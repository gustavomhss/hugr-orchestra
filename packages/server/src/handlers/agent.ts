import { AgentV2 } from "@orchestra/core/agent"
import { ConfigAgentFile } from "@orchestra/core/config/agent-file"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { ConflictError, InvalidRequestError, UnknownError } from "@orchestra/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const AgentHandler = HttpApiBuilder.group(Api, "server.agent", (handlers) =>
  Effect.gen(function* () {
    // Agent files are read and written with the process-global FSUtil, captured here so it does not
    // leak into per-request requirements that every host would otherwise have to provide.
    const fs = yield* FSUtil.Service

    return handlers
      .handle("agent.list", () =>
        Effect.gen(function* () {
          return yield* response(AgentV2.Service.use((agent) => agent.all()))
        }),
      )
      .handle(
        "agent.file.get",
        Effect.fn(function* (ctx) {
          const name = yield* requireName(ctx.params.agentID)
          const location = yield* Location.Service
          return yield* response(
            ConfigAgentFile.read(location.directory, name).pipe(
              Effect.provideService(FSUtil.Service, fs),
              Effect.mapError(failure),
            ),
          )
        }),
      )
      .handle(
        "agent.file.update",
        Effect.fn(function* (ctx) {
          const name = yield* requireName(ctx.params.agentID)
          const location = yield* Location.Service
          const agents = yield* AgentV2.Service
          const file = yield* ConfigAgentFile.write(location.directory, name, ctx.payload).pipe(
            Effect.provideService(FSUtil.Service, fs),
            Effect.mapError((error) =>
              error instanceof ConfigAgentFile.ConflictError
                ? new ConflictError({ message: error.message, resource: error.path })
                : failure(error),
            ),
          )
          // The config agent plugin rescans `.orchestra` on reload, including a folder this write created.
          yield* agents.reload()
          return yield* response(Effect.succeed(file))
        }),
      )
  }),
)

function requireName(name: string) {
  if (ConfigAgentFile.validName(name)) return Effect.succeed(name)
  return Effect.fail(
    new InvalidRequestError({
      message: "Agent names are 1-64 letters, numbers, hyphens or underscores and not a reserved device name.",
      kind: "agent_name",
      field: "agentID",
    }),
  )
}

function failure(error: ConfigAgentFile.RejectedError | Error) {
  if (error instanceof ConfigAgentFile.RejectedError)
    return new InvalidRequestError({ message: error.message, kind: `agent_file_${error.reason}`, field: "agentID" })
  return new UnknownError({ message: error.message })
}
