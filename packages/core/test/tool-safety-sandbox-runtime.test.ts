import { expect } from "bun:test"
import path from "path"
import { createHash } from "crypto"
import { Effect, Schedule } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { ToolSafetySandboxRuntime } from "../src/tool-safety-sandbox-runtime"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
// macOS always has seatbelt, so the no-sandbox and srt paths are measured on Linux and Windows only.
const noSeatbelt = process.platform === "darwin" ? it.live.skip : it.live
const linux = process.platform === "linux" ? it.live : it.live.skip
const fallback = { requireSandbox: true, sandbox: { enabled: true, scratch: true, unconfinedFallback: true } }

const fixture = Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const directory = yield* fs.realPath(yield* fs.makeTempDirectoryScoped({ prefix: "sandbox-runtime-" }))
  const root = path.join(directory, "root")
  yield* fs.makeDirectory(root)
  // A runtime archive shaped like the npm package: its cli prints what srt would receive.
  const cli = "const fs=require('fs');process.stdout.write(JSON.stringify({argv:process.argv.slice(2)," +
    "env:Object.fromEntries(['TMPDIR','GOCACHE','XDG_CACHE_HOME','npm_config_cache','BUN_INSTALL_CACHE_DIR','PIP_CACHE_DIR','UV_CACHE_DIR'].map(k=>[k,process.env[k]]))," +
    "settings:JSON.parse(fs.readFileSync(process.argv[3],'utf8'))}))"
  yield* fs.writeWithDirs(path.join(directory, "archive", "package", "dist", "cli.js"), cli)
  const tar = yield* processes.run(ChildProcess.make("tar", ["-czf", "runtime.tgz", "-C", "archive", "package"], { cwd: directory }))
  if (tar.exitCode !== 0) throw new Error(`BLOCKED: tar unavailable: ${tar.stderr.toString()}`)
  const genuine = new Uint8Array(yield* fs.readFile(path.join(directory, "runtime.tgz")))
  const tampered = new Uint8Array([...genuine.slice(0, -1), genuine[genuine.length - 1] ^ 1])
  const served = { bytes: genuine }
  const server = yield* Effect.acquireRelease(
    Effect.sync(() => Bun.serve({ port: 0, fetch: () => new Response(served.bytes) })),
    (server) => Effect.promise(() => server.stop(true)),
  )
  const source = (name: string, dependencies: string[] = []): ToolSafetySandboxRuntime.Source => ({
    directory: path.join(directory, name),
    dependencies,
    artifacts: [{
      url: `http://127.0.0.1:${server.port}/runtime.tgz`,
      integrity: `sha512-${createHash("sha512").update(genuine).digest("base64")}`,
      root: "package",
      target: path.join("node_modules", "@anthropic-ai", "sandbox-runtime"),
    }],
  })
  const outside = path.join(directory, "outside.txt")
  const command = ChildProcess.make(process.execPath, ["-e", `require('fs').writeFileSync(${JSON.stringify(outside)},'x')`], {
    cwd: root, env: { BUN_BE_BUN: "1", GOCACHE: "/inherited/go-build" }, extendEnv: true,
  })
  const wrap = (profile: ToolSafety.Profile, runtime: ToolSafetySandboxRuntime.Source) => Effect.gen(function* () {
    const report: { fact?: ToolSafety.ShellFact } = {}
    const wrapped = yield* ToolSafetySandbox.wrap(command).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, { ...profile, writeRoots: [root] }),
      Effect.provideService(ToolSafety.NativeContext, { directory: root }),
      Effect.provideService(ToolSafety.ShellReport, report),
      Effect.provideService(ToolSafetySandboxRuntime.Source, runtime),
    )
    return { wrapped, fact: report.fact }
  })
  return { fs, processes, directory, root, served, genuine, tampered, source, outside, command, wrap }
})

it.live("acquisition installs pinned artifacts and refuses a tampered one before extracting it", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const good = f.source("good")
    expect(yield* ToolSafetySandboxRuntime.acquire(good)).toBe(good.directory)
    expect(yield* f.fs.exists(ToolSafetySandboxRuntime.cli(good.directory))).toBe(true)
    expect((yield* ToolSafetySandboxRuntime.resolve(false).pipe(Effect.provideService(ToolSafetySandboxRuntime.Source, good))))
      .toEqual({ directory: good.directory })

    f.served.bytes = f.tampered
    const bad = f.source("bad")
    const refused = yield* Effect.flip(ToolSafetySandboxRuntime.acquire(bad))
    expect(refused.reason).toBe(`sandbox-runtime-integrity-mismatch: ${bad.artifacts[0].url}`)
    expect(yield* f.fs.exists(bad.directory)).toBe(false)
    // No staging dir or extracted file survives a refused archive.
    expect((yield* f.fs.readDirectory(f.directory)).filter((entry) => entry.startsWith(".staging-"))).toEqual([])
  }), 30_000,
)

