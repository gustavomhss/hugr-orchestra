export * as MaestroArsenal from "./maestro-arsenal"

import path from "node:path"
import { createHash } from "node:crypto"
import { lstat } from "node:fs/promises"
import { Effect, Exit, Layer, Option, Schema } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { AgentV2 } from "@opencode-ai/core/agent"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { Global } from "@opencode-ai/core/global"
import type { EventV2 } from "@opencode-ai/core/event"
import { Location } from "@opencode-ai/core/location"
import { LocationMutation } from "@opencode-ai/core/location-mutation"
import { PermissionV2 } from "@opencode-ai/core/permission"
import { ApplicationTools } from "@opencode-ai/core/tool/application-tools"
import { Tool } from "@opencode-ai/core/tool/tool"
import { Tools } from "@opencode-ai/core/tool/tools"
import { ToolRegistry } from "@opencode-ai/core/tool/registry"
import { ToolSafety } from "@opencode-ai/core/tool-safety"
import { ToolSafetyProfile } from "@opencode-ai/core/tool-safety-profile"
import { ToolOutputStore } from "@opencode-ai/core/tool-output-store"

export const names = {
  catalog: "maestro_arsenal_catalog",
  describe: "maestro_arsenal_describe",
  execute: "maestro_arsenal_execute",
} as const

export const descriptions = {
  catalog:
    "Discover a bounded page of Maestro Arsenal capabilities by effect group. No input schemas are included. Native Maestro only.",
  describe:
    "Describe one selected Maestro Arsenal capability, including its exact input schema and declared effects. Call this before execute. Native Maestro only.",
  execute:
    "Execute one previously described Maestro Arsenal capability. arguments must satisfy the exact schema returned by maestro_arsenal_describe. Governance audit/usage/status observations and pricing come only from the host. Results are advice, not approval or execution receipts. Host permissions apply. Native Maestro only.",
} as const

export const CatalogInput = Schema.Struct({
  group: Schema.optional(Schema.Literals(["pure", "read", "write", "process"])),
  offset: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(10_000))),
  limit: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(10))),
})
export const DescribeInput = Schema.Struct({ name: Schema.NonEmptyString.check(Schema.isMaxLength(128)) })
export const ExecuteInput = Schema.Struct({
  name: DescribeInput.fields.name,
  arguments: Schema.Unknown.annotate({
    description: "Arguments matching the selected describe result; never supply host roots or permissions.",
  }),
})

export interface Authorization {
  readonly effect: "read" | "write" | "process"
  readonly paths: readonly string[]
  readonly commands: readonly string[]
}

/** Resolved from host services for this invocation, never from tool arguments. */
export interface Host {
  readonly directory: string
  readonly stateDirectory: string
  readonly projectID: string
  readonly nativeMaestro: boolean
  readonly ask: (action: string, resources: readonly string[]) => Effect.Effect<void, Tool.Failure>
  readonly authorize: (input: Authorization) => Effect.Effect<void, Tool.Failure>
  readonly outputBudget: () => Effect.Effect<{ readonly maxLines: number; readonly maxBytes: number }, Tool.Failure>
  /** Actual Session events/check records and provider pricing; model claims are not observations. */
  readonly observeGovernance?: (
    operation: "audit" | "usage" | "status",
  ) => Effect.Effect<GovernanceEvidence, Tool.Failure>
  readonly beforeExecute?: (name: string, args: unknown) => Effect.Effect<void, Tool.Failure>
  readonly afterExecute?: (name: string, args: unknown, result: unknown) => Effect.Effect<void, Tool.Failure>
}

