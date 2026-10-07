export * as ToolSafety from "./tool-safety"

import path from "path"
import { Cause, Context, Effect, Exit, Layer, Option, Result, Schema } from "effect"
import { makeLocationNode } from "./effect/app-node"
import { FSUtil } from "./fs-util"
import { Patch } from "./patch"
import { ToolSafetyCommands } from "./tool-safety-commands"
import { ToolSafetyGit } from "./tool-safety-git"
import { AppProcess } from "./process"
import { Global } from "./global"
import { LayerNode } from "./effect/layer-node"
import { OutputInspector } from "./output-inspector"
import type { RelayHook } from "@opencode-ai/schema/relay-hook"
import { ToolSafetyHooks } from "./tool-safety-hooks"

/** Host-bound preferences, never decoded from tool arguments or inherited environment waivers. */
export type Profile = {
  readonly writeRoots?: ReadonlyArray<string>
  readonly protectedWrites?: ReadonlyArray<string>
  readonly allowedConfigEdits?: ReadonlyArray<string>
  readonly corpusFiles?: ReadonlyArray<string>
  readonly transcriptFiles?: ReadonlyArray<string>
  readonly maxTranscriptBytes?: number
  readonly requireSandbox?: boolean
  readonly neverTouch?: ReadonlyArray<string>
  readonly askBefore?: ReadonlyArray<string>
  readonly managedPaths?: ReadonlyArray<string>
  readonly sandbox?: {
    readonly enabled: boolean
    readonly allowedDomains?: ReadonlyArray<string>
    readonly denyPaths?: ReadonlyArray<string>
    /** Give each sandboxed command a fresh writable directory as TMPDIR, removed when the command ends. */
    readonly scratch?: boolean
    /** Where no sandbox can run, run the command without the write jail and report it instead of holding it. */
    readonly unconfinedFallback?: boolean
  }
  /** Installed Relay hooks (`hooks.json`), pinned per install. Only ToolSafety.run enforces them; they grant nothing. */
  readonly hooks?: ReadonlyArray<RelayHook.Install>
}

// Profiles a loader made only to carry hooks: to the native checks and to the tool they are no profile at all, as
// before any hook was installed.
const hookCarriers = new WeakSet<Profile>()

/** Attaches installed hooks to a loaded profile without making a profile where there was none. */
export const withHooks = (profile: Profile | undefined, hooks: ReadonlyArray<RelayHook.Install>): Profile | undefined => {
  if (hooks.length === 0) return profile
  const base = native(profile)
  if (base) return { ...base, hooks } satisfies Profile
  const carrier = { hooks } satisfies Profile
  hookCarriers.add(carrier)
  return carrier
}

// The profile the native checks and the tool see; hooks are ToolSafety.run's alone.
const native = (profile: Profile | undefined): Profile | undefined => {
  if (!profile?.hooks) return profile
  if (hookCarriers.has(profile)) return undefined
  return { ...profile, hooks: undefined }
}

/** Host fact about the write jail of sandbox-bound shell commands. */
export type ShellFact = {
  readonly shellWrites: "enforced" | "unenforced"
  readonly shellSandbox: { readonly kind: "seatbelt" | "srt" | "none"; readonly reason?: string }
}

/** Per-invocation cell that ToolSafetySandbox.wrap fills and ToolSafety.run attaches to its observation. */
export const ShellReport = Context.Reference<{ fact?: ShellFact } | undefined>("@opencode/ToolSafety/ShellReport", {
  defaultValue: () => undefined,
})

/** Record a shell command's fact; an unenforced command is never hidden by a later enforced one. */
export const reportShell = (fact: ShellFact) => Effect.gen(function* () {
  const cell = yield* ShellReport
  if (cell) cell.fact = worse(cell.fact, fact)
})

// Process-local worst fact per Session, read by the backend work result. Bounded; the oldest Sessions drop first.
const shells = new Map<string, ShellFact>()
export const shellFact = (sessionID: string) => shells.get(sessionID)

