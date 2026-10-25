export * as Config from "./config"

import { makeLocationNode } from "./effect/app-node"
import path from "path"
import { type ParseError, applyEdits, modify, parse } from "jsonc-parser"
import { Context, Effect, Layer, Option, Schema } from "effect"
import { Permission } from "@orchestra/schema/permission"
import { FSUtil } from "./fs-util"
import { Global } from "./global"
import { InstallationVersion } from "./installation/version"
import { Location } from "./location"
import { PackagedSkills } from "./packaged-skills"
import { Policy } from "./policy"
import { AbsolutePath } from "./schema"
import { ConfigAgent } from "./config/agent"
import { ConfigAttachments } from "./config/attachments"
import { ConfigCompaction } from "./config/compaction"
import { ConfigContinuity } from "./config/continuity"
import { ConfigCommand } from "./config/command"
import { ConfigExperimental } from "./config/experimental"
import { ConfigFormatter } from "./config/formatter"
import { ConfigLSP } from "./config/lsp"
import { ConfigMaestro } from "@orchestra/schema/config-maestro"
import { ConfigMCP } from "@orchestra/schema/config-mcp"
import { ConfigPlugin } from "./config/plugin"
import { ConfigProvider } from "./config/provider"
import { ConfigReference } from "./config/reference"
import { ConfigRelay } from "./config/relay"
import { ConfigResearch } from "./config/research"
import { ConfigToolOutput } from "./config/tool-output"
import { ConfigWatcher } from "./config/watcher"
import { ConfigV1 } from "./v1/config/config"
import { ConfigMigrateV1 } from "./v1/config/migrate"

export class Info extends Schema.Class<Info>("Config.Info")({
  $schema: Schema.optional(Schema.String).annotate({
    description: "JSON schema reference for configuration validation",
  }),
  shell: Schema.String.pipe(Schema.optional).annotate({
    description: "Default shell to use for terminal and shell tool execution",
  }),
  model: Schema.String.pipe(Schema.optional).annotate({
    description: "Default model to use when no session or agent model is selected",
  }),
  default_agent: Schema.String.pipe(Schema.optional).annotate({
    description: "Default primary agent to use when no session agent is selected",
  }),
  autoupdate: Schema.Union([Schema.Boolean, Schema.Literal("notify")])
    .pipe(Schema.optional)
    .annotate({
      description: "Automatically update or notify when a new version is available",
    }),
  username: Schema.String.pipe(Schema.optional).annotate({
    description: "Username displayed in conversations and used for telemetry identity",
  }),
  permissions: Permission.Ruleset.pipe(Schema.optional).annotate({
    description: "Ordered tool permission rules applied to agent tool use",
  }),
  agents: Schema.Record(Schema.String, ConfigAgent.Info).pipe(Schema.optional).annotate({
    description: "Named built-in agent overrides and custom agent definitions",
  }),
  snapshots: Schema.Boolean.pipe(Schema.optional).annotate({
    description: "Enable snapshots used for undo and revert behavior",
  }),
  watcher: ConfigWatcher.Info.pipe(Schema.optional).annotate({
    description: "Filesystem watcher configuration",
  }),
  formatter: ConfigFormatter.Info.pipe(Schema.optional).annotate({
    description: "Enable built-in formatters or configure formatter overrides",
  }),
  lsp: ConfigLSP.Info.pipe(Schema.optional).annotate({
    description: "Enable built-in language servers or configure server overrides",
  }),
  attachments: ConfigAttachments.Info.pipe(Schema.optional).annotate({
    description: "Attachment processing configuration",
  }),
  tool_output: ConfigToolOutput.Info.pipe(Schema.optional).annotate({
    description: "Tool output truncation thresholds",
  }),
  mcp: ConfigMCP.Info.pipe(Schema.optional).annotate({
    description: "MCP server configuration",
  }),
  compaction: ConfigCompaction.Info.pipe(Schema.optional).annotate({
    description: "Conversation compaction behavior",
  }),
  continuity: ConfigContinuity.Info.pipe(Schema.optional).annotate({
    description: "Context continuity: tool-output masking and background summaries",
  }),
  skills: Schema.String.pipe(Schema.Array, Schema.optional).annotate({
    description: "Additional paths or URLs to discover skills from",
  }),
  commands: Schema.Record(Schema.String, ConfigCommand.Info).pipe(Schema.optional).annotate({
    description: "Named slash command definitions",
  }),
  instructions: Schema.String.pipe(Schema.Array, Schema.optional).annotate({
    description: "Additional paths or URLs supplying ambient instructions",
  }),
  references: ConfigReference.Info.pipe(Schema.optional).annotate({
    description: "Named local directories or Git repositories available as external context",
  }),
  plugins: ConfigPlugin.Plugins.pipe(Schema.optional).annotate({
    description: "Ordered external plugin packages to load",
  }),
  experimental: ConfigExperimental.Experimental.pipe(Schema.optional),
  relay: ConfigRelay.Info.pipe(Schema.optional).annotate({ description: "Relay workflow and hook engine settings" }),
  research: ConfigResearch.Info.pipe(Schema.optional).annotate({
    description: "Resource caps of the discovery seat's research toolkit. A configured value can only lower its built-in cap.",
  }),
  maestro: ConfigMaestro.Info.pipe(Schema.optional).annotate({
    description: "Project-bound static Atlas/Own context for governed Maestro work",
  }),
  providers: Schema.Record(Schema.String, ConfigProvider.Info).pipe(Schema.optional),
}) {}