export interface GovernanceEvidence {
  readonly observations: unknown
  /** Host-acquired retained event window only; never certifies the separately folded actions. */
  readonly integrity?: {
    readonly projectID: string
    readonly sessionID: string
    readonly scope: "event-window-only"
    readonly observationsVerified: false
  } & (
    | { readonly window: EventV2.SealWindowResult; readonly acquisition?: never }
    | {
        readonly window?: never
        readonly acquisition: {
          readonly status: "UNKNOWN"
          readonly decision: "HOLD"
          readonly code: EventV2.SealWindowError["code"]
          readonly message: string
        }
      }
  )
  readonly prices?: unknown
  readonly runners?: readonly unknown[]
  readonly coverage?: {
    readonly scope: "settled-prefix"
    readonly historyComplete: boolean
    readonly usageComplete: boolean
    readonly reasons: readonly string[]
    readonly providerSteps: number
    readonly settledUsageSteps: number
  }
}

export interface Invocation {
  readonly sessionID: string
  readonly agent: string
}

const MAX_DESCRIPTOR_BYTES = 32 * 1024
const MAX_RECEIPTS = 256

/** Shared discovery/execution boundary for V1, V2 and application registrations. */
export function makeHandlers<C extends Invocation>(resolve: (context: C) => Effect.Effect<Host, Tool.Failure>) {
  const receipts = new Map<string, string>()
  const key = (context: C, host: Host, name: string) =>
    JSON.stringify([host.projectID, host.directory, context.sessionID, context.agent, name])
  const requireMaestro = (host: Host) =>
    host.nativeMaestro
      ? Effect.void
      : Effect.fail(new Tool.Failure({ message: "Maestro Arsenal requires native Maestro identity." }))
  const load = () =>
    Effect.tryPromise({
      try: () => import("@opencode-ai/maestro-arsenal"),
      catch: () => new Tool.Failure({ message: "Maestro Arsenal package is unavailable." }),
    })
  const selected = (name: string) =>
    Effect.gen(function* () {
      const { Arsenal } = yield* load()
      const descriptor = yield* Effect.tryPromise({
        try: () => Arsenal.describe(name),
        catch: () => new Tool.Failure({ message: "Unable to describe selected Arsenal capability." }),
      })
      if (!descriptor || descriptor.name !== name)
        return yield* new Tool.Failure({ message: "Unknown Arsenal capability." })
      const contract = JSON.stringify(descriptor)
      // Never turn an incomplete/truncated schema into a usable execution contract.
      if (Buffer.byteLength(contract, "utf8") > MAX_DESCRIPTOR_BYTES)
        return yield* new Tool.Failure({ message: "Selected Arsenal descriptor exceeds the native discovery bound." })
      return { descriptor, contract }
    })

  return {
    catalog: (input: typeof CatalogInput.Type, context: C) =>
      Effect.gen(function* () {
        const host = yield* resolve(context)
        yield* requireMaestro(host)
        yield* host.ask(names.catalog, [input.group ?? "*"])
        const { Arsenal } = yield* load()
        const descriptors = yield* Effect.tryPromise({
          try: () => Arsenal.list(),
          catch: () => new Tool.Failure({ message: "Unable to list Arsenal capabilities." }),
        })
        const filtered = descriptors.filter(
          (item) =>
            !input.group || (input.group === "pure" ? item.effects.length === 0 : item.effects.includes(input.group)),
        )
        const offset = input.offset ?? 0
        const page = filtered.slice(offset, offset + (input.limit ?? 5)).map((item) => ({
          name: item.name,
          description: item.description.slice(0, 512),
          descriptionTruncated: item.description.length > 512,
          effects: item.effects,
        }))
        return JSON.stringify({
          capabilities: page,
          total: filtered.length,
          offset,
          next: offset + page.length < filtered.length ? offset + page.length : null,
        })
      }),
    describe: (input: typeof DescribeInput.Type, context: C) =>
      Effect.gen(function* () {
        const host = yield* resolve(context)
        yield* requireMaestro(host)
        yield* host.ask(names.describe, [input.name])
        const result = yield* selected(input.name)
        const receipt = key(context, host, input.name)
        receipts.delete(receipt)
        const budget = yield* host.outputBudget()
        if (!Number.isSafeInteger(budget.maxLines) || !Number.isSafeInteger(budget.maxBytes) || budget.maxLines < result.contract.split("\n").length || budget.maxBytes < Buffer.byteLength(result.contract, "utf8"))
          return yield* new Tool.Failure({ message: "DESCRIBE_CONTRACT_OVER_BUDGET" })
        receipts.set(receipt, createHash("sha256").update(result.contract).digest("hex"))
        if (receipts.size > MAX_RECEIPTS) {
          const oldest = receipts.keys().next().value
          if (oldest !== undefined) receipts.delete(oldest)
        }
        return result.contract
      }),
    execute: (input: typeof ExecuteInput.Type, context: C) =>
      Effect.gen(function* () {
        const host = yield* resolve(context)
        yield* requireMaestro(host)
        yield* host.ask(names.execute, [input.name])
        const result = yield* selected(input.name)
        if (receipts.get(key(context, host, input.name)) !== createHash("sha256").update(result.contract).digest("hex"))
          return yield* new Tool.Failure({
            message: "Describe this Arsenal capability in the current Session and agent before executing it.",
          })
        const args = input.arguments
        if (host.beforeExecute) yield* host.beforeExecute(input.name, args)
        const operation =
          input.name === "governance" && typeof args === "object" && args !== null && "operation" in args
            ? args.operation
            : undefined
        const observed = operation === "audit" || operation === "usage" || operation === "status"
        if (
          observed && typeof args === "object" && args !== null &&
          ["integrity", "aggregateID", "projectID", "sessionID", "auditWindow"].some((key) => key in args)
        )
          return yield* new Tool.Failure({ message: "GOVERNANCE_HOST_IDENTITY_OVERRIDE_DENIED" })
        if (observed && !host.observeGovernance)
          return yield* new Tool.Failure({
            message:
              "Arsenal governance requires actual host Session observations; this host has no observation binding.",
          })
        const evidence = observed && host.observeGovernance ? yield* host.observeGovernance(operation) : undefined
        if (
          evidence?.integrity && (
            evidence.integrity.projectID !== host.projectID ||
            evidence.integrity.sessionID !== context.sessionID ||
            (evidence.integrity.window && evidence.integrity.window.aggregateID !== context.sessionID)
          )
        )
          return yield* new Tool.Failure({ message: "GOVERNANCE_INTEGRITY_PLACEMENT_MISMATCH" })
        const integrity = operation === "audit" || operation === "status" ? evidence?.integrity : undefined
        if (evidence?.coverage) {
          const supplied = Schema.decodeUnknownSync(Schema.Struct({ usage: Schema.Array(Schema.Unknown), actions: Schema.Array(Schema.Unknown) }))(evidence.observations)
          if (!supplied.usage.length && (operation === "usage" || !supplied.actions.length)) return JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ source: "host-session-observations", integrity, coverage: evidence.coverage, runners: evidence.runners, audit: { actions: supplied.actions }, usage: { status: "HOLD", costUSD: null, holds: evidence.coverage.reasons, scope: "settled-prefix" }, checks: null }) }] })
        }
        const arguments_ =
          evidence && typeof args === "object" && args !== null
            ? {
                ...Object.fromEntries(
                  Object.entries(args).filter(([name]) => name !== "observations" && name !== "prices"),
                ),
                observations: evidence.observations,
                ...(operation !== "audit" && evidence.prices !== undefined ? { prices: evidence.prices } : {}),
              }
            : args
        const { Arsenal } = yield* load()
        const services = yield* Effect.context<never>()
        const rejected: Array<Exit.Exit<void, Tool.Failure>> = []
        const pending = yield* Effect.tryPromise({
          try: (signal) =>
            Arsenal.execute(input.name, arguments_, {
              directory: host.directory,
              stateDirectory: host.stateDirectory,
              projectID: host.projectID,
              authorize: async (request) => {
                const authorization = result.descriptor.effects.includes(request.effect)
                  ? host.authorize(request)
                  : Effect.fail(new Tool.Failure({ message: "Arsenal requested an undeclared effect." }))
                const exit = await Effect.runPromiseExitWith(services)(authorization, { signal })
                if (Exit.isSuccess(exit)) return
                rejected.push(exit)
                throw new Error("Arsenal authorization denied")
              },
            }),
          catch: () => new Tool.Failure({ message: "Arsenal execution failed; no successful outcome was recorded." }),
        }).pipe(Effect.result)
        // Restore permission failures/defects even if a backend converts rejection into isError.
        if (rejected[0]) yield* rejected[0]
        if (pending._tag === "Failure") return yield* pending.failure
        if (pending.success.isError)
          return yield* new Tool.Failure({ message: "Arsenal capability failed; no successful outcome was recorded." })
        if (evidence && (evidence.coverage || integrity)) {
          const coverage = evidence.coverage
          const response = { ...pending.success, content: pending.success.content.map((item) => {
            if (item.type !== "text") return item
            const report = Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(item.text))
            const previous = operation === "usage" ? report : typeof report.usage === "object" && report.usage !== null ? report.usage : {}
            const usage = { ...previous, scope: "settled-prefix", ...(coverage && !coverage.usageComplete ? { status: "HOLD", costUSD: null, holds: [...coverage.reasons] } : {}) }
            return { ...item, text: JSON.stringify(operation === "usage" ? { ...usage, coverage, runners: evidence.runners } : { ...report, integrity, coverage, runners: evidence.runners, ...(operation === "status" ? { usage } : {}) }) }
          }) }
          if (host.afterExecute) yield* host.afterExecute(input.name, args, response)
          return JSON.stringify(response)
        }
        if (host.afterExecute) yield* host.afterExecute(input.name, args, pending.success)
        return JSON.stringify(pending.success)
      }),
  }
}

