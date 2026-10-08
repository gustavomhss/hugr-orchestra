import { expect } from "bun:test"
import path from "node:path"
import { createServer } from "node:net"
import { pathToFileURL } from "node:url"
import { Deferred, Effect, Fiber } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { SandboxParents } from "../src/sandbox-parents"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const fact = await Effect.runPromise(ToolSafetySandbox.status())
// Unsupported/unavailable hosts measure HOLD separately, never count it as confinement conformance.
const confined = fact.shellWrites === "enforced" ? it.live : it.live.skip
if (fact.shellWrites === "unenforced") console.info(`Confinement tests skipped: ${fact.shellSandbox.reason}`)
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
  return { fs, processes, directory, node, wrap }
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

it.live("default wrap does not prepare output parents, including with a model-style environment hint", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(f.node, ["-e", ""], {
      cwd: f.directory, env: { ORCHESTRA_PREPARE_PARENTS: "true" },
    })).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true, writeRoots: ["pending/deep/out.ts"], sandbox: { enabled: true, scratch: true, unconfinedFallback: true } }),
      Effect.provideService(ToolSafety.NativeContext, { directory: f.directory }),
    )
    expect(command._tag).toBe("StandardCommand")
    expect(yield* f.fs.exists(path.join(f.directory, "pending"))).toBe(false)
  }),
)

it.live("explicit Go read-only cache flags HOLD before filesystem acquisition, scratch or parents", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const acquisitions: string[] = []
    const fs = {
      ...f.fs,
      realPath: (target: string) => f.fs.realPath(target).pipe(Effect.tap(() => Effect.sync(() => acquisitions.push(target)))),
      makeTempDirectoryScoped: f.fs.makeTempDirectoryScoped,
    }
    yield* Effect.forEach(["0", "f", "F", "false", "FALSE", "False"].flatMap((value) =>
      ["-", "--"].flatMap((prefix) => ["", "'", '"'].map((quote) => `-trimpath\t${quote}${prefix}modcacherw=${value}${quote}\r\n-buildvcs=false`))), (GOFLAGS) => Effect.gen(function* () {
      const env = { GOFLAGS }
      const result = yield* ToolSafetySandbox.wrap(ChildProcess.make(f.node, ["-e", "require('fs').writeFileSync('spawned','bad')"], {
        cwd: f.directory, env, extendEnv: false,
      }), { prepareParents: true }).pipe(
        Effect.provideService(FSUtil.Service, fs),
        Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true, writeRoots: ["pending/deep/out"], sandbox: { enabled: true, scratch: true, unconfinedFallback: true } }),
        Effect.provideService(ToolSafety.NativeContext, { directory: f.directory }),
        Effect.result,
      )
      expect(result._tag).toBe("Failure")
      if (result._tag !== "Failure") throw new Error("Read-only Go cache request was overridden")
      expect(result.failure).toBeInstanceOf(ToolSafety.Denied)
      expect(result.failure.reason).toBe("sandbox-go-readonly-cache-unsupported")
      expect(env.GOFLAGS).toBe(GOFLAGS)
      expect(acquisitions).toEqual([])
      expect(yield* f.fs.exists(path.join(f.directory, "pending"))).toBe(false)
      expect(yield* f.fs.exists(path.join(f.directory, "spawned"))).toBe(false)
    }), { discard: true })
  }),
)

it.live("Go quoted fields do not interpret inner quotes or unrelated flag values as read-only cache requests", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.forEach(["-modcacherw", "--modcacherw=true", '-ldflags="-modcacherw=false"', "-modcacherw='false'", '"-modcacherw=false', "-modcacherw=FALSELY"], (GOFLAGS) => Effect.gen(function* () {
      // These flags are unconflicted or Go-owned syntax errors. An unsandboxed child receives them unchanged.
      const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(f.node, ["-e", ""], { cwd: f.directory, env: { GOFLAGS }, extendEnv: false })).pipe(
        Effect.provideService(ToolSafety.RuntimeProfile, { sandbox: { enabled: false, scratch: true } }),
      )
      expect(command._tag).toBe("StandardCommand")
      if (command._tag !== "StandardCommand") throw new Error("Unexpected pipeline")
      expect(command.options.env?.GOFLAGS).toBe(GOFLAGS)
    }), { discard: true })
  }),
)

