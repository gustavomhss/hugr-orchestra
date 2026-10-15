import { expect } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import { access, copyFile, mkdir, mkdtemp, readFile, readdir, realpath, rm, stat, writeFile } from "fs/promises"
import { constants } from "fs"
import { tmpdir } from "os"
import { Effect } from "effect"
import { BackendToolkit } from "../src/backend-toolkit"
import { BackendToolkitManifest } from "../src/backend-toolkit/manifest"
import { BackendToolkitTarget } from "../src/backend-toolkit/target"
import { Omni } from "../src/omni"
import { PinnedArtifact } from "../src/pinned-artifact"
import { it } from "./lib/effect"

const fixture = Effect.gen(function* () {
  const root = yield* Effect.acquireRelease(
    Effect.promise(async () => realpath(await mkdtemp(path.join(tmpdir(), "toolkit-source-ready-")))),
    (root) => Effect.promise(() => rm(root, { recursive: true, force: true })),
  )
  const host = BackendToolkitTarget.detect()
  if (!("target" in host)) throw new Error(`BLOCKED: unsupported toolkit host: ${host.unsupported}`)
  const windows = host.target === "win32-x64"
  const home = path.join(root, "runtimes", "go", `fixture-${host.target}`)
  const interpreter = path.join("bin", windows ? "go.exe" : "go")
  // Node treats the first Go argv item, "build", as a script in the staged source cwd.
  const bytes = yield* Effect.promise(async () => {
    const node = Bun.which("node")
    if (!node) throw new Error("Source readiness fixture requires a real Node interpreter")
    await mkdir(path.join(home, "bin"), { recursive: true })
    await copyFile(node, path.join(home, interpreter))
    await writeFile(path.join(home, ".complete"), "")
    await mkdir(path.join(root, "cache"), { recursive: true })
    await mkdir(path.join(root, "source"))
    await writeFile(path.join(root, "source", "build"), `
const { mkdirSync, copyFileSync, chmodSync, writeFileSync } = require("node:fs")
const path = require("node:path")
const args = process.argv.slice(2)
if (args[0] !== "-trimpath" || args[1] !== "-o" || args.length !== 4) throw new Error("Unexpected builder argv")
const output = args[2]
const mode = args[3]
if (mode === "directory") mkdirSync(output)
else {
  copyFileSync(process.execPath, output)
  chmodSync(output, mode === "nonexecutable" ? 0o644 : 0o755)
}
writeFileSync(path.join(process.env.GOCACHE, "..", "call.json"), JSON.stringify({
  cwd: process.cwd(), args, output, mode,
}))
`)
    // Relative archive paths keep GNU tar from treating Windows drive letters as remote hosts.
    const archive = Bun.spawn(["tar", "-czf", "source.tgz", "-C", "source", "build"], {
      cwd: root, stdout: "pipe", stderr: "pipe",
    })
    const [exit, stderr] = await Promise.all([archive.exited, new Response(archive.stderr).text()])
    if (exit !== 0) throw new Error(`Source fixture tar failed: ${stderr}`)
    return readFile(path.join(root, "source.tgz"))
  })
  const server = yield* Effect.acquireRelease(
    Effect.sync(() => Bun.serve({ port: 0, fetch: () => new Response(bytes) })),
    (server) => Effect.promise(() => server.stop(true)),
  )
  const artifact: PinnedArtifact.Artifact = {
    url: new URL("source.tgz", server.url).href,
    integrity: `sha256-${createHash("sha256").update(bytes).digest("base64")}`,
    format: "tar.gz",
    entries: [{ from: "build", to: "src/build" }],
  }
  const pin = { ...BackendToolkitManifest.RUNTIMES.go.targets[host.target], executable: interpreter }
  const runtimes = {
    ...BackendToolkitManifest.RUNTIMES,
    go: {
      ...BackendToolkitManifest.RUNTIMES.go,
      version: "fixture",
      targets: { "darwin-arm64": pin, "darwin-x64": pin, "linux-arm64": pin, "linux-x64": pin, "win32-x64": pin },
    },
  }
  const directory = path.join(root, "engines", "gocqlx-schemagen", `fixture-${host.target}`)
  const engine = (mode: string): BackendToolkitManifest.HostedEngine => ({
    ...BackendToolkitManifest.ENGINES["gocqlx-schemagen"],
    version: "fixture",
    runtime: "go",
    install: { kind: "source", build: "go", artifact, path: mode, binary: "fixture" },
    launch: [],
  })
  return {
    root,
    directory,
    executable: path.join(directory, windows ? "fixture.exe" : "fixture"),
    install: (mode: string, api: "hosted" | "ensure") => api === "hosted"
      ? BackendToolkit.hosted(root, engine(mode), runtimes, directory, host.target, true).pipe(
          Effect.mapError((error) => error.cause),
        )
      : BackendToolkit.ensure("gocqlx-schemagen").pipe(
          Effect.provideService(BackendToolkit.Root, root),
          Effect.provideService(BackendToolkit.Target, host),
          Effect.provideService(BackendToolkit.Runtimes, runtimes),
          Effect.provideService(BackendToolkit.Manifest, { ...BackendToolkitManifest.ENGINES, "gocqlx-schemagen": engine(mode) }),
          Effect.mapError((error) => error.reason),
          Effect.asVoid,
        ),
  }
})

