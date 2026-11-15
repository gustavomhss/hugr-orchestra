# v2 mandatory correction evidence

All excerpts are exact contiguous source lines at `1cde2ff7a71bcf7aecb5d030917b577165135d38`. Line numbers are metadata outside fences; code is not normalized. Existing E01–E26 remain in the unchanged v1 review packet. These snippets supplement the same judges’ evidence requests; they are not runtime results. E30 demonstrates the historical goal and route sketch only, not current Protocol/Server authority. E35 is a cross-read without ownership transfer.

## E27 — Configuration discovery, directory loading and last defined value

Source `packages/core/src/config.ts`; blob `52985a1dfc3575efca662dcb0667d81a1ab6f1de`; full-file SHA256 `bc4ce670f2214fcecab7f7a705f04aecd0f48c7cf03076c67e55421956a625e6`.

Lines 125–129:

```ts
export function latest<K extends keyof Info>(entries: readonly Entry[], key: K): Info[K] | undefined {
  return entries
    .filter((entry): entry is Document => entry.type === "document")
    .findLast((entry) => entry.info[key] !== undefined)?.info[key]
}
```

Lines 167–170:

```ts
    const names = ["orchestra.json", "orchestra.jsonc"]
    const decodeOptions = { errors: "all", onExcessProperty: "ignore", propertyOrder: "original" } as const
    const decodeInfo = Schema.decodeUnknownEffect(Info, decodeOptions)
    const decodeOldInfo = Schema.decodeUnknownEffect(ConfigUpgradeSource.Info, decodeOptions)
```

Lines 206–268:

```ts
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
```

Source `packages/core/src/fs-util.ts`; blob `695361a7b2812386ceb0dfcc0f535c146e744a9e`; full-file SHA256 `075165942ad976929aa9e3257d63f6812a3f943472aeb960ffeb9be81ecc312a`.

Lines 204–218:

```ts
      const up = Effect.fn("FileSystem.up")(function* (options: { targets: string[]; start: string; stop?: string }) {
        const result: string[] = []
        let current = options.start
        while (true) {
          for (const target of options.targets) {
            const search = join(current, target)
            if (yield* fs.exists(search)) result.push(search)
          }
          if (options.stop === current) break
          const parent = dirname(current)
          if (parent === current) break
          current = parent
        }
        return result
      })
```

## E28 — Historical config field-review labels and review order

Source `docs/specs/v2/config.md`; blob `81353980473012b1b3d311f0a638e3d65ba8cbcd`; full-file SHA256 `5b8df788e30f2120eaa1c12c94d9ca19738fb16d14ddc4cc372b129d535d37f8`.

Lines 1–18:

```markdown
# V2 Config Review

This document breaks the legacy configuration schema into small review groups. Work through one group at a time and decide whether each field should be ported as-is, removed, or redesigned for v2.

## Status Labels

- `pending`: not discussed yet
- `keep`: port with substantially the existing meaning
- `remove`: do not carry forward
- `redesign`: keep the capability with a different shape, scope, or owning module

## Schema Scope

Use one v2 config schema for now. Some fields are intended for global/user configuration, but there is not yet enough benefit to enforce that with separate global and location schemas. Revisit this if more scope-sensitive fields survive the review.

V2 core discovers config documents named `orchestra.json` or `orchestra.jsonc` in the global config directory, ancestor project directories, and `.orchestra` config directories. The legacy `config.json` filename is not supported in V2.

## Group 1: File Metadata
```

Lines 382–390:

```markdown
## Review Order

Work through the groups in this order unless a dependency between decisions becomes clear:

1. File Metadata
2. Process And Server Settings
3. Providers And Model Selection
4. Commands And Project Resources
5. Plugins
```

## E29 — Checkpoint JSON decoder and UTF-8 SHA-256 definition

Source `packages/core/src/project/checkpoint.ts`; blob `5972b18ab5b5bd6792447261cd65933aee379e99`; full-file SHA256 `25156c4e4b8cdb91db190f5d388c78b48e198be8511dd95c0aaef4821213531a`.

Lines 3–5:

```ts
import { createHash } from "node:crypto"
import { and, desc, eq } from "drizzle-orm"
import { Clock, Context, Effect, Layer, Option, Schema } from "effect"
```