export class Document extends Schema.Class<Document>("Config.Document")({
  type: Schema.Literal("document"),
  path: Schema.String.pipe(Schema.optional),
  info: Info,
}) {}

export class Directory extends Schema.Class<Directory>("Config.Directory")({
  type: Schema.Literal("directory"),
  path: AbsolutePath,
}) {}

export type Entry = Document | Directory

export function latest<K extends keyof Info>(entries: readonly Entry[], key: K): Info[K] | undefined {
  return entries
    .filter((entry): entry is Document => entry.type === "document")
    .findLast((entry) => entry.info[key] !== undefined)?.info[key]
}

export interface Interface {
  /** Returns location config documents and supplemental directories from lowest to highest priority. */
  readonly entries: () => Effect.Effect<Entry[]>
  /** Returns packaged roots already admitted during required location initialization. */
  readonly packagedSkills?: () => Effect.Effect<readonly string[]>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/Config") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    // Required admission must fail before recoverable plugin boot can swallow packaging defects.
    const packagedSkills = yield* Effect.promise(() =>
      PackagedSkills.materialize({ cache: global.cache, version: InstallationVersion }),
    )
    const location = yield* Location.Service
    const policy = yield* Policy.Service
    const names = ["orchestra.json", "orchestra.jsonc"]
    const decodeOptions = { errors: "all", onExcessProperty: "ignore", propertyOrder: "original" } as const
    const decodeInfo = Schema.decodeUnknownOption(Info, decodeOptions)
    const decodeV1Info = Schema.decodeUnknownOption(ConfigV1.Info, decodeOptions)

    const loadFile = Effect.fnUntraced(function* (filepath: string) {
      const text = yield* fs.readFileStringSafe(filepath)
      if (!text) return

      const errors: ParseError[] = []
      const input: unknown = parse(text, errors, { allowTrailingComma: true })
      if (errors.length) return

      const info = Option.getOrUndefined(
        ConfigMigrateV1.isV1(input)
          ? decodeV1Info(input).pipe(Option.map(ConfigMigrateV1.migrate), Option.flatMap(decodeInfo))
          : decodeInfo(input),
      )
      if (!info) return
      return new Document({ type: "document", path: filepath, info })
    })

