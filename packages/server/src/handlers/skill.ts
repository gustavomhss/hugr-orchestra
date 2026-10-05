import { SkillV2 } from "@opencode-ai/core/skill"
import { Location } from "@opencode-ai/core/location"
import { SkillFile } from "@opencode-ai/core/skill/file"
import { ConflictError, InvalidRequestError } from "@opencode-ai/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const SkillHandler = HttpApiBuilder.group(Api, "server.skill", (handlers) =>
  handlers
    .handle("skill.list", () => response(SkillV2.Service.use((skill) => skill.list())))
    .handle(
      "skill.save",
      Effect.fn(function* (ctx) {
        const skill = yield* SkillV2.Service
        const location = yield* Location.Service
        const input = ctx.payload
        return yield* response(
          skill.save(location.directory, {
            name: input.name,
            description: input.description,
            content: input.content,
            location: input.path,
            mtime: input.mtime,
          }),
        ).pipe(Effect.catchTag("SkillWriteError", (error) => Effect.fail(writeError(error))))
      }),
    )
    .handle(
      "skill.remove",
      Effect.fn(function* (ctx) {
        const skill = yield* SkillV2.Service
        const location = yield* Location.Service
        return yield* response(skill.remove(location.directory, ctx.query.path).pipe(Effect.as(true))).pipe(
          Effect.catchTag("SkillWriteError", (error) =>
            Effect.fail(new InvalidRequestError({ message: error.message, kind: error.reason, field: "path" })),
          ),
        )
      }),
    ),
)

function writeError(error: SkillFile.WriteError) {
  if (error.reason === "conflict") return new ConflictError({ message: error.message, resource: "skill" })
  return new InvalidRequestError({ message: error.message, kind: error.reason })
}