export const stateDirectory = (data: string, projectID: string) =>
  path.join(data, "maestro-arsenal", createHash("sha256").update(projectID).digest("hex"))

/** Host bootstrap, before tool invocation. Backend state operations require an existing managed root. */
export const prepareState = Effect.fn("MaestroArsenal.prepareState")(function* (data: string, projectID: string) {
  const fs = yield* FSUtil.Service
  const root = yield* fs
    .realPath(data)
    .pipe(Effect.mapError(() => new Tool.Failure({ message: "Arsenal host data directory is unavailable." })))
  const directory = yield* fence(fs, root, stateDirectory(root, projectID))
  yield* fs
    .makeDirectory(directory, { recursive: true, mode: 0o700 })
    .pipe(Effect.mapError(() => new Tool.Failure({ message: "Unable to initialize Arsenal managed state." })))
  return directory
})

/** Native Location registry captures its real project preferences at construction. */
function profiled<A, E, T extends LayerNode.Tag | undefined>(node: LayerNode.Node<A, E, T>) {
  if (!Layer.isLayer(node.implementation)) throw new Error("Native Arsenal registry implementation missing")
  const loader = Layer.effect(
    ToolSafety.RuntimeProfileLoader,
    Effect.gen(function* () {
      const fs = yield* FSUtil.Service
      const global = yield* Global.Service
      const location = yield* Location.Service
      const stateDirectory = yield* prepareState(global.data, location.project.id)
      const host = yield* ToolSafety.RuntimeProfile
      return makeProfileLoader(
        fs,
        { directory: location.directory, projectID: location.project.id, stateDirectory },
        host,
      )
    }).pipe(Effect.orDie),
  )
  return {
    ...node,
    implementation: Layer.provide(node.implementation, loader),
    dependencies: [...node.dependencies, FSUtil.node, Global.node, Location.node],
  }
}

