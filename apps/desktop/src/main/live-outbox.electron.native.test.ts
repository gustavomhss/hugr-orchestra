import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { createReadStream, existsSync } from "node:fs"
import { lstat, mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { builtinModules, createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { Effect, Fiber, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { AppProcess, collectStream } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { electronInstallScript } from "../../scripts/install-electron"

const it = testEffect(LayerNode.compile(AppProcess.node))
const reportSchema = Schema.Struct({ kind: Schema.Literal("live-outbox-electron-capability"), pid: Schema.Number, ppid: Schema.Number, processType: Schema.Literal("browser"), electron: Schema.String, node: Schema.String, sqlite: Schema.String, runtimeSQLite: Schema.optional(Schema.String), userData: Schema.String, profileID: Schema.String, reopenedProfileID: Schema.String, recordID: Schema.String, segmentID: Schema.String, batchIDs: Schema.Array(Schema.String), pendingCount: Schema.Number, rememberedCount: Schema.Number, segmentDigest: Schema.String, integrity: Schema.Literal("ok"), storeBundleHash: Schema.String, mainBundleHash: Schema.String })
const hash = async (file: string) => {
  const digest = createHash("sha256")
  for await (const chunk of createReadStream(file)) digest.update(chunk)
  return digest.digest("hex")
}

it.live("actual Electron main reopens the real outbox with stable pending IDs and SQLite integrity", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  if (!process.env.CI || !process.env.RUNNER_OS) return yield* Effect.die("Electron capability is hosted only")
  const node = Bun.which("node")
  if (!node) return yield* Effect.die("Hosted Node installer executable missing")
  const proc = yield* AppProcess.Service
  const proof = yield* Effect.scoped(Effect.gen(function* () {
    const root = yield* Effect.acquireRelease(Effect.promise(() => mkdtemp(join(tmpdir(), "live-outbox-electron-"))), (root) => Effect.promise(() => rm(root, { recursive: true, force: true })))
    const profile = join(root, "profile"), home = join(root, "home")
    yield* Effect.promise(() => Promise.all([profile, home, ...["state", "config", "cache", "appdata", "localappdata", "tmp"].map((name) => join(root, name))].map((path) => mkdir(path, { recursive: true }))))
    const electronDirectory = dirname(createRequire(import.meta.url).resolve("electron/package.json"))
    const packageFile = join(electronDirectory, "package.json")
    const pkg = Schema.decodeUnknownSync(Schema.Struct({ version: Schema.Literal("42.11.16") }))(yield* Effect.promise(() => Bun.file(packageFile).json()))
    expect(pkg.version).toBe("42.11.16")
    const installer = yield* Effect.promise(() => electronInstallScript(electronDirectory))
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(ELECTRON_|ORCHESTRA_|LIVE_OUTBOX_ELECTRON_|NODE_OPTIONS$|NODE_PATH$|HOME$|USERPROFILE$|APPDATA$|LOCALAPPDATA$|XDG_|TMPDIR$|TMP$|TEMP$)/.test(key))),
      HOME: home, USERPROFILE: home, APPDATA: join(root, "appdata"), LOCALAPPDATA: join(root, "localappdata"), XDG_STATE_HOME: join(root, "state"), XDG_CONFIG_HOME: join(root, "config"), XDG_DATA_HOME: home, XDG_CACHE_HOME: join(root, "cache"), TMPDIR: join(root, "tmp"), TMP: join(root, "tmp"), TEMP: join(root, "tmp"), LIVE_OUTBOX_ELECTRON_ROOT: root, LIVE_OUTBOX_ELECTRON_VERSION: pkg.version }
    const installerStarted = performance.now()
    const installed = yield* proc.run(ChildProcess.make(node, [installer], { cwd: root, env, extendEnv: false, stdin: "ignore", stdout: "pipe", stderr: "pipe" }), { timeout: "180 seconds", maxOutputBytes: 65536, maxErrorBytes: 65536 })
    const installerMs = performance.now() - installerStarted
    expect(installed.stdoutTruncated).toBe(false); expect(installed.stderrTruncated).toBe(false)
    expect(installed.exitCode, installed.stderr.toString("utf8")).toBe(0)
    const electron = join(electronDirectory, "dist", (yield* Effect.promise(() => readFile(join(electronDirectory, "path.txt"), "utf8"))).trim())
    expect((yield* Effect.promise(() => lstat(electron))).isFile()).toBe(true)
    expect((yield* Effect.promise(() => readFile(join(electronDirectory, "dist/version"), "utf8"))).trim()).toBe(pkg.version)
    const sources = { store: join(import.meta.dir, "live-outbox.ts"), fixture: join(import.meta.dir, "live-outbox.electron.fixture.ts"), contract: join(import.meta.dir, "live-outbox-contract.ts") }
    const sourceHashes = yield* Effect.promise(async () => Object.fromEntries(await Promise.all(Object.entries(sources).map(async ([name, file]) => [name, await hash(file)]))))
    const external = [...new Set(["electron", "node:sqlite", ...builtinModules.flatMap((name) => [name, name.startsWith("node:") ? name : `node:${name}`])])]
    const buildStarted = performance.now()
    yield* Effect.promise(async () => {
      for (const [entry, naming] of [[sources.store, "store.cjs"], [sources.fixture, "main.cjs"]] as const) {
        const build = await Bun.build({ entrypoints: [entry], outdir: root, naming, target: "node", format: "cjs", external, write: true })
        expect(build.success, build.logs.map(String).join("\n")).toBe(true)
      }
    })
    const buildMs = performance.now() - buildStarted
    const executableHash = yield* Effect.promise(() => hash(electron))
    const bundles = { store: yield* Effect.promise(() => hash(join(root, "store.cjs"))), main: yield* Effect.promise(() => hash(join(root, "main.cjs"))) }
    const xvfbLog = join(root, "xvfb.log"), command = process.platform === "linux" ? "xvfb-run" : electron
    const args = [...(process.platform === "linux" ? ["-a", "-e", xvfbLog, electron] : []), "--no-sandbox", join(root, "main.cjs")]
    const electronStarted = performance.now()
    const actual = yield* Effect.scoped(Effect.gen(function* () {
      const child = yield* proc.spawn(ChildProcess.make(command, args, { cwd: root, env, extendEnv: false, stdin: "ignore", stdout: "pipe", stderr: "pipe" }))
      const output = yield* collectStream(child.stdout, 65536).pipe(Effect.forkChild)
      const errors = yield* collectStream(child.stderr, 65536).pipe(Effect.forkChild)
      return yield* Effect.gen(function* () {
        const exitCode = yield* child.exitCode
        const stdout = yield* Fiber.join(output), stderr = yield* Fiber.join(errors)
        expect(stdout.truncated).toBe(false); expect(stderr.truncated).toBe(false)
        expect(stdout.buffer.byteLength).toBeLessThanOrEqual(65536); expect(stderr.buffer.byteLength).toBeLessThanOrEqual(65536)
        expect(exitCode, [stdout.buffer.toString("utf8"), stderr.buffer.toString("utf8")].join("\n")).toBe(0)
        expect(yield* child.isRunning).toBe(false)
        const records = stdout.buffer.toString("utf8").split(/\r?\n/).filter((line) => line.startsWith("live-outbox-electron-proof:"))
        expect(records.length).toBe(1)
        const report = Schema.decodeUnknownSync(reportSchema)(JSON.parse(records[0]!.slice("live-outbox-electron-proof:".length)))
        const direct = report.pid === Number(child.pid)
        expect(process.platform === "linux" ? direct || report.ppid === Number(child.pid) : direct).toBe(true)
        return { report, ownedPID: Number(child.pid), binding: direct ? "direct-pid" : "immediate-wrapper-parent", stdoutBytes: stdout.buffer.byteLength, stderrBytes: stderr.buffer.byteLength }
      }).pipe(Effect.ensuring(
        child.isRunning.pipe(Effect.flatMap((running) => running ? child.kill({ forceKillAfter: "1 second" }) : Effect.void), Effect.andThen(child.isRunning), Effect.flatMap((running) => running ? Effect.die("Owned Electron fixture still running") : Effect.void), Effect.andThen(Fiber.await(output)), Effect.andThen(Fiber.await(errors)), Effect.timeout("3 seconds"), Effect.orDie),
      ))
    }).pipe(Effect.timeout("45 seconds")))
    const electronMs = performance.now() - electronStarted
    expect(actual.report.electron).toBe(pkg.version); expect(actual.report.node).toMatch(/^\d+\.\d+\.\d+$/); expect(actual.report.sqlite).toMatch(/^\d+\.\d+\.\d+$/)
    expect(actual.report.pid).toBeGreaterThan(0); expect(actual.report.userData).toBe(profile)
    expect(actual.report.profileID).toMatch(/^[0-9a-f-]{36}$/); expect(actual.report.reopenedProfileID).toBe(actual.report.profileID)
    expect(actual.report.recordID).toBe("00000000-0000-4000-8000-000000000001"); expect(actual.report.segmentID).toBe("00000000-0000-4000-8000-000000000002")
    expect(actual.report.pendingCount).toBe(1); expect(actual.report.rememberedCount).toBe(1); expect(actual.report.batchIDs).toEqual([actual.report.segmentID])
    const segment = { id: actual.report.segmentID, track: "me", text: "Electron SQLite retained café e\u0301", startMs: 0, endMs: 100 }
    expect(actual.report.segmentDigest).toBe(createHash("sha256").update(JSON.stringify(segment), "utf8").digest("hex"))
    expect(actual.report.storeBundleHash).toBe(bundles.store); expect(actual.report.mainBundleHash).toBe(bundles.main)
    expect(yield* Effect.promise(() => hash(join(root, "store.cjs")))).toBe(bundles.store); expect(yield* Effect.promise(() => hash(join(root, "main.cjs")))).toBe(bundles.main)
    for (const [name, file] of Object.entries(sources)) expect(yield* Effect.promise(() => hash(file))).toBe(sourceHashes[name])
    return { root, ...actual, sourceHashes, bundleHashes: bundles, executableHash, timings: { installerMs, buildMs, electronMs }, electronPackageHash: yield* Effect.promise(() => hash(packageFile)), installerHash: yield* Effect.promise(() => hash(installer)) }
  }))
  expect(existsSync(proof.root)).toBe(false)
  console.log(JSON.stringify({ kind: "live-outbox-electron-capability-parent", ...proof, root: undefined, profileRemoved: true }))
}), 240000)
