import { expect } from "bun:test"
import path from "path"
import { createServer } from "net"
import { access, chmod, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from "fs/promises"
import { Effect, Schema } from "effect"
import { LayerNode } from "../../src/effect/layer-node"
import { FSUtil } from "../../src/fs-util"
import { AppProcess } from "../../src/process"
import { ResearchProcess } from "../../src/research-toolkit/process"
import { ToolSafetySandboxRuntime } from "../../src/tool-safety-sandbox-runtime"
import { ReviewLocalReadProcess } from "../../src/review-toolkit/local-read-process"
import { FileDigests } from "../fixture/file-digests"
import { expectSpawn } from "../fixture/omni-expect"
import { tmpdir } from "../fixture/tmpdir"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const held = () => Effect.acquireRelease(Effect.promise(tmpdir), (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()))
const ProbeResult = Schema.fromJsonString(Schema.Struct({ inside: Schema.Boolean, outside: Schema.Boolean, insideWrite: Schema.Boolean, outsideWrite: Schema.Boolean, scratch: Schema.Boolean, tmp: Schema.String, tcp: Schema.Boolean, unix: Schema.Boolean }))
const PROBE = `import fs from 'fs'; import net from 'net'; import path from 'path';
const yes = (f) => { try { return f() } catch { return false } };
const reach = (options) => new Promise(resolve => { const s = net.connect(options); const done = value => { s.destroy(); resolve(value) }; s.once('connect',()=>done(true)); s.once('error',()=>done(false)); s.setTimeout(1000,()=>done(false)); });
const root=process.cwd(), outside=process.argv[2];
console.log(JSON.stringify({inside:yes(()=>fs.readFileSync(path.join(root,'inside'),'utf8')==='inside-control'),outside:yes(()=>fs.readFileSync(outside,'utf8')==='outside-control'),insideWrite:yes(()=>{fs.writeFileSync(path.join(root,'created'),'x');return true}),outsideWrite:yes(()=>{fs.writeFileSync(outside+'.created','x');return true}),scratch:yes(()=>{fs.writeFileSync(path.join(process.env.TMPDIR,'probe-created'),'x');return true}),tmp:process.env.TMPDIR,tcp:await reach({host:'127.0.0.1',port:Number(process.argv[3])}),unix:await reach({path:process.argv[4]})}));`

if (process.platform === "win32") it.live("Windows refuses read-confined analysis before input access or execution", () => Effect.gen(function* () {
  const result = yield* ReviewLocalReadProcess.run({ executable: "absent", args: [], root: "absent" }, () => Effect.die("unexpected execution"))
  expect(result).toEqual({ denied: "read-sandbox-unsupported-host" })
}))

if (process.platform === "linux") {
  it.live("missing pinned sandbox refuses without execution or acquisition", () => Effect.gen(function* () {
    const temp = yield* held()
    const executable = yield* Effect.promise(() => realpath(process.execPath))
    const result = yield* ReviewLocalReadProcess.run({ executable, args: [], root: temp.path }, () => Effect.die("unexpected execution")).pipe(Effect.provideService(ToolSafetySandboxRuntime.Source, { directory: path.join(temp.path, "missing-runtime"), dependencies: [path.join(temp.path, "missing-sandbox-dependency")], artifacts: [] }))
    expect(result).toEqual({ denied: "read-sandbox-unavailable" })
    expect(yield* Effect.promise(() => FileDigests.capture(temp.path))).toEqual([])
  }))

  it.live("PATH srt is refused without executing the unverified launcher", () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    yield* ToolSafetySandboxRuntime.ready()
    const source = yield* ToolSafetySandboxRuntime.Source
    const temp = yield* held()
    const root = path.join(temp.path, "projection")
    const bin = path.join(temp.path, "bin")
    const executable = yield* Effect.promise(() => realpath(process.execPath))
    const script = path.join(temp.path, "host.ts")
    const imports = [["Effect", import.meta.resolve("effect")], ["LayerNode", import.meta.resolve("../../src/effect/layer-node")], ["FSUtil", import.meta.resolve("../../src/fs-util")], ["AppProcess", import.meta.resolve("../../src/process")], ["ReviewLocalReadProcess", import.meta.resolve("../../src/review-toolkit/local-read-process")], ["ToolSafetySandboxRuntime", import.meta.resolve("../../src/tool-safety-sandbox-runtime")]]
    yield* Effect.promise(async () => {
      await mkdir(root); await mkdir(bin)
      await writeFile(path.join(bin, "srt"), "#!/bin/sh\nexit 99\n"); await chmod(path.join(bin, "srt"), 0o700)
      await writeFile(script, imports.map(([name, url]) => `import { ${name} } from ${JSON.stringify(url)};`).join("\n") + `\nconst result = await Effect.runPromise(ReviewLocalReadProcess.run(${JSON.stringify({ executable, args: [], root })}, () => Effect.die("unverified launcher executed")).pipe(Effect.provideService(ToolSafetySandboxRuntime.Source, ${JSON.stringify(source)}), Effect.provide(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node]))))); console.log(JSON.stringify(result));`)
    })
    const result = yield* ResearchProcess.run({ command: executable, args: ["--no-env-file", "--config=/dev/null", script], cwd: process.cwd(), env: { ...ResearchProcess.environment(), PATH: `${bin}:${process.env.PATH ?? "/usr/bin:/bin"}` }, timeoutMs: 30_000, maxBytes: 4096 })
    expect(result.exitCode, result.stderr.data.toString()).toBe(0)
    expect(result.stdout.data.toString().trim()).toBe(JSON.stringify({ denied: "read-sandbox-unverified-launcher" }))
  }), 300_000)

  it.live("real read jail preserves inside read and scratch write while denying outside read, source write, TCP and Unix sockets", () => Effect.gen(function* () {
    expectSpawn(import.meta.path)
    yield* ToolSafetySandboxRuntime.ready()
    const temp = yield* held()
    const root = path.join(temp.path, "projection")
    const outside = path.join(temp.path, "outside")
    const socket = path.join(root, "socket")
    yield* Effect.promise(async () => { await mkdir(root); await writeFile(path.join(root, "inside"), "inside-control"); await writeFile(outside, "outside-control"); await writeFile(path.join(root, "probe.mjs"), PROBE) })
    const tcp = yield* Effect.acquireRelease(Effect.promise(() => new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
      const server = createServer((connection) => connection.end())
      server.once("error", reject).listen(0, "127.0.0.1", () => resolve(server))
    })), (server) => Effect.promise(() => new Promise<void>((resolve) => server.close(() => resolve()))))
    const unix = yield* Effect.acquireRelease(Effect.promise(() => new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
      const server = createServer((connection) => connection.end())
      server.once("error", reject).listen(socket, () => resolve(server))
    })), (server) => Effect.promise(() => new Promise<void>((resolve) => server.close(() => resolve()))))
    expect(unix.listening).toBe(true)
    const address = tcp.address()
    if (!address || typeof address === "string") throw new Error("no TCP positive control")
    const executable = yield* Effect.promise(() => realpath(process.execPath))
    const args = ["--no-env-file", "--config=/dev/null", path.join(root, "probe.mjs"), outside, String(address.port), socket]
    const positive = yield* ResearchProcess.run({ command: executable, args, cwd: root, env: { ...ResearchProcess.environment(), TMPDIR: temp.path }, timeoutMs: 10_000, maxBytes: 4096 })
    expect(positive.exitCode).toBe(0)
    expect(Schema.decodeUnknownSync(ProbeResult)(positive.stdout.data.toString())).toMatchObject({ inside: true, outside: true, insideWrite: true, outsideWrite: true, tcp: true, unix: true })
    yield* Effect.promise(async () => { await rm(path.join(root, "created")); await rm(outside + ".created"); await rm(path.join(temp.path, "probe-created")); await writeFile(path.join(root, "bunfig.toml"), 'preload=["./hook.ts"]'); await writeFile(path.join(root, "hook.ts"), `console.log("LOCAL_PRELOAD_RAN"); await Bun.write(${JSON.stringify(path.join(temp.path, "preload-ran"))},'bad')`) })
    const preload = yield* ResearchProcess.run({ command: executable, args: ["--no-env-file", "-e", "''"], cwd: root, env: ResearchProcess.environment(), timeoutMs: 10_000, maxBytes: 4096 })
    expect(preload.exitCode, preload.stderr.data.toString()).toBe(0)
    expect(preload.stdout.data.toString()).toContain("LOCAL_PRELOAD_RAN")
    expect(yield* Effect.promise(() => readFile(path.join(temp.path, "preload-ran"), "utf8"))).toBe("bad")
    yield* Effect.promise(() => rm(path.join(temp.path, "preload-ran")))
    const image = async () => Promise.all((await readdir(root)).filter((file) => file !== "socket").sort().map(async (file) => [file, (await readFile(path.join(root, file))).toString("base64")]))
    const before = yield* Effect.promise(image)
    const calls: Array<Parameters<typeof ResearchProcess.run>[0]> = []
    const result = yield* ReviewLocalReadProcess.run({ executable, args, root }, (input) => { calls.push(input); return ResearchProcess.run(input) })
    if ("denied" in result) throw new Error(`conformance missing: ${result.denied}`)
    expect(result.outcome.exitCode, result.outcome.stderr.data.toString()).toBe(0)
    expect(result.outcome.stdout.data.toString()).not.toContain("LOCAL_PRELOAD_RAN")
    const actual = Schema.decodeUnknownSync(ProbeResult)(result.outcome.stdout.data.toString())
    expect(FSUtil.contains(root, actual.tmp)).toBe(false)
    expect(actual).toMatchObject({ inside: true, outside: false, insideWrite: false, scratch: true, tcp: false, unix: false })
    expect(yield* Effect.promise(() => access(actual.tmp).then(() => true, () => false))).toBe(false)
    expect(yield* Effect.promise(() => access(path.join(temp.path, "preload-ran")).then(() => true, () => false))).toBe(false)
    expect(yield* Effect.promise(image)).toEqual(before)
    expect(yield* Effect.promise(() => readFile(outside, "utf8"))).toBe("outside-control")
    // Linux may accept this path in its private /tmp mount; it must never create a host file.
    expect(yield* Effect.promise(() => access(outside + ".created").then(() => true, () => false))).toBe(false)
    expect(calls).toHaveLength(1)
    const runtime = yield* ToolSafetySandboxRuntime.resolve(false)
    if (runtime.reason !== undefined) throw new Error(runtime.reason)
    expect(calls[0].command).toBe(process.execPath)
    expect(calls[0].args.slice(0, 3)).toEqual(["--no-env-file", "--config=/dev/null", ToolSafetySandboxRuntime.cli(runtime.directory)])
    expect(calls[0].args.slice(-args.length - 1)).toEqual([executable, ...args])
    expect(calls[0].timeoutMs).toBe(30_000)
    expect(calls[0].maxBytes).toBe(256 * 1024)
    expect(calls[0].maxRssBytes).toBe(512 * 1024 * 1024)
    for (const key of ["CARGO", "CARGO_PKG_NAME", "RUSTUP_HOME", "NODE_OPTIONS", "GOENV", "GOTOOLCHAIN", "GITHUB_TOKEN", "ORCHESTRA_AUTH_CONTENT"]) expect(calls[0].env[key]).toBeUndefined()
    for (const limits of [{ timeoutMs: 0 }, { maxBytes: 256 * 1024 + 1 }, { maxRssBytes: Infinity }]) expect(yield* ReviewLocalReadProcess.run({ executable, args, root, limits }, () => Effect.die("invalid limit executed"))).toEqual({ denied: "read-sandbox-input-invalid" })
    const alias = path.join(temp.path, "alias")
    yield* Effect.promise(() => symlink(root, alias, "dir"))
    const linkedExecutable = path.join(temp.path, "linked-executable")
    yield* Effect.promise(() => symlink(executable, linkedExecutable))
    for (const invalid of [{ executable, args: ["é".repeat(600_000)], root }, { executable: linkedExecutable, args, root }, { executable: "relative", args, root }, { executable, args: ["bad\0arg"], root }, { executable, args: Array(10_001).fill("x"), root }, { executable, args, root: alias }, { executable: path.join(root, "inside"), args, root }]) expect(yield* ReviewLocalReadProcess.run(invalid, () => Effect.die("invalid input executed"))).toEqual({ denied: "read-sandbox-input-invalid" })
    const overflow = yield* ReviewLocalReadProcess.run({ executable, args: ["--no-env-file", "--config=/dev/null", "-e", 'process.stdout.write("x".repeat(4096))'], root, limits: { maxBytes: 32 } })
    if ("denied" in overflow) throw new Error(overflow.denied)
    expect(overflow.outcome.overflow).toBe(true)
    const timeout = yield* ReviewLocalReadProcess.run({ executable, args: ["--no-env-file", "--config=/dev/null", "-e", 'setTimeout(()=>{},60000)'], root, limits: { timeoutMs: 100 } })
    if ("denied" in timeout) throw new Error(timeout.denied)
    expect(timeout.outcome.timedOut).toBe(true)
  }), 300_000)
}
