export * as BackendToolkit from "./index"

import path from "path"
import { randomUUID } from "crypto"
import { execFile } from "child_process"
import { chmod, mkdir, readFile, rename, rm, writeFile } from "fs/promises"
import { promisify } from "util"
import { Context, Effect, Schema } from "effect"
import { Global } from "../global"
import { PinnedArtifact } from "../pinned-artifact"
import { ENGINES, RUNTIMES, type Engine, type EngineId, type HostedEngine, type Runtime, type RuntimeId } from "./manifest"
import { detect, type TargetId } from "./target"

// The backend specialist's engines are fetched by the host on first use (the backend seat's shell has no network),
// verified against the pinned manifest and cached per user (ruling M3-4: an evicted engine is fetched again). Each
// engine installs into `<root>/engines/<id>/<version>-<target>/` and, once ready, gets a shim at `<root>/bin/<id>`
// (`<id>.cmd` on Windows) that carries the engine's environment; the shell exposes `<root>/bin` as BACKEND_TOOLKIT_BIN.
// A hosted engine (ruling M4-1) first needs its private runtime, installed once per user into
// `<root>/runtimes/<id>/<version>-<target>/` and shared by every engine on it. Its own install then carries a launcher
// `<id>` (`<id>.cmd` for Windows) that runs the runtime with the engine's arguments; that launcher is its executable.

export type EngineState =
  | { readonly status: "absent" }
  | { readonly status: "fetching" }
  | { readonly status: "ready"; readonly directory: string; readonly executable: string }
  | { readonly status: "failed"; readonly cause: string; readonly at: number }
  | { readonly status: "unsupported"; readonly reason: string }

/** One engine's state on one target; `target` is absent only when the host has no supported target. */
export type State = { readonly engine: EngineId; readonly version: string; readonly target?: TargetId } & EngineState

/** `reason` is `toolkit-not-ready:failed:<engine>:<cause>` or `unsupported-target:<reason>`. */
export class NotReady extends Schema.TaggedErrorClass<NotReady>()("BackendToolkit.NotReady", {
  reason: Schema.String,
}) {
  override get message() {
    return `Backend toolkit not ready: ${this.reason}`
  }
}

/** Cache root holding one install directory per engine version and target. */
export const Root = Context.Reference<string>("@opencode/BackendToolkit/Root", {
  defaultValue: () => process.env.BACKEND_TOOLKIT_ROOT ?? path.join(Global.Path.cache, "backend-toolkit"),
})

export const Manifest = Context.Reference<Readonly<Record<EngineId, Engine>>>("@opencode/BackendToolkit/Manifest", {
  defaultValue: () => ENGINES,
})

export const Runtimes = Context.Reference<Readonly<Record<RuntimeId, Runtime>>>("@opencode/BackendToolkit/Runtimes", {
  defaultValue: () => RUNTIMES,
})

/** The host's toolkit target, or why it has none. */
export const Target = Context.Reference<ReturnType<typeof detect>>("@opencode/BackendToolkit/Target", {
  defaultValue: () => detect(),
})

// A failed fetch is retried by a later need after this window, not by every command.
const RETRY_MS = 5 * 60_000
const INSTALL_MS = 10 * 60_000

// Keyed by install directory. Concurrent needs share the running fetch, which resolves to its failure cause.
const attempts = new Map<string, { readonly running?: Promise<string | undefined>; readonly failed?: string; readonly at: number }>()

export const status = Effect.fn("BackendToolkit.status")(function* (engine?: EngineId) {
  const manifest = yield* Manifest
  const host = yield* Target
  const ids = engine ? [engine] : Object.values(manifest).map((item) => item.id)
  if ("unsupported" in host)
    return ids.map((id): State => ({ engine: id, version: manifest[id].version, status: "unsupported", reason: host.unsupported }))
  return yield* states(ids, host.target)
})

/** The host-target executable of a ready engine, fetching it first when absent. */
export const ensure = Effect.fn("BackendToolkit.ensure")(function* (engine: EngineId) {
  const host = yield* Target
  if ("unsupported" in host) return yield* new NotReady({ reason: `unsupported-target:${host.unsupported}` })
  return yield* acquire(engine, host.target, true)
})

/** Fetch engines (all by default) for a target (the host's by default); shims are written only for the host target. */
export const prefetch = Effect.fn("BackendToolkit.prefetch")(function* (engines?: ReadonlyArray<EngineId>, target?: TargetId) {
  const manifest = yield* Manifest
  const host = yield* Target
  const ids = engines ?? Object.values(manifest).map((item) => item.id)
  const chosen = target ?? ("target" in host ? host.target : undefined)
  if (!chosen) return yield* status().pipe(Effect.map((all) => all.filter((state) => ids.includes(state.engine))))
  yield* Effect.forEach(ids, (id) => acquire(id, chosen, "target" in host && host.target === chosen).pipe(Effect.ignore), {
    concurrency: "unbounded",
    discard: true,
  })
  return yield* states(ids, chosen)
})