it.live("later multi-root mkdir failure rolls back only owned empty directories and preserves foreign bytes", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const a = path.join(f.directory, "a")
    const b = path.join(f.directory, "b")
    const targets = yield* SandboxParents.plan(f.fs, f.directory, [path.join(a, "deep", "out"), path.join(b, "deep", "out")], [])
    // Another host actor occupies the second root after planning. None of its directories belong to preparation.
    yield* f.fs.makeDirectory(path.join(b, "deep"), { recursive: true })
    yield* f.fs.writeFileString(path.join(b, "deep", "owner"), "unfamiliar")
    const failed = yield* Effect.flip(SandboxParents.prepare(f.fs, f.directory, targets))
    expect(failed.reason).toBe("sandbox-parent-exclusive-mkdir")
    expect(yield* f.fs.exists(a)).toBe(false)
    expect(yield* f.fs.readFileString(path.join(b, "deep", "owner"))).toBe("unfamiliar")

    // Inject a real foreign write at the filesystem yield before the second root's exclusive mkdir.
    const occupied = yield* Effect.flip(SandboxParents.prepare({
      ...f.fs,
      realPath: (target) => f.fs.realPath(target).pipe(Effect.tap(() => Effect.gen(function* () {
        if (target === f.directory && (yield* f.fs.exists(path.join(a, "deep"))))
          yield* f.fs.writeFileString(path.join(a, "deep", "owner"), "new unfamiliar bytes")
      }))),
    }, f.directory, targets))
    expect(occupied.reason).toBe("sandbox-parent-exclusive-mkdir")
    expect(yield* f.fs.readFileString(path.join(a, "deep", "owner"))).toBe("new unfamiliar bytes")
    expect(yield* f.fs.readFileString(path.join(b, "deep", "owner"))).toBe("unfamiliar")
  }),
)

it.live("failed preparation preserves a replacement directory with a different identity", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const target = path.join(f.directory, "owned")
    const moved = path.join(f.directory, "moved")
    const failed = yield* Effect.flip(SandboxParents.prepare({
      ...f.fs,
      realPath: (entry) => f.fs.realPath(entry).pipe(Effect.tap(() => Effect.gen(function* () {
        if (entry !== target) return
        yield* f.fs.rename(target, moved)
        yield* f.fs.makeDirectory(target)
        yield* f.fs.realPath(path.join(f.directory, "absent-control"))
      }))),
    }, f.directory, [target]))
    expect(failed.reason).toBe("sandbox-parent-placement-acquisition")
    expect(yield* f.fs.isDir(target)).toBe(true)
    expect(yield* f.fs.isDir(moved)).toBe(true)
  }),
)

