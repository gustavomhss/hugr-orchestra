import { Effect, FileSystem, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { Session } from "@/session/session"
import { Database } from "@opencode-ai/core/database/database"
import { recordContext } from "@/maestro/context-record"
import { Config } from "@/config/config"
import { Skill } from "@/skill"
import { Tool } from "./tool"

const Parameters = Schema.Struct({ planRevisionID: Schema.String })

export const MaestroRecordContextTool = Tool.define(
  "maestro_record_context",
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const git = yield* Git.Service
    const sessions = yield* Session.Service
    const agents = yield* Agent.Service
    const config = yield* Config.Service
    const skills = yield* Skill.Service
    const fs = yield* FileSystem.FileSystem
    return {
      description:
        "Load exact verified static Own skills and record GROUNDED context bound to one current PlanRevision and clean Git worktree. Maestro only.",
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agentID ?? ctx.agent)
          if (agent?.id !== "maestro" || agent.native !== true)
            return yield* Effect.fail(new Error("Context recording requires Maestro"))
          const record = yield* recordContext(params.planRevisionID, ctx.sessionID, true)
          const bindings = { contextRecordID: record.id, contextHash: record.contextHash, mode: record.mode }
          return {
            title: `Context ${record.mode}`,
            metadata: {
              ...bindings,
              truncated: false,
            },
            output: [
              `${record.mode}: ${record.id}`,
              `Bindings: ${JSON.stringify(bindings)}`,
              ...("skills" in record
                ? record.skills.map(
                    (skill) => `<skill_content name="${skill.name}">\n${skill.content}\n</skill_content>`,
                  )
                : []),
            ].join("\n\n"),
          }
        }).pipe(
          Effect.provideService(Database.Service, database),
          Effect.provideService(EventV2Bridge.Service, events),
          Effect.provideService(Git.Service, git),
          Effect.provideService(Session.Service, sessions),
          Effect.provideService(Agent.Service, agents),
          Effect.provideService(Config.Service, config),
          Effect.provideService(Skill.Service, skills),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.orDie,
        ),
    }
  }),
)