/**
 * The toolkit environment for one shell command. Every engine the command invokes through BACKEND_TOOLKIT_BIN is made
 * ready first; a command that names none never fetches. `blocked` is the NotReady reason of the first engine that fails.
 */
export const prepare = Effect.fn("BackendToolkit.prepare")(function* (command: string) {
  const root = yield* Root
  const manifest = yield* Manifest
  const env = { BACKEND_TOOLKIT_BIN: path.join(root, "bin") }
  // `$BACKEND_TOOLKIT_BIN/<id>`, `${BACKEND_TOOLKIT_BIN}/<id>`, `"$BACKEND_TOOLKIT_BIN"/<id>` and PowerShell's
  // `$env:BACKEND_TOOLKIT_BIN\<id>.cmd`, with either separator.
  const named = Object.values(manifest)
    .map((engine) => engine.id)
    .filter((id) =>
      new RegExp(String.raw`\$(?:env:)?(?:BACKEND_TOOLKIT_BIN|\{BACKEND_TOOLKIT_BIN\})"?[\\/]${id}(?![\w-])`).test(command),
    )
  const blocked = yield* Effect.forEach(named, ensure, { concurrency: "unbounded", discard: true }).pipe(
    Effect.match({ onSuccess: () => undefined, onFailure: (error) => error.reason }),
  )
  if (blocked) return { env, blocked }
  return { env }
})

const acquire = Effect.fnUntraced(function* (id: EngineId, target: TargetId, host: boolean) {
  const root = yield* Root
  const engine = (yield* Manifest)[id]
  const runtimes = yield* Runtimes
  const directory = path.join(root, "engines", id, `${engine.version}-${target}`)
  const work =
    "runtime" in engine
      ? hosted(root, engine, runtimes[engine.runtime], directory, target, host)
      : PinnedArtifact.install(directory, [engine.targets[target].artifact]).pipe(
          Effect.andThen(
            host
              ? shim(root, engine.id, launcher(process.platform === "win32", [executable(engine, directory, target)], engine.env ?? {}))
              : Effect.void,
          ),
        )
  const cause = yield* once(directory, work)
  if (cause !== undefined) return yield* new NotReady({ reason: `toolkit-not-ready:failed:${id}:${cause}` })
  return { executable: executable(engine, directory, target) }
})

/** Run `work` for `directory` at most once at a time and remember its failure; resolves to the failure cause. */
const once = Effect.fnUntraced(function* (directory: string, work: Effect.Effect<unknown, PinnedArtifact.Failed>) {
  const attempt = attempts.get(directory)
  if (attempt?.failed && Date.now() - attempt.at < RETRY_MS && !(yield* PinnedArtifact.installed(directory)))
    return attempt.failed
  if (attempt?.running) return yield* Effect.promise(() => attempt.running!)
  // Registered before the work starts: work that fails synchronously settles before runPromise returns, and its
  // failure must not be overwritten by a running entry that never resolves.
  const running = Promise.withResolvers<string | undefined>()
  attempts.set(directory, { running: running.promise, at: Date.now() })
  void Effect.runPromise(
    work.pipe(
      Effect.match({
        onSuccess: () => {
          attempts.delete(directory)
          return undefined
        },
        onFailure: (error) => {
          attempts.set(directory, { failed: error.cause, at: Date.now() })
          return error.cause
        },
      }),
    ),
  ).then(running.resolve)
  return yield* Effect.promise(() => running.promise)
})

/**
 * Install the engine's runtime (shared, `runtime-<cause>` on failure), then the engine with its launcher. npm and pip
 * run the target's own interpreter, so they install only for the host target.
 */
