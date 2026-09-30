import { Effect, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2Bridge } from "@/event-v2-bridge"
import { grantAuthorization } from "@/maestro/authorization"
import { Git } from "@/git"
import * as Tool from "./tool"

const Parameters = Schema.Struct({ validationRecordID: Schema.String, approvalMessageID: Schema.String })

export const MaestroGrantAuthorizationTool = Tool.define(
  "maestro_grant_authorization",
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const git = yield* Git.Service
    return {
      description: "Grant execution authority from one direct user approval and an independent Lucy receipt.",
      parameters: Parameters,
      strictParameters: { validationRecordID: true, approvalMessageID: true },
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agentID ?? ctx.agent)
          if (agent?.id !== "maestro" || agent.native !== true)
            return yield* Effect.fail(new Error("Authorization requires Maestro"))
          const receipt = yield* grantAuthorization({ ...params, sessionID: ctx.sessionID })
          return { title: "Authorization granted", metadata: { authorizationID: receipt.id }, output: receipt.id }
        }).pipe(
          Effect.provideService(Database.Service, database),
          Effect.provideService(EventV2Bridge.Service, events),
          Effect.provideService(Git.Service, git),
          Effect.provideService(Agent.Service, agents),
          Effect.orDie,
        ),
    }
  }),
)