const worse = (current: ShellFact | undefined, next: ShellFact) => current?.shellWrites === "unenforced" ? current : next

export const RuntimeProfile = Context.Reference<Profile | undefined>("@opencode/ToolSafety/Profile", {
  defaultValue: () => undefined,
})

/** Captured native placement. Command cwd and model arguments cannot move policy roots. */
export const NativeContext = Context.Reference<{
  readonly directory: string
  readonly projectID?: string
} | undefined>("@opencode/ToolSafety/NativeContext", { defaultValue: () => undefined })

export type Approval = {
  readonly action: string
  readonly resources: readonly string[]
  readonly invocation: Invocation
  /** A hook's own words for the approval card; askBefore approvals have none. */
  readonly message?: string
}
export const NativeHost = Context.Reference<{
  /** Must await actual native permission decision; preferences never grant authority. */
  readonly ask: (request: Approval) => Effect.Effect<void, Denied>
} | undefined>("@opencode/ToolSafety/NativeHost", { defaultValue: () => undefined })

export const RuntimeProfileLoader = Context.Reference<(() => Effect.Effect<Profile | undefined, Denied>) | undefined>(
  "@opencode/ToolSafety/ProfileLoader", { defaultValue: () => undefined },
)

export class Denied extends Schema.TaggedErrorClass<Denied>()("ToolSafety.Denied", {
  reason: Schema.String,
  /** Words for the model after the reason, such as the message of the hook that denied the call. */
  detail: Schema.optional(Schema.String),
}) {
  override get message() {
    return this.detail === undefined ? `Tool safety HOLD: ${this.reason}` : `Tool safety HOLD: ${this.reason}. ${this.detail}`
  }
}

// The call whose hooks an outer ToolSafety.run already enforces; a nested run of the same call does not repeat them.
const HookedCall = Context.Reference<string | undefined>("@opencode/ToolSafety/HookedCall", {
  defaultValue: () => undefined,
})

export type Invocation = {
  readonly tool: string
  readonly args: unknown
  readonly sessionID: string
  readonly callID: string
  /** Native host execution identity; optional for legacy callers. */
  readonly assistantMessageID?: string
  readonly agent?: string
  readonly directory?: string
  readonly projectID?: string
  readonly projectDirectory?: string
}

/** Audit observations carry identities and outcomes only; they never grant execution authority. */
export type Observation = {
  readonly tool: string
  readonly sessionID: string
  readonly callID: string
  readonly directory?: string
  readonly projectID?: string
  readonly outcome: "started" | "success" | "failure" | "cancelled" | "held"
  readonly reason?: string
  readonly shellWrites?: ShellFact["shellWrites"]
  readonly shellSandbox?: ShellFact["shellSandbox"]
}

