import { expect, test } from "bun:test"
import { Effect, type Layer, type Scope } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { SessionStore } from "@orchestra/core/session"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { SessionID } from "@orchestra/schema/session-id"
import { GovernanceRecordsV2 } from "../src/v2/governance/records"
import { WorkflowGateV2 } from "../src/v2/governance/workflow"
import { WorkflowAdmissionV2 } from "../src/v2/governance/workflow-admission"
import { WorkflowRecordsV2 } from "../src/v2/workflow/records"
import { event, governanceLayer, session, worktree } from "./fixture/v2-governance"

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
            documentID: "packet",
            activeVersionID: "version-1",
            immutableVersionBodyChecksum: "1".repeat(64),
            livePublicationChecksum: "2".repeat(64),
          },
          materialization: { schemaIdentifier: "RelaySprint.Sprint", digest: "3".repeat(64), byteLength: 128 },
          resolvedSkills: [],
          parameters: {},
          writePaths: ["src"],
        },
      }
      const revisionHash = GovernanceRecordsV2.hash(body)
      const id = `evt_maestro_plan_revision_${revisionHash}`
      yield* event(id, sessionID, EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV3.type, 3), {
        ...body,
        id,
        revisionHash,
        createdAt: 1,
      })
      const revision = yield* GovernanceRecordsV2.readWorkflowRevision(database.db, id)
      const missing = yield* Effect.flip(WorkflowAdmissionV2.upstream({ db: database.db, events, store }, revision))
      expect(missing.message).toBe("Tool safety HOLD: UPSTREAM_ATTRIBUTION_MISSING")
    }),
  ))
