import { Effect, Schema } from "effect"
import { recordAdmission } from "@/maestro/admission-record"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Agent } from "@/agent/agent"
import * as Tool from "./tool"

const Parameters = Schema.Struct({
  methodVersion: Schema.String,
  assessment: Schema.Unknown,
})

export const MaestroRecordAdmissionTool = Tool.define(
  "maestro_record_admission",
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const agents = yield* Agent.Service
    return {
      description: "Record one governed Maestro request assessment against current direct user message. Maestro only.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agent)
          if (agent?.id !== "maestro") return yield* Effect.fail(new Error("Admission recording requires Maestro"))
          const message = ctx.messages
            .filter((message) => message.info.role === "user")
            .sort(
              (left, right) =>
                left.info.time.created - right.info.time.created || left.info.id.localeCompare(right.info.id),
            )
            .at(-1)
          if (!message) return yield* Effect.fail(new Error("Admission recording requires direct user message"))
          const record = yield* recordAdmission({
            sessionID: ctx.sessionID,
            messageID: message.info.id,
            methodVersion: params.methodVersion,
            assessment: params.assessment,
          })
          return {
            title: `Admission ${record.outcome}`,
            metadata: { messageID: record.messageID, outcome: record.outcome },
            output:
              record.outcome === "CLARIFY"
                ? `CLARIFY: ${record.reason}`
                : `${record.outcome}: admission message ${record.messageID}`,
          }
        }).pipe(
          Effect.provideService(Database.Service, database),
          Effect.provideService(EventV2Bridge.Service, events),
          Effect.provideService(Agent.Service, agents),
          Effect.orDie,
        ),
    }
  }),
)
