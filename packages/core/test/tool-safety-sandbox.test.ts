import { expect } from "bun:test"
import path from "path"
import { createServer } from "node:net"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const backend = ["darwin", "linux"].includes(process.platform) && await Effect.runPromise(ToolSafetySandbox.available())
// Live confinement is measured only with a real backend; the absent-backend HOLD case always runs below.
const live = backend ? it.live : it.live.skip
const fixture = Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "sandbox-real-" })
  const root = path.join(directory, process.platform === "win32" ? "root spaced literal" : 'root "quoted" literal')
  yield* fs.makeDirectory(root)
  const physical = yield* fs.realPath(root)
  const node = yield* ToolSafetySandbox.available("node")
  if (!node) throw new Error("BLOCKED: real Node runtime unavailable")
  const run = (script: string, profile?: ToolSafety.Profile, cwd = root) => Effect.gen(function* () {
    const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(node, ["-e", script], { cwd })).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, profile),
      Effect.provideService(ToolSafety.NativeContext, { directory: root }),
    )
    return yield* processes.run(command, { timeout: "5 seconds" })
  })
  return { fs, processes, directory, root, physical, node, run }
})

live("real backend permits physical cwd writes, dependency reads and child-only environment scrub", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const alias = path.join(f.directory, "cwd-alias")
    yield* f.fs.symlink(f.root, alias)
    const inherited = { PATH: process.env.PATH, FIXTURE_SECRET_TOKEN: "private", SAFE: "ordinary" }
    const script = "require('fs').writeFileSync('allowed','written');process.stdout.write(JSON.stringify({cwd:process.cwd(),safe:process.env.SAFE,secret:process.env.FIXTURE_SECRET_TOKEN,dependency:require('fs').readFileSync(process.execPath).length>0}));process.stderr.write('stderr-preserved')"
    const input = ChildProcess.make(f.node, ["-e", script], { cwd: alias, env: inherited, extendEnv: true })
    const ordinary = yield* ToolSafetySandbox.wrap(input).pipe(Effect.provideService(ToolSafety.RuntimeProfile, undefined))
    expect(ordinary._tag === "StandardCommand" && ordinary.command).toBe(f.node)
    expect(yield* f.fs.exists(path.join(f.root, "allowed"))).toBe(false)
    const baseline = yield* f.processes.run(ordinary)
    expect(baseline.exitCode).toBe(0)
    yield* f.fs.remove(path.join(f.root, "allowed"))
    const wrapped = yield* ToolSafetySandbox.wrap(input).pipe(Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true, writeRoots: [alias] }),
      Effect.provideService(ToolSafety.NativeContext, { directory: f.root }))
    expect(yield* f.fs.exists(path.join(f.root, "allowed"))).toBe(false)
    const result = yield* f.processes.run(wrapped, { timeout: "5 seconds" })
    if (result.exitCode !== 0) throw new Error(`BLOCKED: real sandbox launch/allow control: ${result.stderr.toString()}`)
    expect(JSON.parse(result.stdout.toString())).toEqual({ cwd: f.physical, safe: "ordinary", dependency: true })
    expect(result.stderr.toString()).toBe("stderr-preserved")
    expect(yield* f.fs.readFileString(path.join(f.root, "allowed"))).toBe("written")
    expect(inherited.FIXTURE_SECRET_TOKEN).toBe("private")
  }), 30_000,
)

live("real descendants and shell redirection cannot write outside roots, through symlinks or directly in /tmp", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const outside = path.join(f.directory, "outside")
    const direct = yield* f.fs.makeTempDirectoryScoped({ directory: "/tmp", prefix: "sandbox-direct-" })
    yield* f.fs.makeDirectory(outside)
    yield* f.fs.symlink(outside, path.join(f.root, "escape"))
    const targets = [path.join(outside, "denied"), path.join(f.root, "escape", "symlink-denied"), path.join(direct, "denied")]
    const script = `const fs=require('fs');fs.writeFileSync('allowed','written');const codes=${JSON.stringify(targets)}.map(target=>require('child_process').spawnSync('/bin/sh',['-c','printf changed > "$1"','fixture',target]).status);process.stdout.write(JSON.stringify(codes));process.exitCode=codes.some(code=>code!==0)?7:0`
    const baseline = yield* f.run(script)
    expect(baseline.exitCode).toBe(0)
    expect(JSON.parse(baseline.stdout.toString())).toEqual([0, 0, 0])
    yield* Effect.forEach(targets, (target) => f.fs.remove(target), { discard: true })
    const result = yield* f.run(script, { requireSandbox: true, writeRoots: [f.root] })
    expect(result.exitCode).toBe(7)
    expect(JSON.parse(result.stdout.toString()).every((code: number) => code > 0)).toBe(true)
    expect(yield* f.fs.readFileString(path.join(f.root, "allowed"))).toBe("written")
    yield* Effect.forEach(targets, (target) => Effect.gen(function* () { expect(yield* f.fs.exists(target)).toBe(false) }), { discard: true })
    const shell = yield* ToolSafetySandbox.wrap(ChildProcess.make('printf changed > "$OUTSIDE"', [], {
      cwd: f.root, shell: true, env: { OUTSIDE: targets[0] }, extendEnv: true,
    })).pipe(Effect.provideService(ToolSafety.RuntimeProfile, { sandbox: { enabled: true }, writeRoots: [f.root] }),
      Effect.provideService(ToolSafety.NativeContext, { directory: f.root }))
    expect((yield* f.processes.run(shell, { timeout: "5 seconds" })).exitCode).not.toBe(0)
    expect(yield* f.fs.exists(targets[0])).toBe(false)
  }), 30_000,
)

