import { expect } from "bun:test"
import path from "path"
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { Effect, Exit, Fiber } from "effect"
import { BackendToolkit } from "../src/backend-toolkit"
import { BackendToolkitManifest } from "../src/backend-toolkit/manifest"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { Omni } from "../src/omni"
import { PinnedArtifact } from "../src/pinned-artifact"
import { it } from "./lib/effect"
import { alive, reap, sweep, tree } from "./fixture/process-tree"

type Config = {
  exitCode?: number
  output?: "stdout" | "stderr"
  mib?: number
  waitFile?: string
  treeArgs?: string[]
  stopping?: string
}

// A real Bun interpreter executes the fixture npm CLI on both OSes; no service or process result is mocked.
const fixture = Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "backend-toolkit-process-")))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )
  const host = BackendToolkitTarget.detect()
  if (!("target" in host)) throw new Error(`BLOCKED: test host has no toolkit target: ${host.unsupported}`)
  const home = path.join(root, "runtimes", "node", `fixture-${host.target}`)
  const windows = process.platform === "win32"
  yield* Effect.promise(async () => {
    await mkdir(path.join(home, "bin"), { recursive: true })
    await copyFile(process.execPath, path.join(home, "bin", windows ? "node.exe" : "node"))
    const npm = path.join(home, windows ? "bin" : "lib", "node_modules", "npm", "bin")
    await mkdir(npm, { recursive: true })
    await writeFile(
      path.join(npm, "npm-cli.js"),
      `
const { writeFileSync, readFileSync, appendFileSync, existsSync } = require("node:fs")
const path = require("node:path")
const config = JSON.parse(readFileSync("package.json", "utf8"))
writeFileSync(path.join(process.env.npm_config_cache, "..", "call.json"), JSON.stringify({
  cwd: process.cwd(), argv: process.argv.slice(2), cache: process.env.npm_config_cache, pid: process.pid,
  notifier: process.env.npm_config_update_notifier, inherited: process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER,
}))
appendFileSync(path.join(process.env.npm_config_cache, "..", "starts.log"), process.pid + "\\n")
if (config.output) {
  const fd = config.output === "stdout" ? 1 : 2
  const chunk = Buffer.alloc(1024 * 1024, 120)
  for (let i = 0; i < config.mib; i++) require("node:fs").writeSync(fd, chunk)
}
if (config.treeArgs) {
  if (config.stopping) process.on("SIGTERM", () => {
    writeFileSync(config.stopping, "")
    setTimeout(() => process.exit(0), 1000)
  })
  const child = require("node:child_process").spawn(process.execPath, config.treeArgs, { stdio: ["ignore", "inherit", "inherit"] })
  child.once("exit", () => process.exit(0))
  setInterval(() => {}, 1 << 30)
} else if (config.waitFile) {
  const poll = () => existsSync(config.waitFile) ? process.exit(0) : setTimeout(poll, 25)
  poll()
} else process.exit(config.exitCode ?? 0)
`,
    )
    await writeFile(path.join(home, ".complete"), "")
    await mkdir(path.join(root, "cache"), { recursive: true })
  })
  const pin = {
    ...BackendToolkitManifest.RUNTIMES.node.targets[host.target],
    executable: path.join("bin", windows ? "node.exe" : "node"),
  }
  const runtime = {
    ...BackendToolkitManifest.RUNTIMES.node,
    version: "fixture",
    targets: { "darwin-arm64": pin, "darwin-x64": pin, "linux-arm64": pin, "linux-x64": pin, "win32-x64": pin },
  }
  const engine = (config: Config): BackendToolkitManifest.HostedEngine => ({
    ...BackendToolkitManifest.ENGINES.orval,
    runtime: "node",
    version: "fixture",
    install: { kind: "npm", packageJson: JSON.stringify(config), lock: "{}" },
    launch: [],
  })
  const directory = path.join(root, "engines", "orval", `fixture-${host.target}`)
  const install = (config: Config) =>
    BackendToolkit.ensure("orval").pipe(
      Effect.provideService(BackendToolkit.Root, root),
      Effect.provideService(BackendToolkit.Target, host),
      Effect.provideService(BackendToolkit.Runtimes, { ...BackendToolkitManifest.RUNTIMES, node: runtime }),
      Effect.provideService(BackendToolkit.Manifest, {
        ...BackendToolkitManifest.ENGINES,
        orval: engine(config),
      }),
    )
  return {
    root,
    directory,
    install,
    worker: (config: Config) => BackendToolkit.hosted(root, engine(config), runtime, directory, host.target, true),
  }
})

