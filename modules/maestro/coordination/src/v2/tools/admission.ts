export * as MaestroAdmissionTools from "./admission"

import { createHash } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import type { Database } from "@orchestra/core/database/database"
import type { SessionStore } from "@orchestra/core/session"
import { EventV2 } from "@orchestra/core/event"
import { Tool } from "@orchestra/core/tool/tool"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { decideAdmission, IntentAssessment, isIntentAssessment } from "../../admit-request"
import { MaestroToolGate } from "./gate"

export const name = "maestro_record_admission"
/** The method version the plan reader looks up. */
export const methodVersion = "admit-request-v1"

export type Admission = Schema.Schema.Type<typeof MaestroEvent.Admission.Decided.data>
type Key = { readonly sessionID: string; readonly messageID: string; readonly methodVersion: string }

const Input = Schema.Struct({
  methodVersion: Schema.String.annotate({
    description: 'Use "admit-request-v1"; the plan reader looks up this exact method version.',
  }),
  assessment: IntentAssessment,
})

const Output = Schema.Struct({ messageID: Schema.String, outcome: Schema.String, text: Schema.String })

export function tools(input: {
  readonly db: Database.Interface["db"]
  readonly events: EventV2.Interface
  readonly store: SessionStore.Interface
  readonly gate: MaestroToolGate.Gate
}) {
  return {
    [name]: Tool.make({
      description:
        'Record one governed Maestro request assessment against current direct user message. Use methodVersion "admit-request-v1" for the plan reader. Runtime computes outcome. Native Maestro only.',
      input: Input,
      output: Output,
      toModelOutput: ({ output }) => [{ type: "text", text: output.text }],
      execute: (params, context) =>
        Effect.gen(function* () {
          yield* input.gate(context, AgentV2.defaultID, "Admission recording requires Maestro")
          // The newest direct owner message before this call: a synthetic message (a Task result) is not the owner
          // speaking, and a prompt promoted after this turn began is not yet the current one.
          const messages = yield* input.store.context(context.sessionID).pipe(Effect.orDie)
          const calling = messages.findIndex((message) => message.id === context.assistantMessageID)
          const message = messages
            .slice(0, calling < 0 ? messages.length : calling)
            .findLast((item) => item.type === "user")?.id
          if (!message) return yield* new Tool.Failure({ message: "Admission recording requires direct user message" })
          const record = yield* recordAdmission(input, {
            sessionID: context.sessionID,
            messageID: message,
            methodVersion: params.methodVersion,
            assessment: params.assessment,
          })
          return {
            messageID: record.messageID,
            outcome: record.outcome,
            text:
              record.outcome === "CLARIFY"
                ? `CLARIFY: ${record.reason}`
                : `${record.outcome}: admission message ${record.messageID}`,
          }
        }),
    }),
  }
}

/** The one admission result for an owner message and method version; read by the plan step. */
export const read = Effect.fn("MaestroAdmissionTools.read")(function* (db: Database.Interface["db"], key: Key) {
  const row = yield* db
    .select()
    .from(EventV2.EventTable)
    .where(eq(EventV2.EventTable.id, eventID(key)))
    .get()
    .pipe(Effect.orDie)
  if (!row || row.type !== EventV2.versionedType(MaestroEvent.Admission.Decided.type, 1)) return undefined
  return Schema.decodeUnknownSync(MaestroEvent.Admission.Decided.data)(row.data)
})

/** Persist exactly one deterministic admission result for one Session message and method version. */
const recordAdmission = Effect.fn("MaestroAdmissionTools.record")(function* (
  services: { readonly db: Database.Interface["db"]; readonly events: EventV2.Interface },
  input: Key & { readonly assessment: unknown },
) {
  const decision = decideAdmission(input.assessment)
  const wanted: Admission = {
    sessionID: input.sessionID,
    messageID: input.messageID,
    methodVersion: input.methodVersion,
    outcome: decision.outcome,
    ...(decision.outcome === "CLARIFY" ? { reason: decision.reason } : {}),
    ...(isIntentAssessment(input.assessment) ? { assessment: input.assessment } : {}),
  }
  const existing = yield* read(services.db, input)
  if (existing) {
    if (isDeepStrictEqual(existing, wanted)) return existing
    return yield* new Tool.Failure({
      message: `MaestroAdmissionConflict: owner message ${input.messageID} already has a different ${input.methodVersion} admission. Reuse that first record; a new admission needs a new owner message.`,
    })
  }
  return (yield* services.events.publish(MaestroEvent.Admission.Decided, wanted, { id: eventID(input) })).data
})

function eventID(input: Key) {
  const key = [input.sessionID, input.messageID, input.methodVersion].join("\u0000")
  return EventV2.ID.make(`evt_maestro_admission_${createHash("sha256").update(key).digest("hex")}`)
}
