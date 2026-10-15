export * as BackendToolkit from "./index"

import path from "path"
import { readFile } from "fs/promises"
import { Context, Effect } from "effect"
import { Global } from "../global"
import { PinnedArtifact } from "../pinned-artifact"
import { attempts, INSTALL_MS, NotReady } from "./attempts"
import { hosted } from "./hosted"
import { executable, fileReady, launchText, shim } from "./launcher"
import { ENGINES, RUNTIMES, type Engine, type EngineId, type Runtime, type RuntimeId } from "./manifest"
import { detect, type TargetId } from "./target"

export { NotReady } from "./attempts"
export { hosted } from "./hosted"

// The backend specialist's engines are fetched by the host on first use (the backend seat's shell has no network),
// verified against the pinned manifest and cached per user (ruling M3-4: an evicted engine is fetched again). Each
// engine installs into `<root>/engines/<id>/<version>-<target>/` and, once ready, gets a shim at `<root>/bin/<id>`
// (`<id>.cmd` on Windows) that carries the engine's environment; the shell exposes `<root>/bin` as BACKEND_TOOLKIT_BIN.
// A hosted engine (ruling M4-1) first needs its private runtime, installed once per user into
// `<root>/runtimes/<id>/<version>-<target>/` and shared by every engine on it. Its own install then carries a launcher
// `<id>` (`<id>.cmd` for Windows) that runs the runtime with the engine's arguments; that launcher is its executable.
// A source engine (ruling M5-1) is instead built once from its pinned source by the runtime toolchain; the built binary
// is its executable and the shim execs it.

export type EngineState =
  | { readonly status: "absent" }
  | { readonly status: "fetching"; readonly at: number; readonly budgetMs: number }
  | { readonly status: "ready"; readonly directory: string; readonly executable: string }
  | { readonly status: "failed"; readonly cause: string; readonly at: number }
  | { readonly status: "unsupported"; readonly reason: string }

/** One engine's state on one target; `target` is absent only when the host has no supported target. */
export type State = { readonly engine: EngineId; readonly version: string; readonly target?: TargetId } & EngineState

/** Cache root holding one install directory per engine version and target. */
export const Root = Context.Reference<string>("@orchestra/BackendToolkit/Root", {
  defaultValue: () => process.env.BACKEND_TOOLKIT_ROOT ?? path.join(Global.Path.cache, "backend-toolkit"),
})

export const Manifest = Context.Reference<Readonly<Record<EngineId, Engine>>>("@orchestra/BackendToolkit/Manifest", {
  defaultValue: () => ENGINES,
})

export const Runtimes = Context.Reference<Readonly<Record<RuntimeId, Runtime>>>("@orchestra/BackendToolkit/Runtimes", {
  defaultValue: () => RUNTIMES,
})

/** The host's toolkit target, or why it has none. */
export const Target = Context.Reference<ReturnType<typeof detect>>("@orchestra/BackendToolkit/Target", {
  defaultValue: () => detect(),
})

// Acquisition outlives a shell call. A cold source build must not consume an entire model scenario in silence.
const PREPARE_MS = 60_000

export const status = Effect.fn("BackendToolkit.status")(function* (engine?: EngineId) {
  const manifest = yield* Manifest
  const host = yield* Target
  const ids = engine ? [engine] : Object.values(manifest).map((item) => item.id)
  if ("unsupported" in host)
    return ids.map(
      (id): State => ({ engine: id, version: manifest[id].version, status: "unsupported", reason: host.unsupported }),
    )
  return yield* states(ids, host.target)
})

/** The host-target executable of a ready engine, fetching it first when absent. */
export const ensure = Effect.fn("BackendToolkit.ensure")(function* (engine: EngineId) {
  const host = yield* Target
  if ("unsupported" in host) return yield* new NotReady({ reason: `unsupported-target:${host.unsupported}` })
  return yield* request(engine, host.target, true)
})

/** Fetch engines (all by default) for a target (the host's by default); shims are written only for the host target. */
export const prefetch = Effect.fn("BackendToolkit.prefetch")(function* (
  engines?: ReadonlyArray<EngineId>,
  target?: TargetId,
) {
  const manifest = yield* Manifest
  const host = yield* Target
  const ids = engines ?? Object.values(manifest).map((item) => item.id)
  const chosen = target ?? ("target" in host ? host.target : undefined)
  if (!chosen) return yield* status().pipe(Effect.map((all) => all.filter((state) => ids.includes(state.engine))))
  yield* Effect.forEach(ids, (id) => request(id, chosen, "target" in host && host.target === chosen).pipe(Effect.ignore), {
    concurrency: "unbounded",
    discard: true,
  })
  return yield* states(ids, chosen)
})