async function until(check: () => Promise<boolean>) {
  const deadline = Date.now() + 20_000
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error("condition not reached within the bound")
    await Bun.sleep(25)
  }
}

it.live(
  "toolkit install runs through Omni with staging cwd, inherited env and npm overrides",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const before = Omni.snapshot()
      yield* f.install({ output: "stdout", mib: 64 })
      if (process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "1") {
        expect(Omni.snapshot().spawns).toBeGreaterThan(before.spawns)
        expect(Omni.snapshot().delegations).toBe(before.delegations)
      }
      const call = yield* Effect.promise(() => Bun.file(path.join(f.root, "cache", "call.json")).json())
      expect(call.cwd).toStartWith(path.join(f.root, "engines", "orval", ".staging-"))
      expect(call.argv).toEqual(["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--offline=false"])
      expect(call.cache).toBe(path.join(f.root, "cache", "npm"))
      expect(call.notifier).toBe("false")
      expect(call.inherited).toBe(process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER)
      expect(yield* PinnedArtifact.installed(f.directory)).toBe(true)
      expect(yield* Effect.promise(() => readFile(path.join(f.directory, "package-lock.json"), "utf8"))).toBe("{}")
    }),
  120_000,
)

it.live(
  "a nonzero npm exit fails instead of publishing a completed install",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      expect(
        yield* f.install({ exitCode: 3 }).pipe(
          Effect.flip,
          Effect.map((error) => error.reason),
        ),
      ).toBe("toolkit-not-ready:failed:orval:install:npm")
      expect(yield* PinnedArtifact.installed(f.directory)).toBe(false)
      expect(yield* Effect.promise(() => readdir(path.dirname(f.directory)))).toEqual([])
    }),
  30_000,
)
;(["stdout", "stderr"] as const).forEach((output) => {
  it.live(
    `a zero-exit npm install exceeding 64 MiB on ${output} fails and removes staging`,
    () =>
      Effect.gen(function* () {
        const f = yield* fixture
        expect(
          yield* f.install({ output, mib: 65 }).pipe(
            Effect.flip,
            Effect.map((error) => error.reason),
          ),
        ).toBe("toolkit-not-ready:failed:orval:install:npm")
        expect(yield* PinnedArtifact.installed(f.directory)).toBe(false)
        expect(yield* Effect.promise(() => readdir(path.dirname(f.directory)))).toEqual([])
      }),
    120_000,
  )
})

it.live(
  "canceling one shared toolkit waiter leaves the other waiter and one install running",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const gate = path.join(f.root, "release")
      const first = yield* f.install({ waitFile: gate }).pipe(Effect.forkScoped)
      yield* Effect.promise(() => until(() => Bun.file(path.join(f.root, "cache", "call.json")).exists()))
      const second = yield* f.install({ waitFile: gate }).pipe(Effect.forkScoped)
      yield* Fiber.interrupt(first)
      expect(Exit.isFailure(yield* Fiber.await(first))).toBe(true)
      expect(yield* PinnedArtifact.installed(f.directory)).toBe(false)
      yield* Effect.promise(() => writeFile(gate, ""))
      yield* Fiber.join(second).pipe(Effect.timeout("20 seconds"))
      expect(yield* PinnedArtifact.installed(f.directory)).toBe(true)
      expect(
        (yield* Effect.promise(() => readFile(path.join(f.root, "cache", "starts.log"), "utf8"))).trim().split("\n"),
      ).toHaveLength(1)
    }),
  60_000,
)

