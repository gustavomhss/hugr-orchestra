# Exact source evidence

All spans are copied without code edits from verified baseline captures. Headers identify inclusive source lines and SHA-256 over the original span bytes. Display fencing adds a newline only when needed; span hashes bind the original bytes. Test spans describe source assertions only. Product execution: NOT_RUN.

## E01. Current decoder, discovery and global/project lifetime

Source: packages/core/src/config.ts:35–110; blob 52985a1dfc3575efca662dcb0667d81a1ab6f1de; exact-span SHA-256 abb3cc9d96fa87ebac4423a13e13e5a3ac54f4490ff3081504b0e5228c548d34.

```ts
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
  trusted_projects: Schema.String.pipe(Schema.Array, Schema.optional).annotate({
    description:
      "Absolute paths of projects (or folders holding projects) whose own config may start local MCP servers. Honored only in the user's global config.",
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
    description:
      "Additional local instruction files, relative to the config file that lists them. URLs are not supported. A project config may only name files inside the project.",
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
```

Source: packages/core/src/config.ts:161–204; blob 52985a1dfc3575efca662dcb0667d81a1ab6f1de; exact-span SHA-256 f00a178454a58e5130d04a98b0850f5785a7689dcbcf8521c2f3fb90c079ac7d.

```ts
    // Required admission must fail before recoverable plugin boot can swallow packaging defects.
    const packagedSkills = yield* Effect.promise(() =>
      PackagedSkills.materialize({ cache: global.cache, version: InstallationVersion }),
    )
    const location = yield* Location.Service
    const policy = yield* Policy.Service
    const names = ["orchestra.json", "orchestra.jsonc"]
    const decodeOptions = { errors: "all", onExcessProperty: "ignore", propertyOrder: "original" } as const
    const decodeInfo = Schema.decodeUnknownEffect(Info, decodeOptions)
    const decodeOldInfo = Schema.decodeUnknownEffect(ConfigUpgradeSource.Info, decodeOptions)

    const loadFile = Effect.fnUntraced(function* (filepath: string) {
      const text = yield* fs.readFileStringSafe(filepath)
      if (!text) return

      const errors: ParseError[] = []
      const input: unknown = parse(text, errors, { allowTrailingComma: true })
      if (errors.length)
        return yield* new InvalidError({
          path: filepath,
          message: `${filepath}: ${errors.map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`).join(", ")}`,
        })

      const info = yield* (
        ConfigUpgrade.needsUpgrade(input)
          ? decodeOldInfo(input).pipe(
              Effect.map(ConfigUpgrade.migrate),
              // Settings write current `permissions` into a file that may still hold old keys; the old-format decode drops them.
              Effect.map((info) => {
                const rules = [...(info.permissions ?? []), ...settings(text).permissions]
                return { ...info, permissions: rules.length ? rules : undefined }
              }),
              Effect.flatMap(decodeInfo),
            )
          : decodeInfo(input)
      ).pipe(Effect.mapError((error) => new InvalidError({ path: filepath, message: `${filepath}: ${error.message}` })))
      const remote = info.instructions?.find((entry) => /^[a-z][a-z0-9+.-]*:\/\//i.test(entry))
      if (remote !== undefined)
        return yield* new InvalidError({
          path: filepath,
          message: `${filepath}: instructions must be local file paths; remote URLs are not supported (${remote})`,
        })
      return new Document({ type: "document", path: filepath, info })
    })
```

Source: packages/core/src/config.ts:217–267; blob 52985a1dfc3575efca662dcb0667d81a1ab6f1de; exact-span SHA-256 fa90b98761d0d83e5e8f8b681e794f070487a686cb6a6bea64662d60b25ee3db.

```ts
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
```

## E02. Global settings writer, signature cache and provider-denial edits

Source: packages/core/src/config.ts:292–341; blob 52985a1dfc3575efca662dcb0667d81a1ab6f1de; exact-span SHA-256 690ed1d875e07ad6b549f137a8ba07c370d043a3a4362bcfd1dcdd62f05bac6c.

```ts
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
    // Written whole: `leaves` would edit array indices, and a shorter list must drop the old tail.
    ...(patch.permissions === undefined ? [] : [[["permissions"], [...patch.permissions]] as [string[], unknown]]),
    ...(patch.trustedProjects === undefined ? [] : [[["trusted_projects"], [...patch.trustedProjects]] as [string[], unknown]]),
  ].reduce(
    (text, [at, value]) =>
      applyEdits(text, modify(text, at, value, { formattingOptions: { insertSpaces: true, tabSize: 2 } })),
    text,
  )
  yield* fs.makeDirectory(path.dirname(target.file), { recursive: true }).pipe(Effect.orDie)
  yield* fs.writeAtomic(target.file, next).pipe(Effect.orDie)
  globalCache.delete(path.dirname(target.file))
})

/**
 * The settings `updateGlobal` writes, read back from the global config document. The decoded result is
 * cached per config directory and reused while both config files keep the same mtime, size and inode;
 * `updateGlobal` drops the entry. Callers get their own copy.
 */