export const nativeRegistryNode = profiled(ToolRegistry.nativeNode)
export const nativeToolsNode = profiled(ToolRegistry.nativeToolsNode)
export const nativeSafetyNode = {
  ...ToolSafety.node,
  implementation: Layer.effect(
    ToolSafety.Service,
    Effect.gen(function* () {
      const safety = yield* ToolSafety.make
      return ToolSafety.Service.of({
        ...safety,
        before: (input) => safety.before(nativeInvocation(input)),
        run: (input, effect, observe, outcome) => safety.run(nativeInvocation(input), effect, observe, outcome),
      })
    }),
  ),
}
export const nativeRegistryReplacements = [
  [ToolSafety.node, nativeSafetyNode],
  [ToolRegistry.node, nativeRegistryNode],
  [ToolRegistry.toolsNode, nativeToolsNode],
] as const

/** Core leaves use `path`; F's shared V1 policy consumes the same resource as `filePath`. */
export function nativeInvocation(input: ToolSafety.Invocation): ToolSafety.Invocation {
  if (
    !["read", "write", "edit", "multiedit"].includes(input.tool) ||
    typeof input.args !== "object" ||
    input.args === null ||
    !("path" in input.args) ||
    typeof input.args.path !== "string"
  )
    return input
  return { ...input, args: { ...input.args, filePath: input.args.path } }
}

