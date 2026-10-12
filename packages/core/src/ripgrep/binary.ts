import path from "path"
import { createHash } from "crypto"
import { Cause, Context, Deferred, Duration, Effect, Exit, Layer, Option, Schedule, Schema, Scope, Stream } from "effect"
import { HttpClient, HttpClientRequest } from "effect/unstable/http"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"
import { CrossSpawnSpawner } from "../cross-spawn-spawner"
import { makeGlobalNode } from "../effect/app-node"
import { httpClient } from "../effect/app-node-platform"
import { FSUtil } from "../fs-util"
import { Global } from "../global"
import { which } from "../util/which"
import { EffectFlock } from "../util/effect-flock"

/**
 * Finds the ripgrep executable: `rg` on PATH first (Nix builds and CI put it there), then a copy this host
 * downloaded before, and only then a download of the pinned release. A download is checked against its pinned
 * digest before extraction, runs in the background once per process (and once per host, under a file lock), and
 * each attempt has a deadline. A caller waits at most `wait` for it; past that it fails with a clear message while
 * the download carries on for the next caller. A failed download is not retried for `cooldown`.
 */
export namespace RipgrepBinary {
  export const VERSION = "15.1.0"
  /** `1` or `true` forbids the download: a missing `rg` then fails naming this variable. CI sets it. */
  export const DISABLE_DOWNLOAD = "ORCHESTRA_DISABLE_RIPGREP_DOWNLOAD"

  // sha256 of each upstream release archive. Pinned 2026-10-12: each matched upstream's .sha256 file, and the two
  // Linux archives match the sha512 pins in tool-safety-sandbox-runtime.ts.
  const PLATFORM = {
    "arm64-darwin": {
      platform: "aarch64-apple-darwin",
      extension: "tar.gz",
      sha256: "378e973289176ca0c6054054ee7f631a065874a352bf43f0fa60ef079b6ba715",
    },
    "arm64-linux": {
      platform: "aarch64-unknown-linux-gnu",
      extension: "tar.gz",
      sha256: "2b661c6ef508e902f388e9098d9c4c5aca72c87b55922d94abdba830b4dc885e",
    },
    "x64-darwin": {
      platform: "x86_64-apple-darwin",
      extension: "tar.gz",
      sha256: "64811cb24e77cac3057d6c40b63ac9becf9082eedd54ca411b475b755d334882",
    },
    "x64-linux": {
      platform: "x86_64-unknown-linux-musl",
      extension: "tar.gz",
      sha256: "1c9297be4a084eea7ecaedf93eb03d058d6faae29bbc57ecdaf5063921491599",
    },
    "arm64-win32": {
      platform: "aarch64-pc-windows-msvc",
      extension: "zip",
      sha256: "00d931fb5237c9696ca49308818edb76d8eb6fc132761cb2a1bd616b2df02f8e",
    },
    "ia32-win32": {
      platform: "i686-pc-windows-msvc",
      extension: "zip",
      sha256: "725be85a1e8f92878a548f40ee4f6df64bc93b809586462b3c6d884e1de1e83a",
    },
    "x64-win32": {
      platform: "x86_64-pc-windows-msvc",
      extension: "zip",
      sha256: "124510b94b6baa3380d051fdf4650eaa80a302c876d611e9dba0b2e18d87493a",
    },
  } as const

  /** One downloadable archive: where it is, its digest, and the directory inside it that holds the executable. */
  export type Release = {
    readonly url: string
    readonly sha256: string
    readonly extension: "tar.gz" | "zip"
    readonly root: string
  }

  export type Options = {
    /** The `rg` on PATH, if any. */
    readonly system: () => string | undefined
    /** Where a downloaded `rg` is kept. */
    readonly directory: string
    /** This platform's archive; undefined where ripgrep publishes none. */
    readonly release: Release | undefined
    readonly download: boolean
    /** Deadline for one attempt's response headers. */
    readonly connectTimeout: Duration.Input
    /** Deadline for one whole attempt, body included. */
    readonly attemptTimeout: Duration.Input
    readonly attempts: number
    /** Delay before the first retry, doubled for each later one. */
    readonly retryDelay: Duration.Input
    /** Longest a caller waits for a download in progress. */
    readonly wait: Duration.Input
    /** How long after a failed download callers fail at once instead of starting another. */
    readonly cooldown: Duration.Input
  }

  export class Unavailable extends Schema.TaggedErrorClass<Unavailable>()("RipgrepBinary.Unavailable", {
    message: Schema.String,
    /** Whether another attempt might succeed (timeouts, 5xx, 429, transport errors). */
    retry: Schema.Boolean,
  }) {}

  export interface Interface {
    readonly filepath: Effect.Effect<string, Unavailable>
  }

