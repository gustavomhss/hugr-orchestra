import { expect } from "bun:test"
import path from "node:path"
import { createServer } from "node:net"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { SandboxParents } from "../src/sandbox-parents"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const fixture = Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "sr-" }).pipe(Effect.flatMap(fs.realPath))
  const node = yield* ToolSafetySandbox.available("node")
  if (!node) throw new Error("BLOCKED: Node unavailable")
  const wrap = (script: string, profile?: ToolSafety.Profile, native = directory, cwd = directory) =>
    ToolSafetySandbox.wrap(ChildProcess.make(node, ["-e", script], { cwd })).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, profile),
      Effect.provideService(ToolSafety.NativeContext, { directory: native }),
    )
  return { fs, processes, directory, wrap }
})

it.live("parent plan validates all roots before exclusive mkdir and never creates the ambiguous leaf", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = path.join(f.directory, "generated", "nested", "out.ts")
    const forbidden = path.join(f.directory, "protected")
    const denied = yield* Effect.flip(SandboxParents.plan(f.fs, f.directory, [target, path.join(forbidden, "missing", "out")], [forbidden]))
    expect(denied.reason).toBe("sandbox-parent-protected-path")
    expect(yield* f.fs.exists(path.dirname(target))).toBe(false)
    const parents = yield* SandboxParents.plan(f.fs, f.directory, [target], [forbidden])
    expect(parents).toEqual([path.join(f.directory, "generated"), path.dirname(target)])
    yield* SandboxParents.prepare(f.fs, f.directory, parents)
    expect(yield* f.fs.isDir(path.dirname(target))).toBe(true)
    expect(yield* f.fs.exists(target)).toBe(false)
    yield* f.fs.writeFileString(target, "existing")
    expect(yield* SandboxParents.plan(f.fs, f.directory, [target], [])).toEqual([])
    expect(yield* f.fs.readFileString(target)).toBe("existing")
    const occupied = yield* Effect.flip(SandboxParents.prepare(f.fs, f.directory, parents))
    expect(occupied.reason).toBe("sandbox-parent-exclusive-mkdir")
    expect(yield* f.fs.readFileString(target)).toBe("existing")
  }),
)

it.live("parent plan rejects symlink escape, dangling symlink, non-directory, ambiguous and external roots", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const outside = yield* f.fs.makeTempDirectoryScoped({ prefix: "sr-out-" }).pipe(Effect.flatMap(f.fs.realPath))
    yield* f.fs.symlink(outside, path.join(f.directory, "escape"))
    yield* f.fs.symlink(path.join(outside, "absent"), path.join(f.directory, "dangling"))
    yield* f.fs.writeFileString(path.join(f.directory, "file"), "untouched")
    yield* Effect.forEach([
      { root: path.join(f.directory, "escape", "missing", "out"), reasons: ["sandbox-parent-symlink-denied"] },
      { root: path.join(f.directory, "dangling", "missing", "out"), reasons: ["sandbox-parent-symlink-denied"] },
      // Windows realpath reports a file ancestor as NotFound; POSIX reports ENOTDIR before the component walk.
      { root: path.join(f.directory, "file", "missing", "out"), reasons: ["sandbox-parent-path-acquisition", "sandbox-parent-not-directory"] },
      { root: path.join(f.directory, "*", "out"), reasons: ["sandbox-parent-path-ambiguous"] },
      { root: path.join(outside, "missing", "out"), reasons: ["sandbox-parent-outside-native-placement"] },
    ], (entry) => Effect.gen(function* () {
      const held = yield* Effect.flip(SandboxParents.plan(f.fs, f.directory, [path.join(f.directory, "first", "out"), entry.root], []))
      expect(entry.reasons).toContain(held.reason)
      expect(yield* f.fs.exists(path.join(f.directory, "first"))).toBe(false)
      expect(yield* f.fs.exists(path.join(outside, "missing"))).toBe(false)
    }), { discard: true })
    expect(yield* f.fs.readFileString(path.join(f.directory, "file"))).toBe("untouched")
  }),
)

it.live("child environment scrubs ORCHESTRA_AUTH_CONTENT without changing owner input", () =>
  Effect.gen(function* () {
    const owner = { ORCHESTRA_AUTH_CONTENT: '{"provider":"credential"}', GOMODCACHE: "owner-mod", GOCACHE: "owner-build", SAFE: "yes" }
    const before = { ...owner }
    const child = ToolSafetySandbox.environment(owner)
    expect(child).toEqual({ GOMODCACHE: "owner-mod", GOCACHE: "owner-build", SAFE: "yes" })
    expect(owner).toEqual(before)
  }),
)

const listen = (endpoint: string | number) => Effect.acquireRelease(
  Effect.promise(() => new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
    const server = createServer((socket) => socket.end(typeof endpoint === "string" ? path.basename(endpoint) : "tcp"))
    server.once("error", reject)
    if (typeof endpoint === "string") server.listen(endpoint, () => resolve(server))
    else server.listen(endpoint, "127.0.0.1", () => resolve(server))
  })),
  (server) => Effect.promise(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))),
)

