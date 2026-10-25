export * as BackendToolkitHosted from "./hosted"

import path from "path"
import { chmod, mkdir, writeFile } from "fs/promises"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../effect/layer-node"
import { PinnedArtifact } from "../pinned-artifact"
import { AppProcess } from "../process"
import { ToolkitRuntime } from "../toolkit/runtime"
import { INSTALL_MS } from "./attempts"
import { BackendToolkitCassandra } from "./cassandra-metadata"
import { BackendToolkitDiagnostics } from "./diagnostics"
import { executable, fileReady, launchText, shim } from "./launcher"
import type { HostedEngine, Runtime, RuntimeId } from "./manifest"
import type { TargetId } from "./target"

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
    // The common runtime primitive owns the attempt, so capability callers and hosted engines share one download.
    yield* ToolkitRuntime.ensure({ root, runtime, target }).pipe(
      Effect.mapError((error) => new PinnedArtifact.Failed({ cause: `runtime-${error.cause}` })),
    )
    if (install.kind === "source" && install.compatibility && (engine.id !== "gocqlx-schemagen" || install.build !== "go"))
      return yield* new PinnedArtifact.Failed({ cause: "compatibility:cassandra-metadata:unsupported-engine" })
    yield* PinnedArtifact.install(
      directory,
      install.kind === "jar" || install.kind === "source"
        ? [install.artifact, ...(install.kind === "source" && install.compatibility ? [BackendToolkitCassandra.artifact] : [])]
        : [],
      (staging) =>
        // Compatibility preparation owns staging writes too; finish them before interrupted install cleanup.
        (install.kind === "source" && install.compatibility
          ? BackendToolkitCassandra.prepare(staging).pipe(Effect.uninterruptible)
          : Effect.void).pipe(Effect.andThen(Effect.suspend(() => {
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
                if (install.kind === "source") {
                  // Reject invalid builder output before PinnedArtifact publishes its complete cache.
                  if (!(await Effect.runPromise(fileReady(executable(engine, staging, target), target))))
                    throw new Error("source-executable-not-ready")
                  return
                }
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
        }))),
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