it.live("interrupted multi-root preparation rolls back its own empty directories", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const ready = yield* Deferred.make<void>()
    const targets = yield* SandboxParents.plan(f.fs, f.directory, [path.join(f.directory, "a", "deep", "out"), path.join(f.directory, "b", "out")], [])
    const fiber = yield* SandboxParents.prepare({
      ...f.fs,
      realPath: (target) => f.fs.realPath(target).pipe(Effect.tap(() => Effect.gen(function* () {
        if (target !== f.directory || !(yield* f.fs.exists(path.join(f.directory, "a", "deep")))) return
        yield* Deferred.succeed(ready, undefined)
        yield* Effect.never
      }))),
    }, f.directory, targets).pipe(Effect.forkScoped)
    yield* Deferred.await(ready).pipe(Effect.timeout("5 seconds"))
    expect(yield* f.fs.isDir(path.join(f.directory, "a", "deep"))).toBe(true)
    yield* Fiber.interrupt(fiber)
    expect(yield* f.fs.exists(path.join(f.directory, "a"))).toBe(false)
    expect(yield* f.fs.exists(path.join(f.directory, "b"))).toBe(false)
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

it.live("malformed Unix grants are typed HOLD even with sandbox disabled and fallback enabled", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.forEach([null, {}, "socket", [null], [false], [{}], [{ directory: 7, path: "/socket" }], [{ directory: f.directory, path: 7 }]], (value) => Effect.gen(function* () {
      const profile = { writeRoots: ["must/not/out"], sandbox: { enabled: false, unconfinedFallback: true,
        allowedUnixSockets: [{ directory: f.directory, path: path.join(f.directory, "missing.sock") }] } }
      Reflect.set(profile.sandbox, "allowedUnixSockets", value)
      const result = yield* f.wrap("", profile).pipe(Effect.result)
      expect(result._tag).toBe("Failure")
      if (result._tag !== "Failure") throw new Error("Malformed socket grant was not held")
      expect(result.failure).toBeInstanceOf(ToolSafety.Denied)
      expect(result.failure.reason).toBe(Array.isArray(value) ? "sandbox-unix-socket-invalid-entry" : "sandbox-unix-socket-invalid-grants")
      expect(yield* f.fs.exists(path.join(f.directory, "must"))).toBe(false)
    }), { discard: true })
  }),
)

it.live("other native location does not acquire an absent foreign socket", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const elsewhere = path.join(f.directory, "elsewhere")
    yield* f.fs.makeDirectory(elsewhere)
    const profile = { requireSandbox: true, writeRoots: [], sandbox: { enabled: true, unconfinedFallback: true,
      allowedUnixSockets: [{ directory: f.directory, path: path.join(f.directory, "absent-parent", "missing.sock") }] } }
    const result = yield* f.wrap("", profile, elsewhere).pipe(Effect.result)
    if (process.platform === "darwin") {
      expect(result._tag).toBe("Success")
      return
    }
    expect(result._tag).toBe("Failure")
    if (result._tag !== "Failure") throw new Error("Unsupported socket policy did not HOLD")
    expect(result.failure.reason).toBe(process.platform === "linux"
      ? "sandbox-unix-socket-exact-policy-unsupported" : "sandbox-unix-socket-platform-unsupported")
    expect(yield* f.fs.exists(path.join(f.directory, "absent-parent"))).toBe(false)
  }),
)

it.live("unavailable process sandbox HOLDs without preparing parents", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    if (fact.shellWrites === "enforced") return
    const held = yield* Effect.flip(f.wrap("", { requireSandbox: true, writeRoots: ["unavailable/deep/out"] }))
    expect(held.reason).toMatch(/^(?:required-process-sandbox-unavailable|sandbox-platform-unavailable)$/)
    expect(yield* f.fs.exists(path.join(f.directory, "unavailable"))).toBe(false)
  }),
)