/**
 * The toolkit environment for one shell command. Engines named through BACKEND_TOOLKIT_BIN and their owned dependencies
 * acquire on demand. A command naming none never fetches. A cold acquisition exceeding the shell wait returns a named
 * fetching blocker while acquisition continues; `ensure`/`prefetch` await the install budget.
 */
export const prepare = Effect.fn("BackendToolkit.prepare")(function* (command: string, callerEnv: NodeJS.ProcessEnv = process.env) {
  const root = yield* Root
  const manifest = yield* Manifest
  // `$BACKEND_TOOLKIT_BIN/<id>`, `${BACKEND_TOOLKIT_BIN}/<id>`, `"$BACKEND_TOOLKIT_BIN"/<id>` and PowerShell's
  // `$env:BACKEND_TOOLKIT_BIN\<id>.cmd`, with either separator.
  const named = Object.values(manifest)
    .map((engine) => engine.id)
    .filter((id) =>
      new RegExp(String.raw`\$(?:env:)?(?:BACKEND_TOOLKIT_BIN|\{BACKEND_TOOLKIT_BIN\})"?[\\/]${id}(?![\w-])`).test(
        command,
      ),
    )
  const env = {
    BACKEND_TOOLKIT_BIN: path.join(root, "bin"),
    ...(named.some((id) => manifest[id].dependencies?.length)
      ? { PATH: [path.join(root, "bin"), callerEnv.PATH ?? callerEnv.Path ?? ""].join(path.delimiter) }
      : {}),
  }
  const blocked = yield* Effect.forEach(named, (id) => ensure(id).pipe(Effect.timeoutOrElse({
    duration: PREPARE_MS,
    orElse: () => Effect.fail(new NotReady({ reason: `toolkit-not-ready:fetching:${id}` })),
  })), { concurrency: "unbounded", discard: true }).pipe(
    Effect.match({ onSuccess: () => undefined, onFailure: (error) => error.reason }),
  )
  if (blocked) return { env, blocked }
  return { env }
})

/** Validate the reachable graph before fetching any bytes; postorder puts each owned dependency before its caller. */
export function dependencyOrder(manifest: Readonly<Record<EngineId, Engine>>, id: EngineId): EngineId[] | string {
  const active = new Set<string>()
  const done = new Set<string>()
  const ordered: EngineId[] = []
  const visit = (current: string): string | undefined => {
    const engine = Object.entries(manifest).find(([key]) => key === current)?.[1]
    if (!engine) return `toolkit-dependency-missing:${current}`
    if (active.has(current)) return `toolkit-dependency-cycle:${[...active, current].join("->")}`
    if (done.has(current)) return
    active.add(current)
    for (const dependency of engine.dependencies ?? []) {
      const failure = visit(dependency)
      if (failure) return failure
    }
    active.delete(current)
    done.add(current)
    if (current !== id) ordered.push(engine.id)
  }
  return visit(id) ?? ordered
}

const request = Effect.fnUntraced(function* (id: EngineId, target: TargetId, host: boolean) {
  const root = yield* Root
  const manifest = yield* Manifest
  const runtimes = yield* Runtimes
  const dependencies = dependencyOrder(manifest, id)
  if (typeof dependencies === "string") return yield* new NotReady({ reason: dependencies })
  const engine = manifest[id]
  const unsupported = "runtime" in engine ? engine.unsupported?.[target] : undefined
  if (unsupported) return yield* new NotReady({ reason: `unsupported-target:${unsupported}` })
  const directory = path.join(root, "engines", id, `${engine.version}-${target}`)
  const cause = yield* attempts.once(requestKey(directory, host), Effect.gen(function* () {
    yield* Effect.forEach([...dependencies, id], (dependency) => acquire(root, manifest[dependency], runtimes, target, host), { discard: true })
  }))
  if (cause !== undefined) return yield* new NotReady({ reason: cause.startsWith("toolkit-not-ready:") || cause.startsWith("unsupported-target:") ? cause : `toolkit-not-ready:failed:${id}:${cause}` })
  return { executable: executable(engine, directory, target) }
})

const requestKey = (directory: string, host: boolean) => `${directory}:request:${host ? "host" : "cross"}`

