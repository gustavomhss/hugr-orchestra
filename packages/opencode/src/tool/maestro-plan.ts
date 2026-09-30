import { Effect, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2Bridge } from "@/event-v2-bridge"
import { recordPlanRevision } from "@/maestro/plan-revision"
import * as Tool from "./tool"

const Field = Schema.Struct({
  value: Schema.String,
  source: Schema.Literals(["stakeholder", "maestro", "orientation"]),
})
const Parameters = Schema.Struct({
  admissionMessageID: Schema.String,
  methodVersion: Schema.String,
  goal: Field,
  acceptance: Schema.Array(Field),
  scope: Schema.Array(Field),
  constraints: Schema.Array(Field),
  reviewRequirement: Field,
  assumptions: Schema.Array(Field),
  risks: Schema.Array(Field),
})

export const MaestroRecordPlanRevisionTool = Tool.define(
  "maestro_record_plan_revision",
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const agents = yield* Agent.Service
    return {
      description: "Persist one immutable proposed PlanRevision. Maestro only.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agentID ?? ctx.agent)
          if (agent?.id !== "maestro" || agent.native !== true)
            return yield* Effect.fail(new Error("Plan revision requires Maestro"))
          const record = yield* recordPlanRevision({
            ...params,
            sessionID: ctx.sessionID,
            contextRequirement: "PENDING",
          })
          return {
            title: `Plan revision ${record.revision}`,
            metadata: { planRevisionID: record.id },
            output: `${record.status}: ${record.id}`,
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
