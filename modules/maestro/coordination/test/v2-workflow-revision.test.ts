import { expect, test } from "bun:test"
import { Effect, type Layer, type Scope } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { GovernanceRecordsV2 } from "../src/v2/governance/records"
import { event, governanceLayer, session, worktree } from "./fixture/v2-governance"

const run = <A, E>(body: (directory: string) => Effect.Effect<A, E, Layer.Success<ReturnType<typeof governanceLayer>> | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const directory = yield* worktree
        return yield* body(directory).pipe(Effect.provide(governanceLayer(directory)))
      }),
    ),
  )

const v3 = EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV3.type, 3)
const field = { value: "ship it", source: "maestro" }
const workflowBinding = {
  publication: {
    projectID: "global",
    documentID: "packet",
    activeVersionID: "version-1",
    immutableVersionBodyChecksum: "1".repeat(64),
    livePublicationChecksum: "2".repeat(64),
  },
  materialization: { schemaIdentifier: "RelaySprint.Sprint", digest: "3".repeat(64), byteLength: 128 },
  resolvedSkills: [],
  parameters: { target: "src" },
  writePaths: ["src"],
}
// The canonical V3 body: id and hash bind everything but themselves and createdAt.
const revision = (sessionID: string, extra: Record<string, unknown> = {}) => {
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
    ...extra,
  }
  const revisionHash = GovernanceRecordsV2.hash(body)
  return { ...body, id: `evt_maestro_plan_revision_${revisionHash}`, revisionHash, createdAt: 1 }
}
const reason = (id: string) =>
  Effect.gen(function* () {
    const database = yield* Database.Service
    return (yield* Effect.flip(GovernanceRecordsV2.readWorkflowRevision(database.db, id))).reason
  })

test("a workflow Task reads only a v3 revision whose hash, id, Session and binding still hold", () =>
  run((directory) =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const sessionID = yield* session({ directory, agent: "maestro" })
      const bound = revision(sessionID, { workflowBinding })
      yield* event(bound.id, sessionID, v3, bound)
      const read = yield* GovernanceRecordsV2.readWorkflowRevision(database.db, bound.id)
      expect(read.id).toBe(EventV2.ID.make(bound.id))
      expect(read.workflowBinding.publication.documentID).toBe("packet")

      expect(yield* reason("evt_maestro_plan_revision_absent")).toBe("WORKFLOW_PLAN_REVISION_MISSING")
      const v2 = revision(sessionID, { methodVersion: "older" })
      yield* event(v2.id, sessionID, EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV2.type, 2), v2)
      expect(yield* reason(v2.id)).toBe("WORKFLOW_PLAN_REVISION_MISSING")

      const open = { ...revision(sessionID, { methodVersion: "open" }), extra: true }
      yield* event(open.id, sessionID, v3, open)
      expect(yield* reason(open.id)).toBe("WORKFLOW_PLAN_REVISION_INVALID")

      const edited = { ...revision(sessionID, { workflowBinding, methodVersion: "edited" }), goal: { value: "other", source: "maestro" } }
      yield* event(edited.id, sessionID, v3, edited)
      expect(yield* reason(edited.id)).toBe("WORKFLOW_PLAN_HASH_MISMATCH")

      const foreign = revision("ses_other", { workflowBinding })
      yield* event(foreign.id, sessionID, v3, foreign)
      expect(yield* reason(foreign.id)).toBe("WORKFLOW_PLAN_REVISION_MISMATCH")
      const moved = revision(sessionID, { workflowBinding, methodVersion: "moved" })
      yield* event("evt_maestro_plan_revision_moved", sessionID, v3, moved)
      expect(yield* reason("evt_maestro_plan_revision_moved")).toBe("WORKFLOW_PLAN_REVISION_MISMATCH")

      const plain = revision(sessionID, { methodVersion: "plain" })
      yield* event(plain.id, sessionID, v3, plain)
      expect(yield* reason(plain.id)).toBe("WORKFLOW_PLAN_BINDING_MISSING")
    }),
  ))
