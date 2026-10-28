import { AgentV2 } from "@orchestra/core/agent"
import { ConfigAgentFile } from "@orchestra/core/config/agent-file"
import { FSUtil } from "@orchestra/core/fs-util"
import { Location } from "@orchestra/core/location"
import { ConflictError, InvalidRequestError, UnknownError } from "@orchestra/protocol/errors"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { AgentExecution } from "@orchestra/core/host/agent-execution"
import { response } from "../location"
import { SkillV2 } from "@orchestra/core/skill"
import { ToolRegistry } from "@orchestra/core/tool/registry"
import { BackendToolkit } from "@orchestra/core/backend-toolkit"
import { BackendToolkitManifest } from "@orchestra/core/backend-toolkit/manifest"
import { ResearchToolkit } from "@orchestra/core/research-toolkit/index"
import { ResearchToolkitManifest } from "@orchestra/core/research-toolkit/manifest"

export const AgentHandler = HttpApiBuilder.group(Api, "server.agent", (handlers) =>
  Effect.gen(function* () {
    // Agent files are read and written with the process-global FSUtil, captured here so it does not
    // leak into per-request requirements that every host would otherwise have to provide.
    const fs = yield* FSUtil.Service
    const annotate = yield* AgentExecution.Annotate

    return handlers
      .handle("agent.list", () =>
        Effect.gen(function* () {
          const agents = yield* AgentV2.Service
          return yield* response(agents.all().pipe(Effect.flatMap(annotate)))
        }),
      )
      .handle(
        "agent.detail",
        Effect.fn(function* (ctx) {
          const agents = yield* AgentV2.Service
          const registry = yield* ToolRegistry.Service
          const skills = yield* SkillV2.Service
          const agent = yield* agents.get(AgentV2.ID.make(ctx.params.agentID))
          if (!agent)
            return yield* new InvalidRequestError({
              message: `Unknown agent: ${ctx.params.agentID}`,
              kind: "agent_unknown",
              field: "agentID",
            })
          const tools = yield* registry.materialize(agent.permissions)
          return yield* response(
            Effect.succeed({
              tools: tools.definitions.map((tool) => ({ name: tool.name, description: tool.description })),
              skills: SkillV2.available(yield* skills.list(), agent).map((skill) => ({
                name: skill.name,
                description: skill.description,
                location: skill.location,
              })),
              engines: yield* engines(agent.toolkit),
            }),
          )
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

/** The agent's toolkit engines; reading their state only looks at the install cache and never fetches. */
const engines = Effect.fn(function* (toolkit: AgentV2.Info["toolkit"]) {
  if (toolkit === "backend") {
    const states = yield* BackendToolkit.status()
    return Object.values(BackendToolkitManifest.ENGINES).map((pack) => ({
      id: pack.id,
      version: pack.version,
      license: pack.license,
      upstream: pack.upstream,
      role: pack.fit.role,
      input: pack.fit.input,
      status: states.find((state) => state.engine === pack.id)?.status ?? "absent",
    }))
  }
  if (toolkit === "research") {
    const states = yield* ResearchToolkit.status()
    return Object.values(ResearchToolkitManifest.ENGINES).flatMap((pack) =>
      pack
        ? [
            {
              id: pack.id,
              version: pack.version,
              license: pack.license,
              upstream: pack.upstream,
              role: pack.fit.role,
              input: pack.fit.languages.join(", "),
              status: states.find((state) => state.engine === pack.id)?.status ?? "absent",
            },
          ]
        : [],
    )
  }
  return []
})

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