    const loadDirectory = Effect.fnUntraced(function* (directory: AbsolutePath) {
      return [
        ...(yield* Effect.forEach(names, (file) => loadFile(path.join(directory, file))).pipe(
          Effect.map((configs) => configs.filter((config): config is Document => config !== undefined)),
        )),
        new Directory({ type: "directory", path: directory }),
      ]
    })

    const globalDirectory = AbsolutePath.make(global.config)
    const locationIsGlobal = path.resolve(location.directory) === path.resolve(global.config)
    // Read configuration once when this location opens. Later calls reuse these
    // values until the location is reopened.
    const discovered = locationIsGlobal
      ? []
      : yield* fs
          .up({
            targets: [".orchestra", ...names.toReversed()],
            start: location.directory,
            stop: location.project.directory,
          })
          .pipe(Effect.orDie)
    const directories = [
      globalDirectory,
      ...discovered
        .filter((item) => path.basename(item) === ".orchestra")
        .toReversed()
        .map((directory) => AbsolutePath.make(directory)),
    ]
    // A config closer to the opened directory should win over one higher up.
    // Search starts nearby, so reverse the results before applying them.
    const directPaths = discovered.filter((item) => path.basename(item) !== ".orchestra").toReversed()
    const direct = yield* Effect.forEach(directPaths, loadFile).pipe(
      Effect.orDie,
      Effect.map((configs) => configs.filter((config): config is Document => config !== undefined)),
    )
    const supplementary = yield* Effect.forEach(directories, loadDirectory).pipe(Effect.orDie)
    // Apply general settings first and more specific settings last:
    // global config, project files, then `.orchestra` files.
    const configs = [...(supplementary[0] ?? []), ...direct, ...supplementary.slice(1).flat()]
    // Rules use the opposite order so a user-global rule can override a
    // repository rule. Statement order inside each file stays unchanged.
    const loadPolicies = (configs: ReadonlyArray<Document | Directory>) =>
      policy.load(
        configs
          .filter((config): config is Document => config.type === "document")
          .toReversed()
          .flatMap((config) => config.info.experimental?.policies ?? []),
      )
    yield* loadPolicies(configs)

    return Service.of({
      packagedSkills: () => Effect.succeed(packagedSkills),
      entries: Effect.fn("Config.entries")(function* () {
        // Global documents are read again so a settings write (`updateGlobal`) reaches the next agent or catalog
        // reload without reopening the location; project documents keep the snapshot taken at open.
        // Policies reload with them, so a disabled provider leaves the catalog on its next reload.
        const globals = yield* loadDirectory(globalDirectory).pipe(Effect.orDie)
        const configs = [...globals, ...direct, ...supplementary.slice(1).flat()]
        yield* loadPolicies(configs)
        return configs
      }),
    })
  }),
)

/** The settings the app writes into the user's global config document. */
export interface GlobalPatch {
  readonly model?: string
  /** The shell `!` commands, the bash tool and terminals use. */
  readonly shell?: string
  readonly agents?: Readonly<Record<string, { readonly engine?: "orchestra" | "claude-code" }>>
  /** The whole list of disabled providers, kept as exact `provider.use` deny policies. Replaces the previous list. */
  readonly disabledProviders?: ReadonlyArray<string>
  /** Custom providers by ID, each replacing any previous definition of that ID. */
  readonly providers?: Readonly<Record<string, unknown>>
}

/**
 * Merges settings into the global config document, editing the highest-priority existing file in place so
 * comments and unrelated keys survive. Readers see the change on their next `entries()` call.
 */