const acquire = Effect.fnUntraced(function* (root: string, engine: Engine, runtimes: Readonly<Record<RuntimeId, Runtime>>, target: TargetId, host: boolean) {
  const id = engine.id
  const directory = path.join(root, "engines", id, `${engine.version}-${target}`)
  const unsupported = "runtime" in engine ? engine.unsupported?.[target] : undefined
  if (unsupported) return yield* new NotReady({ reason: `unsupported-target:${unsupported}` })
  const work =
    "runtime" in engine
      ? hosted(root, engine, runtimes, directory, target, host)
      : PinnedArtifact.install(directory, [engine.targets[target].artifact]).pipe(
          Effect.andThen(
            host
              ? shim(root, engine.id, launchText(root, engine, runtimes, directory, target))
              : Effect.void,
          ),
        )
  const cause = yield* attempts.once(directory, work.pipe(Effect.andThen(Effect.gen(function* () {
    const missing = yield* readiness(root, engine, runtimes, directory, target, host)
    if (missing) return yield* new PinnedArtifact.Failed({ cause: missing })
  }))))
  if (cause !== undefined) return yield* new NotReady({ reason: `toolkit-not-ready:failed:${id}:${cause}` })
  return { executable: executable(engine, directory, target) }
})

const states = Effect.fnUntraced(function* (ids: ReadonlyArray<EngineId>, target: TargetId) {
  const root = yield* Root
  const manifest = yield* Manifest
  const runtimes = yield* Runtimes
  const host = yield* Target
  const local = "target" in host && host.target === target
  return yield* Effect.forEach(ids, (id) =>
    Effect.gen(function* () {
      const engine = manifest[id]
      const directory = path.join(root, "engines", id, `${engine.version}-${target}`)
      const base = { engine: id, version: engine.version, target }
      const dependencies = dependencyOrder(manifest, id)
      if (typeof dependencies === "string") return { ...base, status: "failed", cause: dependencies, at: 0 } satisfies State
      const unsupported = "runtime" in engine ? engine.unsupported?.[target] : undefined
      if (unsupported) return { ...base, status: "unsupported", reason: unsupported } satisfies State
      // A complete parent artifact cannot hide a failed request, missing dependency, launcher or host shim.
      for (const dependency of [id, ...dependencies]) {
        const item = manifest[dependency]
        const install = path.join(root, "engines", dependency, `${item.version}-${target}`)
        const excluded = "runtime" in item ? item.unsupported?.[target] : undefined
        if (excluded) return { ...base, status: "unsupported", reason: excluded } satisfies State
        for (const key of [requestKey(install, local), install]) {
          const attempt = attempts.get(key)
          if (attempt && "running" in attempt) return { ...base, status: "fetching", at: attempt.at, budgetMs: INSTALL_MS } satisfies State
          if (attempt && "failed" in attempt) {
            const prefix = `toolkit-not-ready:failed:${id}:`
            return { ...base, status: "failed", cause: dependency !== id ? `dependency:${dependency}:${attempt.failed}`
              : attempt.failed.startsWith(prefix) ? attempt.failed.slice(prefix.length) : attempt.failed, at: attempt.at } satisfies State
          }
        }
        if (yield* readiness(root, item, runtimes, install, target, local)) return { ...base, status: "absent" } satisfies State
      }
      return { ...base, status: "ready", directory, executable: executable(engine, directory, target) } satisfies State
    }),
  )
})

/** Cache markers alone are not executable readiness. Status observes; acquisition repairs launchers before success. */
const readiness = Effect.fnUntraced(function* (root: string, engine: Engine, runtimes: Readonly<Record<RuntimeId, Runtime>>, directory: string, target: TargetId, host: boolean) {
  if (!(yield* PinnedArtifact.installed(directory))) return "install-incomplete"
  if (!(yield* fileReady(executable(engine, directory, target), target))) return "executable-missing"
  if ("runtime" in engine) {
    const runtime = runtimes[engine.runtime]
    const home = path.join(root, "runtimes", runtime.id, `${runtime.version}-${target}`)
    if (!(yield* PinnedArtifact.installed(home)) || !(yield* fileReady(path.join(home, runtime.targets[target].executable), target))) return "runtime-executable-missing"
  }
  if (!host) return
  const file = path.join(root, "bin", target === "win32-x64" ? `${engine.id}.cmd` : engine.id)
  if (!(yield* fileReady(file, target))) return "host-shim-missing"
  if ((yield* Effect.promise(() => readFile(file, "utf8").catch(() => undefined))) !== launchText(root, engine, runtimes, directory, target)) return "host-shim-stale"
})
