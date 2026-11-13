import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, mkdir, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Cause, Deferred, Effect, Exit, Fiber, Option, Schema, Stream } from "effect"
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process"
import { AppNodeBuilder } from "../src/effect/app-node-builder"
import { AppProcess } from "../src/process"
import { expectSpawn } from "./fixture/omni-expect"

const layer = AppNodeBuilder.build(AppProcess.node)
const maxBytes = 64 * 1024
const Envelope = Schema.Struct({
  type: Schema.Literals(["EVAL_OK", "COMPILED_ENTRY", "CPU_ENTER", "CPU_DONE"]),
  pid: Schema.Number,
  bun: Schema.String,
  execPath: Schema.String,
  realExecPath: Schema.String,
  hostileEnv: Schema.Boolean,
  patternBytes: Schema.optionalKey(Schema.Number),
  subjectBytes: Schema.optionalKey(Schema.Number),
  value: Schema.optionalKey(Schema.Boolean),
})
const identity = String.raw`
const { realpathSync } = require("node:fs")
const identity = {
  pid: process.pid, bun: process.versions.bun, execPath: process.execPath,
  realExecPath: realpathSync(process.execPath), hostileEnv: process.env.E10_HOSTILE_DOTENV !== undefined,
}
`
const ordinaryScript = identity + String.raw`
process.stdout.write(JSON.stringify({ type: "EVAL_OK", ...identity }) + "\n")
`
const cpuScript = identity + String.raw`
const pattern = "^" + "(?=a+$)".repeat(2048) + "a+$"
const subject = "a".repeat(8 * 1024 * 1024)
const output = Bun.stdout.writer({ highWaterMark: 1 })
output.write(JSON.stringify({ type: "CPU_ENTER", ...identity,
  patternBytes: Buffer.byteLength(pattern), subjectBytes: Buffer.byteLength(subject) }) + "\n")
await output.flush()
const value = new RegExp(pattern).test(subject)
output.write(JSON.stringify({ type: "CPU_DONE", ...identity, value }) + "\n")
await output.flush()
`
const poisonConfig = 'preload = ["./preload.cjs"]\n'
const poisonEnv = "E10_HOSTILE_DOTENV=loaded\n"
const poisonPreload = String.raw`require("node:fs").writeFileSync(require("node:path").join(__dirname, "PRELOAD_LOADED"), "loaded"); process.stdout.write("UNEXPECTED_PRELOAD\n");`
const buildState: { directory?: string; executable?: string; manifest?: Record<string, unknown> } = {}

beforeAll(async () => {
  if (!process.env.RUNNER_OS) throw new Error("SETUP: hosted build required")
  buildState.directory = await realpath(await mkdtemp(path.join(tmpdir(), "e10-native-build-")))
  const packagePath = fileURLToPath(new URL("../../../apps/cli/package.json", import.meta.url))
  const packageBytes = await Bun.file(packagePath).text()
  const pkg = Schema.decodeUnknownSync(Schema.Struct({ version: Schema.String }))(
    Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(packageBytes),
  )
  if (!pkg.version) throw new Error("SETUP: CLI fixture version input is empty")
  const executable = path.join(buildState.directory, `native-fixture${process.platform === "win32" ? ".exe" : ""}`)
  const compile = {
    autoloadBunfig: false,
    autoloadDotenv: false,
    autoloadTsconfig: true,
    autoloadPackageJson: true,
    target: compileTarget(),
    outfile: executable,
    execArgv: [`--user-agent=orchestra/${pkg.version}`, "--use-system-ca", "--"],
    windows: {},
  }
  const result = await Bun.build({
    entrypoints: [fileURLToPath(new URL("./fixture/codemode-native-process.js", import.meta.url))],
    target: "bun",
    compile,
  })
  if (!result.success || !(await Bun.file(executable).exists())) throw new Error("SETUP: compiled fixture unavailable")
  buildState.executable = await realpath(executable)
  // This supplies the build's version input; it does not evaluate Script's release policy.
  buildState.manifest = {
    fixtureVersionInput: pkg.version,
    sourcePackageBlob: { path: "apps/cli/package.json", sha256: new Bun.CryptoHasher("sha256").update(packageBytes).digest("hex") },
    compile,
    executableSha256: new Bun.CryptoHasher("sha256").update(await Bun.file(executable).arrayBuffer()).digest("hex"),
  }
  await Bun.write(path.join(buildState.directory, "manifest.json"), JSON.stringify(buildState.manifest, null, 2))
  console.log(`E10_HARDENED_BUILD ${JSON.stringify(buildState.manifest)}`)
}, 120_000)

afterAll(async () => {
  if (buildState.directory) await rm(buildState.directory, { recursive: true, force: true })
})