export const updateGlobal = Effect.fn("Config.updateGlobal")(function* (patch: GlobalPatch) {
  const fs = yield* FSUtil.Service
  const target = yield* globalDocument()
  const leaves = (value: unknown, at: string[]): [string[], unknown][] =>
    value !== null && typeof value === "object"
      ? Object.entries(value).flatMap(([key, item]) => leaves(item, [...at, key]))
      : value === undefined
        ? []
        : [[at, value]]
  const text = target.text?.trim() ? target.text : "{}"
  const next = [
    ...leaves({ model: patch.model, shell: patch.shell, agents: patch.agents }, []),
    ...(patch.disabledProviders === undefined ? [] : providerEdits(text, patch.disabledProviders)),
    ...Object.entries(patch.providers ?? {}).map(([id, value]): [string[], unknown] => [["providers", id], value]),
  ].reduce(
    (text, [at, value]) =>
      applyEdits(text, modify(text, at, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } })),
    text,
  )
  yield* fs.writeWithDirs(target.file, next).pipe(Effect.orDie)
})

/** The settings `updateGlobal` writes, read back from the global config document. */
export const readGlobal = Effect.fn("Config.readGlobal")(function* () {
  const document = settings((yield* globalDocument()).text ?? "{}")
  return {
    ...(typeof document.model === "string" ? { model: document.model } : {}),
    ...(typeof document.shell === "string" ? { shell: document.shell } : {}),
    // The per-agent engines `updateGlobal` writes; the app reads them back to show the Maestro engine it saved.
    agents: Object.fromEntries(
      Object.entries(document.agents).flatMap(([id, agent]): [string, { engine: "orchestra" | "claude-code" }][] => {
        const engine = agent !== null && typeof agent === "object" ? (agent as { engine?: unknown }).engine : undefined
        return engine === "orchestra" || engine === "claude-code" ? [[id, { engine }]] : []
      }),
    ) as Record<string, { engine: "orchestra" | "claude-code" }>,
    disabledProviders: [
      ...new Set([
        ...document.policies.filter(providerDenial).map((item) => item.resource),
        ...document.disabled.filter((item): item is string => typeof item === "string"),
      ]),
    ],
  }
})

const globalDocument = Effect.fnUntraced(function* () {
  const fs = yield* FSUtil.Service
  const global = yield* Global.Service
  // `orchestra.jsonc` loads after `orchestra.json`, so it wins when both exist.
  const files = yield* Effect.forEach(["orchestra.jsonc", "orchestra.json"], (name) => {
    const file = path.join(global.config, name)
    return fs.readFileStringSafe(file).pipe(Effect.map((text) => ({ file, text })))
  }).pipe(Effect.orDie)
  return files.find((item) => item.text !== undefined) ?? { file: path.join(global.config, "orchestra.json"), text: undefined }
})

// Disabled providers own the exact `provider.use` denials; other statements, such as an allowlist's `*` denial, stay.
// A legacy `disabled_providers` list is rewritten too, since the V1 migration appends it after every policy.
function providerEdits(text: string, disabled: ReadonlyArray<string>): [string[], unknown][] {
  const document = settings(text)
  return [
    [
      ["experimental", "policies"],
      [
        ...document.policies.filter((item) => !providerDenial(item)),
        ...disabled.map((id) => ({ action: "provider.use", effect: "deny", resource: id })),
      ],
    ],
    ...(document.hasDisabled ? [[["disabled_providers"], [...disabled]] as [string[], unknown]] : []),
  ]
}

function settings(text: string) {
  const document: unknown = parse(text)
  const record = (value: unknown): Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const root = record(document)
  const policies = record(root.experimental).policies
  return {
    model: root.model,
    shell: root.shell,
    agents: record(root.agents),
    policies: Array.isArray(policies) ? policies.map(record) : [],
    disabled: Array.isArray(root.disabled_providers) ? root.disabled_providers : [],
    hasDisabled: "disabled_providers" in root,
  }
}

function providerDenial(item: Record<string, unknown>): item is { action: "provider.use"; effect: "deny"; resource: string } {
  return item.action === "provider.use" && item.effect === "deny" && typeof item.resource === "string" && item.resource !== "*"
}

export const locationLayer = layer.pipe(Layer.provideMerge(Policy.locationLayer))

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [FSUtil.node, Global.node, Location.node, Policy.node],
})
