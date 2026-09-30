import { Effect, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { Session } from "@/session/session"
import { Database } from "@opencode-ai/core/database/database"
import { recordContext } from "@/maestro/context-record"
import * as Tool from "./tool"

const Parameters = Schema.Struct({ planRevisionID: Schema.String })

export const MaestroRecordContextTool = Tool.define(
  "maestro_record_context",
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const git = yield* Git.Service
    const sessions = yield* Session.Service
    const agents = yield* Agent.Service
    return {
      description: "Record current Git/worktree evidence bound to one PlanRevision. Maestro only.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agentID ?? ctx.agent)
          if (agent?.id !== "maestro" || agent.native !== true) return yield* Effect.fail(new Error("Context recording requires Maestro"))
          const record = yield* recordContext(params.planRevisionID, ctx.sessionID)
          return { title: `Context ${record.status}`, metadata: { contextRecordID: record.id, contextHash: record.contextHash }, output: `${record.status}: ${record.id}` }
        }).pipe(
          Effect.provideService(Database.Service, database),
          Effect.provideService(EventV2Bridge.Service, events),
          Effect.provideService(Git.Service, git),
          Effect.provideService(Session.Service, sessions),
          Effect.provideService(Agent.Service, agents),
          Effect.orDie,
        ),
    }
  }),
)
