import { expect, test } from "bun:test"
import { Effect, type Layer, type Scope } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { Project } from "@orchestra/core/project"
import { SessionStore } from "@orchestra/core/session"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { SessionEvent } from "@orchestra/schema/session-event"
import { SessionID } from "@orchestra/schema/session-id"
import { GovernanceRecordsV2 } from "../src/v2/governance/records"
import { WorkflowGateV2 } from "../src/v2/governance/workflow"
import { WorkflowAdmissionV2 } from "../src/v2/governance/workflow-admission"
import { WorkflowRecordsV2 } from "../src/v2/workflow/records"
import { admit, event, governanceLayer, session, worktree } from "./fixture/v2-governance"

// The pieces of a workflow Task's admission that hold without a Relay: the Task gate that lets only a workflow Task
// continue a bound child, the recorded holder of an arm as it moves, the stored binding read and the upstream check.

const run = <A, E>(body: (directory: string) => Effect.Effect<A, E, Layer.Success<ReturnType<typeof governanceLayer>> | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        return yield* body(directory).pipe(Effect.provide(governanceLayer(directory)))
      }),
    ),
  )

const token = "tok_admission"
const v3 = EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV3.type, 3)

// Records a canonical v3 workflow plan revision of the Session, as planning writes it, and returns its id.
const plan = (sessionID: string, parameters: Record<string, string>, documentID = "packet") =>
  Effect.gen(function* () {
    const field = { value: "ship it", source: "maestro" }
    const body = {
      sessionID,
      admissionMessageID: "msg_admission",
      methodVersion: "plan-v1",
      revision: "v3",
      goal: field,
      acceptance: [field],
      scope: [field],
      constraints: [],
      reviewRequirement: field,
      contextRequirement: "PENDING",
      assumptions: [],
      risks: [],
      status: "PROPOSED",
      workflowBinding: {
        publication: {
          projectID: "global",
          documentID,
          activeVersionID: "version-1",
          immutableVersionBodyChecksum: "1".repeat(64),
          livePublicationChecksum: "2".repeat(64),
        },
        materialization: { schemaIdentifier: "RelaySprint.Sprint", digest: "3".repeat(64), byteLength: 128 },
        resolvedSkills: [],
        parameters,
        writePaths: ["src"],
      },
    }
    const revisionHash = GovernanceRecordsV2.hash(body)
    const id = `evt_maestro_plan_revision_${revisionHash}`
    yield* event(id, sessionID, v3, { ...body, id, revisionHash, createdAt: 1 })
    return id
  })

test("only a workflow Task continues a child bound to a workflow step", () =>
  run((directory) =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const parentID = yield* session({ directory, agent: "maestro" })
      const child = yield* session({ directory, agent: "general", parentID })
      yield* event(WorkflowGateV2.eventID(child), child, EventV2.versionedType(MaestroEvent.Task.WorkflowBound.type, 1))
      yield* WorkflowGateV2.check(database, { parentID, taskID: child, workflow: true })
      const plain = yield* Effect.flip(WorkflowGateV2.check(database, { parentID, taskID: child, workflow: false }))
      expect(plain.message).toBe("Tool safety HOLD: WORKFLOW_TASK_BINDING_REQUIRED")
      // A bound row that does not decode as a binding holds rather than continuing.
      expect((yield* Effect.flip(WorkflowAdmissionV2.bound(database.db, child))).message).toBe(
        "Tool safety HOLD: WORKFLOW_TASK_BINDING_MISMATCH",
      )
      expect(yield* WorkflowAdmissionV2.bound(database.db, parentID)).toBeUndefined()
    }),
  ))

