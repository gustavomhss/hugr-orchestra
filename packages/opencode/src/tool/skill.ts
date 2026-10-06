import path from "path"
import { Effect, FileSystem, Schema } from "effect"
import { Ripgrep } from "@opencode-ai/core/ripgrep"
import { Skill } from "../skill"
import * as Tool from "./tool"
import { ToolText } from "@opencode-ai/core/tool/text"
import { loadAtlasSkill, readAtlasSource } from "@/maestro/atlas-source"
import { Session } from "@/session/session"
import { Config } from "@/config/config"
import { Git } from "@/git"

export const Parameters = Schema.Struct({
  name: Schema.String.annotate({ description: "The name of the skill from available_skills" }),
})

export const SkillTool = Tool.define(
  "skill",
  Effect.gen(function* () {
    const skill = yield* Skill.Service
    const ripgrep = yield* Ripgrep.Service
    const sessions = yield* Session.Service
    const config = yield* Config.Service
    const git = yield* Git.Service
    const fs = yield* FileSystem.FileSystem

    return {
      description: ToolText.skill,
      parameters: Parameters,
      execute: (
        params: Schema.Schema.Type<typeof Parameters>,
        ctx: Tool.Context,
      ): Effect.Effect<
        Tool.ExecuteResult<{ name: string; dir?: string; snapshot?: string; contentHash?: string; truncated?: boolean }>
      > =>
        Effect.gen(function* () {
          if (params.name.startsWith("own_")) {
            const session = yield* sessions.get(ctx.sessionID)
            const source = yield* readAtlasSource(session)
            const unit = source.context.units.find((unit) => unit.skillName === params.name)
            if (!unit) return yield* Effect.fail(new Error("Own skill is absent from verified availability"))
            yield* ctx.ask({ permission: "skill", patterns: [params.name], always: [params.name], metadata: {} })
            const loaded = yield* loadAtlasSkill(session, source, unit.unit)
            return {
              title: `Loaded verified Own skill: ${loaded.name}`,
              metadata: {
                name: loaded.name,
                snapshot: source.context.snapshot,
                contentHash: loaded.contentHash,
                truncated: false,
              },
              output: `<skill_content name="${loaded.name}">\n${loaded.content}\n</skill_content>`,
            }
          }
          const info = yield* skill
            .require(params.name)
            .pipe(Effect.catchTag("Skill.NotFoundError", (error) => Effect.die(new Error(error.message))))

          yield* ctx.ask({
            permission: "skill",
            patterns: [params.name],
            always: [params.name],
            metadata: {},
          })

          const dir = path.dirname(info.location)
          const base = dir
          const files = yield* ripgrep.find({
            cwd: dir,
            pattern: "!**/SKILL.md",
            hidden: true,
            follow: false,
            signal: ctx.abort,
            limit: 10,
          })

          return {
            title: `Loaded skill: ${info.name}`,
            output: [
              `<skill_content name="${info.name}">`,
              `# Skill: ${info.name}`,
              "",
              info.content.trim(),
              "",
              `Base directory for this skill: ${base}`,
              "Relative paths in this skill (e.g., scripts/, reference/) are relative to this base directory.",
              "Note: file list is sampled.",
              "",
              "<skill_files>",
              files.map((file) => `<file>${path.resolve(dir, file.path)}</file>`).join("\n"),
              "</skill_files>",
              "</skill_content>",
            ].join("\n"),
            metadata: {
              name: info.name,
              dir,
            },
          }
        }).pipe(
          Effect.provideService(Config.Service, config),
          Effect.provideService(Git.Service, git),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Skill.Service, skill),
          Effect.orDie,
        ),
    }
  }),
)