it.live("exact Unix socket grant uses native placement; unsupported enforcement HOLD even with fallback", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const one = path.join(f.directory, "one.sock")
    const two = path.join(f.directory, "two.sock")
    const profile = { requireSandbox: true, writeRoots: [], sandbox: { enabled: true, unconfinedFallback: true,
      allowedUnixSockets: [{ directory: f.directory, path: one }] } } satisfies ToolSafety.Profile
    if (process.platform === "win32") {
      const held = yield* Effect.flip(f.wrap("", profile))
      expect(held.reason).toBe("sandbox-unix-socket-platform-unsupported")
      console.info("Windows: exact Unix socket enforcement unsupported; HOLD measured, no conformance claim")
      return
    }
    yield* listen(one)
    yield* listen(two)
    const tcp = yield* listen(0)
    const address = tcp.address()
    if (!address || typeof address === "string") throw new Error("TCP positive control unavailable")
    const script = `Promise.all(${JSON.stringify([one, two, { host: "127.0.0.1", port: address.port }])}.map(p=>new Promise(r=>{const c=require('net').connect(p);let out='';c.on('data',d=>out+=d);c.on('end',()=>r(out));c.on('error',e=>r(e.code));c.setTimeout(1000,()=>{c.destroy();r('TIMEOUT')})}))).then(r=>console.log(JSON.stringify(r)))`
    const baseline = yield* f.processes.run(yield* f.wrap(script), { timeout: "5 seconds" })
    expect(baseline.exitCode).toBe(0)
    expect(JSON.parse(baseline.stdout.toString())).toEqual(["one.sock", "two.sock", "tcp"])
    if (process.platform === "linux") {
      const held = yield* Effect.flip(f.wrap(script, profile))
      expect(held.reason).toBe("sandbox-unix-socket-exact-policy-unsupported")
      console.info("Linux SRT 0.0.78: exact Unix socket paths unsupported; working socket/TCP controls and HOLD measured")
      return
    }
    const command = yield* f.wrap(script, profile)
    profile.sandbox.allowedUnixSockets[0].path = two
    const allowed = yield* f.processes.run(command, { timeout: "5 seconds" })
    expect(allowed.exitCode).toBe(0)
    expect(JSON.parse(allowed.stdout.toString())).toEqual(["one.sock", "EPERM", "EPERM"])
    const elsewhere = path.join(f.directory, "elsewhere")
    yield* f.fs.makeDirectory(elsewhere)
    const mismatch = yield* f.processes.run(yield* f.wrap(script, profile, elsewhere, f.directory), { timeout: "5 seconds" })
    expect(JSON.parse(mismatch.stdout.toString())).toEqual(["EPERM", "EPERM", "EPERM"])
    const denied = yield* f.processes.run(yield* f.wrap(script, { requireSandbox: true, writeRoots: [] }), { timeout: "5 seconds" })
    expect(JSON.parse(denied.stdout.toString())).toEqual(["EPERM", "EPERM", "EPERM"])
  }), 30_000,
)

it.live("invalid Unix socket grants HOLD before preparing output parents or unconfined fallback", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const file = path.join(f.directory, "ordinary-file")
    yield* f.fs.writeFileString(file, "untouched")
    yield* Effect.forEach(["*.sock", "missing.sock", "ordinary-file"], (name) => Effect.gen(function* () {
      const held = yield* Effect.flip(f.wrap("", { requireSandbox: true, writeRoots: ["must/not/out"], sandbox: {
        enabled: true, scratch: true, unconfinedFallback: true, allowedUnixSockets: [{ directory: f.directory, path: path.join(f.directory, name) }],
      } }))
      expect(held.reason).toMatch(/^sandbox-unix-socket-/)
      expect(yield* f.fs.exists(path.join(f.directory, "must"))).toBe(false)
    }), { discard: true })
    expect(yield* f.fs.readFileString(file)).toBe("untouched")
  }),
)

it.live("confined generator prepares nested file parents; sibling denied and caches scratch-scoped", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const fact = yield* ToolSafetySandbox.status()
    if (fact.shellWrites === "unenforced") {
      const held = yield* Effect.flip(f.wrap("", { requireSandbox: true }))
      expect(held.reason).toMatch(/^(?:required-process-sandbox-unavailable|sandbox-platform-unavailable)$/)
      console.info(`No live jail: ${fact.shellSandbox.reason}; unavailable HOLD measured, no confinement claim`)
      return
    }
    const profile = { requireSandbox: true, writeRoots: ["gen/nested/out.ts"], sandbox: { enabled: true, scratch: true } }
    const command = yield* f.wrap("const f=require('fs');f.mkdirSync('gen/nested',{recursive:true});f.writeFileSync('gen/nested/out.ts','generated');let denied=false;try{f.writeFileSync('gen/nested/sibling','bad')}catch(e){denied=['EACCES','EPERM'].includes(e.code)};f.writeFileSync(require('path').join(process.env.GOMODCACHE,'probe'),'module');console.log(JSON.stringify({denied,go:process.env.GOCACHE,mod:process.env.GOMODCACHE,tmp:process.env.TMPDIR}))", profile)
    expect(yield* f.fs.isDir(path.join(f.directory, "gen", "nested"))).toBe(true)
    expect(yield* f.fs.exists(path.join(f.directory, "gen", "nested", "out.ts"))).toBe(false)
    const result = yield* f.processes.run(command, { timeout: "5 seconds" })
    expect(result.exitCode).toBe(0)
    const out = JSON.parse(result.stdout.toString())
    expect(out.denied).toBe(true)
    expect(out.go).toBe(path.join(out.tmp, "go-build"))
    expect(out.mod).toBe(path.join(out.tmp, "go-mod"))
    expect(yield* f.fs.readFileString(path.join(out.mod, "probe"))).toBe("module")
    expect(yield* f.fs.readFileString(path.join(f.directory, "gen", "nested", "out.ts"))).toBe("generated")
    expect(yield* f.fs.exists(path.join(f.directory, "gen", "nested", "sibling"))).toBe(false)
  }), 30_000,
)