noSeatbelt("without a sandbox a fallback profile runs the command unconfined and says why; edits stay held", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const missing = f.source("missing", ["orchestra-missing-sandbox-dependency"])
    const reason = process.platform === "linux"
      ? "sandbox-dependency-missing: orchestra-missing-sandbox-dependency"
      : `sandbox-platform-unsupported: ${process.platform}`

    const held = yield* Effect.flip(f.wrap({ requireSandbox: true, sandbox: { enabled: true } }, missing))
    expect(held.reason).toBe(process.platform === "linux" ? "required-process-sandbox-unavailable" : "sandbox-platform-unavailable")

    const safety = yield* ToolSafety.make
    const observed: ToolSafety.Observation[] = []
    const sessionID = `session-${Date.now()}`
    const invocation = { sessionID, callID: "call-1", directory: f.root, projectID: "project" }
    const ran = yield* safety.run({ ...invocation, tool: "bash", args: { command: "write outside" } }, Effect.gen(function* () {
      const wrapped = yield* ToolSafetySandbox.wrap(f.command).pipe(
        Effect.provideService(ToolSafety.NativeContext, { directory: f.root }),
      )
      return yield* f.processes.run(wrapped, { timeout: "10 seconds" })
    }).pipe(Effect.provideService(ToolSafetySandboxRuntime.Source, missing)), (value) => Effect.sync(() => observed.push(value)))
      .pipe(Effect.provideService(ToolSafety.RuntimeProfile, { ...fallback, writeRoots: [f.root] }))
    expect(ran.exitCode).toBe(0)
    expect(yield* f.fs.exists(f.outside)).toBe(true)
    const fact = { shellWrites: "unenforced", shellSandbox: { kind: "none", reason } } satisfies ToolSafety.ShellFact
    expect(observed.at(-1)).toMatchObject({ outcome: "success", ...fact })
    expect(ToolSafety.shellFact(sessionID)).toEqual(fact)

    const edit = yield* Effect.flip(safety.before({ ...invocation, tool: "write", args: { filePath: path.join(f.directory, "edit.txt") } })
      .pipe(Effect.provideService(ToolSafety.RuntimeProfile, { ...fallback, writeRoots: [f.root] })))
    expect(edit.reason).toBe("write-outside-physical-roots")
  }), 30_000,
)

linux("a failed acquisition keeps the fallback running with an explicit reason", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    f.served.bytes = f.tampered
    const source = f.source("failing")
    const first = yield* f.wrap(fallback, source)
    expect(first.fact).toEqual({ shellWrites: "unenforced", shellSandbox: { kind: "none", reason: "sandbox-runtime-acquiring" } })
    const failed = `sandbox-runtime-acquisition-failed: sandbox-runtime-integrity-mismatch: ${source.artifacts[0].url}`
    const status = ToolSafetySandbox.status().pipe(Effect.provideService(ToolSafetySandboxRuntime.Source, source))
    // The acquisition runs in the background; wait until it has settled.
    yield* status.pipe(
      Effect.flatMap((value) => value.shellSandbox.reason === failed ? Effect.void : Effect.fail(value.shellSandbox.reason)),
      Effect.retry({ schedule: Schedule.spaced("50 millis"), times: 200 }),
    )
    const second = yield* f.wrap(fallback, source)
    expect(second.fact).toEqual({ shellWrites: "unenforced", shellSandbox: { kind: "none", reason: failed } })
    expect((yield* f.processes.run(second.wrapped, { timeout: "10 seconds" })).exitCode).toBe(0)
    expect(yield* f.fs.exists(f.outside)).toBe(true)
    expect(yield* f.fs.exists(source.directory)).toBe(false)
  }), 30_000,
)

linux("an installed runtime runs srt with toolchain caches in scratch; unconfined commands keep theirs", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const installed = f.source("installed")
    yield* ToolSafetySandboxRuntime.acquire(installed)
    const sandboxed = yield* Effect.scoped(Effect.gen(function* () {
      const result = yield* f.wrap(fallback, installed)
      expect(result.fact).toEqual({ shellWrites: "enforced", shellSandbox: { kind: "srt" } })
      const run = yield* f.processes.run(result.wrapped, { timeout: "10 seconds" })
      if (run.exitCode !== 0) throw new Error(run.stderr.toString())
      return JSON.parse(run.stdout.toString())
    }))
    expect(sandboxed.argv.slice(0, 1)).toEqual(["--settings"])
    // srt receives the words to quote itself, not one pre-quoted word.
    expect(sandboxed.argv.slice(2)).toEqual(["--", process.execPath, "-e", expect.stringContaining("writeFileSync")])
    const scratch = sandboxed.env.TMPDIR
    expect(sandboxed.env).toEqual({
      TMPDIR: scratch,
      GOCACHE: path.join(scratch, "go-build"),
      XDG_CACHE_HOME: path.join(scratch, "cache"),
      npm_config_cache: path.join(scratch, "npm"),
      BUN_INSTALL_CACHE_DIR: path.join(scratch, "bun"),
      PIP_CACHE_DIR: path.join(scratch, "pip"),
      UV_CACHE_DIR: path.join(scratch, "uv"),
    })
    expect(sandboxed.settings.filesystem.allowWrite).toEqual([f.root, scratch])
    expect(sandboxed.settings.ripgrep).toEqual({ command: ToolSafetySandboxRuntime.ripgrep(installed.directory) })
    expect(yield* f.fs.exists(f.outside)).toBe(false)

    const unconfined = yield* f.wrap(fallback, f.source("absent", ["orchestra-missing-sandbox-dependency"]))
    const env = unconfined.wrapped._tag === "StandardCommand" ? unconfined.wrapped.options.env : undefined
    expect(env?.GOCACHE).toBe("/inherited/go-build")
    expect(env?.TMPDIR).toBe(process.env.TMPDIR)
  }), 30_000,
)
