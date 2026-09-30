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

type RevisionData = Schema.Schema.Type<typeof MaestroEvent.PlanRevision.Recorded.data>

export type RecordPlanRevisionInput = Omit<RevisionData, "id" | "revisionHash" | "createdAt" | "status" | "revision">

export class PlanRevisionConflictError extends Schema.TaggedErrorClass<PlanRevisionConflictError>()(
  "MaestroPlanRevisionConflict",
  { sessionID: Schema.String, admissionMessageID: Schema.String, methodVersion: Schema.String },
) {}

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

function wanted(input: RecordPlanRevisionInput): RevisionData {
  const body = { ...input, revision: "v1" as const, status: "PROPOSED" as const, contextRequirement: "PENDING" as const }
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
  if (!row || row.type !== EventV2.versionedType(MaestroEvent.PlanRevision.Recorded.type, 1)) return undefined
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
  const next = wanted(input)
  const existing = yield* readPlanRevision(next.id)
  if (existing) {
    if (isDeepStrictEqual({ ...existing, createdAt: 0 }, { ...next, createdAt: 0 })) return existing
    return yield* new PlanRevisionConflictError(input)
  }
  const events = yield* EventV2Bridge.Service
  const recorded = yield* events.publish(MaestroEvent.PlanRevision.Recorded, next, { id: EventV2.ID.make(next.id) })
  return recorded.data
})