test("an arm's recorded holder follows each move, and every Session it left stays left", () =>
  run(() =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      const services = { db: database.db, events }
      const move = (from: string, to: string) =>
        WorkflowRecordsV2.recordMove(services, {
          executionSessionID: SessionID.make(to),
          from: SessionID.make(from),
          token,
        })
      expect((yield* WorkflowRecordsV2.holders(database.db, token)).holder).toBeUndefined()
      yield* move("ses_a", "ses_b")
      expect((yield* WorkflowRecordsV2.holders(database.db, token)).holder).toBe("ses_b")
      yield* move("ses_b", "ses_c")
      // A retried move records nothing new.
      yield* move("ses_b", "ses_c")
      const recorded = yield* WorkflowRecordsV2.holders(database.db, token)
      expect(recorded.holder).toBe("ses_c")
      expect([...recorded.movedFrom].toSorted()).toEqual(["ses_a", "ses_b"])
      expect((yield* WorkflowRecordsV2.holders(database.db, "tok_other")).holder).toBeUndefined()
    }),
  ))

test("a workflow plan whose revision recorded no upstream attribution holds every turn", () =>
  run((directory) =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const events = yield* EventV2.Service
      const store = yield* SessionStore.Service
      const sessionID = yield* session({ directory, agent: "maestro" })
      const id = yield* plan(sessionID, {})
      const revision = yield* GovernanceRecordsV2.readWorkflowRevision(database.db, id)
      const missing = yield* Effect.flip(WorkflowAdmissionV2.upstream({ db: database.db, events, store }, revision))
      expect(missing.message).toBe("Tool safety HOLD: UPSTREAM_ATTRIBUTION_MISSING")
    }),
  ))

test("a workflow Task runs only the approved plan, from its Maestro's arm, with exactly the approved scope", () =>
  run((directory) =>
    Effect.gen(function* () {
      const parentID = yield* session({ directory, agent: "maestro" })
      const refusal = (workflow: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
        Effect.flip(
          admit({
            directory,
            caller: "maestro",
            target: "general",
            parentID,
            extra: { authorizationID: "evt_authorization", writePaths: ["src"], workflow, ...extra },
          }),
        ).pipe(Effect.map((error) => error.message))
      const workflow = (planRevisionID: string, parameters: Record<string, string> = { target: "src" }) => ({
        documentID: "packet",
        planRevisionID,
        parameters,
      })
      const unapproved = Effect.flip(
        admit({ directory, caller: "maestro", target: "general", parentID, extra: { workflow: workflow("evt_plan") } }),
      )
      expect((yield* unapproved).message).toBe("Tool safety HOLD: WORKFLOW_APPROVAL_BINDING_MISSING")
      expect(yield* refusal(workflow("evt_plan"))).toStartWith("Tool safety HOLD: WORKFLOW_NATIVE_ARM_UNBOUND: ")
      yield* event("evt_arm", parentID, EventV2.versionedType(SessionEvent.Tool.Progress.type, 1), {
        structured: {
          nativeArsenal: {
            source: "native-host",
            version: 1,
            kind: "completion-arm",
            tool: "maestro_arsenal_execute",
            token,
            projectID: Project.ID.global,
            directory,
          },
        },
      })
      expect(yield* refusal(workflow("evt_maestro_plan_revision_absent"))).toBe(
        "Tool safety HOLD: WORKFLOW_PLAN_REVISION_MISSING",
      )
      const other = yield* plan(parentID, { target: "src" }, "other-packet")
      expect(yield* refusal(workflow(other))).toBe("Tool safety HOLD: WORKFLOW_PLAN_REVISION_MISMATCH")
      const approved = yield* plan(parentID, { target: "src" })
      expect(yield* refusal(workflow(approved, { target: "lib" }))).toStartWith(
        "Tool safety HOLD: WORKFLOW_APPROVED_SCOPE_MISMATCH: Plan revision",
      )
      expect(yield* refusal(workflow(approved), { writePaths: ["lib"] })).toContain("approved writePaths")
      // The approved revision is the Session's newest plan; it records no upstream author, so it still holds.
      expect(yield* refusal(workflow(approved))).toBe("Tool safety HOLD: UPSTREAM_ATTRIBUTION_MISSING")
      yield* plan(parentID, { target: "newer" })
      expect(yield* refusal(workflow(approved))).toBe("Tool safety HOLD: WORKFLOW_PLAN_REVISION_STALE")
    }),
  ))