  export class Service extends Context.Service<Service, Interface>()("@orchestra/RipgrepBinary") {}

  export const release = (key = `${process.arch}-${process.platform}`): Release | undefined => {
    const config = PLATFORM[key as keyof typeof PLATFORM]
    if (!config) return undefined
    const root = `ripgrep-${VERSION}-${config.platform}`
    return {
      url: `https://github.com/BurntSushi/ripgrep/releases/download/${VERSION}/${root}.${config.extension}`,
      sha256: config.sha256,
      extension: config.extension,
      root,
    }
  }

  export const defaults = (env: Record<string, string | undefined> = process.env): Options => ({
    system: () => which(process.platform === "win32" ? "rg.exe" : "rg") ?? undefined,
    directory: Global.Path.bin,
    release: release(),
    download: !["1", "true"].includes(env[DISABLE_DOWNLOAD]?.toLowerCase() ?? ""),
    connectTimeout: "15 seconds",
    attemptTimeout: "60 seconds",
    attempts: 3,
    retryDelay: "1 second",
    wait: "20 seconds",
    cooldown: "1 minute",
  })

  const label = (input: Duration.Input) => Duration.format(Duration.fromInputUnsafe(input))

  export const make = Effect.fnUntraced(function* (overrides: Partial<Options> = {}) {
    const options = { ...defaults(), ...overrides }
    const fs = yield* FSUtil.Service
    const http = yield* HttpClient.HttpClient
    const spawner = yield* ChildProcessSpawner
    const flock = yield* EffectFlock.Service
    // Downloads run in the layer's scope, so an interrupted caller never cancels one another caller waits on.
    const scope = yield* Scope.Scope
    const executable = process.platform === "win32" ? "rg.exe" : "rg"
    const target = path.join(options.directory, executable)
    const state: {
      resolved?: string
      running?: Deferred.Deferred<string, Unavailable>
      failed?: { readonly error: Unavailable; readonly at: number }
    } = {}

    const unavailable = (message: string, retry = false) => new Unavailable({ message, retry })

    const run = Effect.fnUntraced(function* (command: string, args: string[]) {
      const handle = yield* spawner.spawn(ChildProcess.make(command, args, { extendEnv: true, stdin: "ignore" }))
      const [stdout, stderr, code] = yield* Effect.all(
        [
          Stream.mkString(Stream.decodeText(handle.stdout)),
          Stream.mkString(Stream.decodeText(handle.stderr)),
          handle.exitCode,
        ],
        { concurrency: "unbounded" },
      )
      if (code !== 0)
        return yield* unavailable(stderr.trim() || stdout.trim() || `ripgrep extraction failed with code ${code}`)
    }, Effect.scoped)

    const fetchArchive = Effect.fnUntraced(function* (release: Release) {
      const response = yield* http.execute(HttpClientRequest.get(release.url)).pipe(
        Effect.mapError((cause) => unavailable(`ripgrep download failed: ${cause.message}`, true)),
        Effect.timeoutOrElse({
          duration: options.connectTimeout,
          orElse: () =>
            Effect.fail(
              unavailable(`ripgrep download got no response within ${label(options.connectTimeout)}`, true),
            ),
        }),
      )
      if (response.status !== 200)
        return yield* unavailable(
          `ripgrep download failed: HTTP ${response.status} from ${release.url}`,
          response.status >= 500 || response.status === 408 || response.status === 429,
        )
      return new Uint8Array(
        yield* response.arrayBuffer.pipe(
          Effect.mapError((cause) => unavailable(`ripgrep download failed: ${cause.message}`, true)),
        ),
      )
    })

    const install = Effect.fnUntraced(function* (release: Release, bytes: Uint8Array) {
      const digest = createHash("sha256").update(bytes).digest("hex")
      if (digest !== release.sha256)
        return yield* unavailable(
          `ripgrep archive failed its integrity check: expected sha256 ${release.sha256}, got ${digest} from ${release.url}`,
        )
      const dir = yield* fs.makeTempDirectoryScoped({ directory: options.directory, prefix: "ripgrep-" })
      const archive = path.join(dir, `archive.${release.extension}`)
      yield* fs.writeFile(archive, bytes)
      const out = path.join(dir, "out")
      yield* fs.makeDirectory(out)
      if (release.extension === "zip") {
        const tar =
          process.platform === "win32"
            ? which("tar.exe", { Path: path.join(process.env.SystemRoot ?? "C:\\Windows", "System32") })
            : which("tar")
        yield* tar
          ? run(tar, ["-xf", archive, "-C", out])
          : run(which("powershell.exe") ?? which("pwsh.exe") ?? "powershell.exe", [
              "-NoProfile",
              "-NonInteractive",
              "-Command",
              `$global:ProgressPreference = 'SilentlyContinue'; Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${out.replaceAll("'", "''")}' -Force`,
            ])
      }
      if (release.extension === "tar.gz") yield* run("tar", ["-xzf", archive, "-C", out])
      const extracted = path.join(out, release.root, executable)
      if (!(yield* fs.isFile(extracted)))
        return yield* unavailable(`ripgrep archive did not contain ${release.root}/${executable}`)
      // Copied next to the target and renamed into place, so a crash never leaves a partial `rg` behind.
      const staged = path.join(options.directory, `.${executable}-${path.basename(dir)}`)
      yield* fs.copyFile(extracted, staged)
      if (process.platform !== "win32") yield* fs.chmod(staged, 0o755)
      yield* fs.rename(staged, target).pipe(Effect.onError(() => fs.remove(staged, { force: true }).pipe(Effect.ignore)))
    }, Effect.scoped)

    const download = (release: Release) =>
      flock.withLock(
        Effect.gen(function* () {
          if (yield* fs.isFile(target)) return target
          yield* Effect.logInfo("downloading ripgrep", { url: release.url })
          yield* fs.ensureDir(options.directory)
          const bytes = yield* fetchArchive(release).pipe(
            Effect.timeoutOrElse({
              duration: options.attemptTimeout,
              orElse: () =>
                Effect.fail(
                  unavailable(`ripgrep download did not finish within ${label(options.attemptTimeout)}`, true),
                ),
            }),
            Effect.tapError((error) =>
              error.retry ? Effect.logWarning("ripgrep download attempt failed", { error: error.message }) : Effect.void,
            ),
            Effect.retry({
              while: (error) => error.retry,
              times: options.attempts - 1,
              schedule: Schedule.exponential(options.retryDelay),
            }),
          )
          yield* install(release, bytes)
          return target
        }),
        `ripgrep-bootstrap:${release.sha256}`,
        options.directory,
      ).pipe(
        Effect.mapError((error) =>
          error instanceof Unavailable ? error : unavailable(`ripgrep install failed: ${error.message}`),
        ),
      )

    // Starts the download, joins one in progress, or repeats a recent failure. The check and the registration happen
    // in one synchronous step, so concurrent callers can never start two downloads.
    const acquisition = (release: Release) =>
      Effect.suspend(() => {
        if (state.running) return Effect.succeed(state.running)
        if (state.failed && Date.now() - state.failed.at < Duration.toMillis(Duration.fromInputUnsafe(options.cooldown)))
          return Effect.fail(state.failed.error)
        const running = Deferred.makeUnsafe<string, Unavailable>()
        state.running = running
        return download(release).pipe(
          Effect.onExit((exit) =>
            Effect.sync(() => {
              // An interrupted download (the host shutting down) is reported to its waiters as a retryable failure.
              const error = Exit.isFailure(exit)
                ? (Option.getOrUndefined(Cause.findErrorOption(exit.cause)) ??
                  unavailable("ripgrep download was interrupted", true))
                : undefined
              state.running = undefined
              state.failed = error ? { error, at: Date.now() } : undefined
              Deferred.doneUnsafe(running, error ? Effect.fail(error) : exit)
            }),
          ),
          Effect.forkIn(scope),
          Effect.as(running),
        )
      })

    const locate = Effect.gen(function* () {
      const system = options.system()
      if (system && (yield* fs.isFile(system))) return system
      if (yield* fs.isFile(target)) return target
      const release = options.release
      if (!release)
        return yield* unavailable(
          `ripgrep publishes no build for ${process.arch}-${process.platform}; install ripgrep (rg) on PATH`,
        )
      if (!options.download) {
        const error = unavailable(
          `ripgrep (rg) is not on PATH and ${DISABLE_DOWNLOAD} forbids downloading it; install ripgrep (rg) on PATH`,
        )
        yield* Effect.logWarning(error.message)
        return yield* error
      }
      return yield* Deferred.await(yield* acquisition(release)).pipe(
        Effect.timeoutOrElse({
          duration: options.wait,
          orElse: () =>
            Effect.fail(
              unavailable(
                `ripgrep is still downloading after ${label(options.wait)}; try again shortly, or install ripgrep (rg) on PATH`,
                true,
              ),
            ),
        }),
      )
    })

    return Service.of({
      filepath: Effect.suspend(() =>
        state.resolved
          ? Effect.succeed(state.resolved)
          : locate.pipe(Effect.tap((resolved) => Effect.sync(() => (state.resolved = resolved)))),
      ),
    })
  })

  export const nodeWith = (overrides: Partial<Options> = {}) =>
    makeGlobalNode({
      service: Service,
      layer: Layer.effect(Service, make(overrides)),
      deps: [FSUtil.node, httpClient, CrossSpawnSpawner.node, EffectFlock.node],
    })

  export const node = nodeWith()
}
