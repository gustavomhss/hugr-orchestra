import { expect } from "bun:test"
import path from "path"
import { copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "fs/promises"
import { tmpdir } from "os"
import { Effect } from "effect"
import { BackendToolkit } from "../src/backend-toolkit"
import { BackendToolkitManifest } from "../src/backend-toolkit/manifest"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { Omni } from "../src/omni"
import { PinnedArtifact } from "../src/pinned-artifact"
import { it } from "./lib/effect"

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
    await writeFile(path.join(npm, "npm-cli.js"), `
const { writeFileSync, readFileSync } = require("node:fs")
const path = require("node:path")
const config = JSON.parse(readFileSync("package.json", "utf8"))
writeFileSync(path.join(process.env.npm_config_cache, "..", "call.json"), JSON.stringify({
  cwd: process.cwd(), argv: process.argv.slice(2), cache: process.env.npm_config_cache,
  notifier: process.env.npm_config_update_notifier, inherited: process.env.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER,
}))
if (config.output) {
  const fd = config.output === "stdout" ? 1 : 2
  const chunk = Buffer.alloc(1024 * 1024, 120)
  for (let i = 0; i < config.mib; i++) require("node:fs").writeSync(fd, chunk)
}
process.exit(config.exitCode ?? 0)
`)
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
  const install = (config: { exitCode?: number; output?: "stdout" | "stderr"; mib?: number }) =>
    BackendToolkit.ensure("orval").pipe(
      Effect.provideService(BackendToolkit.Root, root),
      Effect.provideService(BackendToolkit.Target, host),
      Effect.provideService(BackendToolkit.Runtimes, { ...BackendToolkitManifest.RUNTIMES, node: runtime }),
      Effect.provideService(BackendToolkit.Manifest, {
        ...BackendToolkitManifest.ENGINES,
        orval: {
          ...BackendToolkitManifest.ENGINES.orval,
          runtime: "node",
          version: "fixture",
          install: { kind: "npm", packageJson: JSON.stringify(config), lock: "{}" },
          launch: [],
        },
      }),
    )
  return { root, directory: path.join(root, "engines", "orval", `fixture-${host.target}`), install }
})

it.live("toolkit install runs through Omni with staging cwd, inherited env and npm overrides", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const before = Omni.snapshot()
    yield* f.install({ output: "stdout", mib: 64 })
    if (process.env.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER === "1") {
      expect(Omni.snapshot().spawns).toBeGreaterThan(before.spawns)
      expect(Omni.snapshot().delegations).toBe(before.delegations)
    }
    const call = yield* Effect.promise(() => Bun.file(path.join(f.root, "cache", "call.json")).json())
    expect(call.cwd).toStartWith(path.join(f.root, "engines", "orval", ".staging-"))
    expect(call.argv).toEqual(["ci", "--ignore-scripts", "--no-audit", "--no-fund", "--offline=false"])
    expect(call.cache).toBe(path.join(f.root, "cache", "npm"))
    expect(call.notifier).toBe("false")
    expect(call.inherited).toBe(process.env.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER)
    expect(yield* PinnedArtifact.installed(f.directory)).toBe(true)
    expect(yield* Effect.promise(() => readFile(path.join(f.directory, "package-lock.json"), "utf8"))).toBe("{}")
  }), 120_000,
)

it.live("a nonzero npm exit fails instead of publishing a completed install", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    expect(yield* f.install({ exitCode: 3 }).pipe(Effect.flip, Effect.map((error) => error.reason)))
      .toBe("toolkit-not-ready:failed:orval:install:npm")
    expect(yield* PinnedArtifact.installed(f.directory)).toBe(false)
    expect(yield* Effect.promise(() => readdir(path.dirname(f.directory)))).toEqual([])
  }), 30_000,
)

;(["stdout", "stderr"] as const).forEach((output) => {
  it.live(`a zero-exit npm install exceeding 64 MiB on ${output} fails and removes staging`, () =>
    Effect.gen(function* () {
      const f = yield* fixture
      expect(yield* f.install({ output, mib: 65 }).pipe(Effect.flip, Effect.map((error) => error.reason)))
        .toBe("toolkit-not-ready:failed:orval:install:npm")
      expect(yield* PinnedArtifact.installed(f.directory)).toBe(false)
      expect(yield* Effect.promise(() => readdir(path.dirname(f.directory)))).toEqual([])
    }), 120_000,
  )
})