Lines 75–100:

```ts
const decodePayload = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)
const digest = (payload: string) => createHash("sha256").update(payload, "utf8").digest("hex")

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const database = yield* Database.Service

    return Service.of({
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
```

## E30 — Historical multi-project/worktree goal and route sketch

Source `docs/specs/project.md`; blob `35adeb94cff7e1d24adc9844f9e25fdb17df08a5`; full-file SHA256 `f1b96968476b6e0723fb5f42a9a3d9741cb2381b2892ae27392127a19507374c`.

Lines 1–64:

````markdown
## project

The goal is to let a single instance of Orchestra run sessions for multiple projects and different worktrees per project.

### api

```
GET /project -> Project[]

POST /project/init -> Project


GET /project/:projectID/session -> Session[]

GET /project/:projectID/session/:sessionID -> Session

POST /project/:projectID/session -> Session
{
  id?: string
  parentID?: string
  directory: string
}

DELETE /project/:projectID/session/:sessionID

POST /project/:projectID/session/:sessionID/init

POST /project/:projectID/session/:sessionID/abort

POST /project/:projectID/session/:sessionID/share

DELETE /project/:projectID/session/:sessionID/share

POST /project/:projectID/session/:sessionID/compact

GET /project/:projectID/session/:sessionID/message -> { info: Message, parts: Part[] }[]

GET /project/:projectID/session/:sessionID/message/:messageID -> { info: Message, parts: Part[] }

POST /project/:projectID/session/:sessionID/message -> { info: Message, parts: Part[] }

POST /project/:projectID/session/:sessionID/revert -> Session

POST /project/:projectID/session/:sessionID/unrevert -> Session

POST /project/:projectID/session/:sessionID/permission/:permissionID -> Session

GET /project/:projectID/session/:sessionID/find/file -> string[]

GET /project/:projectID/session/:sessionID/file -> { type: "raw" | "patch", content: string }

GET /project/:projectID/session/:sessionID/file/status -> File[]

POST /log

// These are awkward

GET /provider?directory=<resolve path> -> Provider
GET /config?directory=<resolve path> -> Config // think only tui uses this?

GET /project/:projectID/agent?directory=<resolve path> -> Agent
GET /project/:projectID/find/file?directory=<resolve path> -> File

```
````

## E31 — Disabled-provider edit predicate and replacement

Source `packages/core/src/config.ts`; blob `52985a1dfc3575efca662dcb0667d81a1ab6f1de`; full-file SHA256 `bc4ce670f2214fcecab7f7a705f04aecd0f48c7cf03076c67e55421956a625e6`.

Lines 383–419:

```ts
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
    permissions: Array.isArray(root.permissions) ? root.permissions : [],
    trustedProjects: Array.isArray(root.trusted_projects) ? root.trusted_projects : [],
  }
}

function providerDenial(item: Record<string, unknown>): item is { action: "provider.use"; effect: "deny"; resource: string } {
  return item.action === "provider.use" && item.effect === "deny" && typeof item.resource === "string" && item.resource !== "*"
}
```

## E32 — Copy strategy selection, possible source admission and destination registration

Source `packages/core/src/project/copy.ts`; blob `11e941c573dca760eb95641f45597f48412ea98c`; full-file SHA256 `de6171c6977466da7c5fa074cacc9c8e858780ea8726f82167e805d7a015b56a`.

Lines 161–232:

```ts
    const changed = Effect.fnUntraced(function* (projectID: Project.ID, update: boolean) {
      if (update) yield* events.publish(Event.Updated, { projectID })
    })

    const canonical = Effect.fnUntraced(function* (input: AbsolutePath) {
      const resolved = AbsolutePath.make(yield* fs.resolve(input))
      if (!(yield* fs.isDir(resolved))) return yield* new DirectoryUnavailableError({ directory: input })
      return resolved
    })

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
```

## E33 — Behavior owner discriminator

Source `packages/core/src/behavior.ts`; blob `4d678d8b4b34b01d1dd6cb828963ae2bed223697`; full-file SHA256 `fa9b716c91dbd12964ef65dc86d3a4e864d8bfb279a9969553ee2c1bb12324c4`.

Lines 45–57:

```ts
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

```