confined("confined generator prepares nested file parents; sibling denied and caches scratch-scoped", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const profile = { requireSandbox: true, writeRoots: ["gen/nested/out.ts"], sandbox: { enabled: true, scratch: true } }
    const env = { GOCACHE: path.join(f.directory, "owner-build"), GOMODCACHE: path.join(f.directory, "owner-mod") }
    yield* Effect.forEach(Object.values(env), (directory) => f.fs.makeDirectory(directory), { discard: true })
    yield* Effect.forEach(Object.values(env), (directory) => f.fs.writeFileString(path.join(directory, "sentinel"), "owner"), { discard: true })
    const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(f.node, ["-e", "const f=require('fs'),p=require('path');f.mkdirSync('gen/nested',{recursive:true});f.writeFileSync('gen/nested/out.ts','generated');let denied=false;try{f.writeFileSync('gen/nested/sibling','bad')}catch(e){denied=['EACCES','EPERM'].includes(e.code)};f.writeFileSync(p.join(process.env.GOMODCACHE,'probe'),'module');f.writeFileSync(p.join(process.env.GOCACHE,'probe'),'build');const ownerDenied=[process.env.OWNER_BUILD,process.env.OWNER_MOD].every(dir=>{try{f.writeFileSync(p.join(dir,'sentinel'),'changed');return false}catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;return true}});console.log(JSON.stringify({denied,ownerDenied,go:process.env.GOCACHE,mod:process.env.GOMODCACHE,tmp:process.env.TMPDIR}))"], {
      cwd: f.directory, env: { ...env, OWNER_BUILD: env.GOCACHE, OWNER_MOD: env.GOMODCACHE },
    }), { prepareParents: true }).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, profile),
      Effect.provideService(ToolSafety.NativeContext, { directory: f.directory }),
    )
    expect(yield* f.fs.isDir(path.join(f.directory, "gen", "nested"))).toBe(true)
    expect(yield* f.fs.exists(path.join(f.directory, "gen", "nested", "out.ts"))).toBe(false)
    const result = yield* f.processes.run(command, { timeout: "5 seconds" })
    expect(result.exitCode).toBe(0)
    const out = JSON.parse(result.stdout.toString())
    expect(out.denied).toBe(true)
    expect(out.ownerDenied).toBe(true)
    expect(out.go).toBe(path.join(out.tmp, "go-build"))
    expect(out.mod).toBe(path.join(out.tmp, "go-mod"))
    expect(yield* f.fs.readFileString(path.join(out.mod, "probe"))).toBe("module")
    expect(yield* f.fs.readFileString(path.join(out.go, "probe"))).toBe("build")
    yield* Effect.forEach(Object.values(env), (directory) => Effect.gen(function* () {
      expect(yield* f.fs.readFileString(path.join(directory, "sentinel"))).toBe("owner")
    }), { discard: true })
    expect(env).toEqual({ GOCACHE: path.join(f.directory, "owner-build"), GOMODCACHE: path.join(f.directory, "owner-mod") })
    expect(yield* f.fs.readFileString(path.join(f.directory, "gen", "nested", "out.ts"))).toBe("generated")
    expect(yield* f.fs.exists(path.join(f.directory, "gen", "nested", "sibling"))).toBe(false)
  }), 30_000,
)