/** Read D's exact managed snapshot on change; F owns restrictive interpretation and cache validation. */
export function makeProfileLoader(
  fs: FSUtil.Interface,
  binding: { directory: string; projectID: string; stateDirectory: string },
  host?: ToolSafety.Profile,
) {
  const load = ToolSafetyProfile.makeLoader(fs, binding, host)
  const cache: { stamp?: string } = {}
  const ambient: { profile?: ToolSafety.Profile; load?: ReturnType<typeof ToolSafetyProfile.makeLoader> } = {}
  return Effect.fn("MaestroArsenal.profileSnapshot")(function* () {
    const file = path.join(binding.stateDirectory, binding.projectID, "profile", "preferences.json")
    const info = yield* fs.stat(file).pipe(
      Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
      Effect.mapError(() => new ToolSafety.Denied({ reason: "profile-snapshot-acquisition" })),
    )
    if (info && (info.type !== "File" || info.size > 512 * 1024))
      return yield* new ToolSafety.Denied({ reason: "profile-snapshot-overflow-or-type" })
    const stamp = JSON.stringify(
      info
        ? [info.dev, Option.getOrUndefined(info.ino), String(info.size), Option.getOrUndefined(info.mtime)?.getTime()]
        : ["absent"],
    )
    if (cache.stamp !== stamp) {
      const { Arsenal } = yield* Effect.tryPromise({
        try: () => import("@opencode-ai/maestro-arsenal"),
        catch: () => new ToolSafety.Denied({ reason: "profile-native-snapshot-unavailable" }),
      })
      const snapshot = yield* Effect.tryPromise({
        try: () =>
          Arsenal.readPreferencesSnapshot({
            ...binding,
            authorize: async (request) => {
              if (request.effect !== "read" || request.commands.length)
                throw new Error("Profile snapshot may only read native resources")
              await Effect.runPromise(
                Effect.forEach(request.paths, (item) =>
                  fence(
                    fs,
                    FSUtil.contains(binding.stateDirectory, item) ? binding.stateDirectory : binding.directory,
                    item,
                  ),
                ),
              )
            },
          }),
        catch: () => new ToolSafety.Denied({ reason: "profile-native-snapshot-invalid" }),
      })
      if (snapshot.path !== file)
        return yield* new ToolSafety.Denied({ reason: "profile-native-snapshot-path-mismatch" })
      const after = yield* fs.stat(file).pipe(
        Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
        Effect.mapError(() => new ToolSafety.Denied({ reason: "profile-snapshot-acquisition" })),
      )
      const current = JSON.stringify(
        after
          ? [
              after.dev,
              Option.getOrUndefined(after.ino),
              String(after.size),
              Option.getOrUndefined(after.mtime)?.getTime(),
            ]
          : ["absent"],
      )
      if (current !== stamp) return yield* new ToolSafety.Denied({ reason: "profile-native-snapshot-changed" })
      cache.stamp = stamp
    }
    const profile = host ?? (yield* ToolSafety.RuntimeProfile)
    if (profile === host) return yield* load()
    if (ambient.profile !== profile || !ambient.load) {
      ambient.profile = profile
      ambient.load = ToolSafetyProfile.makeLoader(fs, binding, profile)
    }
    return yield* ambient.load()
  })
}