## E34 — Repository cache status, reset fallback and actual return

Source `packages/core/src/repository-cache.ts`; blob `bcdc9de5686e25a71e0f83655bd19c0f87f7f29e`; full-file SHA256 `47553ee98730d975ad7b22a1b7e70fb6f1c9e6ab3ced30a96d02451ae01328cc`.

Lines 170–230:

```ts
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

                const checkout = yield* git.repo.discover(AbsolutePath.make(localPath))

                return {
                  repository,
                  host: input.reference.host,
                  remote: input.reference.remote,
                  localPath,
                  status,
                  head: checkout ? yield* git.history.head(checkout) : undefined,
                  branch: checkout ? yield* git.history.branch(checkout) : undefined,
                } satisfies Result
              }),
```

## E35 — Cross-read of read-tool authorization and text/media bounds

Source `packages/core/src/tool/read.ts`; blob `1e38e74b7231691a31d2ba217267326e74189558`; full-file SHA256 `1ca9741cfd96e11391c0cd457a354ad07a45072ed005b2c77b07c2710c6134c1`.

Lines 17–29:

```ts
export const name = "read"
const SUPPORTED_IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"])
const LocationInput = Schema.Struct({
  path: Schema.String,
  offset: ReadToolFileSystem.PageInput.fields.offset.annotate({
    description: "The 1-based directory entry or text line offset to start reading from",
  }),
  limit: ReadToolFileSystem.PageInput.fields.limit.annotate({
    description: "The maximum number of directory entries or text lines to read",
  }),
})
const Input = LocationInput
const Output = Schema.Union([FileSystem.Content, ReadToolFileSystem.TextPage, ReadToolFileSystem.ListPage])
```

Lines 58–109:

```ts
          execute: (input, context) => {
            return Effect.gen(function* () {
              const source = {
                type: "tool" as const,
                messageID: context.assistantMessageID,
                callID: context.toolCallID,
              }
              const target = yield* mutation.resolve({ path: input.path, kind: "directory" })
              const external = target.externalDirectory
              if (external)
                yield* permission.assert({
                  ...LocationMutation.externalDirectoryPermission(external),
                  sessionID: context.sessionID,
                  agent: context.agent,
                  source,
                })
              const resource = target.resource
              const absolute = AbsolutePath.make(target.canonical)
              const type = yield* reader.inspect(absolute)
              yield* permission.assert({
                action: name,
                resources: [resource],
                save: ["*"],
                sessionID: context.sessionID,
                agent: context.agent,
                source,
              })
              if (type === "directory")
                return yield* reader.list(absolute, { offset: input.offset, limit: input.limit })
              const content = yield* reader.read(absolute, resource, {
                offset: input.offset,
                limit: input.limit,
              })
              if ("encoding" in content && content.encoding === "base64" && SUPPORTED_IMAGE_MIMES.has(content.mime)) {
                return yield* image
                  .normalize(resource, { ...content, encoding: "base64" })
                  .pipe(Effect.catchTag("Image.ResizerUnavailableError", () => Effect.succeed(content)))
              }
              if ("encoding" in content && content.encoding === "base64")
                return yield* Effect.fail(new ReadToolFileSystem.BinaryFileError({ resource }))
              return content
            }).pipe(
              Effect.mapError((error) => {
                const message =
                  error instanceof ReadToolFileSystem.BinaryFileError ||
                  error instanceof ToolSafety.Denied ||
                  error instanceof ReadToolFileSystem.MediaIngestLimitError ||
                  error instanceof Image.DecodeError ||
                  error instanceof Image.SizeError
                    ? error.message
                    : `Unable to read ${input.path}`
                return new ToolFailure({ message, ...(error instanceof ToolSafety.Denied ? { error } : {}) })
```

Source `packages/core/src/tool/read-filesystem.ts`; blob `651e3b5f8852ed7a135763e0a32a12c897ef2da7`; full-file SHA256 `d219062814c8e3e1eaedbd59b025836acac1c73cd480e4c470c25f61231c156f`.

Lines 13–17:

