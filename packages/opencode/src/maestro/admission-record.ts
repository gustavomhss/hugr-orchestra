import { Database } from "@opencode-ai/core/database/database"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { Effect, Schema } from "effect"
import { eq } from "drizzle-orm"
import { decideAdmission, isIntentAssessment } from "./admit-request"
import { EventV2Bridge } from "@/event-v2-bridge"

export type RecordAdmissionInput = {
  sessionID: string
  messageID: string
  methodVersion: string
  assessment: unknown
}

export type AdmissionRecord = Schema.Schema.Type<typeof MaestroEvent.Admission.Decided.data>

export class AdmissionConflictError extends Schema.TaggedErrorClass<AdmissionConflictError>()(
  "MaestroAdmissionConflict",
  {
    sessionID: Schema.String,
    messageID: Schema.String,
    methodVersion: Schema.String,
  },
) {}

function eventID(input: Pick<RecordAdmissionInput, "sessionID" | "messageID" | "methodVersion">) {
  const key = [input.sessionID, input.messageID, input.methodVersion].join("\u0000")
  return EventV2.ID.make(`evt_maestro_admission_${createHash("sha256").update(key).digest("hex")}`)
}

function data(input: RecordAdmissionInput): AdmissionRecord {
  const decision = decideAdmission(input.assessment)
  return {
    sessionID: input.sessionID,
    messageID: input.messageID,
    methodVersion: input.methodVersion,
    outcome: decision.outcome,
    ...(decision.outcome === "CLARIFY" ? { reason: decision.reason } : {}),
    ...(isIntentAssessment(input.assessment) ? { assessment: input.assessment } : {}),
  }
}

export const readAdmission = Effect.fn("MaestroAdmission.read")(function* (
  input: Pick<RecordAdmissionInput, "sessionID" | "messageID" | "methodVersion">,
) {
  const { db } = yield* Database.Service
  const row = yield* db
    .select()
    .from(EventTable)
    .where(eq(EventTable.id, eventID(input)))
    .get()
    .pipe(Effect.orDie)
  if (!row) return undefined
  if (row.type !== EventV2.versionedType(MaestroEvent.Admission.Decided.type, 1)) return undefined
  return Schema.decodeUnknownSync(MaestroEvent.Admission.Decided.data)(row.data)
})

/** Persist exactly one deterministic admission result for one Session message and method version. */
export const recordAdmission = Effect.fn("MaestroAdmission.record")(function* (input: RecordAdmissionInput) {
  const wanted = data(input)
  const existing = yield* readAdmission(input)
  if (existing) {
    if (isDeepStrictEqual(existing, wanted)) return existing
    return yield* new AdmissionConflictError(input)
  }

  const events = yield* EventV2Bridge.Service
  const recorded = yield* events.publish(MaestroEvent.Admission.Decided, wanted, { id: eventID(input) })
  return recorded.data
})
