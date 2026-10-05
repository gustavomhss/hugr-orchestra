import path from "path"
import { AgentV2 } from "@opencode-ai/core/agent"
import { Config } from "@opencode-ai/core/config"
import { ConfigAgentFile } from "@opencode-ai/core/config/agent-file"
import { Location } from "@opencode-ai/core/location"
import { LocationServiceMap } from "@opencode-ai/core/location-services"
import { InvalidRequestError, UnknownError } from "@opencode-ai/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const AgentHandler = HttpApiBuilder.group(Api, "server.agent", (handlers) =>
  Effect.gen(function* () {
    const locations = yield* LocationServiceMap.Service
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
          return yield* response(ConfigAgentFile.read(location.directory, name).pipe(Effect.orDie))
        }),
      )
      .handle(
        "agent.file.update",
        Effect.fn(function* (ctx) {
          const name = yield* requireName(ctx.params.agentID)
          const location = yield* Location.Service
          const agents = yield* AgentV2.Service
          const config = yield* Config.Service
          const file = yield* ConfigAgentFile.write(location.directory, name, ctx.payload).pipe(
            Effect.mapError((error) => new UnknownError({ message: error.message })),
          )
          yield* agents.reload()
          // Config discovers `.opencode` directories once per opened location. When this write created
          // the directory, reopen the location so the next request sees the new agent.
          const directory = path.join(location.directory, ".opencode")
          const discovered = (yield* config.entries()).some(
            (entry) => entry.type === "directory" && path.resolve(entry.path) === path.resolve(directory),
          )
          if (!discovered)
            yield* locations.invalidate(
              Location.Ref.make({ directory: location.directory, workspaceID: location.workspaceID }),
            )
          return yield* response(Effect.succeed(file))
        }),
      )
  }),
)

function requireName(name: string) {
  if (ConfigAgentFile.validName(name)) return Effect.succeed(name)
  return Effect.fail(
    new InvalidRequestError({
      message: "Agent names may contain only letters, numbers, hyphens and underscores.",
      kind: "agent_name",
      field: "agentID",
    }),
  )
}