```ts
export const MAX_READ_LINES = 2_000
export const MAX_READ_BYTES = 50 * 1024
export const MAX_MEDIA_INGEST_BYTES = 20 * 1024 * 1024
const MAX_LINE_LENGTH = 2_000
const MAX_LINE_SUFFIX = `... (line truncated to ${MAX_LINE_LENGTH} chars)`
```

Lines 75–78:

```ts
export const PageInput = Schema.Struct({
  offset: PositiveInt.pipe(Schema.optional),
  limit: PositiveInt.check(Schema.isLessThanOrEqualTo(MAX_READ_LINES)).pipe(Schema.optional),
})
```

Lines 108–165:

```ts
const extensions = new Set([
  ".zip",
  ".tar",
  ".gz",
  ".exe",
  ".dll",
  ".so",
  ".class",
  ".jar",
  ".war",
  ".7z",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".odt",
  ".ods",
  ".odp",
  ".bin",
  ".dat",
  ".obj",
  ".o",
  ".a",
  ".lib",
  ".wasm",
  ".pyc",
  ".pyo",
])
const startsWith = (bytes: Uint8Array, prefix: number[]) => prefix.every((value, index) => bytes[index] === value)
const imageMime = (bytes: Uint8Array) => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png"
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg"
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50]))
    return "image/webp"
}
const binary = (resource: string, bytes: Uint8Array) => {
  if (extensions.has(path.extname(resource).toLowerCase())) return true
  if (bytes.length === 0) return false
  let nonPrintable = 0
  for (const byte of bytes) {
    if (byte === 0) return true
    if (byte < 9 || (byte > 13 && byte < 32)) nonPrintable++
  }
  return nonPrintable / bytes.length > 0.3
}
const decodeUtf8 = (resource: string, decoder: TextDecoder, bytes?: Uint8Array) =>
  Effect.try({
    try: () => decoder.decode(bytes, { stream: bytes !== undefined }),
    catch: (error) => {
      if (error instanceof TypeError) return new MalformedUtf8Error({ resource })
      throw error
    },
  })
const decodeChunk = (resource: string, decoder: TextDecoder, bytes: Uint8Array) =>
  bytes.includes(0) ? Effect.fail(new BinaryFileError({ resource })) : decodeUtf8(resource, decoder, bytes)
```

Lines 174–337:

