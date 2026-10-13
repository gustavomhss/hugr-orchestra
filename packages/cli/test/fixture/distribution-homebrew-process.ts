import { expect } from "bun:test"
import { lstat, mkdir, readFile, realpath } from "node:fs/promises"
import { join, resolve, sep } from "node:path"
import { Cause, Effect, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { command, successful } from "./distribution-native"
import type { Sandbox } from "./distribution-native"
import { privateCoreTap } from "./distribution-homebrew-core"

// Public brew commands only: streamed evidence must never include service stdout/passwords.
// Same AppProcess spawn/collect path as command(), with PID-scoped diagnostics before timeout.
export async function homebrewCommand(args: string[], box: Sandbox, artifacts: string, label: string,
  requests: () => unknown, preserve: () => void) {
  if (!args[0]?.endsWith("/bin/brew")) throw new Error("HOMEBREW_DIAGNOSTIC_COMMAND_REFUSED")
  const started = Date.now()
  const partial = { stdout: "", stderr: "" }
  const result = await Effect.runPromise(Effect.gen(function* () {
    const service = yield* AppProcess.Service
    const handle = yield* service.spawn(ChildProcess.make(args[0], args.slice(1), {
      cwd: box.cwd, env: box.env, extendEnv: false,
      stdin: "ignore", stdout: "pipe", stderr: "pipe", forceKillAfter: "2 seconds",
    }))
    console.info(`Homebrew command started: ${label} pid=${handle.pid}`)
    yield* Effect.forkScoped(Effect.gen(function* () {
      yield* Effect.sleep("30 seconds")
      const table = yield* Effect.promise(() => command([
        "/bin/ps", "-axo", "pid=,ppid=,pgid=,state=,wchan=,comm=",
      ], box, 10_000))
      if (table.code !== 0) throw new Error(`HOMEBREW_PROCESS_TABLE_FAILED: ${table.stderr}`)
      const rows = table.stdout.split("\n").filter((line) => line.trim())
      const parents = new Map(rows.map((line) => {
        const fields = line.trim().split(/\s+/)
        return [Number(fields[0]), Number(fields[1])] as const
      }))
      // Ruby's system_command starts children in new process groups; include ancestry too.
      const descendant = (pid: number): boolean => {
        const parent = parents.get(pid)
        return pid === handle.pid || (parent !== undefined && parent !== pid && descendant(parent))
      }
      const owned = rows.filter((line) => {
        const fields = line.trim().split(/\s+/)
        return descendant(Number(fields[0])) || Number(fields[2]) === handle.pid
      })
      console.info(`Homebrew active: ${JSON.stringify({ label, elapsed: Date.now() - started,
        processes: owned, requests: requests(), stdoutBytes: Buffer.byteLength(partial.stdout),
        stderrBytes: Buffer.byteLength(partial.stderr) })}`)
      // One native stack sample, while the owned Ruby process is still alive.
      if (Date.now() - started < 60_000 && owned.some((line) => Number(line.trim().split(/\s+/)[0]) === handle.pid)) {
        const file = join(artifacts, `${label}-sample.txt`)
        const sample = yield* Effect.promise(() => command([
          "/usr/bin/sample", String(handle.pid), "1", "1", "-file", file,
        ], box, 10_000))
        console.info(`Homebrew sample: code=${sample.code} ${sample.stderr}`)
        // Keep the full sample on disk; library images would bury command diagnostics in CI logs.
        if (sample.code === 0) console.info((yield* Effect.promise(() => readFile(file, "utf8")))
          .split("\nBinary Images:")[0])
      }
    }).pipe(Effect.forever, Effect.catchCause((cause) => Effect.sync(() => {
      console.error(`HOMEBREW_ACTIVE_DIAGNOSTIC_FAILED: ${Cause.pretty(cause)}`)
    }))))
    const capture = (stream: typeof handle.stdout, name: keyof typeof partial, limit: number) =>
      AppProcess.collectStream(stream.pipe(Stream.tap((chunk) => Effect.sync(() => {
        if (Buffer.byteLength(partial[name]) + chunk.length > limit)
          throw new Error(`HOMEBREW_OUTPUT_TRUNCATED: ${name}`)
        partial[name] += Buffer.from(chunk).toString("utf8")
        console.info(`Homebrew ${label} ${name}: ${Buffer.from(chunk).toString("utf8")}`)
      }))), limit)
    const [stdout, stderr, code] = yield* Effect.all([
      capture(handle.stdout, "stdout", 16 * 1024 * 1024),
      capture(handle.stderr, "stderr", 256 * 1024), handle.exitCode,
    ], { concurrency: "unbounded" })
    if (stdout.truncated || stderr.truncated) throw new Error("HOMEBREW_OUTPUT_TRUNCATED")
    return { code: Number(code), stdout: stdout.buffer.toString("utf8"), stderr: stderr.buffer.toString("utf8") }
  }).pipe(
    Effect.timeoutOrElse({ duration: "5 minutes",
      orElse: () => Effect.fail(new Error(`HOMEBREW_COMMAND_TIMEOUT: ${label}`)) }),
    Effect.provide(LayerNode.compile(AppProcess.node)), Effect.scoped,
    Effect.catchCause((cause) => Effect.sync(() => { preserve(); throw new Error(Cause.pretty(cause)) })),
    Effect.ensuring(Effect.promise(() => Bun.write(join(artifacts, `${label}-command.json`), JSON.stringify({
      args, elapsed: Date.now() - started, ...partial, requests: requests(),
    }, null, 2)))),
  ))
  return result
}

export async function privateBrew(box: Sandbox) {
  // HB-ISOLATION: original brew is queried only; all installation commands use clone.
  const original = Bun.which("brew")
  const git = Bun.which("git")
  if (!original || !git) throw new Error("HOMEBREW_INSTALLED_GIT_CHECKOUT_REQUIRED")
  // brew sources this outside HOME/XDG before reading fixture-local configuration.
  const systemConfig = await lstat("/etc/homebrew/brew.env").catch((error: unknown) => {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined
    throw new Error("HOMEBREW_SYSTEM_CONFIG_CHECK_FAILED", { cause: error })
  })
  if (systemConfig) throw new Error("HOMEBREW_SYSTEM_CONFIG_PREVENTS_ISOLATION")
  const controls = {
    HOMEBREW_NO_AUTO_UPDATE: "1", HOMEBREW_NO_INSTALL_CLEANUP: "1", HOMEBREW_NO_ANALYTICS: "1",
    HOMEBREW_NO_INSTALL_FROM_API: "1", HOMEBREW_NO_ENV_HINTS: "1", HOMEBREW_CURLRC: "0",
    HOMEBREW_DOWNLOAD_CONCURRENCY: "1", HOMEBREW_CURL_RETRIES: "0",
  }
  const discovery = { ...box, env: { ...box.env, ...controls } }
  const source = await realpath(await successful([original, "--repository"], discovery))
  const hostPrefix = await realpath(await successful([original, "--prefix"], discovery))
  expect(await realpath(await successful([git, "-C", source, "rev-parse", "--show-toplevel"], box))).toBe(source)
  const prefix = join(box.directory, "prefix")
  await successful([git, "clone", "--no-hardlinks", source, prefix], box, 180_000)
  // This revision includes upstream checksum-prefetch/retry fixes (#23717/#23719).
  // Runner images can contain older Homebrew; only the fixture clone is updated.
  const qualifiedRevision = "1220a4af7bdf66e2b5c2c970cf1191606972e009"
  await successful([git, "-C", prefix, "fetch", "--depth", "1", "https://github.com/Homebrew/brew.git", qualifiedRevision], box, 180_000)
  await successful([git, "-C", prefix, "checkout", "--detach", qualifiedRevision], box)
  const brew = join(prefix, "bin/brew")
  if (!((await lstat(brew)).mode & 0o111)) throw new Error("HOMEBREW_CLONED_LAUNCHER_NOT_EXECUTABLE")
  const artifacts = join(box.directory, "artifacts")
  await Promise.all(["brew-cache", "brew-logs", "brew-temp", "artifacts"].map((name) =>
    mkdir(join(box.directory, name), { recursive: true })))
  const env = {
    ...box.env, ...controls, PATH: `${join(prefix, "bin")}:/usr/bin:/bin:/usr/sbin:/sbin`,
    HOMEBREW_CACHE: join(box.directory, "brew-cache"), HOMEBREW_LOGS: join(box.directory, "brew-logs"),
    HOMEBREW_TEMP: join(box.directory, "brew-temp"), HOMEBREW_GIT_PATH: git,
  }
  const queryBox = { ...box, env }
  const reported = await Promise.all(["--prefix", "--cellar", "--repository"].map((flag) => command([brew, flag], queryBox)))
    .catch((cause: unknown) => { throw new Error("HOMEBREW_CUSTOM_PREFIX_UNSUPPORTED: private brew query failed", { cause }) })
  const expected = [prefix, join(prefix, "Cellar"), prefix]
  if (reported.some((result, index) => result.code !== 0 || resolve(result.stdout.trim()) !== expected[index]) ||
      prefix === hostPrefix || !prefix.startsWith((await realpath(box.directory)) + sep))
    throw new Error("HOMEBREW_CUSTOM_PREFIX_UNSUPPORTED: private prefix/Cellar/repository required")
  const cellar = expected[1]
  const tap = join(prefix, "Library/Taps/qualification/homebrew-native")
  await mkdir(join(tap, "Formula"), { recursive: true })
  await successful([git, "init", tap], queryBox)
  const revision = await successful([git, "-C", prefix, "rev-parse", "HEAD"], box)
  expect(revision).toBe(qualifiedRevision)
  console.info(`Homebrew cloned revision: ${revision}`)
  await Bun.write(join(artifacts, "brew-origin.json"), JSON.stringify({
    source, sourceRevision: await successful([git, "-C", source, "rev-parse", "HEAD"], box), revision, prefix, cellar,
  }, null, 2))
  // macOS upgrade resolves pkgconf even in an empty private Cellar. Preload its
  // official source so this lookup cannot trigger an unbounded full core clone.
  await privateCoreTap(prefix, git, queryBox, artifacts)
  return { prefix, cellar, brew, git, tap, env, artifacts, revision }
}