/** Existing and missing targets must remain under an actual host root, without symlinks. */
export const fence = Effect.fn("MaestroArsenal.fence")(function* (fs: FSUtil.Interface, root: string, input: string) {
  const absolute = path.resolve(root, input)
  if (!input || input.includes("\0") || !FSUtil.contains(root, absolute))
    return yield* new Tool.Failure({ message: "Arsenal path escapes its host scope." })
  const physicalRoot = yield* fs.realPath(root).pipe(
    Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
    Effect.mapError(() => new Tool.Failure({ message: "Arsenal host root is unavailable." })),
  )
  if (physicalRoot !== undefined && physicalRoot !== root)
    return yield* new Tool.Failure({ message: "Arsenal host root is not canonical." })
  const relative = path.relative(root, absolute)
  const segments = relative ? relative.split(path.sep) : []
  yield* Effect.forEach(
    [root, ...segments.map((_, index) => path.join(root, ...segments.slice(0, index + 1)))],
    (target, index) =>
      // Effect FileSystem exposes stat but not lstat; following links would miss dangling links.
      Effect.tryPromise({
        try: () =>
          lstat(target).catch((error: unknown) => {
            if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT")
              return undefined
            throw error
          }),
        catch: () => new Tool.Failure({ message: "Unable to resolve Arsenal path within host scope." }),
      }).pipe(
        Effect.flatMap((info) => {
          if (info?.isSymbolicLink())
            return Effect.fail(new Tool.Failure({ message: "Arsenal paths cannot contain symlinks." }))
          if (info && index < segments.length && !info.isDirectory())
            return Effect.fail(new Tool.Failure({ message: "Arsenal path has a non-directory ancestor." }))
          return Effect.void
        }),
      ),
  )
  return absolute
})

export const authorize = Effect.fn("MaestroArsenal.authorize")(function* (
  fs: FSUtil.Interface,
  host: Pick<Host, "directory" | "stateDirectory" | "ask">,
  input: Authorization,
) {
  if (
    (input.effect !== "process" && input.paths.length === 0) ||
    (input.effect === "process" && input.commands.length === 0)
  )
    return yield* new Tool.Failure({ message: "Arsenal effect requires explicit permission resources." })
  if (input.effect === "process") {
    if (input.commands.some((command) => !command.trim() || command.includes("\0")))
      return yield* new Tool.Failure({ message: "Arsenal process requires explicit commands." })
    yield* host.ask("bash", input.commands)
  }
  const resources = yield* Effect.forEach(input.paths, (item) =>
    Effect.gen(function* () {
      const absolute = path.resolve(host.directory, item)
      const root = FSUtil.contains(host.stateDirectory, absolute) ? host.stateDirectory : host.directory
      const target = yield* fence(fs, root, absolute)
      return root === host.directory
        ? path.relative(root, target).replaceAll(path.sep, "/") || "."
        : target.replaceAll(path.sep, "/")
    }),
  )
  if (input.effect === "process") {
    if (resources.length) yield* host.ask("read", resources)
    return
  }
  yield* host.ask(input.effect === "write" ? "edit" : "read", resources)
})

export interface Options {
  /** V2 has no native identity field. The application must attest from its actual roster. */
  readonly nativeMaestro: (agent: AgentV2.ID) => Effect.Effect<boolean, Tool.Failure>
  readonly observeGovernance?: (
    context: Tool.Context,
    operation: "audit" | "usage" | "status",
  ) => Effect.Effect<GovernanceEvidence, Tool.Failure>
}