```ts
export const read = Effect.fn("ReadTool.read")(function* (
  fs: FSUtil.Interface,
  input: string,
  resource: string,
  page: PageInput = {},
) {
  const real = yield* fs.realPath(input)
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const file = yield* fs.open(real, { flag: "r" })
      const info = yield* file.stat
      if (info.type !== "File") return yield* Effect.fail(new PathKindError({ resource, expected: "a file" }))
      const first = Option.getOrElse(
        yield* file.readAlloc(Math.min(64 * 1024, Number(info.size) || 4 * 1024)),
        () => new Uint8Array(),
      )
      const mime = imageMime(first)
      if (mime) {
        if (info.size > MAX_MEDIA_INGEST_BYTES)
          return yield* Effect.fail(new MediaIngestLimitError({ resource, maximumBytes: MAX_MEDIA_INGEST_BYTES }))
        const chunks = [first]
        let total = first.length
        while (total <= MAX_MEDIA_INGEST_BYTES) {
          const chunk = yield* file.readAlloc(Math.min(64 * 1024, MAX_MEDIA_INGEST_BYTES + 1 - total))
          if (Option.isNone(chunk)) break
          chunks.push(chunk.value)
          total += chunk.value.length
        }
        if (total > MAX_MEDIA_INGEST_BYTES)
          return yield* Effect.fail(new MediaIngestLimitError({ resource, maximumBytes: MAX_MEDIA_INGEST_BYTES }))
        return {
          uri: pathToFileURL(real).href,
          name: path.basename(real),
          content: Buffer.concat(
            chunks.map((chunk) => Buffer.from(chunk)),
            total,
          ).toString("base64"),
          encoding: "base64" as const,
          mime,
        }
      }
      if (startsWith(first, [0x25, 0x50, 0x44, 0x46]) || extensions.has(path.extname(resource).toLowerCase()))
        return yield* Effect.fail(new BinaryFileError({ resource }))
      const inspector = OutputInspector.make()
      const inspectChunk = (chunk: Uint8Array) => {
        const reason = inspector.push(chunk)
        return reason ? Effect.fail(new ToolSafety.Denied({ reason })) : Effect.void
      }
      yield* inspectChunk(first)
      const paged = info.size > MAX_READ_BYTES || page.offset !== undefined || page.limit !== undefined
      if (!paged) {
        if (binary(resource, first)) return yield* Effect.fail(new BinaryFileError({ resource }))
        const decoder = new TextDecoder("utf-8", { fatal: true })
        const text = [yield* decodeUtf8(resource, decoder, first)]
        while (true) {
          const chunk = yield* file.readAlloc(64 * 1024)
          if (Option.isNone(chunk)) break
          yield* inspectChunk(chunk.value)
          text.push(yield* decodeChunk(resource, decoder, chunk.value))
        }
        text.push(yield* decodeUtf8(resource, decoder))
        const reason = inspector.finish()
        if (reason) return yield* new ToolSafety.Denied({ reason })
        return {
          uri: pathToFileURL(real).href,
          name: path.basename(real),
          content: text.join(""),
          encoding: "utf8" as const,
          mime: FSUtil.mimeType(real),
        }
      }
      const offset = page.offset ?? 1
      const limit = Math.min(page.limit ?? MAX_READ_LINES, MAX_READ_LINES)
      const lines: string[] = []
      const decoder = new TextDecoder("utf-8", { fatal: true })
      let pending = ""
      let discard = false
      let line = 1
      let bytes = 0
      let next: number | undefined
      const append = (input: string) => {
        if (line < offset) {
          line++
          return true
        }
        if (lines.length >= limit || bytes >= MAX_READ_BYTES) {
          next = line
          return false
        }
        const text = input.length > MAX_LINE_LENGTH ? input.slice(0, MAX_LINE_LENGTH) + MAX_LINE_SUFFIX : input
        const size = Buffer.byteLength(text, "utf-8") + (lines.length > 0 ? 1 : 0)
        if (bytes + size > MAX_READ_BYTES) {
          next = line
          return false
        }
        lines.push(text)
        bytes += size
        line++
        return true
      }
      const consume = (input: string) => {
        let text = input
        while (true) {
          const index = text.indexOf("\n")
          if (index === -1) {
            if (!discard) {
              pending += text
              if (pending.length > MAX_LINE_LENGTH) {
                pending = pending.slice(0, MAX_LINE_LENGTH + 1)
                discard = true
              }
            }
            break
          }
          const current = pending + (discard ? "" : text.slice(0, index))
          pending = ""
          discard = false
          text = text.slice(index + 1)
          if (!append(current.endsWith("\r") ? current.slice(0, -1) : current)) return false
        }
        return true
      }
      const consumeChunk = Effect.fnUntraced(function* (chunk: Uint8Array) {
        let start = 0
        while (start < chunk.length) {
          if (lines.length >= limit || bytes >= MAX_READ_BYTES) {
            next = line
            return false
          }
          const newline = chunk.indexOf(10, start)
          const end = newline === -1 ? chunk.length : newline + 1
          const segment = chunk.subarray(start, end)
          if (binary(resource, segment)) return yield* Effect.fail(new BinaryFileError({ resource }))
          if (!consume(yield* decodeUtf8(resource, decoder, segment))) return false
          start = end
        }
        return true
      })
      let done = !(yield* consumeChunk(first))
      while (!done) {
        const chunk = yield* file.readAlloc(64 * 1024)
        if (Option.isNone(chunk)) break
        yield* inspectChunk(chunk.value)
        done = !(yield* consumeChunk(chunk.value))
      }
      if (!done) {
        const tail = yield* decodeUtf8(resource, decoder)
        if (!discard) pending += tail
        if (pending) append(pending.endsWith("\r") ? pending.slice(0, -1) : pending)
      }
      if (lines.length === 0 && offset !== 1) return yield* Effect.fail(new OffsetOutOfRangeError({ offset }))
      const reason = inspector.finish()
      if (reason) return yield* new ToolSafety.Denied({ reason })
      return new TextPage({
        type: "text-page",
        content: lines.join("\n"),
        mime: FSUtil.mimeType(real),
        offset,
        truncated: next !== undefined,
        ...(next === undefined ? {} : { next }),
      })
    }),
  )
})
```
