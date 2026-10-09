export * as BackendToolkit from "./index"

import path from "path"
import { randomUUID } from "crypto"
import { access, chmod, mkdir, readFile, rename, rm, stat, writeFile } from "fs/promises"
import { constants } from "fs"
import { Cause, Context, Effect, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../effect/layer-node"
import { Global } from "../global"
import { PinnedArtifact } from "../pinned-artifact"
import { AppProcess } from "../process"
import { BackendToolkitAcquisition } from "./acquisition"
import { BackendToolkitDiagnostics } from "./diagnostics"
import {
  ENGINES,
  RUNTIMES,
  type Engine,
  type EngineId,
  type HostedEngine,
  type Runtime,
  type RuntimeId,
} from "./manifest"
import { detect, type TargetId } from "./target"

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

/**
 * Acquisition failures name the engine and bounded installer cause. A shell wait can instead report
 * `toolkit-not-ready:fetching:<engine>` while acquisition continues; invalid graphs name the missing id or cycle.
 */
export class NotReady extends Schema.TaggedErrorClass<NotReady>()("BackendToolkit.NotReady", {
  reason: Schema.String,
}) {
  override get message() {
    return `Backend toolkit not ready: ${this.reason}`
  }
}

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

// A failed fetch is retried by a later need after this window, not by every command.
const RETRY_MS = 5 * 60_000
// A cold cargo build of a CLI with its whole dependency graph takes minutes.
const INSTALL_MS = 30 * 60_000
// Acquisition outlives a shell call. A cold source build must not consume an entire model scenario in silence.
const PREPARE_MS = 60_000

// Install keys coalesce shared dependencies; request keys own continuation through the entire dependency chain.
const attempts = BackendToolkitAcquisition.make<PinnedArtifact.Failed | NotReady>(RETRY_MS, (cause) => {
  const text = cause.reasons.map((reason) => {
    if (Cause.isFailReason(reason)) return reason.error instanceof NotReady ? reason.error.reason : reason.error.cause
    if (Cause.isInterruptReason(reason)) return "acquisition-interrupted"
    return `acquisition-defect:${reason.defect instanceof Error ? reason.defect.message : typeof reason.defect === "string" ? reason.defect : "unknown"}`
  }).join("; ")
  return BackendToolkitDiagnostics.details(text) ?? "acquisition-details-redacted"
})

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

/**
 * Install the engine's runtime (shared, `runtime-<cause>` on failure), then the engine with its launcher. npm, pip and
 * source builds run the target's own interpreter or toolchain, so they install only for the host target.
 * @internal The worker may also run directly with caller-owned cancellation instead of shared admission.
 */
export function hosted(
  root: string,
  engine: HostedEngine,
  runtimes: Readonly<Record<RuntimeId, Runtime>>,
  directory: string,
  target: TargetId,
  host: boolean,
) {
  const runtime = runtimes[engine.runtime]
  const home = path.join(root, "runtimes", runtime.id, `${runtime.version}-${target}`)
  const pin = runtime.targets[target]
  const interpreter = path.join(home, pin.executable)
  const windows = target === "win32-x64"
  const install = engine.install
  const text = launchText(root, engine, runtimes, directory, target)
  return Effect.gen(function* () {
    if (install.kind !== "jar" && !host)
      return yield* new PinnedArtifact.Failed({ cause: `cross-target:${install.kind}` })
    const cause = yield* attempts.once(home, PinnedArtifact.install(home, [pin.artifact]))
    if (cause !== undefined) return yield* new PinnedArtifact.Failed({ cause: `runtime-${cause}` })
    yield* PinnedArtifact.install(
      directory,
      install.kind === "jar" || install.kind === "source" ? [install.artifact] : [],
      (staging) =>
        Effect.suspend(() => {
          const pending: { work?: Promise<void> } = {}
          return Effect.tryPromise({
            try: (signal) =>
              (pending.work = (async () => {
                if (install.kind === "npm") {
                  await writeFile(path.join(staging, "package.json"), install.packageJson)
                  await writeFile(path.join(staging, "package-lock.json"), install.lock)
                  // Node's Windows zip keeps npm beside node.exe; the POSIX tarballs keep it under lib/.
                  const npm = windows
                    ? path.join(path.dirname(interpreter), "node_modules", "npm", "bin", "npm-cli.js")
                    : path.join(home, "lib", "node_modules", "npm", "bin", "npm-cli.js")
                  await run(
                    interpreter,
                    [npm, "ci", "--ignore-scripts", "--no-audit", "--no-fund", "--offline=false"],
                    staging,
                    {
                      npm_config_cache: path.join(root, "cache", "npm"),
                      npm_config_update_notifier: "false",
                    },
                    signal,
                  )
                }
                if (install.kind === "pip") {
                  const requirements = path.join(staging, "requirements.txt")
                  await writeFile(requirements, install.requirements)
                  await run(
                    interpreter,
                    [
                      "-m",
                      "pip",
                      "install",
                      "--require-hashes",
                      "--no-deps",
                      "--only-binary=:all:",
                      "--target",
                      staging,
                      "-r",
                      requirements,
                    ],
                    staging,
                    { PIP_CACHE_DIR: path.join(root, "cache", "pip"), PIP_DISABLE_PIP_VERSION_CHECK: "1" },
                    signal,
                  )
                }
                // Dependencies are pinned by the module's go.sum, checked against the checksum DB.
                if (install.kind === "source" && install.build === "go")
                  await run(
                    interpreter,
                    ["build", "-trimpath", "-o", executable(engine, staging, target), install.path],
                    path.join(staging, "src"),
                    {
                      GOFLAGS: "-mod=readonly",
                      GOTOOLCHAIN: "local",
                      GOPATH: path.join(root, "cache", "go"),
                      GOCACHE: path.join(root, "cache", "go-build"),
                      GOPROXY: "https://proxy.golang.org",
                      GOSUMDB: "sum.golang.org",
                      CGO_ENABLED: "0",
                    },
                    signal,
                  )
                // Dependencies are pinned by the crate's packaged Cargo.lock (`--locked`). Cargo runs `rustc` from PATH unless
                // RUSTC names one, so it names the toolchain's own.
                if (install.kind === "source" && install.build === "cargo")
                  await run(
                    interpreter,
                    [
                      "install",
                      "--path",
                      path.join(staging, "src", install.path),
                      "--locked",
                      "--root",
                      staging,
                      "--no-default-features",
                      ...(install.features?.length ? ["--features", install.features.join(",")] : []),
                    ],
                    path.join(staging, "src"),
                    {
                      CARGO_HOME: path.join(root, "cache", "cargo"),
                      CARGO_TARGET_DIR: path.join(root, "cache", "cargo-target"),
                      RUSTC: path.join(path.dirname(interpreter), windows ? "rustc.exe" : "rustc"),
                      ...(install.optLevel !== undefined ? { CARGO_PROFILE_RELEASE_OPT_LEVEL: String(install.optLevel) } : {}),
                    },
                    signal,
                  )
                if (install.kind === "source") return access(executable(engine, staging, target))
                const file = executable(engine, staging, target)
                await mkdir(path.dirname(file), { recursive: true })
                await writeFile(file, text)
                await chmod(file, 0o755)
              })()),
            catch: (error) =>
              new PinnedArtifact.Failed({
                cause: installerCause(install.kind === "source" ? install.build : install.kind, error),
              }),
          }).pipe(
            // tryPromise aborts before its Promise settles. Join the nested root's process finalizers before install()
            // removes staging, including interruption during the async filesystem work preceding the spawn.
            Effect.onInterrupt(() =>
              Effect.promise(
                () =>
                  pending.work?.then(
                    () => undefined,
                    () => undefined,
                  ) ?? Promise.resolve(),
              ),
            ),
          )
        }),
    )
    // Existing complete pip caches used the engine id beside the packages. Refresh the private launcher without
    // reinstalling or touching pinned package bytes, so their advertised executable exists after a layout upgrade.
    if (install.kind === "pip") yield* shim(directory, engine.id, text, path.join(directory, ".launchers"))
    if (host) yield* shim(root, engine.id, text)
  })
}

const run = (
  file: string,
  args: ReadonlyArray<string>,
  cwd: string,
  env: Record<string, string>,
  signal: AbortSignal,
) =>
  Effect.runPromise(
    Effect.gen(function* () {
      const processService = yield* AppProcess.Service
      const result = yield* processService
        .run(ChildProcess.make(file, args, { cwd, env: { ...BackendToolkitDiagnostics.environment(cwd), ...env }, forceKillAfter: "5 seconds" }), {
          timeout: INSTALL_MS,
          maxOutputBytes: 64 * 1024 * 1024,
          maxErrorBytes: 64 * 1024 * 1024,
        })
      // AppProcess caps capture without failing the run; an incomplete install log must still fail the install.
      if (result.stdoutTruncated || result.stderrTruncated)
        return yield* new AppProcess.AppProcessError({
          command: result.command,
          cause: new Error("Output exceeded 64 MiB"),
        })
      if (result.exitCode !== 0)
        return yield* new AppProcess.AppProcessError({
          command: result.command,
          exitCode: result.exitCode,
          stderr: result.stderr.toString(),
          cause: { stdout: result.stdout.toString() },
        })
    }).pipe(Effect.provide(LayerNode.compile(AppProcess.node))),
    { signal },
  )
/** Inspect whole captured output before truncating: a credential outside the retained tail still suppresses details. */
function installerCause(kind: string, error: unknown) {
  const prefix = `install:${kind}`
  if (!(error instanceof Error)) return prefix
  const stderr = "stderr" in error && typeof error.stderr === "string" ? error.stderr : ""
  const stdout = error instanceof AppProcess.AppProcessError && typeof error.cause === "object" && error.cause !== null &&
    "stdout" in error.cause && typeof error.cause.stdout === "string" ? error.cause.stdout
    : "stdout" in error && typeof error.stdout === "string" ? error.stdout : ""
  if (BackendToolkitDiagnostics.details(`${error.message}\n${stderr}\n${stdout}`) === undefined) return `${prefix}:details-redacted`
  const exit = error instanceof AppProcess.AppProcessError && error.cause instanceof Error && error.cause.message === "Timed out" ? `timeout:${INSTALL_MS}ms`
    : error instanceof AppProcess.AppProcessError && error.exitCode !== undefined ? `exit:${error.exitCode}`
    : "killed" in error && error.killed ? `timeout:${INSTALL_MS}ms`
    : "code" in error && (typeof error.code === "string" || typeof error.code === "number") ? `exit:${error.code}` : "failed"
  return `${prefix}:${exit}:${BackendToolkitDiagnostics.details(stderr || stdout || error.message) ?? "details-redacted"}`
}

function executable(engine: Engine, directory: string, target: TargetId) {
  const install = "runtime" in engine ? engine.install : undefined
  if (install?.kind === "source") {
    const name = target === "win32-x64" ? `${install.binary}.exe` : install.binary
    // `go build -o` writes where it is told; `cargo install --root` writes under bin/.
    return install.build === "go" ? path.join(directory, name) : path.join(directory, "bin", name)
  }
  // A pip distribution can contain a package named exactly like the engine (sqlglot/). Never overwrite it with a launcher.
  if ("runtime" in engine) return path.join(directory, ...(install?.kind === "pip" ? [".launchers"] : []), target === "win32-x64" ? `${engine.id}.cmd` : engine.id)
  return path.join(directory, engine.targets[target].executable)
}

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

const fileReady = (file: string, target: TargetId) => Effect.promise(async () => {
  if (!(await stat(file).catch(() => undefined))?.isFile()) return false
  return access(file, target === "win32-x64" ? constants.F_OK : constants.X_OK).then(() => true, () => false)
})

function launchText(root: string, engine: Engine, runtimes: Readonly<Record<RuntimeId, Runtime>>, directory: string, target: TargetId) {
  const bin = engine.dependencies?.length ? path.join(root, "bin") : undefined
  if (!("runtime" in engine)) return launcher(target === "win32-x64", [executable(engine, directory, target)], engine.env ?? {}, bin)
  const runtime = runtimes[engine.runtime]
  const home = path.join(root, "runtimes", runtime.id, `${runtime.version}-${target}`)
  const expand = (text: string) => text.replaceAll("{install}", directory).replaceAll("{runtime}", home)
  return launcher(target === "win32-x64",
    engine.install.kind === "source" ? [executable(engine, directory, target)] : [path.join(home, runtime.targets[target].executable), ...engine.launch.map(expand)],
    Object.fromEntries(Object.entries({ ...(engine.install.kind === "pip" ? { PYTHONPATH: "{install}" } : {}), ...engine.env }).map(([key, value]) => [key, expand(value)])), bin)
}

/** A launcher that runs `command` with the caller's arguments appended and `env` set for the child only. */
function launcher(windows: boolean, command: ReadonlyArray<string>, env: Readonly<Record<string, string>>, bin?: string) {
  const vars = Object.entries(env)
  if (windows)
    return ["@echo off", "setlocal", ...vars.map(([key, value]) => `set "${key}=${value}"`), ...(bin ? [`set "PATH=${bin};%PATH%"`] : []), `${command.map((part) => `"${part}"`).join(" ")} %*`, "exit /b %errorlevel%", ""].join("\r\n")
  return ["#!/bin/sh", ...vars.map(([key, value]) => `export ${key}=${quote(value)}`), ...(bin ? [`export PATH=${quote(bin)}:"$PATH"`] : []), `exec ${command.map(quote).join(" ")} "$@"`, ""].join("\n")
}

/** Write an engine's `<root>/bin` launcher through a temp file and one rename, skipping it when it is already current. */
function shim(root: string, id: EngineId, text: string, bin = path.join(root, "bin")) {
  return Effect.tryPromise({
    try: async () => {
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
