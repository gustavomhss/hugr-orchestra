export * as BackendToolkit from "./index"

import path from "path"
import { randomUUID } from "crypto"
import { chmod, mkdir, readFile, rename, rm, writeFile } from "fs/promises"
import { Context, Effect, Schema } from "effect"
import { Global } from "../global"
import { PinnedArtifact } from "../pinned-artifact"
import { ENGINES, type Engine, type EngineId } from "./manifest"
import { detect, type TargetId } from "./target"

// The backend specialist's engines are fetched by the host on first use (the backend seat's shell has no network),
// verified against the pinned manifest and cached per user (ruling M3-4: an evicted engine is fetched again). Each
// engine installs into `<root>/engines/<id>/<version>-<target>/` and, once ready, gets a shim at `<root>/bin/<id>`
// (`<id>.cmd` on Windows) that carries the engine's environment; the shell exposes `<root>/bin` as BACKEND_TOOLKIT_BIN.

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

/** The host's toolkit target, or why it has none. */
export const Target = Context.Reference<ReturnType<typeof detect>>("@opencode/BackendToolkit/Target", {
  defaultValue: () => detect(),
})

// A failed fetch is retried by a later need after this window, not by every command.
const RETRY_MS = 5 * 60_000

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
  const pin = engine.targets[target]
  const directory = path.join(root, "engines", id, `${engine.version}-${target}`)
  const executable = path.join(directory, pin.executable)
  const attempt = attempts.get(directory)
  if (attempt?.failed && Date.now() - attempt.at < RETRY_MS && !(yield* PinnedArtifact.installed(directory)))
    return yield* new NotReady({ reason: `toolkit-not-ready:failed:${id}:${attempt.failed}` })
  const running =
    attempt?.running ??
    Effect.runPromise(
      PinnedArtifact.install(directory, [pin.artifact]).pipe(
        Effect.andThen(host ? shim(root, engine, executable) : Effect.void),
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
    )
  if (!attempt?.running) attempts.set(directory, { running, at: Date.now() })
  const cause = yield* Effect.promise(() => running)
  if (cause !== undefined) return yield* new NotReady({ reason: `toolkit-not-ready:failed:${id}:${cause}` })
  return { executable }
})

const states = Effect.fnUntraced(function* (ids: ReadonlyArray<EngineId>, target: TargetId) {
  const root = yield* Root
  const manifest = yield* Manifest
  return yield* Effect.forEach(ids, (id) =>
    Effect.gen(function* () {
      const engine = manifest[id]
      const directory = path.join(root, "engines", id, `${engine.version}-${target}`)
      const base = { engine: id, version: engine.version, target }
      if (yield* PinnedArtifact.installed(directory))
        return { ...base, status: "ready", directory, executable: path.join(directory, engine.targets[target].executable) } satisfies State
      const attempt = attempts.get(directory)
      if (attempt?.running) return { ...base, status: "fetching" } satisfies State
      if (attempt?.failed) return { ...base, status: "failed", cause: attempt.failed, at: attempt.at } satisfies State
      return { ...base, status: "absent" } satisfies State
    }),
  )
})

/** Write the engine's launcher through a temp file and one rename, skipping it when it is already current. */
function shim(root: string, engine: Engine, executable: string) {
  return Effect.tryPromise({
    try: async () => {
      const bin = path.join(root, "bin")
      const windows = process.platform === "win32"
      const file = path.join(bin, windows ? `${engine.id}.cmd` : engine.id)
      const env = Object.entries(engine.env ?? {})
      const text = windows
        ? ["@echo off", "setlocal", ...env.map(([key, value]) => `set "${key}=${value}"`), `"${executable}" %*`, "exit /b %errorlevel%", ""].join("\r\n")
        : ["#!/bin/sh", ...env.map(([key, value]) => `export ${key}=${quote(value)}`), `exec ${quote(executable)} "$@"`, ""].join("\n")
      if ((await readFile(file, "utf8").catch(() => undefined)) === text) return
      await mkdir(bin, { recursive: true })
      const temp = path.join(bin, `.${engine.id}-${randomUUID()}`)
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