;(["hosted", "ensure"] as const).forEach((api) => {
  ;(["directory", "nonexecutable"] as const).forEach((mode) => {
    const test = mode === "nonexecutable" && process.platform === "win32" ? it.live.skip : it.live
    test(`zero-exit source builder ${mode} rejected before publication through ${api}`, () => Effect.gen(function* () {
      const f = yield* fixture
      const failure = yield* f.install(mode, api).pipe(Effect.flip)
      expect(failure).toContain("install:go:failed:source-executable-not-ready")
      const call = yield* Effect.promise(() => Bun.file(path.join(f.root, "cache", "call.json")).json())
      expect(call.mode).toBe(mode)
      expect(call.cwd).toStartWith(path.join(path.dirname(f.directory), ".staging-"))
      expect(call.args).toEqual(["-trimpath", "-o", call.output, mode])
      expect(yield* PinnedArtifact.installed(f.directory)).toBe(false)
      expect(yield* Effect.promise(() => stat(f.directory).catch(() => undefined))).toBeUndefined()
      expect(yield* Effect.promise(() => stat(path.dirname(call.cwd)).catch(() => undefined))).toBeUndefined()
      expect(yield* Effect.promise(() => readdir(path.dirname(f.directory)))).toEqual([])
    }))
  })

  it.live(`valid source executable publishes complete cache through ${api}`, () => Effect.gen(function* () {
    const f = yield* fixture
    const before = Omni.snapshot()
    yield* f.install("valid", api)
    // Native extraction and builder spawns calibrate the hosted run's Omni positive control.
    expect(Omni.snapshot().spawns).toBeGreaterThan(before.spawns)
    expect(Omni.snapshot().delegations).toBe(before.delegations)
    expect(yield* PinnedArtifact.installed(f.directory)).toBe(true)
    expect((yield* Effect.promise(() => stat(f.executable))).isFile()).toBe(true)
    yield* Effect.promise(() => access(f.executable, process.platform === "win32" ? constants.F_OK : constants.X_OK))
    expect(yield* Effect.promise(() => readFile(path.join(f.directory, "src", "build")))).toEqual(
      yield* Effect.promise(() => readFile(path.join(f.root, "source", "build"))),
    )
    expect(yield* Effect.promise(() => readdir(path.dirname(f.directory)))).toEqual([path.basename(f.directory)])
    expect((yield* Effect.promise(async () => {
      const child = Bun.spawn([f.executable, "--version"], { stdout: "pipe", stderr: "pipe" })
      const [exit, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
      return { exit, stdout, stderr }
    }))).toMatchObject({ exit: 0, stdout: expect.stringMatching(/^v\d+\./), stderr: "" })
  }))
})