it.live(
  "interrupting a direct PinnedArtifact populated-command worker stops its nonce tree before staging cleanup",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      const processTree = yield* Effect.acquireRelease(
        Effect.sync(() => tree(0)),
        (processTree) =>
          Effect.promise(async () => {
            await reap(processTree.nonce)
            await rm(path.join(tmpdir(), processTree.nonce), { recursive: true, force: true })
          }),
      )
      const stopping = path.join(f.root, "stopping")
      const worker = yield* f
        .worker({
          treeArgs: [
            "-e",
            `process.on("SIGTERM", () => setTimeout(() => process.exit(0), 1000)); ${processTree.args[1]}`,
            ...processTree.args.slice(2),
          ],
          stopping,
        })
        .pipe(Effect.forkScoped)
      yield* Effect.promise(() => until(async () => (await alive(processTree.nonce)) === processTree.size))
      // Calibrate the independent nonce sweep while the child is known alive.
      expect((yield* Effect.promise(() => sweep(processTree.nonce))).length).toBe(processTree.size)
      const interrupted = yield* Fiber.interrupt(worker).pipe(Effect.forkScoped)
      if (process.platform !== "win32") {
        yield* Effect.promise(() => until(() => Bun.file(stopping).exists()))
        const call = yield* Effect.promise(() => Bun.file(path.join(f.root, "cache", "call.json")).json())
        expect((yield* Effect.promise(() => stat(call.cwd))).isDirectory()).toBe(true)
      }
      yield* Fiber.join(interrupted)
      expect(Exit.isFailure(yield* Fiber.await(worker))).toBe(true)
      expect(yield* Effect.promise(() => alive(processTree.nonce))).toBe(0)
      expect(yield* Effect.promise(() => sweep(processTree.nonce))).toEqual([])
      expect(yield* PinnedArtifact.installed(f.directory)).toBe(false)
      expect(yield* Effect.promise(() => readdir(path.dirname(f.directory)))).toEqual([])
    }),
  60_000,
)

it.live(
  "a missing Omni addon settles shared startup failure and never leaves an engine fetching",
  () =>
    Effect.gen(function* () {
      const f = yield* fixture
      // Separate loader/process: an intentional zero-spawn startup failure must not trip the parent run's positive control.
      const child = Bun.spawn(
        [
          process.execPath,
          "-e",
          `
const { Effect } = await import(${JSON.stringify(import.meta.resolve("effect"))})
const { createHash } = await import("node:crypto")
const { BackendToolkit } = await import(${JSON.stringify(new URL("../src/backend-toolkit/index.ts", import.meta.url).href)})
const { BackendToolkitManifest } = await import(${JSON.stringify(new URL("../src/backend-toolkit/manifest.ts", import.meta.url).href)})
const { BackendToolkitTarget } = await import(${JSON.stringify(new URL("../src/backend-toolkit/target.ts", import.meta.url).href)})
const bytes = Buffer.from("digest-valid but irrelevant: startup fails before extraction")
let hits = 0
const server = Bun.serve({ port: 0, fetch() { hits++; return new Response(bytes) } })
const pin = { executable: "tool", artifact: { url: server.url + "tool.tgz", integrity: "sha256-" + createHash("sha256").update(bytes).digest("base64"), format: "tar.gz", entries: [{ from: "tool", to: "tool" }] } }
const scoped = (effect) => effect.pipe(
  Effect.provideService(BackendToolkit.Root, ${JSON.stringify(f.root)}),
  Effect.provideService(BackendToolkit.Target, BackendToolkitTarget.detect()),
  Effect.provideService(BackendToolkit.Manifest, { ...BackendToolkitManifest.ENGINES, sqlc: { ...BackendToolkitManifest.ENGINES.sqlc, targets: Object.fromEntries(BackendToolkitTarget.TARGETS.map(target => [target, pin])) } }),
)
const need = () => Effect.runPromise(scoped(BackendToolkit.ensure("sqlc")).pipe(Effect.timeout("3 seconds"), Effect.match({ onSuccess: () => ({ tag: "success" }), onFailure: error => ({ tag: error._tag, reason: error.reason }) })))
const first = await need()
const second = await need()
const state = await Effect.runPromise(scoped(BackendToolkit.status("sqlc")))
console.log(JSON.stringify({ first, second, state, hits }))
await server.stop(true)
`,
        ],
        {
          cwd: f.root,
          env: {
            ...process.env,
            ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "1",
            HUGR_OMNI_ADDON: path.join(f.root, "missing-addon.node"),
          },
          stdout: "pipe",
          stderr: "pipe",
          timeout: 20_000,
        },
      )
      const [stdout, stderr, code] = yield* Effect.promise(() =>
        Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]),
      )
      expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
      const report = JSON.parse(stdout.trim())
      expect(report.first.tag).toBe("BackendToolkit.NotReady")
      expect(report.first.reason).toContain("toolkit-not-ready:failed:sqlc:defect:")
      expect(report.first.reason).toContain("missing-addon.node")
      expect(report.second).toEqual(report.first)
      expect(report.state[0].status).toBe("failed")
      expect(report.hits).toBe(1)
    }),
  60_000,
)
