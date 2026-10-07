import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { EventV2Bridge } from "@/event-v2-bridge"
import { readAdmission } from "./admission-record"
import { readAtlasSource, AtlasContextHeld } from "./atlas-source"
import { compileContextToolPlan } from "./context-tool-plan"
import { Session } from "@/session/session"
import { SessionID } from "@/session/schema"

type LegacyRevisionData = Schema.Schema.Type<typeof MaestroEvent.PlanRevision.Recorded.data>
type RevisionData = LegacyRevisionData | Schema.Schema.Type<typeof MaestroEvent.PlanRevision.RecordedV2.data>

export type RecordPlanRevisionInput = Omit<
  LegacyRevisionData,
  "id" | "revisionHash" | "createdAt" | "status" | "revision"
> & { units?: readonly string[] }

// Revision identity hashes the whole input, so in practice this conflict means the admission precondition failed.
export class PlanRevisionConflictError extends Schema.TaggedErrorClass<PlanRevisionConflictError>()(
  "MaestroPlanRevisionConflict",
  { sessionID: Schema.String, admissionMessageID: Schema.String, methodVersion: Schema.String },
) {
  override get message() {
    return `${this._tag}: admission message ${this.admissionMessageID} has no READY_TO_DRAFT admission recorded under admit-request-v1 in this Session. Plan only from the admission message ID of a READY_TO_DRAFT maestro_record_admission result with methodVersion "admit-request-v1".`
  }
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function hash(value: unknown) {
  return createHash("sha256").update(stable(value), "utf8").digest("hex")
}

function eventID(input: Pick<RecordPlanRevisionInput, "sessionID" | "admissionMessageID" | "methodVersion">) {
  return EventV2.ID.make(`evt_maestro_plan_revision_${hash(input)}`)
}

function wanted(input: RecordPlanRevisionInput): LegacyRevisionData {
  const { units, ...fields } = input
  const body = {
    ...fields,
    revision: "v1" as const,
    status: "PROPOSED" as const,
    contextRequirement: "PENDING" as const,
  }
  return { ...body, id: eventID(input), revisionHash: hash(body), createdAt: Date.now() }
}

export const readPlanRevision = Effect.fn("MaestroPlanRevision.read")(function* (id: string) {
  if (!id.startsWith("evt_")) return undefined
  const { db } = yield* Database.Service
  const row = yield* db
    .select()
    .from(EventTable)
    .where(eq(EventTable.id, EventV2.ID.make(id)))
    .get()
    .pipe(Effect.orDie)
  if (!row) return undefined
  if (row.type === EventV2.versionedType(MaestroEvent.PlanRevision.RecordedV2.type, 2)) {
    return Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV2.data)(row.data)
  }
  if (row.type !== EventV2.versionedType(MaestroEvent.PlanRevision.Recorded.type, 1)) return undefined
  return Schema.decodeUnknownSync(MaestroEvent.PlanRevision.Recorded.data)(row.data)
})

export const recordPlanRevision = Effect.fn("MaestroPlanRevision.record")(function* (input: RecordPlanRevisionInput) {
  const admission = yield* readAdmission({
    sessionID: input.sessionID,
    messageID: input.admissionMessageID,
    methodVersion: "admit-request-v1",
  })
  if (!admission || admission.outcome !== "READY_TO_DRAFT") {
    return yield* new PlanRevisionConflictError(input)
  }
  const legacy = wanted(input)
  const units = input.units
  const next: RevisionData = units
    ? yield* Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.get(SessionID.make(input.sessionID))
        const source = yield* readAtlasSource(session)
        const grounding = {
          catalogVersion: source.context.catalogVersion,
          snapshot: source.context.snapshot,
          sourceRevision: source.context.sourceRevision,
          sourceIdentityHash: source.identityHash,
          units: [...units],
        }
        const { id, revisionHash, createdAt, ...fields } = legacy
        const body = { ...fields, revision: "v2" as const, grounding }
        const proposed = {
          ...body,
          id: EventV2.ID.make(`evt_maestro_plan_revision_${hash(body)}`),
          revisionHash: hash(body),
          createdAt,
        }
        const compiled = compileContextToolPlan({
          actor: { projectId: session.projectID, sessionId: session.id, memberId: "maestro" },
          revision: {
            id: proposed.id,
            hash: proposed.revisionHash,
            projectId: session.projectID,
            sessionId: session.id,
          },
          territories: proposed.scope.map((field) => field.value),
          units: grounding.units,
          context: source.context,
        })
        if (compiled.status === "HOLD")
          return yield* new AtlasContextHeld({ reason: compiled.reason, evidence: compiled.evidence })
        return proposed
      })
    : legacy
  const existing = yield* readPlanRevision(next.id)
  if (existing) {
    if (isDeepStrictEqual({ ...existing, createdAt: 0 }, { ...next, createdAt: 0 })) return existing
    return yield* new PlanRevisionConflictError(input)
  }
  const events = yield* EventV2Bridge.Service
  const recorded =
    next.revision === "v2"
      ? yield* events.publish(MaestroEvent.PlanRevision.RecordedV2, next, { id: EventV2.ID.make(next.id) })
      : yield* events.publish(MaestroEvent.PlanRevision.Recorded, next, { id: EventV2.ID.make(next.id) })
  return recorded.data
})