confined("real Go downloads and builds in removable scoped scratch, preserving owner flags and caches", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const go = yield* ToolSafetySandbox.available("go")
    if (!go) throw new Error("BLOCKED: real Go unavailable")
    const proxy = path.join(f.directory, "proxy", "example.com", "scratch", "@v")
    yield* f.fs.makeDirectory(proxy, { recursive: true })
    yield* f.fs.writeFileString(path.join(proxy, "v1.0.0.mod"), "module example.com/scratch\n\ngo 1.20\n")
    yield* f.fs.writeFileString(path.join(proxy, "v1.0.0.info"), JSON.stringify({ Version: "v1.0.0", Time: "2020-01-01T00:00:00Z" }))
    // Offline module proxy ZIP: go.mod plus scratch.go exporting Value = 42; no network/cache seeding needed.
    yield* f.fs.writeFile(path.join(proxy, "v1.0.0.zip"), Buffer.from("UEsDBBQAAAAAAIYJSF2hrap0JAAAACQAAAAhAAAAZXhhbXBsZS5jb20vc2NyYXRjaEB2MS4wLjAvZ28ubW9kbW9kdWxlIGV4YW1wbGUuY29tL3NjcmF0Y2gKCmdvIDEuMjAKUEsDBBQAAAAAAIYJSF3Re78jIgAAACIAAAAlAAAAZXhhbXBsZS5jb20vc2NyYXRjaEB2MS4wLjAvc2NyYXRjaC5nb3BhY2thZ2Ugc2NyYXRjaAoKY29uc3QgVmFsdWUgPSA0MgpQSwECFAMUAAAAAACGCUhdoa2qdCQAAAAkAAAAIQAAAAAAAAAAAAAAgAEAAAAAZXhhbXBsZS5jb20vc2NyYXRjaEB2MS4wLjAvZ28ubW9kUEsBAhQDFAAAAAAAhglIXdF7vyMiAAAAIgAAACUAAAAAAAAAAAAAAIABYwAAAGV4YW1wbGUuY29tL3NjcmF0Y2hAdjEuMC4wL3NjcmF0Y2guZ29QSwUGAAAAAAIAAgCiAAAAyAAAAAAA", "base64"))
    yield* f.fs.writeFileString(path.join(f.directory, "go.mod"), "module fixture\n\ngo 1.20\n\nrequire example.com/scratch v1.0.0\n")
    yield* f.fs.writeFileString(path.join(f.directory, "main.go"), 'package main\nimport "example.com/scratch"\nfunc main() { println(scratch.Value) }\n')
    const owner = { GOCACHE: path.join(f.directory, "owner-build"), GOMODCACHE: path.join(f.directory, "owner-mod") }
    yield* Effect.forEach(Object.values(owner), (directory) => f.fs.makeDirectory(directory), { discard: true })
    yield* Effect.forEach(Object.values(owner), (directory) => f.fs.writeFileString(path.join(directory, "sentinel"), "owner"), { discard: true })
    const env = { ...owner, GOPROXY: pathToFileURL(path.join(f.directory, "proxy")).href, GOSUMDB: "off", GOTOOLCHAIN: "local", GOTELEMETRY: "off", GOENV: "off", CGO_ENABLED: "0", GOFLAGS: "-trimpath -buildvcs=false", GOPRIVATE: "", GONOPROXY: "", GONOSUMDB: "" }
    const before = { ...env }
    const scratch = yield* Effect.scoped(Effect.gen(function* () {
      const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(f.node, ["-e", `const c=require('child_process');for(const args of [['mod','download','example.com/scratch'],['build','-mod=mod','-o','gen/deep/out','.']]){const r=c.spawnSync(${JSON.stringify(go)},args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||String(r.error));}console.log(JSON.stringify({go:process.env.GOCACHE,mod:process.env.GOMODCACHE,tmp:process.env.TMPDIR,flags:process.env.GOFLAGS}))`], {
        cwd: f.directory, env,
      }), { prepareParents: true }).pipe(
        Effect.provideService(ToolSafety.RuntimeProfile, { requireSandbox: true, writeRoots: ["gen/deep/out", "go.sum"], sandbox: { enabled: true, scratch: true } }),
        Effect.provideService(ToolSafety.NativeContext, { directory: f.directory }),
      )
      expect(command._tag).toBe("StandardCommand")
      if (command._tag !== "StandardCommand") throw new Error("Unexpected Go pipeline")
      expect(command.options.env?.GOFLAGS).toBe(`${env.GOFLAGS} -modcacherw`)
      const result = yield* f.processes.run(command, { timeout: "120 seconds" })
      if (result.exitCode !== 0) throw new Error(`Real Go control failed: ${result.stderr.toString()}`)
      const out = JSON.parse(result.stdout.toString())
      expect(out.flags).toBe("-trimpath -buildvcs=false -modcacherw")
      expect(out.go).toBe(path.join(out.tmp, "go-build"))
      expect(out.mod).toBe(path.join(out.tmp, "go-mod"))
      expect((yield* f.fs.readDirectory(out.go)).some((entry) => /^[a-f0-9]{2}$/.test(entry))).toBe(true)
      expect(yield* f.fs.readFileString(path.join(out.mod, "example.com", "scratch@v1.0.0", "scratch.go"))).toContain("const Value = 42")
      if (typeof out.tmp !== "string") throw new Error("Go child did not report its scratch directory")
      return out.tmp
    }))
    expect(yield* f.fs.exists(scratch)).toBe(false)
    expect(env).toEqual(before)
    expect(yield* f.fs.exists(path.join(f.directory, "gen", "deep", "out"))).toBe(true)
    yield* Effect.forEach(Object.values(owner), (directory) => Effect.gen(function* () {
      expect(yield* f.fs.readDirectory(directory)).toEqual(["sentinel"])
      expect(yield* f.fs.readFileString(path.join(directory, "sentinel"))).toBe("owner")
    }), { discard: true })
  }), 150_000,
)
