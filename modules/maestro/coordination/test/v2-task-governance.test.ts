import { expect, test } from "bun:test"
import { ToolFailure } from "@orchestra/llm"
import { Effect, Layer } from "effect"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { EventV2 } from "@orchestra/core/event"
import { TaskGovernance } from "@orchestra/core/tool/task-governance"
import { GovernanceInputV2 } from "../src/v2/governance/input"
import { WorkflowGateV2 } from "../src/v2/governance/workflow"
import { admit, event, governanceLayer, session, worktree } from "./fixture/v2-governance"

const run = <A, E>(body: (directory: string) => Effect.Effect<A, E, Layer.Success<ReturnType<typeof governanceLayer>>>) =>
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
      const governed = {
        sessionID: "s", projectID: "p", memberID: "backend", approvalMessageID: "m", planRevisionID: "r",
        revisionHash: "h", validationRecordID: "v", validationHash: "h", contextHash: "h", policyHash: "h", taskHash: "h",
      }
      const cases = [
        [{ background: true }, "background-unavailable"],
        [{ workflow: { documentID: "doc", planRevisionID: "evt_plan", parameters: {} } }, "workflow-unavailable"],
        [{ authorizationID: "evt_authorization" }, "authorized-dispatch-unavailable"],
        [{ governed }, "governed-dispatch-unavailable"],
      ] as const
      for (const [extra, reason] of cases)
        expect(yield* refusal(admit({ directory, caller: "maestro", target: "general", extra }))).toStartWith(`Task denied: ${reason}:`)
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "backend", extra: { memoryUnit: { kind: "task", id: "t" } } })))
        .toStartWith("Task denied: atlas-resume-unavailable:")
      expect(yield* refusal(admit({ directory, caller: "maestro", target: "jimmy" })))
        .toStartWith("Task denied: research-allowance-unavailable:")
      // `background: false` is the foreground Task every runtime has.
      expect(yield* admit({ directory, caller: "maestro", target: "general", extra: { background: false } })).toEqual({})
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