live("real read denials and protected writes use captured physical policy, while dependencies remain readable", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const names = ["managed", "denied", "never"]
    yield* Effect.forEach(names, (name) => f.fs.writeFileString(path.join(f.root, name), "private"), { discard: true })
    const protectedFile = path.join(f.root, "instructions")
    yield* f.fs.writeFileString(protectedFile, "protected")
    const alias = path.join(f.directory, "managed-alias")
    yield* f.fs.symlink(path.join(f.root, "managed"), alias)
    const managed = [alias]
    const profile = { requireSandbox: true, writeRoots: [f.root], managedPaths: managed, neverTouch: ["never/**"],
      sandbox: { enabled: true, denyPaths: ["denied"] }, protectedWrites: ["instructions"] }
    const script = `const fs=require('fs');const denied=${JSON.stringify(names)}.map(name=>{try{fs.readFileSync(name);return false}catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;return true}});let writeDenied=false;try{fs.writeFileSync('instructions','changed')}catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;writeDenied=true}process.stdout.write(JSON.stringify({denied,writeDenied,protectedRead:fs.readFileSync('instructions','utf8'),dependency:fs.readFileSync(process.execPath).length>0}))`
    const baseline = yield* f.run(script)
    expect(baseline.exitCode).toBe(0)
    expect(JSON.parse(baseline.stdout.toString()).denied).toEqual([false, false, false])
    yield* f.fs.writeFileString(protectedFile, "protected")
    const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(f.node, ["-e", script], { cwd: f.root })).pipe(Effect.provideService(ToolSafety.RuntimeProfile, profile),
      Effect.provideService(ToolSafety.NativeContext, { directory: f.root }))
    managed.length = 0
    const result = yield* f.processes.run(command, { timeout: "5 seconds" })
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout.toString())).toEqual({ denied: [true, true, true], writeDenied: true, protectedRead: "protected", dependency: true })
    expect(yield* f.fs.readFileString(protectedFile)).toBe("protected")
  }), 30_000,
)

live("real network denial blocks loopback TCP against a working local server", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const connections: string[] = []
    const server = yield* Effect.acquireRelease(Effect.promise(() => new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
      const server = createServer((socket) => { connections.push("connected"); socket.end("fixture") })
      server.once("error", reject)
      server.listen(0, "127.0.0.1", () => resolve(server))
    })), (server) => Effect.promise(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))))
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("local server address unavailable")
    const script = `const socket=require('net').connect({host:'127.0.0.1',port:${address.port}});socket.on('data',data=>process.stdout.write(data));socket.on('error',error=>{process.stderr.write(error.code);process.exitCode=3});socket.setTimeout(1000,()=>{socket.destroy();process.exitCode=4})`
    const baseline = yield* f.run(script)
    expect(baseline.exitCode).toBe(0)
    expect(baseline.stdout.toString()).toBe("fixture")
    expect(connections).toEqual(["connected"])
    const result = yield* f.run(script, { requireSandbox: true, writeRoots: [f.root] })
    expect(result.exitCode).toBe(3)
    expect(result.stderr.toString()).toMatch(/EPERM|EACCES/)
    expect(connections).toEqual(["connected"])
  }), 30_000,
)

it.live("unbound pipelines and invalid physical roots HOLD before side effects; unavailable backend stays HOLD", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    expect(yield* ToolSafetySandbox.available(f.node)).toBe(f.node)
    expect(yield* ToolSafetySandbox.available(path.join(f.directory, "missing-binary"))).toBeNull()
    const command = ChildProcess.make(f.node, ["-e", "require('fs').writeFileSync('must-not-run','changed')"], { cwd: f.root })
    if (!backend) {
      const hold = yield* Effect.flip(ToolSafetySandbox.wrap(command).pipe(Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true })))
      expect(hold.reason).toBe(process.platform === "darwin" || process.platform === "linux"
        ? "required-process-sandbox-unavailable" : "sandbox-platform-unavailable")
      expect(yield* f.fs.exists(path.join(f.root, "must-not-run"))).toBe(false)
      return // This passes the absence/HOLD contract, not a live-confinement claim.
    }
    const invalid = yield* Effect.flip(ToolSafetySandbox.wrap(command).pipe(Effect.provideService(ToolSafety.RuntimeProfile, {
      requireSandbox: true, writeRoots: [path.join(f.root, "missing-root")],
    }), Effect.provideService(ToolSafety.NativeContext, { directory: f.root })))
    expect(invalid.reason).toBe("sandbox-write-root-acquisition")
    const pipeline = yield* Effect.flip(ToolSafetySandbox.wrap(ChildProcess.pipeTo(command, command)).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true }),
    ))
    expect(pipeline.reason).toBe("sandbox-pipeline-unbound")
    if (backend === "/usr/bin/sandbox-exec") {
      const domains = yield* Effect.flip(ToolSafetySandbox.wrap(command).pipe(Effect.provideService(ToolSafety.RuntimeProfile, {
        requireSandbox: true, sandbox: { enabled: true, allowedDomains: ["example.invalid"] },
      })))
      expect(domains.reason).toBe("sandbox-seatbelt-domain-policy-unenforceable")
      const glob = yield* Effect.flip(ToolSafetySandbox.wrap(command).pipe(Effect.provideService(ToolSafety.RuntimeProfile, {
        requireSandbox: true, neverTouch: ["**/secrets"],
      }), Effect.provideService(ToolSafety.NativeContext, { directory: f.root })))
      expect(glob.reason).toBe("sandbox-seatbelt-glob-policy-unenforceable")
    }
    expect(yield* f.fs.exists(path.join(f.root, "must-not-run"))).toBe(false)
  }), 30_000,
)
