import { expect, test } from "bun:test"
import { ToolFailure } from "@orchestra/llm"
import { Effect, Layer, type Scope } from "effect"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { eq } from "drizzle-orm"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { GovernanceInputV2 } from "../src/v2/governance/input"
import { WorkflowGateV2 } from "../src/v2/governance/workflow"
import { ResumeAdmissionV2 } from "../src/v2/governance/resume-admission"
import { admit, event, governanceLayer, session, worktree } from "./fixture/v2-governance"

const run = <A, E>(body: (directory: string) => Effect.Effect<A, E, Layer.Success<ReturnType<typeof governanceLayer>> | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        return yield* body(directory).pipe(Effect.provide(governanceLayer(directory)))
      }),
    ),
  )

const refusal = <R>(effect: Effect.Effect<unknown, ToolFailure, R>) =>
  Effect.flip(effect).pipe(Effect.map((error) => error.message))

const workflowBound = EventV2.versionedType(MaestroEvent.Task.WorkflowBound.type, 1)

const resumeAdmitted = Effect.gen(function* () {
  const database = yield* Database.Service
  const rows = yield* database.db.select().from(EventV2.EventTable)
    .where(eq(EventV2.EventTable.type, EventV2.versionedType(MaestroEvent.Task.ResumeAdmitted.type, 1))).all().pipe(Effect.orDie)
  return rows.map((row) => row.data as ResumeAdmissionV2.Recorded)
})

test("Task carries V1's governance fields, so a recorded V1 call decodes on V2", () =>
  run(() =>
    Effect.gen(function* () {
      const governance = yield* TaskGovernance.Service
      expect(Object.keys(governance.input).sort()).toEqual(
        ["allowedDomains", "authorizationID", "background", "effort", "governed", "memoryUnit", "workflow", "writePaths"],
      )
      expect(governance.input).toBe(GovernanceInputV2.fields)
    }),
  ))

test("a plain Task to an agent that is not a seat delegates exactly as allowAll", () =>
  run((directory) =>
    Effect.gen(function* () {
      expect(yield* admit({ directory, caller: "maestro", target: "general" })).toEqual({})
      // jimmy-only and Atlas-only fields are ignored for other teammates, as on V1.
      expect(yield* admit({ directory, caller: "maestro", target: "general", extra: { effort: "deep", memoryUnit: { kind: "task", id: "t" } } }))
        .toEqual({})
    }),
  ))

test("a native seat starts only what its own profile allows", () =>
  run((directory) =>
    Effect.gen(function* () {
      expect(yield* refusal(admit({ directory, caller: "lucy", target: "general" }))).toBe("Task denied: lucy may not start general")
      // An agent that is not a seat keeps core's own checks only.
      expect(yield* admit({ directory, caller: "custom", target: "general" })).toEqual({})
    }),
  ))

test("each phase without a V2 host refuses the call with its reason, never skipping the check", () =>
  run((directory) =>
    Effect.gen(function* () {
      const cases = [
        // Without the process Session service a background result has no way back.
        [{ background: true }, "background-unavailable"],
        [{ workflow: { documentID: "doc", planRevisionID: "evt_plan", parameters: {} } }, "workflow-unavailable"],
      ] as const
      for (const [extra, reason] of cases)
        expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", extra }))).toStartWith(`Task denied: ${reason}:`)
      // The research seat is admitted under its dispatch allowance (v2-research.test.ts), never refused.
      expect((yield* admit({ directory, caller: "maestro", target: "jimmy" })).permissions).toBeDefined()
      // An upstream proposal settles only in the foreground.
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "archie", extra: { background: true } })))
        .toStartWith("Task denied: upstream-settlement-unavailable:")
      // `background: false` is the foreground Task every runtime has.
      expect(yield* admit({ directory, caller: "maestro", target: "general", extra: { background: false } })).toEqual({})
    }),
  ))

test("authorized and governed Tasks run their reservation checks instead of a blanket refusal", () =>
  run((directory) =>
    Effect.gen(function* () {
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", extra: { authorizationID: "evt_authorization" } })))
        .toStartWith("MaestroDispatchRejected: authorization-not-found.")
      const governed = {
        sessionID: "s", projectID: "p", memberID: "maestro", approvalMessageID: "m", planRevisionID: "r",
        revisionHash: "h", validationRecordID: "v", validationHash: "h", contextHash: "h", policyHash: "h", taskHash: "h",
      }
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", extra: { governed } })))
        .toBe("Governed Task denied: request-context-mismatch")
    }),
  ))