export interface Interface {
  readonly before: (input: Invocation) => Effect.Effect<void, Denied>
  readonly inspect: (output: unknown) => Effect.Effect<void, Denied>
  readonly run: <A, E, R>(
    input: Invocation,
    effect: Effect.Effect<A, E, R>,
    observe: (observation: Observation) => Effect.Effect<void>,
    outcome?: (value: A) => "success" | "failure" | "cancelled",
  ) => Effect.Effect<A, E | Denied, R>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/ToolSafety") {}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}

const contains = (root: string, target: string) => {
  const relative = path.relative(root, target)
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

export const make = Effect.gen(function* () {
  const fs = Option.getOrUndefined(yield* Effect.serviceOption(FSUtil.Service))
  const processService = Option.getOrUndefined(yield* Effect.serviceOption(AppProcess.Service))
  const global = Option.getOrUndefined(yield* Effect.serviceOption(Global.Service))
  // Hook services missing from a call's context are looked up where ToolSafety was built.
  const ambient = yield* Effect.context<never>()

  const canonical = Effect.fnUntraced(function* (target: string): Effect.fn.Return<string, Denied> {
    if (!fs) return yield* new Denied({ reason: "filesystem-acquisition" })
    return yield* fs.realPath(target).pipe(
      Effect.catchReason("PlatformError", "NotFound", () => Effect.gen(function* () {
        const parent = path.dirname(target)
        if (parent === target) return yield* new Denied({ reason: "path-acquisition-missing-root" })
        const anchor = yield* canonical(parent)
        const info = yield* fs.stat(anchor).pipe(
          Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed(undefined)),
          Effect.mapError(() => new Denied({ reason: "path-acquisition-stat" })),
        )
        if (info && info.type !== "Directory") return yield* new Denied({ reason: "path-acquisition-non-directory" })
        return path.join(anchor, path.basename(target))
      })),
      Effect.mapError((error) => error instanceof Denied ? error : new Denied({ reason: "path-acquisition" })),
    )
  })

  const before = Effect.fn("ToolSafety.before")(function* (input: Invocation) {
    const args = record(input.args)
    const command = input.tool !== "task" && typeof args.command === "string" ? args.command : undefined
    if (command) {
      const reason = ToolSafetyCommands.reason(command)
      if (reason) return yield* new Denied({ reason })
    }
    const profile = native(yield* RuntimeProfile)
    if (command && /\bgit\b[^\n;&|]*\b(?:add|commit)\b/.test(command)) {
      if (!input.directory || !fs || !processService)
        return yield* new Denied({ reason: "git-hygiene-native-binding-missing" })
      yield* ToolSafetyGit.before({
        command, directory: input.directory, projectDirectory: input.projectDirectory,
        cwd: typeof args.workdir === "string" ? args.workdir : undefined,
        managedPaths: [...(global ? [global.data, global.state, path.join(global.home, ".git-credentials"),
          path.join(global.home, ".npmrc"), path.join(global.home, ".aws"), path.join(global.home, ".ssh")] : []), ...(profile?.managedPaths ?? [])],
        neverTouch: profile?.neverTouch,
      }).pipe(Effect.provideService(FSUtil.Service, fs), Effect.provideService(AppProcess.Service, processService))
    }
    if (!profile) return
    if (!input.directory || !input.projectID) return yield* new Denied({ reason: "missing-native-binding" })
    const actions = command ? ToolSafetyCommands.actions(command) : [input.tool]
    const required = actions.filter((action) => profile.askBefore?.includes(action))
    if (required.length) {
      const host = yield* NativeHost
      if (!host) return yield* new Denied({ reason: "ask-before-native-binding-missing" })
      yield* Effect.forEach(required, (action) => host.ask({
        action, resources: command ? [command] : [input.tool], invocation: input,
      }), { discard: true })
    }
    if (profile.requireSandbox && command !== undefined && !["bash", "shell", "task"].includes(input.tool))
      return yield* new Denied({ reason: "required-process-sandbox-unbound" })

    const writing = ["write", "edit", "multiedit", "apply_patch"].includes(input.tool)
    const reading = input.tool === "read"
    if (!writing && !reading) return
    const paths = input.tool === "apply_patch"
      ? yield* Effect.try({
          try: () => Patch.parse(typeof args.patchText === "string" ? args.patchText : "").flatMap((hunk) =>
            hunk.type === "update" && hunk.movePath ? [hunk.path, hunk.movePath] : [hunk.path]),
          catch: () => new Denied({ reason: "invalid-patch-acquisition" }),
        })
      : typeof args.filePath === "string" ? [args.filePath] : reading && typeof args.path === "string" ? [args.path] : []
    if (paths.length === 0) return yield* new Denied({ reason: "missing-native-path" })
    if (!fs) return yield* new Denied({ reason: "filesystem-acquisition" })
    const directory = yield* fs.realPath(input.directory).pipe(
      Effect.mapError(() => new Denied({ reason: "binding-acquisition" })),
    )
    yield* Effect.forEach(paths, (target) => Effect.gen(function* () {
      const physical = yield* canonical(path.resolve(directory, target))
      const relative = path.relative(directory, physical).replaceAll("\\", "/")
      if (profile.neverTouch?.some((pattern) => fs.globMatch(pattern, relative) || fs.globMatch(pattern, physical)))
        return yield* new Denied({ reason: "project-never-touch" })
      const literalDenies = yield* Effect.forEach((profile.neverTouch ?? []).filter((pattern) => !/[*?[]/.test(pattern)),
        (entry) => canonical(path.resolve(directory, entry)).pipe(Effect.map((entry) => contains(entry, physical))))
      if (literalDenies.some(Boolean)) return yield* new Denied({ reason: "project-never-touch" })
      const matches = (entries: ReadonlyArray<string> = []) => Effect.forEach(entries, (entry) =>
        canonical(path.resolve(directory, entry)).pipe(Effect.map((entry) => contains(entry, physical))))
        .pipe(Effect.map((entries) => entries.some(Boolean)))
      if (writing) {
        if (profile.writeRoots !== undefined) {
          // A root may be a file or a path not created yet; it resolves through its nearest existing ancestor on
          // every call, so a root later replaced by a symlink is judged by where it points now.
          const roots = yield* Effect.forEach(profile.writeRoots, (root) => canonical(path.resolve(directory, root)).pipe(
            Effect.mapError(() => new Denied({ reason: "write-root-acquisition" })),
          ))
          if (!roots.some((root) => contains(root, physical)))
            return yield* new Denied({ reason: "write-outside-physical-roots" })
        }
        if ((yield* matches(profile.protectedWrites)) && !(yield* matches(profile.allowedConfigEdits)))
          return yield* new Denied({ reason: "protected-instruction-or-config-write" })
        // Native leaf edit/external_directory permissions still decide authorization.
        return
      }
      if (yield* matches(profile.corpusFiles)) {
        const info = yield* fs.stat(physical).pipe(
          Effect.mapError(() => new Denied({ reason: "corpus-stat-acquisition" })),
        )
        if (info.type !== "File") return yield* new Denied({ reason: "corpus-not-file" })
        if (typeof args.limit !== "number" || !Number.isInteger(args.limit) || args.limit <= 0 || args.limit > 400)
          return yield* new Denied({ reason: "defense-corpus-bulk-read" })
      }
      if (yield* matches(profile.transcriptFiles)) {
        const cap = profile.maxTranscriptBytes ?? 400_000
        if (!Number.isSafeInteger(cap) || cap <= 0) return yield* new Denied({ reason: "invalid-transcript-budget" })
        const info = yield* fs.stat(physical).pipe(
          Effect.mapError(() => new Denied({ reason: "transcript-stat-acquisition" })),
        )
        if (info.type !== "File") return yield* new Denied({ reason: "transcript-not-file" })
        if (info.size > cap) return yield* new Denied({ reason: "transcript-context-budget" })
      }
    }), { discard: true })
  })

  const run: Interface["run"] = (input, effect, observe, outcome) => {
    const observation = {
      tool: input.tool.slice(0, 128),
      sessionID: input.sessionID,
      callID: input.callID,
      directory: input.directory,
      projectID: input.projectID,
    }
    // Nested runs (the registry's durable observation inside the session's) share the outermost cell, so every
    // observation of the call carries the fact.
    const report: { cell: { fact?: ShellFact } } = { cell: {} }
    return Effect.gen(function* () {
      report.cell = (yield* ShellReport) ?? report.cell
      const loader = yield* RuntimeProfileLoader
      // Loaded once: the whole call, its after hooks included, keeps this snapshot even if hooks.json changes meanwhile.
      const loaded = loader ? yield* loader() : yield* RuntimeProfile
      const profile = native(loaded)
      yield* before(input).pipe(Effect.provideService(RuntimeProfile, profile))
      const outer = yield* HookedCall
      const hooked = loaded?.hooks && outer !== input.callID
        ? yield* ToolSafetyHooks.before({ installs: loaded.hooks, call: input, profile, resolve: canonical, ambient })
        : undefined
      yield* observe({ ...observation, outcome: "started" })
      const value = yield* effect.pipe(
        Effect.provideService(RuntimeProfile, profile),
        Effect.provideService(NativeContext, input.directory ? { directory: input.directory, projectID: input.projectID } : undefined),
        Effect.provideService(ShellReport, report.cell),
        Effect.provideService(HookedCall, hooked ? input.callID : outer),
        sanitizeFailure,
      )
      if (!hooked) return value
      return yield* ToolSafetyHooks.after(hooked, value, (outcome?.(value) ?? "success") === "success")
    }).pipe(Effect.onExit((exit) => {
      const shell = report.cell.fact
      if (shell) {
        const recorded = worse(shells.get(input.sessionID), shell)
        shells.delete(input.sessionID)
        shells.set(input.sessionID, recorded)
        if (shells.size > 1024) shells.delete(shells.keys().next().value!)
      }
      if (Exit.isSuccess(exit)) return observe({ ...observation, ...shell, outcome: outcome?.(exit.value) ?? "success" })
      const error = Option.getOrUndefined(Cause.findErrorOption(exit.cause)) ?? Result.getOrUndefined(Cause.findDefect(exit.cause))
      return observe({
        ...observation,
        ...shell,
        outcome: Cause.hasInterrupts(exit.cause) ? "cancelled" : error instanceof Denied ? "held" : "failure",
        ...(error instanceof Denied ? { reason: error.reason } : {}),
      })
    }))
  }

  return Service.of({ before, inspect, run })
})

/** Stateless boundary usable by native producers before retention, including plugin producers. */
export const inspect = (output: unknown) => Effect.try({
  try: () => inspectValue(output),
  catch: () => new Denied({ reason: "output-inspection-acquisition" }),
}).pipe(Effect.flatMap((reason) => reason ? Effect.fail(new Denied({ reason })) : Effect.void))

export const node = makeLocationNode({ service: Service, layer: Layer.effect(Service, make), deps: [FSUtil.node, AppProcess.node, Global.node] })

/** Legacy plugin producer hook: call with its native Instance placement before def.execute, never model roots. */
export const beforeInvocation = (input: Invocation) => Effect.gen(function* () {
  const safety = yield* make
  const loader = yield* RuntimeProfileLoader
  const profile = loader ? yield* loader() : yield* RuntimeProfile
  yield* safety.before(input).pipe(Effect.provideService(RuntimeProfile, profile))
}).pipe(Effect.provide(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node, Global.node]))))

