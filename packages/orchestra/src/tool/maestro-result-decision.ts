import { Effect } from "effect"
import { Agent } from "@/agent/agent"
import { Database } from "@orchestra/core/database/database"
import { EventV2Bridge } from "@/event-v2-bridge"
import { WorkResultDecision } from "@/maestro/work-result-decision"
import { Session } from "@/session/session"
import { Tool } from "./tool"

export const MaestroRecordResultDecisionTool = Tool.define(
  "maestro_record_result_decision",
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    return {
      description:
        "Record acceptance or rejection of a stored final backend Task WorkResult. Native root Maestro only. Accepting host-failed or host-incomplete requires a nonblank override reason. Background running results cannot be decided; target an actual durable final Task result when available.",
      parameters: WorkResultDecision.Parameters,
      strictParameters: { parentSessionID: true, messageID: true, partID: true, decision: true, reason: true },
      execute: (params, ctx) =>
        Effect.gen(function* () {
          const record = yield* WorkResultDecision.record({
            sessionID: ctx.sessionID,
            agentID: ctx.agentID ?? ctx.agent,
            target: params,
          })
          return {
            title: `WorkResult ${record.decision}`,
            metadata: {
              decisionID: record.id,
              workResultHash: record.workResultHash,
              decision: record.decision,
              truncated: false,
            },
            output: JSON.stringify(record),
          }
        }).pipe(
          Effect.provideService(Agent.Service, agents),
          Effect.provideService(Session.Service, sessions),
          Effect.provideService(Database.Service, database),
          Effect.provideService(EventV2Bridge.Service, events),
          Effect.orDie,
        ),
    }
  }),
)
