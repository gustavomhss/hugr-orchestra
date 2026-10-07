import { Config, ConfigProvider, Context, Effect, Layer, Option } from "effect"
import { ConfigService } from "@/effect/config-service"

const bool = (name: string) => Config.boolean(name).pipe(Config.withDefault(false))
const positiveInteger = (name: string) =>
  Config.number(name).pipe(
    Config.map((value) => (Number.isInteger(value) && value > 0 ? value : undefined)),
    Config.orElse(() => Config.succeed(undefined)),
  )
const experimental = bool("ORCHESTRA_EXPERIMENTAL")
const enabledByExperimental = (name: string) =>
  Config.all({ experimental, enabled: Config.boolean(name).pipe(Config.option) }).pipe(
    Config.map((flags) => Option.getOrElse(flags.enabled, () => flags.experimental)),
  )

export class Service extends ConfigService.Service<Service>()("@orchestra/RuntimeFlags", {
  autoShare: bool("ORCHESTRA_AUTO_SHARE"),
  pure: bool("ORCHESTRA_PURE"),
  disableDefaultPlugins: bool("ORCHESTRA_DISABLE_DEFAULT_PLUGINS"),
  disableEmbeddedWebUi: bool("ORCHESTRA_DISABLE_EMBEDDED_WEB_UI"),
  disableExternalSkills: bool("ORCHESTRA_DISABLE_EXTERNAL_SKILLS"),
  disableLspDownload: bool("ORCHESTRA_DISABLE_LSP_DOWNLOAD"),
  disableClaudeCodePrompt: Config.all({
    broad: bool("ORCHESTRA_DISABLE_CLAUDE_CODE"),
    direct: bool("ORCHESTRA_DISABLE_CLAUDE_CODE_PROMPT"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  disableClaudeCodeSkills: Config.all({
    broad: bool("ORCHESTRA_DISABLE_CLAUDE_CODE"),
    direct: bool("ORCHESTRA_DISABLE_CLAUDE_CODE_SKILLS"),
  }).pipe(Config.map((flags) => flags.broad || flags.direct)),
  enableExa: Config.all({
    experimental,
    enabled: bool("ORCHESTRA_ENABLE_EXA"),
    legacy: bool("ORCHESTRA_EXPERIMENTAL_EXA"),
  }).pipe(Config.map((flags) => flags.experimental || flags.enabled || flags.legacy)),
  enableParallel: Config.all({
    enabled: bool("ORCHESTRA_ENABLE_PARALLEL"),
    legacy: bool("ORCHESTRA_EXPERIMENTAL_PARALLEL"),
  }).pipe(Config.map((flags) => flags.enabled || flags.legacy)),
  enableExperimentalModels: bool("ORCHESTRA_ENABLE_EXPERIMENTAL_MODELS"),
  enableQuestionTool: bool("ORCHESTRA_ENABLE_QUESTION_TOOL"),
  experimentalReferences: enabledByExperimental("ORCHESTRA_EXPERIMENTAL_REFERENCES"),
  experimentalBackgroundSubagents: enabledByExperimental("ORCHESTRA_EXPERIMENTAL_BACKGROUND_SUBAGENTS"),
  experimentalLspTy: bool("ORCHESTRA_EXPERIMENTAL_LSP_TY"),
  experimentalLspTool: enabledByExperimental("ORCHESTRA_EXPERIMENTAL_LSP_TOOL"),
  experimentalOxfmt: enabledByExperimental("ORCHESTRA_EXPERIMENTAL_OXFMT"),
  experimentalCodeMode: enabledByExperimental("ORCHESTRA_EXPERIMENTAL_CODE_MODE"),
  experimentalEventSystem: enabledByExperimental("ORCHESTRA_EXPERIMENTAL_EVENT_SYSTEM"),
  experimentalWorkspaces: enabledByExperimental("ORCHESTRA_EXPERIMENTAL_WORKSPACES"),
  experimentalIconDiscovery: enabledByExperimental("ORCHESTRA_EXPERIMENTAL_ICON_DISCOVERY"),
  outputTokenMax: positiveInteger("ORCHESTRA_EXPERIMENTAL_OUTPUT_TOKEN_MAX"),
  bashDefaultTimeoutMs: positiveInteger("ORCHESTRA_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS"),
  experimentalNativeLlm: bool("ORCHESTRA_EXPERIMENTAL_NATIVE_LLM"),
  experimentalWebSockets: bool("ORCHESTRA_EXPERIMENTAL_WEBSOCKETS"),
  client: Config.string("ORCHESTRA_CLIENT").pipe(Config.withDefault("cli")),
  // Display label override for the backend native seat (F1-D2); the config key `agent.backend.name` is the source.
  backendName: Config.string("HUGR_BACKEND_NAME").pipe(Config.option, Config.map(Option.getOrUndefined)),
}) {}

export type Info = Context.Service.Shape<typeof Service>

const emptyConfigLayer = Service.layer.pipe(
  Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown({}))),
  Layer.orDie,
)

export const layer = (overrides: Partial<Info> = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const flags = yield* Service
      return Service.of({ ...flags, ...overrides })
    }),
  ).pipe(Layer.provide(emptyConfigLayer))

export const node = LayerNode.make({ service: Service, layer: Service.layer.pipe(Layer.orDie), deps: [] })

export * as RuntimeFlags from "./runtime-flags"
import { LayerNode } from "@orchestra/core/effect/layer-node"