/** Recognized credential shapes only. Encodings, binary attachments and unknown providers are not confinement. */
function inspectValue(value: unknown, state = { seen: new Set<object>(), nodes: 0 }, depth = 0): string | undefined {
  state.nodes++
  if (depth > 64 || state.nodes > 10_000) return "output-inspection-budget"
  if (typeof value === "string") {
    return OutputInspector.reason(value)
  }
  if (!value || typeof value !== "object" || state.seen.has(value)) return
  state.seen.add(value)
  if (value instanceof Error) {
    const reason = inspectValue(value.message, state, depth + 1) ?? inspectValue(value.cause, state, depth + 1)
    if (reason) return reason
  }
  for (const child of Object.values(value)) {
    const reason = inspectValue(child, state, depth + 1)
    if (reason) return reason
  }
}

/** Preserve interruption causes; replace secret-bearing failures/defects before any durable error projection. */
export const sanitizeFailure = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | Denied, R> =>
  effect.pipe(Effect.catchCause((cause) => Effect.gen(function* () {
    const reasons = yield* Effect.forEach(cause.reasons, (entry) => Effect.gen(function* () {
      if (Cause.isInterruptReason(entry)) return Cause.fromReasons<E>([entry])
      const checked = yield* inspect(Cause.isFailReason(entry) ? entry.error : entry.defect).pipe(Effect.result)
      return checked._tag === "Failure" ? Cause.fail(checked.failure) : Cause.fromReasons<E>([entry])
    }))
    return yield* Effect.failCause(Cause.fromReasons<E | Denied>(reasons.flatMap<Cause.Reason<E | Denied>>((entry) => entry.reasons)))
  })))