export const readGlobal = Effect.fn("Config.readGlobal")(function* () {
  const fs = yield* FSUtil.Service
  const directory = (yield* Global.Service).config
  const signature = (yield* Effect.forEach(["orchestra.jsonc", "orchestra.json"], (name) =>
    fs.stat(path.join(directory, name)).pipe(
      Effect.map(
        (info) =>
          `${Option.getOrElse(Option.map(info.mtime, (date) => date.getTime()), () => 0)}:${info.size}:${Option.getOrElse(info.ino, () => 0)}`,
      ),
      Effect.orElseSucceed(() => "absent"),
    ),
  )).join("|")
  const cached = globalCache.get(directory)
  if (cached?.signature === signature) return structuredClone(cached.value)
  const value = yield* readGlobalDocument()
  globalCache.set(directory, { signature, value })
  return structuredClone(value)
})
```

Source: packages/core/src/config.ts:372–396; blob 52985a1dfc3575efca662dcb0667d81a1ab6f1de; exact-span SHA-256 d39b0602682f1aaac7447c752da1e8c5fa570a113251a2c353fc7dd749fab5a5.

```ts
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
// A legacy `disabled_providers` list is rewritten too, since the config upgrade appends it after every policy.
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
```

Source: packages/core/src/config.ts:417–419; blob 52985a1dfc3575efca662dcb0667d81a1ab6f1de; exact-span SHA-256 4c3df25937b405a7345dcfe363080600472f82c4a9d92c4dd43b8b3d80d482bc.

```ts
function providerDenial(item: Record<string, unknown>): item is { action: "provider.use"; effect: "deny"; resource: string } {
  return item.action === "provider.use" && item.effect === "deny" && typeof item.resource === "string" && item.resource !== "*"
}
```

## E03. Read error suppression and global-write helper

Source: packages/core/src/fs-util.ts:71–75; blob 695361a7b2812386ceb0dfcc0f535c146e744a9e; exact-span SHA-256 f77e2f49d8df118ba5f33658b6822992850a95a835c89f62847e843bd86bf2d2.

```ts
      const readFileStringSafe = Effect.fn("FileSystem.readFileStringSafe")(function* (path: string) {
        return yield* fs.readFileString(path).pipe(
          Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
          Effect.catchReason("PlatformError", "PermissionDenied", () => Effect.succeed(undefined)),
        )
```

Source: packages/core/src/fs-util.ts:119–127; blob 695361a7b2812386ceb0dfcc0f535c146e744a9e; exact-span SHA-256 3f53066ce5df8c9a30f993dc9eb9680dfd7b53a3f17b7e5aa1cda6103286debe.

```ts
      const writeAtomic = Effect.fn("FileSystem.writeAtomic")(function* (path: string, content: string, mode?: number) {
        // Write to the real file when the path is a symlink, so the link survives the rename.
        const target = yield* fs.realPath(path).pipe(Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(path)))
        const temp = `${target}.${process.pid}.${Date.now()}.tmp`
        yield* fs.writeFileString(temp, content).pipe(
          Effect.andThen(mode ? fs.chmod(temp, mode) : Effect.void),
          Effect.andThen(fs.rename(temp, target)),
          Effect.tapError(() => fs.remove(temp, { force: true }).pipe(Effect.ignore)),
        )
```

## E04. Live legacy detection, mapping and policy precedence

Source: packages/core/src/config/upgrade/upgrade.ts:13–41; blob 581d2e879c6a70587a2a0c675c7433eddb9e85d7; exact-span SHA-256 87ae606ad9739174a422c5a1ebd41a126a40a0d08cfb073b30f04ceca0bf6b17.

```ts
const keys = new Set([
  "logLevel",
  "server",
  "command",
  "reference",
  "snapshot",
  "plugin",
  "disabled_providers",
  "enabled_providers",
  "small_model",
  "mode",
  "agent",
  "provider",
  "permission",
  "tools",
  "attachment",
  "layout",
])

export function needsUpgrade(input: unknown) {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return false
  return Object.keys(input).some((key) => keys.has(key)) || ("mcp" in input && oldMcp(input.mcp))
}

// An old-format `mcp` maps server names to entries; the current format nests them under `servers`. A file whose only old key is `mcp`, such as
// one `orchestra mcp add` created, still needs the upgrade.
function oldMcp(mcp: unknown) {
  if (typeof mcp !== "object" || mcp === null) return false
  return Object.values(mcp).some((entry) => typeof entry === "object" && entry !== null && "type" in entry)
```

Source: packages/core/src/config/upgrade/upgrade.ts:44–129; blob 581d2e879c6a70587a2a0c675c7433eddb9e85d7; exact-span SHA-256 c89cff48ead1416215812216b2f1c2642e7d30a244142bb475e2085677666890.

```ts
export function migrate(info: typeof ConfigUpgradeSource.Info.Type) {
  return {
    $schema: info.$schema,
    shell: info.shell,
    model: info.model,
    default_agent: info.default_agent,
    permissions: permissions(info.permission, info.tools),
    agents: agents(info),
    snapshots: info.snapshot,
    watcher: info.watcher,
    formatter: info.formatter,
    lsp: info.lsp,
    attachments: info.attachment,
    tool_output: info.tool_output,
    mcp: mcp(info),
    compaction: info.compaction && {
      auto: info.compaction.auto,
      prune: info.compaction.prune,
      keep: {
        tokens: info.compaction.preserve_recent_tokens,
      },
      buffer: info.compaction.reserved,
    },
    continuity: info.continuity,
    skills: info.skills && [...(info.skills.paths ?? []), ...(info.skills.urls ?? [])],
    commands: info.command,
    instructions: info.instructions,
    references: info.references ?? info.reference,
    plugins: info.plugin?.map((plugin) =>
      typeof plugin === "string" ? plugin : { package: plugin[0], options: plugin[1] },
    ),
    experimental: policies(info),
    relay: info.relay,
    research: info.research,
    // Encoded, so a decoded old-format value's undefined keys stay absent as the current document schema requires.
    maestro: info.maestro && Schema.encodeSync(ConfigMaestro.Info)(info.maestro),
    providers: providers(info.provider),
  }
}

function policies(info: typeof ConfigUpgradeSource.Info.Type) {
  const original = info.experimental?.policies ?? []
  // Legacy allowlists and disabled providers are restrictions, not authentication. Preserve existing
  // policy denials for allowed IDs, then place disabled IDs last so an allow cannot revive them.
  const allowed = info.enabled_providers
  const statements = [
    ...original,
    ...(allowed === undefined
      ? []
      : [
          { action: "provider.use", effect: "deny" as const, resource: "*" },
          ...allowed.map((id) => ({
            action: "provider.use",
            resource: id,
            effect:
              original.findLast(
                (policy) => Wildcard.match("provider.use", policy.action) && Wildcard.match(id, policy.resource),
              )?.effect ?? ("allow" as const),
          })),
        ]),
    ...(info.disabled_providers ?? []).map((id) => ({ action: "provider.use", effect: "deny" as const, resource: id })),
  ]
  return statements.length ? { policies: statements } : undefined
}

function permissions(info?: ConfigUpgradePermission.Info, tools?: Readonly<Record<string, boolean>>) {
  const rules: Array<{ action: string; resource: string; effect: ConfigUpgradePermission.Action }> = Object.entries(
    tools ?? {},
  ).map(([action, enabled]) => ({
    action: normalizeAction(action),
    resource: "*",
    effect: enabled ? ("allow" as const) : ("deny" as const),
  }))
  for (const [action, rule] of Object.entries(info ?? {})) {
    if (!rule) continue
    if (typeof rule === "string") {
      rules.push({ action, resource: "*", effect: rule })
      continue
    }
    rules.push(...Object.entries(rule).map(([resource, effect]) => ({ action, resource, effect })))
  }
  return rules.length ? rules : undefined
}

function normalizeAction(action: string) {
  return action === "write" || action === "patch" ? "edit" : action
```

Source: packages/core/src/config/upgrade/source.ts:1–23; blob df3f45e41effe725e09fd540048c85432cec15ca; exact-span SHA-256 b7bd8e80a95c600968c0bc9a122fd99c0f12ef4c327023a7029711b157794714.

```ts
export * as ConfigUpgradeSource from "./source"

// The older `orchestra.json` layout. Config files on disk may still use it, so loading reads it with this schema and
// ConfigUpgrade.migrate rewrites it into the current Config.Info shape.

import { Schema } from "effect"
import { ConfigMaestro } from "@orchestra/schema/config-maestro"
import { NonNegativeInt, PositiveInt, type DeepMutable } from "../../schema"
import { ConfigExperimental } from "../experimental"
import { ConfigReference } from "../reference"
import { ConfigRelay } from "../relay"
import { ConfigUpgradeAgent } from "./agent"
import { ConfigUpgradeAttachment } from "./attachment"
import { ConfigUpgradeCommand } from "./command"
import { ConfigUpgradeFormatter } from "./formatter"
import { ConfigUpgradeLSP } from "./lsp"
import { ConfigUpgradeMCP } from "./mcp"
import { ConfigUpgradePermission } from "./permission"
import { ConfigUpgradePlugin } from "./plugin"
import { ConfigUpgradeProvider } from "./provider"
import { ConfigUpgradeSkills } from "./skills"

export const Info = Schema.Struct({
```

## E05. Policy last-match behavior and user trust admission

Source: packages/core/src/policy.ts:31–42; blob 043d52eec849a25d2f904152cbe2afd1b83a78ef; exact-span SHA-256 9b7c0d46284e9c276e99d69a74995192ed94d6c73a8c773d7a2eb2cd725c2124.

```ts
    return Service.of({
      load: EffectRuntime.fn("Policy.load")(function* (input) {
        statements = input
      }),
      hasStatements: () => statements.length > 0,
      evaluate: EffectRuntime.fn("Policy.evaluate")(function* (action, resource, fallback) {
        return (
          statements.findLast(
            (statement) => Wildcard.match(action, statement.action) && Wildcard.match(resource, statement.resource),
          )?.effect ?? fallback
        )
      }),
```

Source: packages/core/src/config/trust.ts:12–29; blob a8b068f1fdb5c01e59ad43c56b9e6241ec3dfc78; exact-span SHA-256 a742518211976b5fe7a9b14986afb7cbc5b40f86be0e77998a89a2c81a5da4ed.

```ts
/** Whether a config entry is the user's own: under the global config folder, or a document with no file. */
export function isUser(globalConfig: string, entry: Config.Entry) {
  return entry.path === undefined || within(globalConfig, entry.path)
}

/** Whether `directory` is, or is inside, a path listed in `trusted_projects` of the user's own config. */
export function isTrusted(entries: readonly Config.Entry[], globalConfig: string, directory: string) {
  return entries
    .filter((entry): entry is Config.Document => entry.type === "document")
    .filter((entry) => isUser(globalConfig, entry))
    .flatMap((entry) => entry.info.trusted_projects ?? [])
    .some((root) => within(root, directory))
}

/** The entries whose declared commands may run: all of them for a trusted project, otherwise only the user's own. */
export function runnable(entries: readonly Config.Entry[], globalConfig: string, directory: string) {
  return isTrusted(entries, globalConfig, directory) ? entries : entries.filter((entry) => isUser(globalConfig, entry))
}
```

Source: packages/core/src/config/trust.ts:40–56; blob a8b068f1fdb5c01e59ad43c56b9e6241ec3dfc78; exact-span SHA-256 d2eace66bb17b674247531829de1ab87fd8c3ec15d19057220330530c89f1895.

```ts
/** Approves a project folder in the user's global config. A folder already trusted, directly or through a parent, changes nothing. */
export const approve = Effect.fn("ConfigTrust.approve")(function* (directory: string) {
  const root = yield* canonical(directory)
  const trusted = yield* list()
  if (trusted.some((item) => within(item, root))) return
  yield* Config.updateGlobal({ trustedProjects: [...trusted, root] })
})

/** Removes a folder's own entry from the user's global config. A folder trusted only through a parent stays trusted. */
export const revoke = Effect.fn("ConfigTrust.revoke")(function* (directory: string) {
  const fs = yield* FSUtil.Service
  const root = yield* fs.resolve(directory)
  const trusted = yield* list()
  const resolved = yield* Effect.forEach(trusted, (item) => fs.resolve(item))
  const kept = trusted.filter((_, index) => resolved[index] !== root)
  if (kept.length === trusted.length) return
  yield* Config.updateGlobal({ trustedProjects: kept })
```

Source: packages/core/src/config/trust.ts:63–81; blob a8b068f1fdb5c01e59ad43c56b9e6241ec3dfc78; exact-span SHA-256 c07cc5a986c629e4f7343b329fc5bfb380659d8e2b67f526766c01f64dc6a44f.

```ts
// The real path of an existing absolute folder, so a symlink and its target store as one entry.
const canonical = Effect.fnUntraced(function* (directory: string) {
  const fs = yield* FSUtil.Service
  if (!path.isAbsolute(directory))
    return yield* new DirectoryError({ message: `Project folder must be an absolute path: ${directory}` })
  if (!(yield* fs.isDir(directory)))
    return yield* new DirectoryError({ message: `Project folder does not exist: ${directory}` })
  const real = yield* fs.realPath(directory).pipe(Effect.orDie)
  if (path.parse(real).root === real)
    return yield* new DirectoryError({
      message: "The filesystem root cannot be trusted: it would approve every project on this machine.",
    })
  return real
})

// Whether `target` is `root` or inside it.
export function within(root: string, target: string) {
  const relative = path.relative(path.resolve(root), path.resolve(target))
  return relative.split(path.sep)[0] !== ".." && !path.isAbsolute(relative)
```

## E06. Actual exported schema and its two source-visible publishers

Source: apps/cli/script/schema-files.ts:11–61; blob b965bf921f0a75ab6abfd2149e1d24b50f86f83b; exact-span SHA-256 3e12bea9819683da8ea626ee60f3fcc6fe67800673615dcfc5797cfe281f22c0.

```ts
export function generateEffect(schema: Schema.Top) {
  const document = Schema.toJsonSchemaDocument(schema)
  const normalized = normalize({
    $schema: "https://json-schema.org/draft/2020-12/schema",
    ...document.schema,
    $defs: document.definitions,
  })
  if (!isRecord(normalized)) throw new Error("schema generator produced a non-object schema")
  const restored = restoreModelRefs(normalized)
  if (!isRecord(restored)) throw new Error("schema generator produced a non-object schema")
  restored.allowComments = true
  restored.allowTrailingCommas = true
  return restored
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize)
  if (!isRecord(value)) return value

  const schema = Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalize(item)]))

  if (Array.isArray(schema.anyOf)) {
    const anyOf = schema.anyOf.filter((item) => !isRecord(item) || item.type !== "null")
    if (anyOf.length !== schema.anyOf.length) {
      const { anyOf: _, ...rest } = schema
      if (anyOf.length === 1 && isRecord(anyOf[0])) return normalize({ ...anyOf[0], ...rest })
      return { ...rest, anyOf }
    }
  }

  if (Array.isArray(schema.allOf) && schema.allOf.length === 1 && isRecord(schema.allOf[0])) {
    const { allOf: _, ...rest } = schema
    return normalize({ ...schema.allOf[0], ...rest })
  }

  if (schema.type === "integer" && schema.maximum === undefined) {
    return { ...schema, maximum: Number.MAX_SAFE_INTEGER }
  }

  return schema
}

function restoreModelRefs(value: unknown, key?: string): unknown {
  if (Array.isArray(value)) return value.map((item) => restoreModelRefs(item))
  if (!isRecord(value)) return value

  const schema = Object.fromEntries(Object.entries(value).map(([name, item]) => [name, restoreModelRefs(item, name)]))
  if ((key === "model" || key === "small_model") && schema.type === "string") {
    return { ...schema, $ref: MODEL_REF }
  }
  return schema
```

Source: apps/cli/script/schema-files.ts:68–83; blob b965bf921f0a75ab6abfd2149e1d24b50f86f83b; exact-span SHA-256 aecb82e27e41d18c2677962261854e2216728b4a674a9ae058e89d4cb3124988.

```ts
export const configSchemaFile = path.resolve(import.meta.dir, "../../../schema/config.json")
export const tuiSchemaFile = path.resolve(import.meta.dir, "../../../schema/tui.json")
export const themeSchemaFile = path.resolve(import.meta.dir, "../../../schema/theme.json")
export const themeSchemaSource = path.resolve(import.meta.dir, "../../../packages/ui/src/theme/desktop-theme.schema.json")

export const configSchemaText = () => JSON.stringify(generateEffect(Config.Info), null, 2)
export const tuiSchemaText = () => JSON.stringify(generateEffect(TuiConfig.Info), null, 2)

// schema/ is what editors fetch through the $schema URLs; the theme schema is hand-written in packages/ui and mirrored verbatim.
if (import.meta.main) {
  await Bun.write(configSchemaFile, configSchemaText())
  await Bun.write(tuiSchemaFile, tuiSchemaText())
  await Bun.write(themeSchemaFile, Bun.file(themeSchemaSource))
  console.log(configSchemaFile)
  console.log(tuiSchemaFile)
  console.log(themeSchemaFile)
```

Source: apps/cli/script/schema.ts:1–27; blob d590a1671d7c3034652b842fc330080f2ae21086; exact-span SHA-256 2bfffb625a6523c85c5681f44906505c0f701cb966fbf37a49fa45b8b99b24ca.

```ts
#!/usr/bin/env bun

const args = process.argv.slice(2)
if (args.length !== 1 || !args[0]) {
  console.error("Usage: bun --bun apps/cli/script/schema.ts <output>")
  process.exit(2)
}

// Validate arguments before loading config dependencies or touching the output.
const { Config } = await import("@orchestra/core/config")
const { Schema } = await import("effect")
const document = Schema.toJsonSchemaDocument(Config.Info)

await Bun.write(
  args[0],
  JSON.stringify(
    {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      ...document.schema,
      $defs: document.definitions,
      allowComments: true,
      allowTrailingCommas: true,
    },
    null,
    2,
  ) + "\n",
)
```

Source: schema/config.json:1–4; blob ba9b5d2121a9a3bda733cba0459094b69757ede6; exact-span SHA-256 80e43edc1b9ca0dc0ac5f1ec0741047f1bcdd98eafabb0a4e3b49f39705efa4a.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$ref": "#/$defs/Config.Info",
  "$defs": {
```

Source: schema/config.json:1054–1078; blob ba9b5d2121a9a3bda733cba0459094b69757ede6; exact-span SHA-256 7c72b4cb79c7154797ed7594c95ca93b7c78494fae912d731a8b3efa05d901b2.

```json
    "Config.Info": {
      "type": "object",
      "properties": {
        "$schema": {
          "type": "string",
          "description": "JSON schema reference for configuration validation"
        },
        "shell": {
          "type": "string",
          "description": "Default shell to use for terminal and shell tool execution"
        },
        "model": {
          "type": "string",
          "description": "Default model to use when no session or agent model is selected",
          "$ref": "https://models.dev/model-schema.json#/$defs/Model"
        },
        "default_agent": {
          "type": "string",
          "description": "Default primary agent to use when no session agent is selected"
        },
        "permissions": {
          "$ref": "#/$defs/PermissionV2.Ruleset",
          "description": "Ordered tool permission rules applied to agent tool use"
        },
        "agents": {
```

Source: schema/config.json:1223–1246; blob ba9b5d2121a9a3bda733cba0459094b69757ede6; exact-span SHA-256 8868f0bbc5588596c926f750425162eca2c5dc057b8e1640718d3d140568cd7f.

```json
          "$ref": "#/$defs/ConfigV2.Relay",
          "description": "Relay workflow and hook engine settings"
        },
        "research": {
          "$ref": "#/$defs/ConfigV2.Research",
          "description": "Resource caps of the discovery seat's research toolkit. A configured value can only lower its built-in cap."
        },
        "maestro": {
          "$ref": "#/$defs/Config.Maestro",
          "description": "Project-bound static Atlas/Own context for governed Maestro work"
        },
        "providers": {
          "type": "object",
          "additionalProperties": {
            "$ref": "#/$defs/ConfigV2.Provider"
          }
        }
      },
      "additionalProperties": false
    }
  },
  "allowComments": true,
  "allowTrailingCommas": true
}
```

## E07. External plugin trust selection and recovered setup failure

Source: packages/core/src/config/plugin/external.ts:41–107; blob cb47c685fb303085f39ba1b520c9c740701941fe; exact-span SHA-256 06b906944cf3cb208fb56df22de12db21e6e39e07a4c5fb1273c3bd313e8c040.

```ts

export const Plugin = define({
  id: "config-plugin",
  effect: Effect.fn(function* (ctx) {
    const config = yield* Config.Service
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const location = yield* Location.Service
    const npm = yield* Npm.Service
    yield* Effect.gen(function* () {
      const configured: { package: string; options?: Record<string, any> }[] = []

      const entries = yield* config.entries()
      // A project's plugins are code the repository chose to run: they load only once the user trusts the project.
      const allowed = ConfigTrust.runnable(entries, global.config, location.directory)
      if (entries.some((entry) => !allowed.includes(entry) && (entry.type === "directory" || entry.info.plugins?.length)))
        yield* Effect.logWarning(`Project plugins not loaded. ${ConfigTrust.approveHint(location.directory)}`)

      for (const entry of allowed) {
        if (entry.type === "document") {
          const directory = entry.path ? path.dirname(entry.path) : location.directory
          for (const item of entry.info.plugins ?? []) {
            const ref = typeof item === "string" ? { package: item } : item
            const packageName = (() => {
              if (ref.package.startsWith("file://")) return fileURLToPath(ref.package)
              if (ref.package.startsWith("./") || ref.package.startsWith("../")) {
                return path.resolve(directory, ref.package)
              }
              return ref.package
            })()
            configured.push({ package: packageName, options: ref.options })
          }
        }

        if (entry.type === "directory") {
          const files = yield* fs
            .glob("{plugin,plugins}/*.{ts,js}", {
              cwd: entry.path,
              absolute: true,
              include: "file",
              dot: true,
              symlink: true,
            })
            .pipe(Effect.orElseSucceed(() => []))
          files.sort()
          for (const file of files) configured.push({ package: file })
        }
      }

      for (const ref of configured) {
        yield* Effect.gen(function* () {
          const entrypoint = path.isAbsolute(ref.package)
            ? pathToFileURL(ref.package).href
            : (yield* npm.add(ref.package)).entrypoint
          if (!entrypoint) return

          const value = yield* Effect.promise(() => loadExternalPlugin(entrypoint, path.isAbsolute(ref.package) ? path.dirname(ref.package) : undefined))
          const plugin = "effect" in value ? value : PluginPromise.fromPromise(value)
          yield* ctx.plugin.add({
            id: plugin.id,
            effect: (host) => plugin.effect({ ...host, options: ref.options ?? {} }),
          })
        }).pipe(Effect.catchCause((cause) => Effect.logError("External plugin setup blocked", cause)))
      }
    }).pipe(Effect.forkScoped({ startImmediately: true }))
  }),
})
```

## E08. Distinct agent-file and plugin-file writer contracts

Source: packages/core/src/config/agent-file.ts:32–35; blob a9c4b087c78a6e6de5cc809091d583d16838b662; exact-span SHA-256 577ab1ecb3b988e68e0101bda4bbf3920e7091183cb54133d9ae63a743c37249.

```ts
/** Agent names become file names, so only short plain segments are writable. */
export function validName(name: string) {
  return NAME.test(name) && !RESERVED.test(name)
}
```

Source: packages/core/src/config/agent-file.ts:45–70; blob a9c4b087c78a6e6de5cc809091d583d16838b662; exact-span SHA-256 e3da2d0691660225ad82d54bbd63e1272836dcb3c7c3924704dfe3c5fe6fd0d0.

```ts
export const write = Effect.fn("ConfigAgentFile.write")(function* (
  directory: string,
  name: string,
  input: AgentFile.Input,
) {
  const fs = yield* FSUtil.Service
  const filepath = yield* locate(fs, directory, name)
  // Every session runs on Maestro, so its file may neither disable it nor take it out of primary mode.
  if (name === AgentV2.defaultID && (input.disable || (input.mode ?? "primary") !== "primary"))
    return yield* new RejectedError({
      path: filepath,
      reason: "protected",
      message: "Maestro runs every session, so it cannot be disabled or set to a mode other than primary.",
    })
  const existing = yield* content(fs, filepath)
  if (input.revision !== undefined && input.revision !== revision(existing))
    return yield* new ConflictError({ path: filepath, message: "The agent file changed since it was read." })
  const next = render(existing, input)
  if (next === undefined)
    return yield* new RejectedError({
      path: filepath,
      reason: "unparseable",
      message: "The agent file's front matter cannot be parsed. Fix it by hand.",
    })
  yield* replace(fs, filepath, next)
  return info(filepath, next)
```

Source: packages/core/src/config/agent-file.ts:146–190; blob a9c4b087c78a6e6de5cc809091d583d16838b662; exact-span SHA-256 c45d0f3027f296d6dc1f3cca3649ebf8e97ec1c5a043b422bc17af6303c8eecf.

```ts
const locate = Effect.fnUntraced(function* (fs: FSUtil.Interface, directory: string, name: string) {
  const folders = ["agent", "agents"].map((folder) => path.join(directory, ".orchestra", folder))
  const file = `${name}.md`
  const listed = yield* Effect.forEach(folders, (folder) =>
    fs.readDirectoryEntries(folder).pipe(Effect.orElseSucceed((): FSUtil.DirEntry[] => [])),
  )
  // Discovery names an agent after the file's own spelling, so on a case-insensitive disk `Plan.md`
  // would take a write meant for `plan` while still loading as `Plan`.
  if (listed.flat().some((entry) => entry.name !== file && entry.name.toLowerCase() === file.toLowerCase()))
    return yield* new RejectedError({
      path: path.join(folders[0], file),
      reason: "case",
      message: "An agent file with the same name in different letter case already exists.",
    })
  // Discovery applies `agent/` before `agents/`, so the `agents/` definition wins; edit the winning file.
  const owner = folders.filter((_, index) => listed[index].some((entry) => entry.name === file)).at(-1)
  const filepath = path.join(owner ?? folders[0], file)
  yield* confine(fs, directory, filepath)
  return filepath
})

// Refuse a `.orchestra`, folder or file that resolves outside the profile through a symlink.
const confine = Effect.fnUntraced(function* (fs: FSUtil.Interface, directory: string, filepath: string) {
  const root = yield* fs.realPath(directory)
  const resolved = yield* Effect.forEach([path.join(directory, ".orchestra"), path.dirname(filepath), filepath], (item) =>
    fs.realPath(item).pipe(Effect.orElseSucceed(() => undefined)),
  )
  if (resolved.every((item) => item === undefined || item === root || item.startsWith(root + path.sep))) return
  return yield* new RejectedError({
    path: filepath,
    reason: "outside",
    message: "The agent file resolves outside this profile.",
  })
})

// Write beside the target and rename over it, so readers never see a partial file.
const replace = Effect.fnUntraced(function* (fs: FSUtil.Interface, filepath: string, text: string) {
  const folder = path.dirname(filepath)
  const temp = path.join(folder, `.${path.basename(filepath)}.${randomUUID()}.tmp`)
  yield* fs.ensureDir(folder)
  yield* fs.writeFileString(temp, text).pipe(
    Effect.andThen(fs.rename(temp, filepath)),
    Effect.tapError(() => fs.remove(temp).pipe(Effect.ignore)),
  )
})
```

Source: packages/core/src/config/plugin-file.ts:10–47; blob 5a17a19e04defc4a2fccfd1b2b7be113528d45df; exact-span SHA-256 6f5bc0ec20c0c97f086c7ebc73def0ea7cf29e96206506474d334831c5aa6507.

```ts
export function files(directory: string) {
  return [
    path.join(directory, "orchestra.json"),
    path.join(directory, "orchestra.jsonc"),
    path.join(directory, ".orchestra", "orchestra.json"),
    path.join(directory, ".orchestra", "orchestra.jsonc"),
  ]
}

/** The package an entry names: a spec without its version (`@scope/pkg@1.2` is `@scope/pkg`). */
export function packageName(spec: string) {
  const at = spec.lastIndexOf("@")
  return at > 0 ? spec.slice(0, at) : spec
}

/**
 * Registers a plugin package in a directory's config `plugins`, keeping comments and formatting. An entry for the same
 * package stays as it is unless `force` replaces it. The first existing config file is edited, else `orchestra.json`.
 */
export async function add(directory: string, spec: string, options: { readonly force?: boolean } = {}): Promise<Result> {
  const file = (await Promise.all(files(directory).map(async (item) => ((await Bun.file(item).exists()) ? item : undefined)))).find(
    (item) => item !== undefined,
  ) ?? files(directory)[0]
  const text = (await Bun.file(file).exists()) ? await Bun.file(file).text() : "{}"
  const errors: ParseError[] = []
  const document = parse(text, errors, { allowTrailingComma: true })
  if (errors.length > 0) throw new Error(`Invalid JSON in ${file} (${printParseErrorCode(errors[0].error)} at offset ${errors[0].offset})`)
  const existing: unknown[] = Array.isArray(document?.plugins) ? document.plugins : []

  const name = packageName(spec)
  const index = existing.findIndex((entry) => packageName(typeof entry === "string" ? entry : String((entry as { package?: unknown })?.package ?? "")) === name)
  if (index >= 0 && (!options.force || existing[index] === spec)) return { file, mode: "noop" }

  const format = { formattingOptions: { tabSize: 2, insertSpaces: true } }
  const edits = modify(text, ["plugins", index >= 0 ? index : existing.length], spec, { ...format, isArrayInsertion: index < 0 })
  await Bun.write(file, applyEdits(text, edits))
  return { file, mode: index >= 0 ? "replace" : "add" }
}
```

## E09. Location schema and bound identity

Source: packages/schema/src/location.ts:1–25; blob c01ce36372a698a289b1591466d4b01b323543d9; exact-span SHA-256 69198bd4bcbec4dc406d5e8d35977ccb3174828fee859814462e3278caf2a603.

```ts
export * as Location from "./location"

import { Schema } from "effect"
import { AbsolutePath, optional } from "./schema"
import { ProjectID } from "./project-id"
import { WorkspaceID } from "./workspace-id"

export interface Ref extends Schema.Schema.Type<typeof Ref> {}
export const Ref = Schema.Struct({
  directory: AbsolutePath,
  workspaceID: optional(WorkspaceID),
}).annotate({ identifier: "Location.Ref" })

export class Info extends Schema.Class<Info>("Location.Info")({
  directory: AbsolutePath,
  workspaceID: optional(WorkspaceID),
  project: Schema.Struct({
    id: ProjectID,
    directory: AbsolutePath,
  }),
}) {}

export function response<S extends Schema.Top>(data: S) {
  return Schema.Struct({ location: Info, data })
}
```

Source: packages/core/src/location.ts:19–39; blob af889448fe9340187266ab622cb7249751e52328; exact-span SHA-256 60f01c9d73be59c5f53e69470453b684c117c1db317a2675cbc2fe5bf3adc985.

```ts
const layer = (ref: Ref) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const project = yield* Project.Service
      const resolved = yield* project.resolve(ref.directory)
      return Service.of({
        directory: ref.directory,
        workspaceID: ref.workspaceID,
        project: { id: resolved.id, directory: resolved.directory },
        vcs: resolved.vcs,
      })
    }),
  )

export const boundNode = (ref: Ref) =>
  makeLocationNode({
    service: Service,
    layer: layer(ref),
    deps: [Project.node],
  })
```

## E10. Location graph freshness, hoisting, recovery and completed globals

Source: packages/core/src/location-services.ts:58–111; blob c754426dde31acad2dbbfd96459b32624cfdd2e4; exact-span SHA-256 4aa853d4a95847f103377ea8ab5a6cacd0ec760a1d05b6ac5708b3ccf9c55115.

```ts
export const locationServices = LayerNode.group([
  Location.node,
  Policy.node,
  Config.node,
  AgentV2.node,
  CommandV2.node,
  Reference.node,
  Integration.node,
  Catalog.node,
  AISDK.node,
  PluginV2.node,
  PluginInternal.node,
  ProjectCopy.node,
  ProjectCopy.refreshNode,
  PullRequest.node,
  Guardrail.node,
  Actions.node,
  FileSystemSearch.node,
  FileSystem.node,
  Watcher.node,
  Pty.node,
  SkillV2.node,
  SystemContextRegistry.node,
  SystemContextBuiltIns.node,
  BehaviorV2.node,
  LocationMutation.node,
  FileMutation.node,
  PermissionV2.node,
  ToolOutputStore.node,
  ToolRegistry.node,
  ToolRegistry.toolsNode,
  Image.node,
  SkillGuidance.node,
  ReferenceGuidance.node,
  SessionTodo.node,
  SessionMeeting.node,
  MeetingBriefing.node,
  MeetingContext.node,
  MeetingHandoff.node,
  QuestionV2.node,
  ReadToolFileSystem.node,
  BuiltInTools.node,
  Mcp.node,
  LSP.node,
  Format.node,
  SessionRunnerModel.node,
  Snapshot.node,
  Relay.node,
  RelayHookRecovery.node,
  TaskGovernance.node,
  SessionCompaction.node,
  SessionRunnerLLM.node,
  MeetingConsolidation.node,
])
```

Source: packages/core/src/location-services.ts:123–164; blob c754426dde31acad2dbbfd96459b32624cfdd2e4; exact-span SHA-256 e96362c6caaa6399e7eaf56456d7c40d003938f328ff11d3e1a0502f282b97e3.

```ts
      // A hoisted global (for example Arsenal observations) may depend on the Location map itself. Its node is
      // unbound inside the hoisted graph, so it is bound to this map once the map exists.
      const self = Deferred.makeUnsafe<Context.Service.Shape<typeof LocationServiceMap.Service>>()
      const locations = yield* LayerMap.make(
        (ref: Location.Ref) => {
          const allReplacements: LayerNode.Replacements = [
            [ToolRegistry.node, ToolRegistry.nativeNode],
            [ToolRegistry.toolsNode, ToolRegistry.nativeToolsNode],
            ...replacements,
            [Location.node, Location.boundNode(ref)],
          ]
          // Apply replacements during hoist, not afterward: replacements can
          // introduce new tagged dependencies (Location.boundNode depends on
          // Project), and the hoist walk is the only pass that can still slice
          // those back out.
          const location = LayerNode.hoist(LayerNode.group([locationServices, ...extra]), Node.tags.values.global, allReplacements)
          // Contributed nodes (Host.Contribution.locationNodes) add services; the map still exposes LocationServices.
          const services: Layer.Layer<LocationServices, LocationError> = LayerNode.compile(location.node)

          return services.pipe(
            Layer.fresh,
            Layer.tap((context) =>
              Effect.gen(function* () {
                const recovery = Context.get(context, RelayHookRecovery.Service)
                yield* Effect.logInfo("booting location services", {
                  directory: ref.directory,
                  workspaceID: ref.workspaceID,
                })
                // Start only after the entire graph succeeds; the Location scope owns this one pass.
                yield* recovery.recover().pipe(Effect.forkScoped)
              }),
            ),
            Layer.provide(
              LayerNode.compile(location.hoisted, [
                [LocationServiceMap.node, Layer.effect(LocationServiceMap.Service, Deferred.await(self))],
              ]),
            ),
          )
        },
        { idleTimeToLive: "60 minutes" },
      )
      yield* Deferred.succeed(self, locations)
```

Source: packages/core/src/location-service-map.ts:18–43; blob 2f9f70c7edf21ab9e8d57eb6966aacab13c47c33; exact-span SHA-256 cb797f5be4f05e465596a8a4bd841e014d6d92177e47d7b83a2963167cfb0d3d.

```ts
/** Lazy acquisitions must see the completed application's exports, not a constructor's partial context. */
export function withGlobalContext<A, E, R>(
  layer: Layer.Layer<A, E, R>,
  globalContext: Effect.Effect<Context.Context<never>>,
) {
  return layer.pipe(
    Layer.flatMap((context) => {
      const locations = Context.getUnsafe(context, Service)
      const contextEffect = (ref: Location.Ref) =>
        // Wait before entering the cache: early constructor forks must not retain a partial acquisition.
        globalContext.pipe(
          Effect.flatMap((globals) =>
            locations
              .contextEffect(ref)
              .pipe(Effect.updateContext((current: Context.Context<Scope.Scope>) => Context.merge(current, globals))),
          ),
        )
      return Layer.succeedContext(
        Context.add(context, Service, {
          ...locations,
          get: (ref) => Layer.effectContext(contextEffect(ref)),
          contextEffect,
        }),
      )
    }),
  )
```

## E11. Process-global Session routing, fork boundary and same-project move

Source: packages/core/src/session/execution/local.ts:10–55; blob e7b758462abfd388f937fb18b79f82f2733dffad; exact-span SHA-256 99d66c39bbbafb3f40aaef138b57b8d9aaa8b0425617496964c4b65e56f36bba.

```ts
/** Current-process routing for implicit-local Locations. Future remote placement belongs here. */
const layer = Layer.effect(
  SessionExecution.Service,
  Effect.gen(function* () {
    const store = yield* SessionStore.Service
    const locations = yield* LocationServiceMap.Service
    const coordinator = yield* SessionRunCoordinator.make<SessionSchema.ID, SessionRunner.RunError>({
      drain: Effect.fnUntraced(function* (sessionID: SessionSchema.ID, force) {
        const session = yield* store.get(sessionID)
        if (!session) return yield* Effect.die(`Session not found: ${sessionID}`)
        return yield* SessionRunner.Service.use((runner) => runner.run({ sessionID, force })).pipe(
          Effect.provide(locations.get(session.location)),
          Effect.mapError((error) => error as SessionRunner.RunError),
          Effect.tapCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.void
              : Effect.logError("Failed to drain Session", cause).pipe(Effect.annotateLogs({ sessionID })),
          ),
        )
      }),
    })

    return SessionExecution.Service.of({
      active: coordinator.active,
      interrupt: coordinator.interrupt,
      resume: (sessionID, options) => coordinator.run(sessionID, options),
      wake: coordinator.wake,
      exclusive: coordinator.exclusive,
      withRunner: <A, E>(sessionID: SessionSchema.ID, use: (runner: SessionRunner.Interface) => Effect.Effect<A, E>) =>
        Effect.gen(function* () {
          const session = yield* store.get(sessionID)
          if (!session) return yield* Effect.die(`Session not found: ${sessionID}`)
          return yield* SessionRunner.Service.use(use).pipe(
            Effect.provide(locations.get(session.location)),
            Effect.mapError((error) => error as E),
          )
        }) as Effect.Effect<A, E, never>,
    })
  }),
)

export const node = makeGlobalNode({
  service: SessionExecution.Service,
  layer,
  deps: [SessionStore.node, LocationServiceMap.node],
})
```

Source: packages/core/src/session.ts:519–590; blob 402a192a69bcad6a4b08c695657e24ff5e335f93; exact-span SHA-256 2fcc2c785810ed6e20015de8cf0e14078298a1714455990b7a2b9a8674a2d9fb.

```ts
      fork: Effect.fn("V2Session.fork")(function* (input) {
        const source = yield* result.get(input.sessionID)
        const rows = yield* db
          .select()
          .from(SessionMessageTable)
          .where(eq(SessionMessageTable.session_id, source.id))
          .orderBy(asc(SessionMessageTable.seq))
          .all()
          .pipe(Effect.orDie)
        const target = input.messageID ? rows.findIndex((row) => row.id === input.messageID) : rows.length
        if (target < 0) return yield* new MessageNotFoundError({ sessionID: source.id, messageID: input.messageID! })
        const reverted = source.revert ? rows.findIndex((row) => row.id === source.revert?.messageID) : -1
        const kept = rows.slice(0, reverted < 0 ? target : Math.min(target, reverted))
        const forked = yield* result.create({ location: source.location, agent: source.agent, model: source.model })
        yield* SessionLifecycle.rename(db, events, { sessionID: forked.id, title: forkedTitle(source.title) })
        // As the legacy import does: copied rows take negative sequences below every event the fork will project.
        yield* db
          .transaction(
            () =>
              Effect.forEach(
                kept,
                (row, index) =>
                  decode(row).pipe(
                    Effect.orDie,
                    Effect.flatMap((message) => {
                      const { id, type, ...data } = encodeMessage({
                        ...message,
                        id: SessionMessage.ID.create(),
                        ...(message.type === "synthetic" ? { sessionID: forked.id } : {}),
                      })
                      return db
                        .insert(SessionMessageTable)
                        .values({
                          id: SessionMessage.ID.make(id),
                          session_id: forked.id,
                          type,
                          seq: index - kept.length,
                          time_created: row.time_created,
                          data,
                        })
                        .run()
                    }),
                  ),
                { discard: true },
              ),
            { behavior: "immediate" },
          )
          .pipe(Effect.orDie)
        return yield* result.get(forked.id)
      }),
      move: Effect.fn("V2Session.move")(function* (input) {
        const session = yield* result.get(input.sessionID)
        const project = yield* projects.resolve(input.location.directory)
        if (project.id !== session.projectID)
          return yield* new MoveError({ sessionID: session.id, directory: input.location.directory })
        const subdirectory = path.relative(project.directory, input.location.directory).replaceAll("\\", "/")
        yield* exclusive(
          session,
          Effect.gen(function* () {
            yield* events.publish(
              SessionEvent.Moved,
              {
                sessionID: session.id,
                timestamp: yield* DateTime.now,
                location: input.location,
                ...(subdirectory ? { subdirectory: RelativePath.make(subdirectory) } : {}),
              },
              { location: input.location },
            )
          }),
        )
      }),
```

## E12. Project identity and exact directory membership

Source: packages/core/src/project.ts:26–64; blob bbedbbf34cbc5b431538db37993c0cc0830fa393; exact-span SHA-256 91f0e8a0c3ad2c8a90cec6f9228a9c70db373c8a7f16d4cb942dba46c900460d.

```ts
/**
 * True for the shared project of a directory outside any repository, whose directory `resolve` sets to the
 * filesystem root: `/`, or a drive root such as `C:\` on Windows. Its directories are the Location's own, not the root.
 */
export const isRoot = (directory: string, paths: path.PlatformPath = path) => paths.parse(directory).root === directory

export class Info extends Schema.Class<Info>("Project.Info")({
  id: ID,
}) {}

export const DirectoriesInput = ProjectDirectories.ListInput
export type DirectoriesInput = typeof DirectoriesInput.Type

export const Directories = ProjectDirectories.ListOutput
export type Directories = typeof Directories.Type

export interface Resolved {
  readonly previous?: ID
  readonly id: ID
  readonly directory: AbsolutePath
  readonly vcs?: Vcs
}

export interface Interface {
  /** Every project this database knows, oldest first. */
  readonly list: () => Effect.Effect<ProjectInfo.Info[]>
  readonly directories: (input: DirectoriesInput) => Effect.Effect<Directories>
  readonly resolve: (input: AbsolutePath) => Effect.Effect<Resolved>
  /**
   * Temporary bridge method for writing the resolved project ID to the repo-local cache.
   *
   * This exists while the legacy project service and this core project
   * service work together: core resolves the ID, while the old service still owns
   * database migration and persistence. The old service should call this after it
   * finishes migrating from `resolve().previous` to `resolve().id`; once project
   * persistence moves into core, this separate bridge method can go away.
   */
  readonly commit: (input: { store: AbsolutePath; id: ID }) => Effect.Effect<void>
}
```

Source: packages/core/src/project.ts:85–148; blob bbedbbf34cbc5b431538db37993c0cc0830fa393; exact-span SHA-256 cf638e506fb857ec905e49b3e6c75ccd6c464aedd551a05395aa8cce6417616b.

```ts
    const cached = Effect.fnUntraced(function* (dir: string) {
      return yield* fs.readFileString(path.join(dir, "orchestra")).pipe(
        Effect.map((value) => value.trim()),
        Effect.map((value) => (value ? ID.make(value) : undefined)),
        Effect.catch(() => Effect.succeed(undefined)),
      )
    })

    const remote = Effect.fnUntraced(function* (repo: Git.Repository) {
      const origin = yield* git.remote.get(repo)
      if (!origin) return undefined
      const normalized = url(origin)
      if (!normalized) return undefined
      return ID.make(Hash.fast(`git-remote:${normalized}`))
    })

    function url(input: string) {
      const value = input.trim()
      if (!value) return undefined

      try {
        const parsed = new URL(value)
        if (parsed.protocol === "file:") return undefined
        return parts(parsed.hostname, parsed.pathname)
      } catch {
        const scp = value.match(/^([^@/:]+@)?([^/:]+):(.+)$/)
        if (scp) return parts(scp[2], scp[3])
        return undefined
      }
    }

    function parts(host: string, name: string) {
      const pathname = name
        .replace(/^\/+/, "")
        .replace(/\.git\/?$/, "")
        .replace(/\/+$/, "")
      if (!host || !pathname) return undefined
      return `${host.toLowerCase()}/${pathname}`
    }

    const root = Effect.fnUntraced(function* (repo: Git.Repository) {
      const root = (yield* git.history.rootCommits(repo))[0]
      return root ? ID.make(root) : undefined
    })

    const resolve = Effect.fn("Project.resolve")(function* (input: AbsolutePath) {
      const repo = yield* git.repo.discover(input)
      if (!repo) return { id: ID.global, directory: AbsolutePath.make(path.parse(input).root), vcs: undefined }

      const previous = yield* cached(repo.commonDirectory)
      const id = (yield* remote(repo)) ?? previous ?? (yield* root(repo))
      return {
        previous,
        id: id ?? ID.global,
        directory: repo.worktree,
        vcs: { type: "git" as const, store: repo.commonDirectory },
      }
    })

    const commit = Effect.fn("Project.commit")(function* (input: { store: AbsolutePath; id: ID }) {
      yield* fs.writeFileString(path.join(input.store, "orchestra"), input.id).pipe(Effect.ignore)
    })

    return Service.of({ list, directories, resolve, commit })
```

Source: packages/core/src/project.ts:170–191; blob bbedbbf34cbc5b431538db37993c0cc0830fa393; exact-span SHA-256 fdba385a4fdce9c0aff4ed9b66383b68dcb6e5f6943232a2f9fee5ad7746f7fc.

```ts
/**
 * Records a resolved project for the project list with its version control, as opening a directory did on the earlier runtime, and
 * announces a new project or a newly found repository with `project.updated`.
 */
export const record = Effect.fn("Project.record")(function* (
  db: Database.Interface["db"],
  events: EventV2.Interface,
  project: Resolved,
) {
  const existing = yield* db.select().from(ProjectTable).where(eq(ProjectTable.id, project.id)).get().pipe(Effect.orDie)
  const vcs = project.vcs?.type
  if (existing && (!vcs || existing.vcs === vcs)) return
  if (existing) yield* db.update(ProjectTable).set({ vcs }).where(eq(ProjectTable.id, project.id)).run().pipe(Effect.orDie)
  if (!existing)
    yield* db
      .insert(ProjectTable)
      .values({ id: project.id, worktree: project.directory, vcs, sandboxes: [] })
      .onConflictDoNothing()
      .run()
      .pipe(Effect.orDie)
  const row = yield* db.select().from(ProjectTable).where(eq(ProjectTable.id, project.id)).get().pipe(Effect.orDie)
  if (row) yield* events.publish(ProjectInfo.Event.Updated, toInfo(row))
```

Source: packages/core/src/project/directories.ts:47–89; blob 7863f4d2640a9b4bd85febab338610446bf839ef; exact-span SHA-256 c600b7ec439c2c8c779d1f6ebfae31950e5a1ccb6e3e3db5dc71406ac847cbaf.

```ts
export interface Interface {
  readonly list: (projectID: ProjectSchema.ID) => Effect.Effect<ReadonlyArray<Directory>>
  readonly get: (input: {
    projectID: ProjectSchema.ID
    directory: AbsolutePath
  }) => Effect.Effect<Directory | undefined>
  readonly contains: (input: { projectID: ProjectSchema.ID; directory: AbsolutePath }) => Effect.Effect<boolean>
  readonly create: (input: CreateInput, tx?: Transaction) => Effect.Effect<boolean>
  readonly remove: (input: RemoveInput, tx?: Transaction) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/ProjectDirectories") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = (yield* Database.Service).db

    const create = Effect.fn("ProjectDirectories.create")(function* (input: CreateInput, tx?: Transaction) {
      const insert = (tx ?? db)
        .insert(ProjectDirectoryTable)
        .values({ project_id: input.projectID, directory: input.directory, strategy: input.strategy })
      const query =
        input.behavior === "replace"
          ? insert.onConflictDoUpdate({
              target: [ProjectDirectoryTable.project_id, ProjectDirectoryTable.directory],
              set: { strategy: input.strategy ?? null },
              setWhere: input.strategy
                ? or(isNull(ProjectDirectoryTable.strategy), ne(ProjectDirectoryTable.strategy, input.strategy))
                : isNotNull(ProjectDirectoryTable.strategy),
            })
          : insert.onConflictDoNothing()
      return (
        (yield* query.returning({ directory: ProjectDirectoryTable.directory }).get().pipe(Effect.orDie)) !== undefined
      )
    })

    const remove = Effect.fn("ProjectDirectories.remove")(function* (input: RemoveInput, tx?: Transaction) {
      return (
        (yield* (tx ?? db)
          .delete(ProjectDirectoryTable)
          .where(
            and(
```

Source: packages/core/src/project/sql.ts:18–35; blob ab05fdac4a1adb971ec18ecb53c80bd8859be188; exact-span SHA-256 e81a10cf02eafa05eed0e3bb75166f21893b5b78791f6ef39d07a976525cf28b.

```ts
})

export const ProjectDirectoryTable = sqliteTable(
  "project_directory",
  {
    project_id: text()
      .$type<ProjectSchema.ID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    directory: DatabasePath.absoluteColumn().notNull(),
    type: text().$type<"main" | "root" | "git_worktree">(),
    strategy: text(),
    time_created: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [primaryKey({ columns: [table.project_id, table.directory] })],
)
```

## E13. Canonical mutation resources without permission approval

Source: packages/core/src/location-mutation.ts:52–59; blob 5c80742365c78301f296d5fe87fd8844a1efc44c; exact-span SHA-256 a18aabd8e752dd056004f93339e230275b27f825d70772270f7529a09c84f210.

```ts
export interface Interface {
  /**
   * Resolve a path and derive its permission resources. Relative paths must
   * stay inside the Location. Absolute paths outside it require separate
   * `external_directory` approval. This does not approve the mutation.
   */
  readonly resolve: (input: ResolveInput) => Effect.Effect<Target, PathError | FSUtil.Error>
}
```

Source: packages/core/src/location-mutation.ts:90–131; blob 5c80742365c78301f296d5fe87fd8844a1efc44c; exact-span SHA-256 b163dccb734d1c87ce40f1c8e8f4fafc0ec3d8ab2dbe3fa4f36905f0b2bcaf7e.

```ts
    // A dangling symlink is not missing: a write through it creates the file where it points.
    const followDangling = Effect.fnUntraced(function* (start: string) {
      let current = start
      for (let hops = 0; hops < 40; hops++) {
        if ((yield* notFound(fs.realPath(current))) !== undefined) return current
        const link = yield* fs.readLink(current).pipe(Effect.orElseSucceed(() => undefined))
        if (link === undefined) return current
        const parent = (yield* notFound(fs.realPath(path.dirname(current)))) ?? path.dirname(current)
        current = path.resolve(parent, link)
      }
      return current
    })

    const resolvePath = Effect.fnUntraced(function* (requested: string) {
      const absolute = yield* followDangling(requested)
      const existing = yield* notFound(fs.realPath(absolute))
      if (existing !== undefined) {
        const info = yield* fs.stat(existing)
        return {
          canonical: existing,
          type: info.type,
          directory: info.type === "Directory" ? existing : path.dirname(existing),
        } satisfies ResolvedPath
      }

      let anchor = path.dirname(absolute)
      while (true) {
        const canonical = yield* notFound(fs.realPath(anchor))
        if (canonical !== undefined) {
          const info = yield* fs.stat(canonical)
          if (info.type !== "Directory") {
            return yield* new PathError({ path: absolute, reason: "non_directory_ancestor" })
          }
          return {
            canonical: path.resolve(canonical, path.relative(anchor, absolute)),
            directory: canonical,
          } satisfies ResolvedPath
        }
        const parent = path.dirname(anchor)
        if (parent === anchor) return yield* new PathError({ path: absolute, reason: "non_directory_ancestor" })
        anchor = parent
      }
```

Source: packages/core/src/location-mutation.ts:134–164; blob 5c80742365c78301f296d5fe87fd8844a1efc44c; exact-span SHA-256 d2bebf16e9937d998af90dcac72c8ad6ed896999276c5a1e81ea609e7b39e6ef.

```ts
    const resolve = Effect.fn("LocationMutation.resolve")(function* (input: ResolveInput) {
      const relative = !path.isAbsolute(input.path)
      const absolute = path.resolve(location.directory, input.path)
      const lexicallyInternal = FSUtil.contains(location.directory, absolute)
      if (relative && !lexicallyInternal) return yield* new PathError({ path: input.path, reason: "relative_escape" })

      const resolved = yield* resolvePath(absolute)
      if (lexicallyInternal && !FSUtil.contains(locationRoot, resolved.canonical)) {
        return yield* new PathError({ path: input.path, reason: "location_escape" })
      }

      const external = !lexicallyInternal
      const resource = external
        ? slash(resolved.canonical)
        : slash(path.relative(locationRoot, resolved.canonical) || ".")
      const externalDirectory =
        input.kind === "directory" && resolved.type === "Directory" ? resolved.canonical : resolved.directory
      const externalResource = slash(path.join(externalDirectory, "*"))
      return {
        canonical: resolved.canonical,
        resource,
        externalDirectory: external
          ? {
              action: "external_directory",
              directory: externalDirectory,
              resource: externalResource,
              save: externalResource,
            }
          : undefined,
      } satisfies Target
    })
```

## E14. Read/list containment and separate search delegation

Source: packages/core/src/filesystem.ts:55–135; blob 46791eb40338be5fcc31bc22d110a9899d6b5d80; exact-span SHA-256 c665757c5adbe2a59ed614088eeb9cb9a2b6a46c436ad6e43c3d1d7f42f82942.

```ts
export interface Interface {
  readonly read: (input: ReadInput) => Effect.Effect<{ readonly content: Uint8Array; readonly mime: string }, PathError>
  readonly list: (input?: ListInput) => Effect.Effect<Entry[]>
  readonly find: (input: FindInput) => Effect.Effect<Entry[], FileSystemSearch.SearchError>
  readonly glob: (input: GlobInput) => Effect.Effect<readonly Entry[], FileSystemSearch.SearchError>
  readonly grep: (input: GrepInput) => Effect.Effect<readonly Match[], FileSystemSearch.SearchError>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/FileSystem") {}

const baseLayer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const location = yield* Location.Service
    const search = yield* FileSystemSearch.Service
    const resolve = (input?: RelativePath) => within(fs, location.directory, input)
    return Service.of({
      find: search.find,
      glob: search.glob,
      grep: search.grep,
      read: Effect.fn("FileSystem.read")(function* (input) {
        const target = yield* resolve(input.path)
        const info = yield* fs.stat(target.real).pipe(Effect.orDie)
        if (info.type !== "File") return yield* new PathError({ path: input.path, reason: "not-file" })
        return {
          content: yield* fs.readFile(target.real).pipe(Effect.orDie),
          mime: FSUtil.mimeType(target.real),
        }
      }),
      list: (input = {}) => list(fs, location.directory, input),
    })
  }),
)

const within = Effect.fnUntraced(function* (fs: FSUtil.Interface, directory: string, input?: RelativePath) {
  const root = yield* fs.realPath(directory).pipe(Effect.orDie)
  const relative = input ?? "."
  const absolute = path.resolve(directory, relative)
  if (!FSUtil.contains(directory, absolute)) return yield* new PathError({ path: relative, reason: "outside" })
  const real = yield* fs.realPath(absolute).pipe(Effect.mapError(() => new PathError({ path: relative, reason: "missing" })))
  if (!FSUtil.contains(root, real)) return yield* new PathError({ path: relative, reason: "outside" })
  return { absolute, real, directory, root }
})

/**
 * The direct children of a directory under `directory`, directories first. It needs only the filesystem, so a
 * directory browser lists folders without starting their Location's services.
 */
export const list = Effect.fn("FileSystem.list")(function* (
  fs: FSUtil.Interface,
  directory: string,
  input: ListInput = {},
) {
  const target = yield* within(fs, directory, input.path).pipe(Effect.orDie)
  const info = yield* fs.stat(target.real).pipe(Effect.orDie)
  if (info.type !== "Directory") return yield* Effect.die(new Error("Path is not a directory"))
  return yield* fs.readDirectoryEntries(target.real).pipe(
    Effect.orDie,
    Effect.map((items) =>
      items
        .flatMap((item) => {
          if (item.type !== "file" && item.type !== "directory") return []
          const absolute = path.join(target.absolute, item.name)
          const relative = path.relative(target.directory, absolute)
          return [
            Entry.make({
              path: RelativePath.make(relative + (item.type === "directory" ? path.sep : "")),
              type: item.type,
            }),
          ]
        })
        .sort((a, b) => (a.type === b.type ? a.path.localeCompare(b.path) : a.type === "directory" ? -1 : 1)),
    ),
  )
})

export const node = makeLocationNode({
  service: Service,
  layer: baseLayer,
  deps: [FSUtil.node, Location.node, FileSystemSearch.node],
```

## E15. Local mutation lock, compare/write delegation and explicit deferred guarantees

Source: packages/core/src/file-mutation.ts:69–89; blob 1a1af7ca0edd6b51db81820cbd8b45cad1eb7a3a; exact-span SHA-256 6ea38bd74cde4da50bfa376dfcff58235b8ad3ce9a27c8650346d09efe0e26ee.

```ts
/**
 * Writes go to the resolved canonical target and refuse a symlink swapped in after resolution instead of following
 * it, so a check made at resolve time still holds at write time.
 *
 * Every write runs the Location's configured formatters on the canonical target before the lock is released, as the earlier runtime's
 * edit, write and apply_patch tools did.
 *
 * Serialize file changes by canonical target. Conditional writes compare and
 * write under the same process-local lock so cooperating Orchestra mutations do
 * not overwrite changes made from the same stale content.
 */
const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const format = yield* Format.Service
    const locks = KeyedMutex.makeUnsafe<string>()
    const withTargetLock =
      (target: Target) =>
      <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        locks.withLock(target.canonical)(Effect.uninterruptible(effect))
```

Source: packages/core/src/file-mutation.ts:152–164; blob 1a1af7ca0edd6b51db81820cbd8b45cad1eb7a3a; exact-span SHA-256 d977fd8b6ae5ddef651a37105a4601481c6e1874452eaf148393321770c414e7.

```ts
    const writeIfUnchanged = Effect.fn("FileMutation.writeIfUnchanged")((input: ConditionalWriteInput) =>
      withTargetLock(input.target)(
        Effect.gen(function* () {
          const current = yield* fs.readFile(input.target.canonical)
          if (!sameBytes(current, input.expected)) {
            return yield* new StaleContentError({ path: input.target.canonical })
          }
          yield* fs.writePhysical(input.target.canonical, input.content)
          yield* format.file(input.target.canonical)
          return writeResult(input.target, true)
        }),
      ),
    )
```

Source: packages/core/src/file-mutation.ts:205–213; blob 1a1af7ca0edd6b51db81820cbd8b45cad1eb7a3a; exact-span SHA-256 982f2496ba51cd72841a2dd15ab2f9dcdabc718b02c6ae7512d716479d1d1a19.

```ts
/**
 * Deferred until the corresponding V2 integrations exist.
 */
// TODO: Publish watcher/file-edit events after V2 watcher integration exists.
// TODO: Add snapshots / undo after V2 snapshot design exists.
// TODO: Notify LSP and collect diagnostics after V2 LSP runtime exists.
// TODO: Design multi-file transactions / rollback if apply_patch needs atomic edits.
// Until then, edits are sequential and report partial application.
// TODO: Define crash recovery and idempotency for side effects between Tool.Called and durable settlement.
```

Source: packages/core/src/fs-util.ts:165–181; blob 695361a7b2812386ceb0dfcc0f535c146e744a9e; exact-span SHA-256 1d8298183087b82d4c5f0e3efe7a8cce3a13895864320756b830d9e686c1de98.

```ts
      const writePhysical = Effect.fn("FileSystem.writePhysical")(function* (
        path: string,
        content: string | Uint8Array,
        options?: { exclusive?: boolean },
      ) {
        yield* Effect.tryPromise({
          try: () => PhysicalPath.writePhysical(path, content, options),
          catch: (cause) =>
            systemError({
              _tag: cause instanceof Error && "code" in cause && cause.code === "EEXIST" ? "AlreadyExists" : "Unknown",
              module: "FileSystem",
              method: "writePhysical",
              pathOrDescriptor: path,
              cause,
            }),
        })
      })
```

Source: packages/core/src/patch.ts:24–43; blob 0a71f3a9234802dee1a20964c08f2babe69809c7; exact-span SHA-256 14834fb58277db13693358020cb1f603b5772f86c7d47a5f304529b2616eaffc.

```ts

/**
 * The one apply_patch grammar. The apply_patch tools apply the hunks it returns and ToolSafety checks their paths,
 * so a patch either reaches the files exactly as it was checked or is rejected by both. Every line between the
 * markers is read: a line that fits nowhere fails the patch instead of being skipped.
 */
export function parse(patchText: string): ReadonlyArray<Hunk> {
  const lines = stripHeredoc(patchText.trim()).split("\n")
  // The last end marker closes the patch, so a context line that reads `*** End Patch` cannot cut it short
  const begin = lines.findIndex((line) => line.trim() === "*** Begin Patch")
  const end = lines.findLastIndex((line) => line.trim() === "*** End Patch")
  if (begin === -1 || end === -1 || begin >= end) throw new Error("Invalid patch format: missing Begin/End markers")

  const body = lines.slice(begin + 1, end)
  const hunks: Hunk[] = []
  let index = 0
  while (index < body.length) {
    const line = body[index]
    // Empty lines between file sections only separate them
    if (blank(line)) {
```

## E16. Checkpoint retained owner, read digest and sanitized failures

Source: packages/core/src/project/checkpoint.ts:84–199; blob 5972b18ab5b5bd6792447261cd65933aee379e99; exact-span SHA-256 8352a2407da5deabfe0b366de1f075ee77472418e1309641205fd6a2e19683df.

```ts
      save: Effect.fn("ProjectCheckpoint.save")(function* (input) {
        const value = { ...input }
        if (
          (value.attempt !== 0 && value.attempt !== 1) ||
          typeof value.forkID !== "string" ||
          !value.forkID.trim() ||
          typeof value.boundary !== "string" ||
          !value.boundary.trim() ||
          typeof value.payload !== "string" ||
          !value.payload.trim() ||
          Buffer.from(value.payload, "utf8").toString("utf8") !== value.payload ||
          Option.isNone(decodePayload(value.payload))
        )
          return yield* new CheckpointError({ reason: "invalid_input" })

        const id = `${value.forkID}:${value.attempt}`
        const hash = digest(value.payload)
        return yield* database.db.transaction(
          (tx) =>
            Effect.gen(function* () {
              const existing = yield* tx
                .select({ ...metadata, payload: ProjectCheckpointTable.payload })
                .from(ProjectCheckpointTable)
                .where(eq(ProjectCheckpointTable.id, id))
                .get()
              if (existing) {
                if (
                  existing.sessionID !== value.sessionID ||
                  existing.forkID !== value.forkID ||
                  existing.boundary !== value.boundary ||
                  existing.attempt !== value.attempt ||
                  existing.payload !== value.payload
                )
                  return yield* new CheckpointError({ reason: "conflict" })
                if (existing.digest !== hash) return yield* new CheckpointError({ reason: "corrupt" })
                const { payload, ...result } = existing
                return result
              }

              // Exact retries use the retained record, even after the source Session is deleted.
              // Only insertion resolves current ownership; retries never reassign old checkpoints.
              const session = yield* tx
                .select({ projectID: SessionTable.project_id, directory: SessionTable.directory })
                .from(SessionTable)
                .where(eq(SessionTable.id, value.sessionID))
                .get()
              if (!session) return yield* new CheckpointError({ reason: "missing_session" })

              const createdAt = yield* Clock.currentTimeMillis
              yield* tx
                .insert(ProjectCheckpointTable)
                .values({
                  id,
                  project_id: session.projectID,
                  session_id: value.sessionID,
                  fork_id: value.forkID,
                  boundary: value.boundary,
                  attempt: value.attempt,
                  directory: session.directory,
                  time_created: createdAt,
                  digest: hash,
                  payload: value.payload,
                })
                .run()
              return {
                id,
                projectID: session.projectID,
                sessionID: value.sessionID,
                forkID: value.forkID,
                boundary: value.boundary,
                attempt: value.attempt,
                directory: session.directory,
                createdAt,
                digest: hash,
              }
            }),
          { behavior: "immediate" },
        )
      }, storageBoundary),
      read: Effect.fn("ProjectCheckpoint.read")(function* (input) {
        const row = yield* database.db
          .select({ ...metadata, payload: ProjectCheckpointTable.payload })
          .from(ProjectCheckpointTable)
          .where(and(eq(ProjectCheckpointTable.project_id, input.projectID), eq(ProjectCheckpointTable.id, input.id)))
          .get()
        if (!row) return undefined
        if (digest(row.payload) !== row.digest) return yield* new CheckpointError({ reason: "corrupt" })
        return row
      }, storageBoundary),
      list: Effect.fn("ProjectCheckpoint.list")(function* (input) {
        const offset = input.offset === undefined ? 0 : input.offset
        const limit = input.limit === undefined ? 20 : input.limit
        if (
          !Number.isSafeInteger(offset) ||
          offset < 0 ||
          offset > Number.MAX_SAFE_INTEGER - 50 ||
          !Number.isSafeInteger(limit) ||
          limit < 1 ||
          limit > 50
        )
          return yield* new CheckpointError({ reason: "invalid_input" })
        const items = yield* database.db
          .select(metadata)
          .from(ProjectCheckpointTable)
          .where(
            and(
              eq(ProjectCheckpointTable.project_id, input.projectID),
              input.directory === undefined ? undefined : eq(ProjectCheckpointTable.directory, input.directory),
            ),
          )
          .orderBy(desc(ProjectCheckpointTable.time_created), desc(ProjectCheckpointTable.id))
          .offset(offset)
          .limit(limit + 1)
          .all()
        return items.length > limit ? { items: items.slice(0, limit), nextOffset: offset + limit } : { items }
      }, storageBoundary),
```

Source: packages/core/src/project/checkpoint.ts:204–209; blob 5972b18ab5b5bd6792447261cd65933aee379e99; exact-span SHA-256 42aaa18527e47be8f3c5c1caf302e174145be75e723743304c037fda2c194f12.

```ts
// Drivers can fail during SQL preparation as well as execution. Neither path may expose bound context.
function storageBoundary<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.mapError((error) => (error instanceof CheckpointError ? error : new CheckpointError({ reason: "storage" }))),
    Effect.catchDefect(() => Effect.fail(new CheckpointError({ reason: "storage" }))),
  )
```

Source: packages/core/src/project/checkpoint.sql.ts:12–29; blob 23c42d9d2198d2962024271f213cd1e5c415ab9c; exact-span SHA-256 653a760144dcbb1fc97d745dffebc38c71c687c76b39376d808fc67b12bc7792.

```ts
    project_id: text()
      .$type<ProjectSchema.ID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    // The source Session may be deleted while its project retains the checkpoint.
    session_id: text().$type<SessionSchema.ID>().notNull(),
    fork_id: text().notNull(),
    boundary: text().notNull(),
    attempt: integer().$type<0 | 1>().notNull(),
    directory: directoryColumn().notNull(),
    time_created: integer().notNull(),
    digest: text().notNull(),
    payload: text().notNull(),
  },
  (table) => [
    index("project_checkpoint_project_time_id_idx").on(table.project_id, table.time_created, table.id),
    check("project_checkpoint_attempt_check", sql`${table.attempt} in (0, 1)`),
  ],
```

## E17. Physical project copy and membership ordering

Source: packages/core/src/project/copy.ts:171–244; blob 11e941c573dca760eb95641f45597f48412ea98c; exact-span SHA-256 492af413cb9af6e0715422196c9ebcc7cea65b17481d1fb841d53641a780ebe8.

```ts
    const registry = new Map<StrategyID, Strategy>()

    const register = Effect.fn("ProjectCopy.register")(function* (strategy: Strategy) {
      if (registry.has(strategy.id)) return yield* new DuplicateStrategyError({ strategy: strategy.id })
      registry.set(strategy.id, strategy)
    })

    // Register default strategies
    yield* register(makeGitWorktreeStrategy({ git, canonical })).pipe(Effect.orDie)

    const strategies = () => Array.from(registry.values())

    const source = Effect.fnUntraced(function* (input: AbsolutePath, projectID: Project.ID) {
      const sourceDirectory = yield* canonical(input)
      if (yield* directories.contains({ projectID, directory: sourceDirectory })) return sourceDirectory
      // The project's own checkout is a source before anything has registered it; register it on first use.
      const project = yield* db
        .select({ worktree: ProjectTable.worktree })
        .from(ProjectTable)
        .where(eq(ProjectTable.id, projectID))
        .get()
        .pipe(Effect.orDie)
      if (!project || (yield* fs.resolve(project.worktree)) !== sourceDirectory)
        return yield* new SourceDirectoryNotFoundError({ directory: sourceDirectory })
      yield* changed(projectID, yield* directories.create({ projectID, directory: sourceDirectory }))
      return sourceDirectory
    })

    const getStrategy = Effect.fnUntraced(function* (id: StrategyID) {
      const found = registry.get(id)
      if (!found) return yield* new StrategyUnavailableError({ strategy: id })
      return found
    })

    const create = Effect.fn("ProjectCopy.create")(function* (input: CreateInput) {
      const selected = yield* getStrategy(input.strategy)
      const sourceDirectory = yield* source(input.sourceDirectory, input.projectID)
      yield* fs.makeDirectory(input.directory, { recursive: true }).pipe(Effect.orDie)
      const name = input.name ?? Slug.create()
      let suffix = 1
      let copyDirectory = AbsolutePath.make(path.join(input.directory, name))
      while (yield* fs.existsSafe(copyDirectory)) {
        suffix++
        if (suffix > 10) return yield* new DestinationExistsError({ directory: copyDirectory })
        copyDirectory = AbsolutePath.make(path.join(input.directory, `${name}-${suffix}`))
      }

      const result = yield* selected.create({
        directory: copyDirectory,
        sourceDirectory,
      })
      yield* changed(
        input.projectID,
        yield* directories.create({
          projectID: input.projectID,
          directory: result.directory,
          strategy: input.strategy,
          behavior: "replace",
        }),
      )
      return result
    })

    const remove = Effect.fn("ProjectCopy.remove")(function* (input: RemoveInput) {
      const copyDirectory = yield* canonical(input.directory)
      const stored = yield* directories.get({ projectID: input.projectID, directory: copyDirectory })
      if (!stored?.strategy) return yield* new InvalidDirectoryError({ directory: copyDirectory })
      yield* (yield* getStrategy(StrategyID.make(stored.strategy))).remove({
        directory: copyDirectory,
        force: input.force,
      })
      yield* changed(
        input.projectID,
        yield* directories.remove({ projectID: input.projectID, directory: copyDirectory }),
```

Source: packages/core/src/project/copy.ts:275–302; blob 11e941c573dca760eb95641f45597f48412ea98c; exact-span SHA-256 bb65d71127496472d4a6b7305a37fd2841e9e65c56c323027a0caa8ad8d9d583.

```ts
      )
      const removed = checked.filter((item) => !item.exists).map((item) => item.directory)
      const result = yield* db
        .transaction((tx) =>
          Effect.all({
            updated: Effect.forEach(discovered, (item) =>
              directories.create(
                {
                  projectID: input.projectID,
                  directory: item.directory,
                  strategy: item.strategy,
                  behavior: "replace",
                },
                tx,
              ),
            ),
            removed: Effect.forEach(removed, (directory) =>
              directories.remove({ projectID: input.projectID, directory }, tx),
            ),
          }),
        )
        .pipe(Effect.orDie)
      const changes = {
        updated: discovered.filter((_, index) => result.updated[index]).map((item) => item.directory),
        removed: removed.filter((_, index) => result.removed[index]),
      }
      yield* changed(input.projectID, changes.updated.length > 0 || changes.removed.length > 0)
      return changes
```

Source: packages/core/src/project/copy-strategies.ts:9–35; blob 59466b9901ae58098bf892dde8bf4bb69a970072; exact-span SHA-256 27bd313d789a6411485e30ef244d96b536a83f74178a25a1edde2a5178972aa7.

```ts
}) {
  return {
    id: StrategyID.make("git_worktree"),
    create: Effect.fn("ProjectCopy.GitWorktree.create")(function* (options) {
      const repository = yield* input.git.repo.discover(options.sourceDirectory)
      if (!repository) return yield* new DirectoryUnavailableError({ directory: options.sourceDirectory })
      yield* input.git.worktree.create({ repository, directory: options.directory })
      return { directory: yield* input.canonical(options.directory) }
    }),
    remove: Effect.fn("ProjectCopy.GitWorktree.remove")(function* (options) {
      const found = yield* input.git.repo.discover(options.directory)
      if (!found) return yield* new DirectoryUnavailableError({ directory: options.directory })
      yield* input.git.worktree.remove({ repository: found, directory: options.directory, force: options.force })
    }),
    list: Effect.fn("ProjectCopy.GitWorktree.list")(function* (directory) {
      const found = yield* input.git.repo.discover(directory)
      if (!found) return yield* new DirectoryUnavailableError({ directory })
      const entries = yield* input.git.worktree.list(found)
      return yield* Effect.forEach(entries, (entry) =>
        input.canonical(entry.directory).pipe(
          Effect.map((directory) => ({ directory, type: entry.kind === "main" ? "root" : "copy" }) as const),
          Effect.catchTag("ProjectCopy.DirectoryUnavailableError", () => Effect.succeed(undefined)),
        ),
      ).pipe(Effect.map((items) => items.filter((item): item is ListEntry => item !== undefined)))
    }),
  } satisfies Strategy
}
```

## E18. Best-effort snapshot collection and selected restore/checkout split

Source: packages/core/src/snapshot.ts:84–105; blob c7e9926fb6d27804df408f628f387de890dbbd90; exact-span SHA-256 61ad0a18fa5d88ecc864eafd4de43ff2533b50385a702813c5693e0c5abfe00c.

```ts
export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/Snapshot") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const config = yield* Config.Service
    const fs = yield* FSUtil.Service
    const git = yield* Git.Service
    const global = yield* Global.Service
    const location = yield* Location.Service
    const source = yield* git.repo.discover(location.project.directory)
    const worktree = source
      ? AbsolutePath.make(yield* fs.realPath(source.worktree).pipe(Effect.orDie))
      : location.project.directory
    const gitDirectory = AbsolutePath.make(path.join(global.data, "snapshot", location.project.id, Hash.fast(worktree)))

    const scope = Effect.fnUntraced(function* () {
      const relative = path.relative(worktree, location.directory)
      if (relative.startsWith("..") || path.isAbsolute(relative))
        return yield* new Error({ operation: "capture", message: "Location is outside the project" })
      return RelativePath.make(relative.replaceAll("\\", "/") || ".")
    })
```

Source: packages/core/src/snapshot.ts:124–147; blob c7e9926fb6d27804df408f628f387de890dbbd90; exact-span SHA-256 ba4f6179eee5fe6dc8a2065d1406815e5564189757161322c9d26c78c072fc86.

```ts
    const enabled = Effect.fnUntraced(function* () {
      if (location.vcs?.type !== "git") return false
      return Config.latest(yield* config.entries(), "snapshots") !== false
    })

    const capture = Effect.fn("Snapshot.capture")(function* () {
      if (!(yield* enabled())) return undefined
      return yield* Effect.gen(function* () {
        const repo = yield* repository()
        return ID.make(
          yield* git.tree.capture({
            repository: repo,
            scopes: [yield* scope()],
            ignores: source,
            maximumUntrackedFileBytes: 2 * 1024 * 1024,
          }),
        )
      }).pipe(
        Effect.catch((cause) => Effect.logWarning("failed to capture snapshot", { cause }).pipe(Effect.as(undefined))),
      )
    })

    const compare = Effect.fnUntraced(function* (operation: "files" | "diff", input: CompareInput) {
      const repo = yield* repository().pipe(Effect.mapError((cause) => failure(operation, cause)))
```

Source: packages/core/src/snapshot.ts:178–224; blob c7e9926fb6d27804df408f628f387de890dbbd90; exact-span SHA-256 6a226feea4d3847553136006fe4fbef3a0343e56f4c56b358348dc8037e3d7f4.

```ts
    const plan = Effect.fnUntraced(function* (operation: "preview" | "restore", input: RestoreInput) {
      const files = new Map<RelativePath, Git.TreeID>()
      for (const [file, snapshot] of input.files) {
        const absolute = path.resolve(worktree, file)
        if (!FSUtil.contains(worktree, absolute))
          return yield* new Error({ operation, message: `Path escapes the project: ${file}` })
        files.set(file, Git.TreeID.make(snapshot))
      }
      return files
    })

    const preview = Effect.fn("Snapshot.preview")(function* (input: PreviewInput) {
      if (!(yield* enabled())) return yield* new Error({ operation: "preview", message: "Snapshots are disabled" })
      const repo = yield* repository().pipe(Effect.mapError((cause) => failure("preview", cause)))
      const files = yield* plan("preview", input)
      const current = yield* git.tree
        .capture({
          repository: repo,
          scopes: Array.from(files.keys()),
          ignores: source,
          maximumUntrackedFileBytes: 2 * 1024 * 1024,
        })
        .pipe(Effect.mapError((cause) => failure("preview", cause)))
      return yield* git.tree
        .preview({
          repository: repo,
          current,
          files,
          context: input.context,
        })
        .pipe(Effect.mapError((cause) => failure("preview", cause)))
    })

    const restore = Effect.fn("Snapshot.restore")(function* (input: RestoreInput) {
      if (!(yield* enabled())) return yield* new Error({ operation: "restore", message: "Snapshots are disabled" })
      const repo = yield* repository().pipe(Effect.mapError((cause) => failure("restore", cause)))
      yield* git.tree
        .restore({ repository: repo, files: yield* plan("restore", input) })
        .pipe(Effect.mapError((cause) => failure("restore", cause)))
    })

    const checkout = Effect.fn("Snapshot.checkout")(function* (snapshot: ID) {
      const repo = yield* repository().pipe(Effect.mapError((cause) => failure("restore", cause)))
      yield* git.tree
        .checkout({ repository: repo, tree: Git.TreeID.make(snapshot) })
        .pipe(Effect.mapError((cause) => failure("restore", cause)))
    })
```

## E19. Git selective restoration and all-index checkout

Source: packages/core/src/git.ts:324–353; blob a90b3707a8d125ea8d4f78b70e03575a45a2fce3; exact-span SHA-256 f5279ff2079b3a603e8b67df725de7f64434c281df9720877d2fb9052b23e8df.

```ts
    const repositoryOperation = Effect.fnUntraced(function* (
      operationName: OperationError["operation"],
      repository: Repository,
      args: string[],
      options?: { stdin?: string; env?: Record<string, string> },
    ) {
      const result = yield* proc
        .run(
          ChildProcess.make("git", repositoryArgs(repository, args), {
            cwd: repository.worktree,
            env: options?.env,
            extendEnv: true,
          }),
          { stdin: options?.stdin },
        )
        .pipe(
          Effect.mapError(
            (cause) =>
              new OperationError({
                operation: operationName,
                directory: repository.worktree,
                message: cause.message,
                cause,
              }),
          ),
        )
      const text = result.stdout.toString("utf8")
      if (result.exitCode === 0) return { text, stderr: result.stderr.toString("utf8") }
      return yield* new OperationError({
        operation: operationName,
```

Source: packages/core/src/git.ts:686–729; blob a90b3707a8d125ea8d4f78b70e03575a45a2fce3; exact-span SHA-256 f0deca66678a6e61a43ef372e69332bea900f2d9dc5ead05c174be265e108ddb.

```ts
          }),
        ),
    )

    const restore = Effect.fn("Git.tree.restore")(
      (input: { repository: Repository; files: ReadonlyMap<RelativePath, TreeID> }) =>
        locked(
          input.repository,
          Effect.forEach(
            input.files,
            ([file, tree]) =>
              Effect.gen(function* () {
                if (yield* entry(input.repository, tree, file)) {
                  yield* repositoryOperation("restore", input.repository, ["checkout", tree, "--", file])
                  return
                }
                yield* fs.remove(path.join(input.repository.worktree, file), { recursive: true, force: true }).pipe(
                  Effect.mapError(
                    (cause) =>
                      new OperationError({
                        operation: "restore",
                        directory: input.repository.worktree,
                        message: `Failed to remove ${file}`,
                        cause,
                      }),
                  ),
                )
              }),
            { discard: true },
          ),
        ),
    )

    const checkoutTree = Effect.fn("Git.tree.checkout")((input: { repository: Repository; tree: TreeID }) =>
      locked(
        input.repository,
        Effect.gen(function* () {
          yield* repositoryOperation("restore", input.repository, ["read-tree", input.tree])
          yield* repositoryOperation("restore", input.repository, ["checkout-index", "--all", "--force"])
        }),
      ),
    )

    const capture = Effect.fn("Git.change.capture")(function* (input: { repository: Repository; path: AbsolutePath }) {
```

## E20. Mutable repository cache identity, exact checkout reuse and refresh

Source: packages/core/src/repository.ts:88–111; blob 828b5b97037ed9df925284200b61368337f2e7c2; exact-span SHA-256 cd8fdac40c0d9e41753880ebf337e33e7fcdf4455eeef8686ad0b8af5c9d8eee.

```ts
export function parseRemote(input: string): RemoteReference {
  const reference = parse(input)
  if (!reference) {
    throw new InvalidReferenceError({
      repository: input,
      message: "Repository must be a git URL, host/path reference, or GitHub owner/repo shorthand",
    })
  }
  if (!isRemote(reference)) {
    throw new UnsupportedLocalRepositoryError({
      repository: input,
      message: "Local file repositories are not supported",
    })
  }
  return reference
}

export function validateBranch(branch: string): void {
  if (/^[A-Za-z0-9/_.-]+$/.test(branch) && !branch.startsWith("-") && !branch.includes("..")) return
  throw new InvalidBranchError({
    branch,
    message: "Branch must contain only alphanumeric characters, /, _, ., and -, and cannot start with - or contain ..",
  })
}
```

Source: packages/core/src/repository.ts:121–137; blob 828b5b97037ed9df925284200b61368337f2e7c2; exact-span SHA-256 7040674d7ea47fa933d8c48caea9a4cbb972e9be9e3dbe2cfd16645f2e6ff834.

```ts
/**
 * Checkouts are keyed by remote and branch: a branch-specific reference gets
 * its own directory so branchless refreshes can never move it. The branch is
 * percent-encoded because valid branch names may contain `/`.
 */
export function cachePath(root: string, reference: Reference, branch?: string): string {
  const base = path.join(root, ...reference.host.split(":"), ...reference.segments)
  return branch ? `${base}@${encodeURIComponent(branch)}` : base
}

export function cacheIdentity(reference: Reference): string {
  return `${reference.host}/${reference.path}`
}

export function same(left: Reference, right: Reference): boolean {
  return cacheIdentity(left) === cacheIdentity(right)
}
```

Source: packages/core/src/repository-cache.ts:141–218; blob bcdc9de5686e25a71e0f83655bd19c0f87f7f29e; exact-span SHA-256 91c85bbfe257521a0304a3aed74f2e670c485e5f55cca0a1456d586a1e18e6f0.

```ts
        ensure: Effect.fn("RepositoryCache.ensure")(function* (input) {
          if (input.branch) yield* validateBranch(input.branch)

          const repository = input.reference.label
          const localPath = Repository.cachePath(global.repos, input.reference, input.branch)
          const cloneTarget = Repository.parse(input.reference.remote) ?? input.reference

          return yield* flock
            .withLock(
              Effect.gen(function* () {
                yield* cacheOperation(fs.ensureDir(path.dirname(localPath)), "ensure cache directory", localPath)

                const existing = yield* git.repo.discover(AbsolutePath.make(localPath))
                const origin = existing ? yield* git.remote.get(existing) : undefined
                const originReference = origin ? Repository.parse(origin) : undefined
                // Discovery walks upward, so an enclosing repository with a
                // matching origin could masquerade as the cache entry; reuse
                // requires the checkout to live exactly at the cache path.
                const worktree = existing ? yield* fs.resolve(localPath) : undefined
                const reuse = Boolean(
                  existing &&
                    existing.worktree === worktree &&
                    originReference &&
                    Repository.same(originReference, cloneTarget),
                )
                if (!reuse && (yield* fs.existsSafe(localPath))) {
                  yield* cacheOperation(fs.remove(localPath, { recursive: true }), "remove stale cache", localPath)
                }

                const status = !reuse
                  ? ("cloned" as const)
                  : input.refresh
                    ? ("refreshed" as const)
                    : ("cached" as const)

                if (status === "cloned") {
                  yield* git.repo
                    .clone({
                      remote: input.reference.remote,
                      directory: AbsolutePath.make(localPath),
                      branch: input.branch,
                    })
                    .pipe(Effect.mapError((error) => new CloneFailedError({ repository, message: error.message })))
                }

                if (status === "refreshed") {
                  if (!existing)
                    return yield* new FetchFailedError({ repository, message: "Repository is unavailable" })
                  yield* git.sync
                    .fetchRemotes(existing)
                    .pipe(Effect.mapError((error) => new FetchFailedError({ repository, message: error.message })))

                  if (input.branch) {
                    yield* git.sync
                      .fetchBranch(existing, { branch: input.branch })
                      .pipe(Effect.mapError((error) => new FetchFailedError({ repository, message: error.message })))
                  }

                  // Checking out the tracked ref before resetting keeps the
                  // checkout self-healing even if it was left on another
                  // branch.
                  const branch = input.branch ?? (yield* git.history.defaultRemoteBranch(existing))
                  if (branch) {
                    yield* git.sync
                      .checkoutRemoteBranch(existing, { branch })
                      .pipe(
                        Effect.mapError(
                          (error) => new CheckoutFailedError({ repository, branch, message: error.message }),
                        ),
                      )
                  }

                  const target = branch ?? (yield* git.history.branch(existing))
                  yield* git.sync
                    .resetHard(existing, target ? `origin/${target}` : "HEAD")
                    .pipe(Effect.mapError((error) => new ResetFailedError({ repository, message: error.message })))
                }

```

Source: packages/core/src/repository-cache.ts:230–237; blob bcdc9de5686e25a71e0f83655bd19c0f87f7f29e; exact-span SHA-256 f2a48fa4769fe4bf8c95f75317729031fac6bc412016738d98d2c3db5d28bb1f.

```ts
              }),
              `repository-cache:${localPath}`,
            )
            .pipe(
              Effect.mapError((error) =>
                isError(error) ? error : new LockFailedError({ localPath, message: errorMessage(error) }),
              ),
            )
```

## E21. Supporting config transformations, lowering, behavior and TUI boundary

Source: packages/core/src/config/plugin/provider.ts:41–77; blob 6f6e0528da7334228da7b5238ea9319c3b2247d4; exact-span SHA-256 a36c7030db3da7818898db3d2d260b773b8b08aa4845b60e42b5afafa055f2e8.

```ts
    yield* ctx.catalog.transform(
      Effect.fn(function* (catalog) {
        const entries = yield* config.entries()
        const files = entries.filter((entry): entry is Config.Document => entry.type === "document")
        const configuredDefault = Config.latest(entries, "model")
        if (configuredDefault !== undefined) {
          const model = ModelV2.parse(configuredDefault)
          catalog.model.default.set(model.providerID, model.modelID)
        }
        for (const file of files) {
          for (const [id, item] of Object.entries(file.info.providers ?? {})) {
            const providerID = id
            catalog.provider.update(providerID, (provider) => {
              if (item.name !== undefined) provider.name = item.name
              if (item.api !== undefined) provider.api = { ...item.api }
              if (item.request !== undefined) {
                Object.assign(provider.request.headers, item.request.headers)
                Object.assign(provider.request.body, item.request.body)
              }
            })
            for (const [id, config] of Object.entries(item.models ?? {})) {
              catalog.model.update(providerID, id, (model) => {
                if (config.family !== undefined) model.family = config.family
                if (config.name !== undefined) model.name = config.name
                if (config.api !== undefined) model.api = { ...model.api, ...config.api }
                if (config.capabilities !== undefined) {
                  model.capabilities = {
                    tools: config.capabilities.tools,
                    input: [...config.capabilities.input],
                    output: [...config.capabilities.output],
                  }
                }
                if (config.request !== undefined) {
                  Object.assign(model.request.headers, config.request.headers)
                  Object.assign(model.request.body, config.request.body)
                  if (config.request.variant !== undefined) model.request.variant = config.request.variant
                }
```

Source: packages/core/src/config/plugin/provider.ts:93–105; blob 6f6e0528da7334228da7b5238ea9319c3b2247d4; exact-span SHA-256 44814fc735dba3fd15ce5f0a1f6daba5b73e47f1675e5bc5a4eb6e83487272f6.

```ts
                if (config.cost !== undefined) {
                  model.cost = (Array.isArray(config.cost) ? config.cost : [config.cost]).map((cost) => ({
                    tier: cost.tier && { ...cost.tier },
                    input: cost.input,
                    output: cost.output,
                    cache: {
                      read: cost.cache?.read ?? 0,
                      write: cost.cache?.write ?? 0,
                    },
                  }))
                }
                if (config.disabled !== undefined) model.enabled = !config.disabled
                if (config.limit !== undefined) model.limit = { ...model.limit, ...config.limit }
```

Source: packages/core/src/config/provider-options.ts:5–45; blob 8d2b70ec531a941db108918edf49c687a9788a82; exact-span SHA-256 faa8f7a75c45324033819011d398123366045d06d47133cd0e178971f954bf66.

```ts
export interface ProviderResult {
  readonly headers?: Record<string, string>
  readonly body?: Record<string, unknown>
  readonly url?: string
  readonly settings?: Record<string, unknown>
}

export interface Lowerer {
  readonly provider: (options: Options) => ProviderResult
  readonly request: (options: Options) => Record<string, unknown>
}

export function get(packageName?: string): Lowerer {
  const key = packageName ?? ""
  return Object.hasOwn(lowerers, key) ? lowerers[key]! : raw
}

const raw: Lowerer = {
  provider(options) {
    return { body: clone(options) }
  },
  request: clone,
}

const openai: Lowerer = {
  provider(options) {
    return {
      url: string(options.baseURL),
      headers: compact({
        Authorization: bearer(options.apiKey),
        "OpenAI-Organization": string(options.organization),
        "OpenAI-Project": string(options.project),
        ...headers(options.headers),
      }),
      body: body(options.body),
      settings: omit(options, ["apiKey", "baseURL", "organization", "project", "headers", "body"]),
    }
  },
  request(options) {
    const result = snake(options)
    if (options.reasoningEffort !== undefined || options.reasoningSummary !== undefined) {
```

Source: packages/core/src/behavior.ts:39–70; blob 4d678d8b4b34b01d1dd6cb828963ae2bed223697; exact-span SHA-256 0400ff0f1a9c47b414810ccc988196b0de0339fdf5ab75c8b5f7212bd8a11e26.

```ts

const Stored = Schema.fromJsonString(Schema.Struct({ behaviors: Schema.Array(Info) }))
const decodeStored = Schema.decodeUnknownOption(Stored)
const encodeStored = Schema.encodeSync(Stored)
const Content = Schema.Struct({ name: Schema.String, instructions: Schema.String })

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const fs = yield* FSUtil.Service
    const global = yield* Global.Service
    const location = yield* Location.Service
    const registry = yield* SystemContextRegistry.Service
    // A project is the profile: its worktrees and sandboxes share one set. Directories outside a repository all
    // resolve to the global project, so each of those keeps its own set.
    const owner =
      location.project.id === Project.ID.global ? `directory:${location.directory}` : `project:${location.project.id}`
    const file = path.join(global.data, "behavior", `${Hash.fast(owner)}.json`)

    // An unreadable or malformed file applies no behaviors rather than blocking every Session of the project.
    const list = Effect.fn("BehaviorV2.list")(function* () {
      const text = yield* fs
        .readFileStringSafe(file)
        .pipe(
          Effect.catch((error) =>
            Effect.logWarning("behavior file unreadable", { file, error }).pipe(Effect.as(undefined)),
          ),
        )
      if (text === undefined) return []
      const stored = decodeStored(text)
      if (Option.isSome(stored)) return stored.value.behaviors
      yield* Effect.logWarning("behavior file malformed", { file })
```

Source: packages/core/src/behavior.ts:94–108; blob 4d678d8b4b34b01d1dd6cb828963ae2bed223697; exact-span SHA-256 172b85fce578cb484016ac19e7848e8fdb89003e21772750038b24a9af46f420.

```ts
)

export const node = makeLocationNode({
  service: Service,
  layer,
  deps: [FSUtil.node, Global.node, Location.node, SystemContextRegistry.node],
})

// Each behavior is its own source with no removal text. Switching one off therefore replaces the context generation,
// so its instructions leave the next provider request instead of lingering behind a "no longer applies" notice.
function source(behavior: Info) {
  return SystemContext.make({
    key: SystemContext.Key.make(`core/behavior/${behavior.id}`),
    codec: Schema.toCodecJson(Content),
    load: Effect.succeed({ name: behavior.name, instructions: behavior.instructions }),
```

Source: packages/core/src/tui-config-files.ts:5–48; blob ff0af1809c35ffa6165e61a4d1fa99b8f89a364f; exact-span SHA-256 18efd6f8a37a5f00e0b85e4000c7f7b06c28af211195164c5e1ea004e0d4cb6a.

```ts
import path from "path"
import { Flag } from "./flag/flag"
import { Global } from "./global"

const names = ["tui.json", "tui.jsonc"]

export interface File {
  readonly path: string
  readonly value: unknown
}

/**
 * Reads `tui.json` and `tui.jsonc` from the global config folder, then from each folder between the project root and
 * `directory` (and its `.orchestra` folder), from lowest to highest priority. The project root is the nearest
 * ancestor with a `.git` entry. A file that cannot be parsed throws an error naming it, so the user never silently
 * runs on defaults. The TUI package owns the schema, so the caller decodes `value`.
 */
export async function read(directory: string, globalConfig = Global.make().config): Promise<File[]> {
  const folders = [globalConfig, ...(Flag.ORCHESTRA_DISABLE_PROJECT_CONFIG ? [] : await projectFolders(directory))]
  const files = await Promise.all(folders.flatMap((folder) => names.map((name) => path.join(folder, name))).map(load))
  return files.filter((file): file is File => file !== undefined)
}

async function projectFolders(directory: string) {
  const ancestors = async (current: string): Promise<string[]> => {
    const parent = path.dirname(current)
    if (parent === current || (await fs.stat(path.join(current, ".git")).catch(() => undefined))) return [current]
    return [current, ...(await ancestors(parent))]
  }
  // Farthest folder first, so the folder nearest the opened directory wins.
  return (await ancestors(path.resolve(directory))).toReversed().flatMap((folder) => [folder, path.join(folder, ".orchestra")])
}

async function load(file: string): Promise<File | undefined> {
  const text = await fs.readFile(file, "utf8").catch(() => undefined)
  if (!text?.trim()) return undefined
  const errors: ParseError[] = []
  const value: unknown = parse(text, errors, { allowTrailingComma: true })
  if (errors.length)
    throw new Error(
      `${file}: ${errors.map((error) => `${printParseErrorCode(error.error)} at offset ${error.offset}`).join(", ")}`,
    )
  return { path: file, value }
}
```

## E22. Short Git cache and bounded VCS view

Source: packages/core/src/git-cli.ts:12–17; blob 16794c1268c48aac93e894777a37e676a2b44c2a; exact-span SHA-256 19f35d298226068ccf88f77aea0f421568eb33b1c9a421768c57e83e31b79f1d.

```ts
export const CACHE_WINDOW = Duration.millis(1500)
const CACHE_MAX_ENTRIES = 64
// Untracked files up to this size are counted in-process; larger ones fall back to git.
const UNTRACKED_READ_LIMIT = 4 * 1024 * 1024
// git treats a NUL in the first 8000 bytes as binary.
const BINARY_PROBE_BYTES = 8000
```

Source: packages/core/src/git-cli.ts:229–265; blob 16794c1268c48aac93e894777a37e676a2b44c2a; exact-span SHA-256 1ad3812c37fc6316d3a582e7bc800d21c2b5af17b72e43672cca22f4876c551f.

```ts
export class Service extends Context.Service<Service, Interface>()("@orchestra/Git") {}

// Lines as `git diff --numstat` counts them: a final line without a newline still counts.
const countLines = (bytes: Buffer) => {
  let newlines = 0
  for (let at = bytes.indexOf(10); at !== -1; at = bytes.indexOf(10, at + 1)) newlines++
  return bytes.length === 0 || bytes[bytes.length - 1] === 10 ? newlines : newlines + 1
}

// Caches one effect per argument list for `window`; callers inside it, concurrent ones included, share one computation.
const memoize = <Args extends readonly string[], A>(
  window: Duration.Input,
  compute: (...args: Args) => Effect.Effect<A>,
) => {
  const entries = new Map<string, Effect.Effect<A>>()
  const read = Effect.fnUntraced(function* (...args: Args) {
    const key = args.join("\0")
    const hit = entries.get(key)
    if (hit) return yield* hit
    const created = (yield* Effect.cachedInvalidateWithTTL(compute(...args), window))[0]
    // Another caller may have stored its entry while this one was being created; the first stored wins.
    const stored = entries.get(key)
    if (stored) return yield* stored
    if (entries.size >= CACHE_MAX_ENTRIES) entries.clear()
    entries.set(key, created)
    return yield* created
  })
  return { read, clear: () => entries.clear() }
}

export const layerWith = (window: Duration.Input) => Layer.effect(
  Service,
  Effect.gen(function* () {
    const appProcess = yield* AppProcess.Service
    const encoder = new TextEncoder()
    const stdin = (text: string) => Stream.make(encoder.encode(text))

```

Source: packages/core/src/git-cli.ts:482–496; blob 16794c1268c48aac93e894777a37e676a2b44c2a; exact-span SHA-256 169c4cb713bc7f14889ccb0fb4730fc83cf60701d321aeb6f2075fc95059f3d7.

```ts
    const cache = {
      branch: memoize(window, branch),
      defaultBranch: memoize(window, defaultBranch),
      hasHead: memoize(window, hasHead),
      status: memoize(window, status),
      stats: memoize(window, stats),
    }

    const applyPatch = Effect.fn("Git.applyPatch")(function* (cwd: string, patch: string) {
      const result = yield* run(["apply", "-"], { cwd, stdin: stdin(patch) })
      // The working tree just changed; a cached status would hide it for the rest of the window.
      Object.values(cache).forEach((entry) => entry.clear())
      return result
    })

```

Source: packages/core/src/vcs.ts:26–46; blob 5576086137755e4a1b471141c71d08803f3dc1f3; exact-span SHA-256 80394b05b52b0091659a56bd5b125489bc4184cc4d93017994f39d24e8e53539.

```ts
const MAX_PATCH_BYTES = 10_000_000
const MAX_TOTAL_PATCH_BYTES = 10_000_000
const ACTIVITY_MAX_COMMITS = 20_000
const ACTIVITY_MAX_WINDOW_MS = 366 * 24 * 60 * 60 * 1000
const ACTIVITY_MAX_OUTPUT_BYTES = 10_000_000
const ACTIVITY_TIMEOUT = Duration.seconds(5)
// Line stats diff every commit, which is orders of magnitude slower than walking history,
// so they get a short budget and may only cover the newest commits of the window.
const ACTIVITY_LINES_BUDGET = Duration.seconds(1)
export type DiffOptions = {
  readonly context?: number
}

const emptyPatch = (file: string) => formatPatch(structuredPatch(file, file, "", "", "", "", { context: 0 }))

const nums = (list: GitCli.Stat[]) =>
  new Map(list.map((item) => [item.file, { additions: item.additions, deletions: item.deletions }] as const))

const merge = (...lists: GitCli.Item[][]) => {
  const out = new Map<string, GitCli.Item>()
  lists.flat().forEach((item) => {
```

Source: packages/core/src/vcs.ts:317–360; blob 5576086137755e4a1b471141c71d08803f3dc1f3; exact-span SHA-256 570ea9131a08fd57199bad062f10ceb4b0609b5128864a2037477edc5f843eca.

```ts
/** Commit activity in a window, bounded in commits, output and time; `repository` is false outside git. */
export const activity = Effect.fn("Vcs.activity")(function* (
  git: GitCli.Interface,
  directory: string,
  input: ActivityInput,
  repository: boolean,
  root: GitCli.Base | undefined,
) {
  const window = { since: Math.max(input.since, input.until - ACTIVITY_MAX_WINDOW_MS), until: input.until }
  const empty = summarize({ commits: [], merges: [], lines: [] }, window)
  if (!repository) return { ...empty, repository: false }
  if (!(yield* git.hasHead(directory))) return empty
  const scan = {
    ...window,
    merges: false,
    numstat: false,
    limit: ACTIVITY_MAX_COMMITS,
    maxOutputBytes: ACTIVITY_MAX_OUTPUT_BYTES,
    timeout: ACTIVITY_TIMEOUT,
  }
  const [commits, merges, lines, divergence] = yield* Effect.all(
    [
      git.log(directory, scan),
      git.log(directory, { ...scan, merges: true }),
      git.log(directory, { ...scan, numstat: true, timeout: ACTIVITY_LINES_BUDGET }),
      upstreamDivergence(git, directory, root),
    ],
    { concurrency: 4 },
  )
  return {
    ...summarize({ commits: commits.commits, merges: merges.commits, lines: lines.commits }, window),
    ahead: divergence?.ahead ?? null,
    behind: divergence?.behind ?? null,
    truncated: commits.truncated || merges.truncated || lines.truncated,
    partial: { commits: commits.truncated || merges.truncated, lines: lines.truncated },
  }
})

// git bounds the walk by committer time; author time decides the window and day buckets.
// Commit, author and merge counts come from the cheap scans; line and path figures come
// from the budgeted numstat scan, which may cover fewer commits.
function summarize(
  scans: { commits: GitCli.Commit[]; merges: GitCli.Commit[]; lines: GitCli.Commit[] },
  window: { since: number; until: number },
```

## E23. Search backend availability and watcher opt-in/failure boundary

Source: packages/core/src/filesystem/search.ts:142–168; blob 4a5ff27504876a2766ae2ee90c42c864aa5aaabc; exact-span SHA-256 35c911c6060a4e39976cea66cb407d9f7d6a7c03af9ee2ad0e38c409cd9079a4.

```ts
              ),
              Effect.mapError(searchError),
            )
        }),
      find: (input) =>
        Effect.gen(function* () {
          yield* indexed
          const items =
            input.type === "file"
              ? state.files
              : input.type === "directory"
                ? state.directories
                : [...state.files, ...state.directories]
          return fuzzysort.go(input.query, items, { limit: input.limit ?? 50 }).map((item) => {
            const relative = item.target
            const type = relative.endsWith(path.sep) ? ("directory" as const) : ("file" as const)
            return FileSystem.Entry.make({
              path: RelativePath.make(relative),
              type,
            })
          })
        }),
    })
  }),
)

export const fffLayer = Layer.effect(
```

Source: packages/core/src/filesystem/search.ts:304–308; blob 4a5ff27504876a2766ae2ee90c42c864aa5aaabc; exact-span SHA-256 f5402292aeb80202e04d33f5f8861bcc8da4e4425c72d728caf3e48e951af3a6.

```ts
const layer = Layer.unwrap(Effect.sync(() => (Flag.ORCHESTRA_DISABLE_FFF || !Fff.available() ? ripgrepLayer : fffLayer)))

export const locationLayer = layer

export const node = makeLocationNode({ service: Service, layer, deps: [FSUtil.node, Location.node, Ripgrep.node] })
```

Source: packages/core/src/filesystem/fff.node.ts:122–139; blob 22e97469a02a529d4717499ae0fcdc81329c6f3e; exact-span SHA-256 eac8adc6da4f49b93fa9b26f1be0fe980b682e96e33f819a15c7f01aa34b0ddd.

```ts
      afterContext?: number
      cursor?: Cursor
      pageSize?: number
    },
  ): Result<Grep>
  trackQuery(query: string, file: string): Result<boolean>
  getHistoricalQuery(offset: number): Result<string | null>
}

export function available() {
  return false
}

export function create(_opts: Init): Result<Picker> {
  return { ok: false, error: "fff unavailable on node runtime" }
}

export * as Fff from "./fff.node"
```

Source: packages/core/src/filesystem/watcher.ts:90–142; blob 4983f9de6580fff07e3359692304c2fcea966dc0; exact-span SHA-256 68d52952c5c3616ec741aa38c2a91b91060ede2c2a590d8a5681012921e946d3.

```ts
const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    if (yield* Flag.ORCHESTRA_EXPERIMENTAL_DISABLE_FILEWATCHER) return Service.of({})

    const backend = getBackend()
    const location = yield* Location.Service
    if (!backend) {
      yield* Effect.logError("watcher backend not supported", {
        directory: location.directory,
        platform: process.platform,
      })
      return Service.of({})
    }

    const w = watcher()
    if (!w) return Service.of({})

    yield* Effect.logInfo("watcher backend", { directory: location.directory, platform: process.platform, backend })
    const events = yield* EventV2.Service
    const fs = yield* FSUtil.Service
    const git = yield* Git.Service
    const context = yield* Effect.context()
    const runFork = Effect.runForkWith(context)
    const pendingSubscriptions = new Set<Promise<ParcelWatcher.AsyncSubscription>>()
    yield* Effect.addFinalizer(() => Effect.promise(() => closeSubscriptions(pendingSubscriptions)))

    // A branch switch rewrites HEAD; `vcs.branch.updated` tells the app, as the earlier runtime's HEAD watcher did.
    const head = { file: undefined as string | undefined, check: Effect.void as Effect.Effect<void> }
    const callback: ParcelWatcher.SubscribeCallback = (_error, updates) => {
      for (const update of updates) {
        if (update.type === "create") runFork(events.publish(Event.Updated, { file: update.path, event: "add" }))
        if (update.type === "update") runFork(events.publish(Event.Updated, { file: update.path, event: "change" }))
        if (update.type === "delete") runFork(events.publish(Event.Updated, { file: update.path, event: "unlink" }))
        if (update.path === head.file) runFork(head.check)
      }
    }

    const subscribe = (directory: string, ignore: string[]) => {
      const pending = w.subscribe(directory, callback, { ignore, backend })
      pendingSubscriptions.add(pending)
      return Effect.promise(() => pending).pipe(
        Effect.timeout(SUBSCRIBE_TIMEOUT_MS),
        Effect.catchCause((cause) => {
          return Effect.logError("failed to subscribe", { directory, cause: Cause.pretty(cause) })
        }),
      )
    }

    const config = (yield* (yield* Config.Service).entries())
      .filter((entry): entry is Config.Document => entry.type === "document")
      .flatMap((item) => item.info.watcher?.ignore ?? [])
    if (location.vcs && (yield* Flag.ORCHESTRA_EXPERIMENTAL_FILEWATCHER)) {
```

## E24. Scan filters and thin schema ownership

Source: packages/core/src/filesystem/ignore.ts:41–66; blob 7d68c38e192b926ac0c8bebc3ede6fe0a1b65387; exact-span SHA-256 ae26a6f5a4d44a3008ec2138fc86613d8a8caf24b31dffc1433841bc7d8be65a.

```ts
  "**/tmp/**",
  "**/temp/**",
  "**/*.log",
  "**/coverage/**",
  "**/.nyc_output/**",
]

// Folders that only ever hold dependencies, caches, VCS data or build output. The watcher takes a bare name as one path
// at the watched root, so these also go as globs to drop them at any depth: a nested package's `node_modules` or a
// nested checkout's `.git` would otherwise stream every write into the server. The other FOLDERS stay root-only there,
// since names like `desktop`, `bin` or `build` are source folders in nested packages.
const GENERATED = [
  "node_modules",
  "bower_components",
  ".pnpm-store",
  ".npm",
  "dist",
  ".next",
  "target",
  ".git",
  ".svn",
  ".hg",
  ".turbo",
  ".output",
  ".sst",
  ".cache",
```

Source: packages/core/src/filesystem/protected.ts:1–53; blob a7646dfb48f2103bac170a983af45647e48e1be4; exact-span SHA-256 c2ed8521ace1153b7fbf29366a9919eaea20561de605f4ae5552abc73e4da100.

```ts
import os from "os"
import path from "path"

const home = os.homedir()

const DARWIN_HOME = [
  "Music",
  "Pictures",
  "Movies",
  "Downloads",
  "Desktop",
  "Documents",
  "Public",
  "Applications",
  "Library",
]

const DARWIN_LIBRARY = [
  "Application Support/AddressBook",
  "Calendars",
  "Mail",
  "Messages",
  "Safari",
  "Cookies",
  "Application Support/com.apple.TCC",
  "PersonalizationPortrait",
  "Metadata/CoreSpotlight",
  "Suggestions",
]

const DARWIN_ROOT = ["/.DocumentRevisions-V100", "/.Spotlight-V100", "/.Trashes", "/.fseventsd"]
const WIN32_HOME = ["AppData", "Downloads", "Desktop", "Documents", "Pictures", "Music", "Videos", "OneDrive"]

/** Directory basenames to skip when scanning the home directory. */
export function names(): ReadonlySet<string> {
  if (process.platform === "darwin") return new Set(DARWIN_HOME)
  if (process.platform === "win32") return new Set(WIN32_HOME)
  return new Set()
}

/** Absolute paths that should never be watched, stated, or scanned. */
export function paths(): string[] {
  if (process.platform === "darwin")
    return [
      ...DARWIN_HOME.map((name) => path.join(home, name)),
      ...DARWIN_LIBRARY.map((name) => path.join(home, "Library", name)),
      ...DARWIN_ROOT,
    ]
  if (process.platform === "win32") return WIN32_HOME.map((name) => path.join(home, name))
  return []
}

export * as Protected from "./protected"
```

Source: packages/core/src/file.ts:1–6; blob 84f181e0300b3be31cca73625f77d15154df4e8f; exact-span SHA-256 9fbb71d49fa149c17322ec82bb61649231a4b14f2ad53d481d4d8c3126420d66.

```ts
export * as File from "./file"

import { Revert } from "@orchestra/schema/revert"

export const Diff = Revert.FileDiff
export type Diff = typeof Diff.Type
```

Source: packages/core/src/workspace.ts:1–6; blob 73fc2bfb517008424bb203e71cfc04b59ebf9460; exact-span SHA-256 0930dcdaf4c7a2b442dce9378a11bf173e213f291d040cbae1d9f32335b3bdc7.

```ts
export * as WorkspaceV2 from "./workspace"

import { Workspace } from "@orchestra/schema/workspace"

export const ID = Workspace.ID
export type ID = typeof ID.Type
```

## E25. Guard and repository-host adapters are external process boundaries

Source: packages/core/src/guardrail.ts:39–80; blob fd60ef512f2c2250f08d9313b09052c2e1fc232c; exact-span SHA-256 040e784ef0270f3611eba674326dc0e2403e32fd765f6170b08ef3f76151f646.

```ts
// The engine is the repository's own script/guards, run with the checkout as `--cwd`. Arguments are an
// array without a shell; a base ref reaches it behind `--base`, so it can never read as an option.
export const make = Effect.fn("Guardrail.make")(function* (input: { directory: string; env?: NodeJS.ProcessEnv }) {
  const proc = yield* AppProcess.Service

  const engine = Effect.fn("Guardrail.engine")(function* (args: string[]) {
    const script = path.join(input.directory, ENGINE)
    if (!fs.existsSync(script))
      return yield* new EngineError({ kind: "no-engine", message: "This repository has no script/guards engine" })
    const bun = which("bun", input.env ?? process.env)
    if (!bun) return yield* new EngineError({ kind: "no-bun", message: "bun is not installed on this server" })
    const result = yield* proc
      .run(
        ChildProcess.make(bun, [script, "--cwd", input.directory, ...args], {
          cwd: input.directory,
          env: engineEnv(input.env ?? process.env),
          extendEnv: false,
          stdin: "ignore",
        }),
        { maxOutputBytes: 8 * 1024 * 1024, maxErrorBytes: 16 * 1024, timeout: `${SECONDS} seconds` },
      )
      .pipe(
        Effect.mapError(
          (error) => new EngineError({ kind: "failed", message: `The guards engine did not finish: ${error}`.slice(0, 300) }),
        ),
      )
    // Exit 1 is a normal answer (a gate finding or a setup error); the JSON on stdout is what counts.
    if (result.stdoutTruncated) return yield* unreadable()
    return result.stdout.toString("utf8")
  })

  const rules = Effect.fn("Guardrail.rules")(function* () {
    const decoded = decodeRules(yield* engine(["--rules"]))
    return Option.isSome(decoded) ? decoded.value : yield* unreadable()
  })

  const run = Effect.fn("Guardrail.run")(function* (request: RunInput) {
    const decoded = decodeReport(yield* engine(["--json", ...(request.base ? ["--base", request.base] : [])]))
    return Option.isSome(decoded) ? decoded.value : yield* unreadable()
  })

  return Service.of({ rules, run })
```

Source: packages/core/src/pull-request.ts:57–90; blob a2310fcaba3e9666056927b6c0f89d4f1629ff12; exact-span SHA-256 bda2c3aabefcbd0b0413cf4c5f58b04cd3b4317a8ece20a80144003ff71fa737.

```ts
  "query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) { pullRequests(states: OPEN, first: " +
  PAGE +
  ", orderBy: {field: CREATED_AT, direction: DESC}) { totalCount nodes { number title url state author { login } } } } }"
const GITLAB_QUERY =
  "query($path: ID!) { project(fullPath: $path) { mergeRequests(state: opened, first: " +
  PAGE +
  ", sort: CREATED_DESC) { count nodes { iid title webUrl state author { username } } } } }"
const decodeGitHubList = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      data: Schema.Struct({
        repository: Schema.Struct({
          pullRequests: Schema.Struct({
            totalCount: Schema.Int,
            nodes: Schema.Array(
              Schema.Struct({
                number: Schema.Int,
                title: Schema.String,
                url: Schema.String,
                state: Schema.String,
                author: Schema.NullOr(Schema.Struct({ login: Schema.String })),
              }),
            ),
          }),
        }),
      }),
    }),
  ),
)
// One pull request with what the board's git trail shows. CI checks are the head commit's statusCheckRollup:
// check runs carry status and conclusion, legacy commit statuses carry a state.
const GITHUB_DETAIL_QUERY =
  "query($owner: String!, $name: String!, $number: Int!) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { " +
  "number title url state merged headRefName reviewDecision mergeCommit { oid } " +
```

Source: packages/core/src/pull-request.ts:187–215; blob a2310fcaba3e9666056927b6c0f89d4f1629ff12; exact-span SHA-256 cc4d10db14b24f88be3d2b5dbe50589b5a08c27f92bddb712aa7aa32f7098b73.

```ts
export const make = Effect.fn("PullRequest.make")(function* (input: { directory: string; env?: NodeJS.ProcessEnv }) {
  const proc = yield* AppProcess.Service

  const git = (args: string[]) =>
    proc
      .run(
        ChildProcess.make("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", ...args], {
          cwd: input.directory,
          extendEnv: true,
          stdin: "ignore",
        }),
        { maxOutputBytes: 64 * 1024, maxErrorBytes: 4 * 1024, timeout: "10 seconds" },
      )
      .pipe(
        Effect.map((result) => ({
          ok: result.exitCode === 0 && !result.stdoutTruncated,
          text: result.stdout.toString("utf8").trim(),
        })),
        Effect.catch(() => Effect.succeed({ ok: false, text: "" })),
      )

  const target = Effect.fn("PullRequest.target")(function* () {
    const listed = yield* git(["remote", "-v"])
    const remotes = listed.text.split(/\r?\n/).flatMap((line) => {
      const match = /^(\S+)\s+(\S+)\s+\(fetch\)$/.exec(line.trim())
      const repository = match ? hostRepository(match[2]!) : undefined
      return match && repository ? [{ name: match[1]!, ...repository }] : []
    })
    const chosen = remotes.find((remote) => remote.name === "origin") ?? remotes[0]
```

## E26. Selected test assertions, not executed checks

Source: packages/core/test/config/config-global.test.ts:173–225; blob c588a2faa706a57795ec5bb84b4e18ac1b1f1d32; exact-span SHA-256 77419897bbe8678bbe5ab3ba0fd29ef3b6bc540baf3c1d77940fba9fa3b82ff2.

```ts
  it.live("reuses the decoded global settings until a file changes or updateGlobal writes", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) => {
        const globalDirectory = path.join(tmp.path, "global")
        const file = path.join(globalDirectory, "orchestra.json")
        return Effect.gen(function* () {
          yield* Effect.promise(async () => {
            await fs.mkdir(globalDirectory, { recursive: true })
            await fs.writeFile(file, `{"model":"a/one"}`)
          })
          expect((yield* Config.readGlobal()).model).toBe("a/one")

          // Same size, inode and mtime: the cached value is served, which proves the file was not decoded again.
          yield* Effect.promise(async () => {
            const before = await fs.stat(file)
            await fs.writeFile(file, `{"model":"b/two"}`)
            await fs.utimes(file, before.atime, new Date(Math.floor(before.mtimeMs)))
          })
          expect((yield* Config.readGlobal()).model).toBe("a/one")

          // A served value is a copy: editing it does not poison the cache.
          const first = yield* Config.readGlobal()
          first.trustedProjects.push("/mutated")
          expect((yield* Config.readGlobal()).trustedProjects).toEqual([])

          // An external edit that changes the size is seen on the next read.
          yield* Effect.promise(() => fs.writeFile(file, `{"model":"c/three"}`))
          expect((yield* Config.readGlobal()).model).toBe("c/three")

          // A new higher-priority file is seen, and so is its removal.
          const jsonc = path.join(globalDirectory, "orchestra.jsonc")
          yield* Effect.promise(() => fs.writeFile(jsonc, `{"model":"d/four"}`))
          expect((yield* Config.readGlobal()).model).toBe("d/four")
          yield* Effect.promise(() => fs.rm(jsonc))
          expect((yield* Config.readGlobal()).model).toBe("c/three")

          // updateGlobal drops the entry, so its own write is read back at once.
          yield* Config.updateGlobal({ model: "e/five" })
          expect((yield* Config.readGlobal()).model).toBe("e/five")
        }).pipe(
          Effect.provide(
            AppNodeBuilder.build(LayerNode.group([FSUtil.node, Global.node]), [
              [
                Location.node,
                Layer.succeed(
                  Location.Service,
                  Location.Service.of(location({ directory: AbsolutePath.make(tmp.path) })),
                ),
              ],
              [Global.node, Global.layerWith({ config: globalDirectory })],
```

Source: packages/core/test/config/provider-policy-migration.test.ts:26–63; blob 1faf787af8df4a5dd76129487790b7f90e34dc0f; exact-span SHA-256 eceed374b19c95dd44d7f6c13d1d8148f1e4dbeae84fb171f67e5e45471a0509.

```ts
it.effect("legacy allowlist and disabled providers retain restrictions and existing policy denials", () =>
  Effect.gen(function* () {
    const policy = yield* Policy.Service
    const config = migrate({
      enabled_providers: ["opencode", "openrouter", "denied"],
      disabled_providers: ["opencode"],
      experimental: {
        policies: [
          { action: "provider.use", resource: "*", effect: "allow" },
          { action: "provider.use", resource: "denied", effect: "deny" },
        ],
      },
    })
    yield* policy.load((config.experimental?.policies ?? []).map((item) => new Policy.Info(item)))
    expect(yield* policy.evaluate("provider.use", "opencode", "allow")).toBe("deny")
    expect(yield* policy.evaluate("provider.use", "openrouter", "allow")).toBe("allow")
    expect(yield* policy.evaluate("provider.use", "denied", "allow")).toBe("deny")
    expect(yield* policy.evaluate("provider.use", "unlisted", "allow")).toBe("deny")
  }),
)

it.effect("an empty legacy allowlist denies every provider; omitted allowlist leaves policy intact", () =>
  Effect.gen(function* () {
    const policy = yield* Policy.Service
    yield* policy.load(
      (migrate({ enabled_providers: [] }).experimental?.policies ?? []).map((item) => new Policy.Info(item)),
    )
    expect(yield* policy.evaluate("provider.use", "opencode", "allow")).toBe("deny")
    const config = migrate({
      experimental: { policies: [{ action: "provider.use", resource: "blocked", effect: "deny" }] },
    })
    expect(config.experimental?.policies).toEqual([{ action: "provider.use", resource: "blocked", effect: "deny" }])
    yield* policy.load((config.experimental?.policies ?? []).map((item) => new Policy.Info(item)))
    expect(yield* policy.evaluate("provider.use", "opencode", "allow")).toBe("allow")
    expect(yield* policy.evaluate("provider.use", "blocked", "allow")).toBe("deny")
    expect(migrate({}).experimental).toBeUndefined()
  }),
)
```

Source: packages/core/test/project-checkpoint-errors.test.ts:15–44; blob 9f76247a40dd62fcc64681ca86535150bc1fe3f2; exact-span SHA-256 f30384f3a2d3cc411528bc3b24a36e78f0e4875aa14016d75688f67dd973d027.

```ts
it.live("checkpoint storage sanitizes a proven driver error containing private context", () => Effect.gen(function* () {
  const database = yield* Database.Service
  const store = yield* ProjectCheckpoint.Service
  const projectID = ProjectSchema.ID.make("checkpoint-errors")
  const sessionID = SessionSchema.ID.make("ses_checkpoint_errors")
  const directory = AbsolutePath.make("/checkpoint-errors")
  const secret = "CHECKPOINT_PRIVATE_DRIVER_CONTROL"
  yield* database.db.insert(ProjectTable).values({ id: projectID, worktree: directory, sandboxes: [] }).run()
  yield* database.db.insert(SessionTable).values({ id: sessionID, project_id: projectID, directory,
    slug: "checkpoint-errors", title: "Checkpoint errors", version: "1" }).run()
  yield* database.db.run(`CREATE TRIGGER checkpoint_private BEFORE INSERT ON project_checkpoint
    BEGIN SELECT RAISE(ABORT, '${secret}'); END`)
  const raw = yield* database.db.insert(ProjectCheckpointTable).values({ id: "raw:0", project_id: projectID,
    session_id: sessionID, fork_id: "raw", boundary: "msg_boundary", attempt: 0, directory,
    time_created: 1, digest: "synthetic", payload: JSON.stringify(secret) }).run().pipe(Effect.exit)
  expect(raw._tag).toBe("Failure")
  if (raw._tag !== "Failure") throw new Error("Missing private-error positive control")
  expect(Cause.pretty(raw.cause)).toContain(secret)
  const input = { sessionID, forkID: "saved", boundary: "msg_boundary", attempt: 0 as const, payload: JSON.stringify(secret) }
  const error = yield* store.save(input).pipe(Effect.flip)
  expect(error.reason).toBe("storage")
  expect(String(error)).not.toContain(secret)
  expect(error.message).not.toContain(secret)
  expect(JSON.stringify(error)).not.toContain(secret)
  expect(Reflect.get(error, "cause")).toBeUndefined()
  expect((yield* store.list({ projectID })).items).toEqual([])
  yield* database.db.run("DROP TRIGGER checkpoint_private")
  const saved = yield* store.save(input)
  expect((yield* store.read({ projectID, id: saved.id }))?.payload).toBe(input.payload)
}))
```