/** Canonical application tool values; resolve Location services for each call at the host. */
export function applicationTools(resolve: (context: Tool.Context) => Effect.Effect<Host, Tool.Failure>) {
  const handlers = makeHandlers(resolve)
  return {
    [names.catalog]: Tool.make({
      description: descriptions.catalog,
      input: CatalogInput,
      output: Schema.String,
      execute: handlers.catalog,
    }),
    [names.describe]: Tool.make({
      description: descriptions.describe,
      input: DescribeInput,
      output: Schema.String,
      execute: handlers.describe,
    }),
    [names.execute]: Tool.make({
      description: descriptions.execute,
      input: ExecuteInput,
      output: Schema.String,
      execute: handlers.execute,
    }),
  }
}

/** Register process application tools using a real per-invocation placement resolver. */
export const registerApplication = Effect.fn("MaestroArsenal.registerApplication")(function* (
  resolve: (context: Tool.Context) => Effect.Effect<Host, Tool.Failure>,
) {
  const tools = yield* ApplicationTools.Service
  yield* tools.register(applicationTools(resolve))
})

/** Capture real Location services and register only for their existing registration Scope. */
export const registerScoped = Effect.fn("MaestroArsenal.registerScoped")(function* (options: Options) {
  const tools = yield* Tools.Service
  const location = yield* Location.Service
  const global = yield* Global.Service
  const fs = yield* FSUtil.Service
  const mutation = yield* LocationMutation.Service
  const permission = yield* PermissionV2.Service
  const agents = yield* AgentV2.Service
  const outputs = yield* ToolOutputStore.Service
  yield* prepareState(global.data, location.project.id)
  yield* tools.register(
    applicationTools((context) =>
      Effect.gen(function* () {
        const directory = yield* fs
          .realPath(location.directory)
          .pipe(Effect.mapError(() => new Tool.Failure({ message: "Arsenal Location is unavailable." })))
        const data = yield* fs
          .realPath(global.data)
          .pipe(Effect.mapError(() => new Tool.Failure({ message: "Arsenal host data directory is unavailable." })))
        const state = yield* fence(fs, data, stateDirectory(data, location.project.id))
        const agent = yield* agents.get(context.agent)
        const nativeMaestro =
          agent?.id === "maestro" &&
          typeof options.nativeMaestro === "function" &&
          (yield* options.nativeMaestro(context.agent))
        const ask = (action: string, resources: readonly string[]) =>
          permission
            .assert({
              action,
              resources,
              sessionID: context.sessionID,
              agent: context.agent,
              source: { type: "tool", messageID: context.assistantMessageID, callID: context.toolCallID },
            })
            .pipe(Effect.mapError(() => new Tool.Failure({ message: "Arsenal permission denied." })))
        const host = { directory, stateDirectory: state, projectID: location.project.id, nativeMaestro, ask }
        const observe = options.observeGovernance
        return {
          ...host,
          outputBudget: outputs.limits,
          ...(observe
            ? { observeGovernance: (operation: "audit" | "usage" | "status") => observe(context, operation) }
            : {}),
          authorize: (input: Authorization) =>
            Effect.gen(function* () {
              yield* authorize(fs, host, input)
              // Use the same canonical resource resolution as native Core filesystem leaves.
              yield* Effect.forEach(
                input.paths.filter((item) => !FSUtil.contains(state, path.resolve(directory, item))),
                (item) =>
                  Effect.gen(function* () {
                    const target = yield* mutation.resolve({ path: item })
                    if (target.externalDirectory)
                      return yield* new Tool.Failure({ message: "Arsenal path escapes its host scope." })
                  }),
              ).pipe(Effect.mapError(() => new Tool.Failure({ message: "Arsenal path escapes its host scope." })))
            }),
        }
      }),
    ),
  )
})