const cases = [
  { name: "CONTROL hardened: source Bun constant eval", artifact: "source", cpu: false, entry: false },
  { name: "CONTROL hardened: compiled normal entry identity", artifact: "compiled", cpu: false, entry: true },
  { name: "CONTROL hardened: compiled Bun constant eval", artifact: "compiled", cpu: false, entry: false },
  { name: "CPU capability: source Bun native regex owned exit", artifact: "source", cpu: true, entry: false },
  { name: "CPU capability: compiled Bun native regex owned exit", artifact: "compiled", cpu: true, entry: false },
]

cases.forEach((scenario) => test(scenario.name, async () => {
  expectSpawn(import.meta.path)
  const root = await realpath(await mkdtemp(path.join(tmpdir(), "e10-native-case-")))
  const parent = path.join(root, "parent")
  const cwd = path.join(parent, "run")
  const config = path.join(root, "empty.toml")
  const executable = scenario.artifact === "source" ? await realpath(process.execPath) : buildState.executable
  try {
    if (!executable) throw new Error("SETUP: compiled artifact missing")
    await mkdir(cwd, { recursive: true })
    await Bun.write(config, "")
    await Promise.all([parent, cwd].flatMap((directory) => [
      Bun.write(path.join(directory, ".env"), poisonEnv),
      Bun.write(path.join(directory, "bunfig.toml"), poisonConfig),
      Bun.write(path.join(directory, "preload.cjs"), poisonPreload),
    ]))
    expect(await Bun.file(config).exists()).toBe(true)
    expect(Bun.file(config).size).toBe(0)
    for (const directory of [parent, cwd]) {
      expect(await Bun.file(path.join(directory, ".env")).text()).toBe(poisonEnv)
      expect(await Bun.file(path.join(directory, "bunfig.toml")).text()).toBe(poisonConfig)
      expect(await Bun.file(path.join(directory, "preload.cjs")).text()).toBe(poisonPreload)
      expect(await Bun.file(path.join(directory, "PRELOAD_LOADED")).exists()).toBe(false)
    }
    const env = {
      ...Object.fromEntries(Object.entries(process.env).filter(([name, value]) =>
        value !== undefined && process.platform === "win32" && ["SYSTEMROOT", "WINDIR"].includes(name.toUpperCase()))),
      ...(scenario.entry ? {} : { BUN_BE_BUN: "1" }),
    }
    console.log(`E10_HARDENED_SETUP ${JSON.stringify({ scenario: scenario.name, plantedDirectories: 2,
      canaries: { env: 2, config: 2, preload: 2 }, emptyConfig: true,
      envKeys: Object.keys(env), fixtureVersionInput: buildState.manifest?.fixtureVersionInput })}`)
    const observed = await Effect.runPromise(Effect.gen(function* () {
      const harnessScope = yield* Effect.scope
      const admitted = yield* Deferred.make<number>()
      const control: { admittedAt?: number; kill?: Effect.Effect<void, unknown> } = {}
      const state = {
        bytes: 0, pending: "", invalidOutput: false, overflow: false,
        enterMs: undefined as number | undefined, killMs: undefined as number | undefined,
        killJoinedMs: undefined as number | undefined, exitMs: undefined as number | undefined,
        liveBeforeKill: undefined as boolean | undefined, osAliveBeforeKill: undefined as boolean | undefined,
        outerWatchdog: false,
        heartbeats: 0, lastHeartbeat: 0, maxGapMs: 0,
      }
      // These belong to the outer harness: inner child/layer finalization must not stop either observer.
      const heartbeat = yield* Effect.forkIn(Effect.forever(Effect.sleep(50).pipe(Effect.andThen(Effect.sync(() => {
        if (state.enterMs === undefined) return
        const now = performance.now()
        state.heartbeats++
        state.maxGapMs = Math.max(state.maxGapMs, now - state.lastHeartbeat)
        state.lastHeartbeat = now
      })))), harnessScope)
      const containment = yield* Effect.forkIn(Effect.gen(function* () {
        const admittedAt = yield* Deferred.await(admitted)
        yield* waitUntil(admittedAt + 8000)
        state.outerWatchdog = true
        if (control.kill) yield* control.kill
      }), harnessScope)
      const result = yield* Effect.gen(function* () {
        const processes = yield* AppProcess.Service
        const admittedAt = performance.now()
        control.admittedAt = admittedAt
        state.lastHeartbeat = admittedAt
        Deferred.doneUnsafe(admitted, Effect.succeed(admittedAt))
        const child = yield* processes.spawn(ChildProcess.make(executable, scenario.entry ? [] : [
          "--no-env-file", `--config=${config}`, "-e", scenario.cpu ? cpuScript : ordinaryScript,
        ], { cwd, env, extendEnv: false, shell: false, stdin: "ignore", stdout: "pipe", stderr: "pipe",
          killSignal: "SIGKILL", forceKillAfter: 0 }))
        control.kill = child.kill({ killSignal: "SIGKILL", forceKillAfter: 0 })
        const messages = new Array<typeof Envelope.Type>()
        const decoder = new TextDecoder()
        const output = yield* Effect.forkChild(child.stdout.pipe(Stream.runForEach((chunk) => Effect.sync(() => {
          state.bytes += chunk.length
          if (state.bytes > maxBytes) { state.overflow = true; return }
          const lines = (state.pending + decoder.decode(chunk, { stream: true })).split("\n")
          state.pending = lines.pop() ?? ""
          lines.filter(Boolean).forEach((line) => {
            const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(line)
            const decoded = Option.flatMap(json, Schema.decodeUnknownOption(Envelope))
            if (Option.isNone(decoded) || messages.length >= 4) { state.invalidOutput = true; return }
            messages.push(decoded.value)
            if (decoded.value.type === "CPU_ENTER" && state.enterMs === undefined) {
              const now = performance.now()
              state.enterMs = now - admittedAt
              state.maxGapMs = Math.max(state.maxGapMs, now - state.lastHeartbeat)
              state.lastHeartbeat = now
            }
          })
        }))))
        const errors = yield* Effect.forkChild(AppProcess.collectStream(child.stderr, maxBytes))
        const exited = yield* Effect.forkChild(Effect.exit(child.exitCode).pipe(Effect.tap(() => Effect.sync(() => {
          state.exitMs = performance.now() - admittedAt
        }))))
        const productKill = yield* Effect.forkChild(scenario.cpu ? Effect.gen(function* () {
          yield* waitUntil(admittedAt + 1500)
          state.liveBeforeKill = yield* child.isRunning
          state.osAliveBeforeKill = osPidIsAlive(Number(child.pid))
          if (!state.liveBeforeKill) return
          state.killMs = performance.now() - admittedAt
          yield* child.kill({ killSignal: "SIGKILL", forceKillAfter: 0 })
          state.killJoinedMs = performance.now() - admittedAt
        }) : Effect.void)
        const [exit, , stderr] = yield* Effect.all([Fiber.join(exited), Fiber.join(output), Fiber.join(errors)], { concurrency: "unbounded" })
        const readersJoinedMs = performance.now() - admittedAt
        const osAliveAfterExit = osPidIsAlive(Number(child.pid))
        yield* Fiber.join(productKill)
        const joinedMs = performance.now() - admittedAt
        const runningAfter = yield* child.isRunning
        const terminal = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
        return { state, messages, stderr, exit, pid: Number(child.pid), joinedMs, readersJoinedMs, runningAfter, osAliveAfterExit,
          terminalKind: terminal instanceof Error ? terminal.name : terminal === undefined ? null : typeof terminal }
      }).pipe(Effect.scoped, Effect.provide(layer, { local: true }))
      if (control.admittedAt === undefined) throw new Error("SETUP: missing spawn admission timestamp")
      const fullScopeEndMs = performance.now() - control.admittedAt
      const osAliveAfterScope = osPidIsAlive(result.pid)
      const deadline = control.admittedAt + 3000
      let finalOSAlive = osAliveAfterScope
      let pidPolls = 0
      while (finalOSAlive && performance.now() < deadline) {
        yield* Effect.sleep(Math.max(0, Math.min(10, deadline - performance.now())))
        finalOSAlive = osPidIsAlive(result.pid)
        pidPolls++
      }
      const finalOSDeadTimeMs = finalOSAlive ? undefined : performance.now() - control.admittedAt
      yield* Fiber.interrupt(containment)
      yield* Fiber.interrupt(heartbeat)
      return { ...result, fullScopeEndMs, osAliveAfterScope, finalOSAlive, finalOSDeadTimeMs, pidPolls,
        admittedAt: control.admittedAt }
    }).pipe(Effect.scoped))
    const finalObservedAt = performance.now()
    const finalObservationMs = finalObservedAt - observed.admittedAt
    if (observed.state.enterMs !== undefined) {
      observed.state.maxGapMs = Math.max(observed.state.maxGapMs, finalObservedAt - observed.state.lastHeartbeat)
    }
    console.log(`E10_HARDENED_WITNESS ${JSON.stringify({ scenario: scenario.name, pid: observed.pid,
      records: observed.messages, ...observed.state, pending: observed.state.pending.length,
      exitCode: Exit.isSuccess(observed.exit) ? Number(observed.exit.value) : null,
      observedSignal: null, requestedSignal: scenario.cpu ? "SIGKILL" : null,
      terminalKind: observed.terminalKind, joinedMs: observed.joinedMs, runningAfter: observed.runningAfter,
      osAliveAfterExit: observed.osAliveAfterExit, readersJoinedMs: observed.readersJoinedMs,
      fullScopeEndMs: observed.fullScopeEndMs, osAliveAfterScope: observed.osAliveAfterScope,
      finalOSAlive: observed.finalOSAlive, finalOSDeadTimeMs: observed.finalOSDeadTimeMs,
      pidPolls: observed.pidPolls, finalObservationMs,
      stderrBytes: observed.stderr.buffer.length, stderrTruncated: observed.stderr.truncated })}`)
    const message = observed.messages[0]
    if (!message) throw new Error("CAPABILITY: expected child identity record was not produced")
    if (message.type !== (scenario.cpu ? "CPU_ENTER" : scenario.entry ? "COMPILED_ENTRY" : "EVAL_OK")) {
      throw new Error("CAPABILITY: requested invocation did not run the expected fixed script")
    }
    if (scenario.cpu && (observed.state.enterMs === undefined || observed.state.enterMs >= 750)) {
      throw new Error("SETUP: native CPU phase was not admitted with at least 750ms remaining")
    }
    expect(observed.state.overflow).toBe(false)
    expect(observed.state.invalidOutput).toBe(false)
    expect(observed.state.pending).toBe("")
    expect(observed.stderr.buffer.length).toBe(0)
    expect(observed.stderr.truncated).toBe(false)
    expect(observed.runningAfter).toBe(false)
    expect(observed.finalOSAlive).toBe(false)
    expect(observed.state.outerWatchdog).toBe(false)
    expect(observed.messages).toHaveLength(1)
    expect(message.pid).toBe(observed.pid)
    expect(message.bun).toBe("1.3.14")
    expect(message.hostileEnv).toBe(false)
    expect(await realpath(message.execPath)).toBe(executable)
    expect(message.realExecPath).toBe(executable)
    if (!scenario.cpu) {
      expect(message.type).toBe(scenario.entry ? "COMPILED_ENTRY" : "EVAL_OK")
      expect(Exit.isSuccess(observed.exit)).toBe(true)
      if (Exit.isFailure(observed.exit)) throw new Error("CAPABILITY: ordinary child failed")
      expect(observed.exit.value).toBe(ChildProcessSpawner.ExitCode(0))
      return
    }
    expect(observed.messages.some((record) => record.type === "CPU_DONE")).toBe(false)
    expect(message.patternBytes).toBe(14340)
    expect(message.subjectBytes).toBe(8 * 1024 * 1024)
    expect(observed.state.liveBeforeKill).toBe(true)
    expect(observed.state.osAliveBeforeKill).toBe(true)
    expect(observed.state.killMs).toBeDefined()
    expect(observed.state.killMs).toBeGreaterThanOrEqual(1500)
    expect(observed.state.killJoinedMs).toBeDefined()
    expect(observed.state.killJoinedMs).toBeLessThan(3000)
    expect(observed.state.exitMs).toBeDefined()
    expect(observed.state.exitMs).toBeLessThan(3000)
    expect(observed.joinedMs).toBeLessThan(3000)
    expect(observed.readersJoinedMs).toBeLessThan(3000)
    expect(observed.fullScopeEndMs).toBeLessThan(3000)
    expect(observed.finalOSDeadTimeMs).toBeDefined()
    expect(observed.finalOSDeadTimeMs).toBeLessThan(3000)
    expect(finalObservationMs).toBeLessThan(3000)
    expect(observed.state.heartbeats).toBeGreaterThanOrEqual(3)
    expect(observed.state.maxGapMs).toBeLessThan(750)
  } finally {
    try {
      // Observe planted files before removing scratch, including assertion/child failure paths.
      for (const directory of [parent, cwd]) {
        expect(await Bun.file(path.join(directory, "PRELOAD_LOADED")).exists()).toBe(false)
      }
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  }
}, 45_000))

function compileTarget(): Bun.Build.CompileTarget {
  if (process.platform === "linux" && process.arch === "x64") return "bun-linux-x64"
  if (process.platform === "linux" && process.arch === "arm64") return "bun-linux-arm64"
  if (process.platform === "win32" && process.arch === "x64") return "bun-windows-x64"
  if (process.platform === "win32" && process.arch === "arm64") return "bun-windows-arm64"
  if (process.platform === "darwin" && process.arch === "x64") return "bun-darwin-x64"
  if (process.platform === "darwin" && process.arch === "arm64") return "bun-darwin-arm64"
  throw new Error("SETUP: this capability gate supports hosted Linux/Windows/macOS only")
}

function waitUntil(deadline: number): Effect.Effect<void> {
  return Effect.suspend(() => {
    const remaining = deadline - performance.now()
    return remaining > 0 ? Effect.sleep(Math.ceil(remaining)).pipe(Effect.andThen(() => waitUntil(deadline))) : Effect.void
  })
}

function osPidIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ESRCH") return false
    throw error
  }
}