test("a Session bound to a workflow step neither starts a Task nor resumes as plain work", () =>
  run((directory) =>
    Effect.gen(function* () {
      const parentID = yield* session({ directory, agent: "maestro" })
      yield* event(WorkflowGateV2.eventID(parentID), parentID, workflowBound)
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", parentID })))
        .toBe("Tool safety HOLD: WORKFLOW_NESTED_TASK_REFUSED")

      const caller = yield* session({ directory, agent: "maestro" })
      const child = yield* session({ directory, agent: "general", parentID: caller })
      yield* event(WorkflowGateV2.eventID(child), child, workflowBound)
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", parentID: caller, extra: { task_id: child } })))
        .toBe("Tool safety HOLD: WORKFLOW_TASK_BINDING_REQUIRED")

      const other = yield* session({ directory, agent: "maestro" })
      yield* event(WorkflowGateV2.eventID(other), other, "maestro.task.bound.1")
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", parentID: other })))
        .toBe("Tool safety HOLD: WORKFLOW_TASK_BINDING_MISMATCH")
    }),
  ))

test("an Atlas seat's memoryUnit joins its resume admission to the prompt once, as V1 renders it", () =>
  run((directory) =>
    Effect.gen(function* () {
      const parentID = yield* session({ directory, agent: "maestro" })
      const call = { directory, caller: "maestro", target: "backend", parentID, extra: { memoryUnit: { kind: "task", id: "t" } } }
      const first = yield* admit(call)
      // The fixture worktree has no HEAD, so the store is unavailable and the seat is told to return an `atlas` blocker.
      expect(first.prompt?.text).toStartWith('p\n\nAtlas Memory resume of your task "t": no checkpoint was admitted (store-unavailable:')
      expect(first.prompt?.text).toContain("return a `atlas` blocker naming `store-unavailable`")
      // An exact retry of the call admits the same prompt from the stored record.
      expect(yield* admit(call)).toEqual(first)
      const records = yield* resumeAdmitted
      expect(records).toHaveLength(1)
      expect(records[0]?.resumeRef).toBeUndefined()
      expect(records[0]?.atlasResume).toMatchObject({
        schema: "atlas-resume-admission-v1",
        residency: "admitted",
        key: { memoryOwner: "backend", logicalResumeID: `${parentID}/call_governance_fixture`, kind: "task", id: "t" },
        verdict: { ok: false, refusal: "store-unavailable" },
      })
      expect(first.prompt?.text).toEndWith(records[0]?.atlasResume?.text ?? "missing")
    }),
  ))

test("a resumed child records its resume marker and leaves the prompt alone", () =>
  run((directory) =>
    Effect.gen(function* () {
      const parentID = yield* session({ directory, agent: "maestro" })
      const childID = yield* session({ directory, agent: "general", parentID })
      expect(yield* admit({ directory, caller: "maestro", target: "general", parentID, extra: { task_id: childID } })).toEqual({})
      expect(yield* resumeAdmitted).toEqual([
        { executionSessionID: childID, promptID: expect.any(String), resumeRef: `${parentID}/call_governance_fixture` },
      ])
      // The reader returns the marker only to the child's own parent and only for the prompt it was written for.
      const database = yield* Database.Service
      const [record] = yield* resumeAdmitted
      const at = (parent: string | undefined, promptID = record!.promptID) =>
        ResumeAdmissionV2.readResumeRef(database.db, { childID, promptID, parentID: parent })
      expect(yield* at(parentID)).toBe(`${parentID}/call_governance_fixture`)
      expect(yield* at("ses_foreign")).toBeUndefined()
      expect(yield* at(undefined)).toBeUndefined()
      expect(yield* at(parentID, "msg_other")).toBeUndefined()
      // A fresh child that is not an Atlas seat records nothing.
      yield* admit({ directory, caller: "maestro", target: "general", extra: { memoryUnit: { kind: "task", id: "t" } } })
      expect(yield* resumeAdmitted).toHaveLength(1)
    }),
  ))