function hosted(root: string, engine: HostedEngine, runtime: Runtime, directory: string, target: TargetId, host: boolean) {
  const home = path.join(root, "runtimes", runtime.id, `${runtime.version}-${target}`)
  const pin = runtime.targets[target]
  const interpreter = path.join(home, pin.executable)
  const windows = target === "win32-x64"
  const expand = (text: string) => text.replaceAll("{install}", directory).replaceAll("{runtime}", home)
  const install = engine.install
  const env = Object.entries({ ...(install.kind === "pip" ? { PYTHONPATH: "{install}" } : {}), ...engine.env })
  const text = launcher(windows, [interpreter, ...engine.launch.map(expand)], Object.fromEntries(env.map(([key, value]) => [key, expand(value)])))
  return Effect.gen(function* () {
    if (install.kind !== "jar" && !host) return yield* new PinnedArtifact.Failed({ cause: `cross-target:${install.kind}` })
    const cause = yield* once(home, PinnedArtifact.install(home, [pin.artifact]))
    if (cause !== undefined) return yield* new PinnedArtifact.Failed({ cause: `runtime-${cause}` })
    yield* PinnedArtifact.install(directory, install.kind === "jar" ? [install.artifact] : [], (staging) =>
      Effect.tryPromise({
        try: async () => {
          if (install.kind === "npm") {
            await writeFile(path.join(staging, "package.json"), install.packageJson)
            await writeFile(path.join(staging, "package-lock.json"), install.lock)
            // Node's Windows zip keeps npm beside node.exe; the POSIX tarballs keep it under lib/.
            const npm = windows
              ? path.join(path.dirname(interpreter), "node_modules", "npm", "bin", "npm-cli.js")
              : path.join(home, "lib", "node_modules", "npm", "bin", "npm-cli.js")
            await run(interpreter, [npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--offline=false"], staging, {
              npm_config_cache: path.join(root, "cache", "npm"),
              npm_config_update_notifier: "false",
            })
          }
          if (install.kind === "pip") {
            const requirements = path.join(staging, "requirements.txt")
            await writeFile(requirements, install.requirements)
            await run(
              interpreter,
              ["-m", "pip", "install", "--require-hashes", "--no-deps", "--only-binary=:all:", "--target", staging, "-r", requirements],
              staging,
              { PIP_CACHE_DIR: path.join(root, "cache", "pip"), PIP_DISABLE_PIP_VERSION_CHECK: "1" },
            )
          }
          const file = path.join(staging, windows ? `${engine.id}.cmd` : engine.id)
          await writeFile(file, text)
          await chmod(file, 0o755)
        },
        catch: () => new PinnedArtifact.Failed({ cause: `install:${install.kind}` }),
      }),
    )
    if (host) yield* shim(root, engine.id, text)
  })
}

const run = (file: string, args: ReadonlyArray<string>, cwd: string, env: Record<string, string>) =>
  promisify(execFile)(file, [...args], { cwd, env: { ...process.env, ...env }, timeout: INSTALL_MS, maxBuffer: 64 * 1024 * 1024 })

function executable(engine: Engine, directory: string, target: TargetId) {
  if ("runtime" in engine) return path.join(directory, target === "win32-x64" ? `${engine.id}.cmd` : engine.id)
  return path.join(directory, engine.targets[target].executable)
}

const states = Effect.fnUntraced(function* (ids: ReadonlyArray<EngineId>, target: TargetId) {
  const root = yield* Root
  const manifest = yield* Manifest
  return yield* Effect.forEach(ids, (id) =>
    Effect.gen(function* () {
      const engine = manifest[id]
      const directory = path.join(root, "engines", id, `${engine.version}-${target}`)
      const base = { engine: id, version: engine.version, target }
      if (yield* PinnedArtifact.installed(directory))
        return { ...base, status: "ready", directory, executable: executable(engine, directory, target) } satisfies State
      const attempt = attempts.get(directory)
      if (attempt?.running) return { ...base, status: "fetching" } satisfies State
      if (attempt?.failed) return { ...base, status: "failed", cause: attempt.failed, at: attempt.at } satisfies State
      return { ...base, status: "absent" } satisfies State
    }),
  )
})

/** A launcher that runs `command` with the caller's arguments appended and `env` set for the child only. */
function launcher(windows: boolean, command: ReadonlyArray<string>, env: Readonly<Record<string, string>>) {
  const vars = Object.entries(env)
  if (windows)
    return ["@echo off", "setlocal", ...vars.map(([key, value]) => `set "${key}=${value}"`), `${command.map((part) => `"${part}"`).join(" ")} %*`, "exit /b %errorlevel%", ""].join("\r\n")
  return ["#!/bin/sh", ...vars.map(([key, value]) => `export ${key}=${quote(value)}`), `exec ${command.map(quote).join(" ")} "$@"`, ""].join("\n")
}

/** Write an engine's `<root>/bin` launcher through a temp file and one rename, skipping it when it is already current. */
function shim(root: string, id: EngineId, text: string) {
  return Effect.tryPromise({
    try: async () => {
      const bin = path.join(root, "bin")
      const file = path.join(bin, process.platform === "win32" ? `${id}.cmd` : id)
      if ((await readFile(file, "utf8").catch(() => undefined)) === text) return
      await mkdir(bin, { recursive: true })
      const temp = path.join(bin, `.${id}-${randomUUID()}`)
      await writeFile(temp, text)
      await chmod(temp, 0o755)
      await rename(temp, file).catch(async (error) => {
        await rm(temp, { force: true })
        throw error
      })
    },
    catch: () => new PinnedArtifact.Failed({ cause: "shim" }),
  })
}

const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`
