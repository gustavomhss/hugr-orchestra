import { expect } from "bun:test"
import path from "node:path"
import { createServer } from "node:net"
import { networkInterfaces } from "node:os"
import { Effect } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const fixture = Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const directory = yield* fs.makeTempDirectoryScoped({ prefix: "le-" }).pipe(Effect.flatMap(fs.realPath))
  const node = yield* ToolSafetySandbox.available("node")
  if (!node) throw new Error("BLOCKED: Node unavailable")
  const wrap = (script: string, profile?: ToolSafety.Profile, native = directory) =>
    ToolSafetySandbox.wrap(ChildProcess.make(node, ["-e", script], { cwd: directory })).pipe(
      Effect.provideService(ToolSafety.RuntimeProfile, profile),
      Effect.provideService(ToolSafety.NativeContext, { directory: native }),
    )
  return { fs, processes, directory, wrap }
})

const listen = (host = "127.0.0.1", port = 0) => Effect.acquireRelease(
  Effect.promise(() => new Promise<ReturnType<typeof createServer>>((resolve, reject) => {
    const server = createServer((socket) => socket.end(host))
    server.once("error", reject)
    server.listen({ host, port, ipv6Only: true }, () => resolve(server))
  })),
  (server) => Effect.promise(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))),
)

it.live("exact loopback uses only declared Darwin IPv4 broker; other hosts HOLD and default/bind stay denied", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    const one = yield* listen()
    const two = yield* listen()
    const first = one.address()
    const second = two.address()
    if (!first || typeof first === "string" || !second || typeof second === "string") throw new Error("TCP controls unavailable")
    const endpoints = [{ host: "127.0.0.1", port: first.port }, { host: "127.0.0.1", port: second.port }]
    if (process.platform === "darwin") {
      const addresses = Object.values(networkInterfaces()).flatMap((entries) => entries ?? [])
        .filter((entry) => entry.family === "IPv4" && entry.address !== "127.0.0.1")
      const other = addresses.find((entry) => entry.address === "127.0.0.2") ?? addresses[0]
      if (!other) throw new Error("BLOCKED: macOS other working IPv4 address unavailable")
      yield* listen(other.address, first.port)
      endpoints.push({ host: other.address, port: first.port })
      yield* listen("::1", first.port)
      endpoints.push({ host: "::1", port: first.port }, { host: "::ffff:127.0.0.1", port: first.port })
      console.info(`macOS: working other IPv4 ${other.address} on the granted port is a positive control`)
    }
    const script = `Promise.all(${JSON.stringify(endpoints)}.map(p=>new Promise(r=>{const c=require('net').connect(p);let out='';c.on('data',d=>out+=d);c.on('end',()=>r(out));c.on('error',e=>r(e.code));c.setTimeout(1000,()=>{c.destroy();r('TIMEOUT')})}))).then(r=>console.log(JSON.stringify(r)))`
    const baseline = yield* f.processes.run(yield* f.wrap(script), { timeout: "5 seconds" })
    expect(baseline.exitCode).toBe(0)
    expect(JSON.parse(baseline.stdout.toString())).toEqual(endpoints.map((entry) => entry.host === "::ffff:127.0.0.1" ? "127.0.0.1" : entry.host))
    const grants = [{ directory: f.directory, host: "127.0.0.1" as const, port: first.port }]
    const profile = { requireSandbox: true, writeRoots: ["must/not/out"], sandbox: { enabled: true, scratch: true, unconfinedFallback: true,
      allowedLoopbackEndpoints: grants } } satisfies ToolSafety.Profile
    if (process.platform !== "darwin") {
      const held = yield* Effect.flip(f.wrap(script, profile))
      expect(held.reason).toBe("sandbox-loopback-endpoint-exact-policy-unsupported")
      expect(yield* f.fs.exists(path.join(f.directory, "must"))).toBe(false)
      console.info(`${process.platform}: working TCP controls and exact loopback policy HOLD measured`)
      return
    }
    const bridged = yield* f.processes.run(yield* f.wrap(script, profile), { timeout: "5 seconds" })
    expect(bridged.exitCode).toBe(0)
    expect(JSON.parse(bridged.stdout.toString())).toEqual(["127.0.0.1", ...endpoints.slice(1).map(() => "EPERM")])
    expect(yield* f.fs.exists(path.join(f.directory, "must"))).toBe(false)
    const elsewhere = path.join(f.directory, "elsewhere")
    yield* f.fs.makeDirectory(elsewhere)
    const mismatch = yield* f.processes.run(yield* f.wrap(script, { ...profile, writeRoots: [] }, elsewhere), { timeout: "5 seconds" })
    expect(JSON.parse(mismatch.stdout.toString())).toEqual(endpoints.map(() => "EPERM"))
    const denied = yield* f.processes.run(yield* f.wrap(script, { requireSandbox: true, writeRoots: [] }), { timeout: "5 seconds" })
    expect(JSON.parse(denied.stdout.toString())).toEqual(endpoints.map(() => "EPERM"))
    const bind = "const s=require('net').createServer();s.on('error',e=>console.log(e.code));s.listen({host:'127.0.0.1',port:0},()=>s.close(()=>console.log('BOUND')))"
    const bindControl = yield* f.processes.run(yield* f.wrap(bind), { timeout: "5 seconds" })
    expect(bindControl.stdout.toString().trim()).toBe("BOUND")
    const bound = yield* f.processes.run(yield* f.wrap(bind, { ...profile, writeRoots: [] }), { timeout: "5 seconds" })
    expect(bound.stdout.toString().trim()).toBe("EPERM")
  }), 30_000,
)

it.live("invalid loopback IP, port, directory and grant shapes HOLD before output parent mkdir on every host", () =>
  Effect.gen(function* () {
    const f = yield* fixture
    yield* Effect.forEach([
      ...[0, -1, 65536, 1.5, NaN, Infinity, "9042", "*", "9000-9100", undefined].map((value) => ({ field: "port", value, reason: "invalid-port" })),
      ...["localhost", "127.0.0.2", "::1", "0.0.0.0", "1.1.1.1", "*", "http://127.0.0.1:9042", undefined].map((value) => ({ field: "host", value, reason: "invalid-host" })),
      ...["", ".", "*", undefined].map((value) => ({ field: "directory", value, reason: "invalid-directory" })),
      { field: "directory", value: path.join(f.directory, "missing"), reason: "directory-acquisition" },
    ], (entry) => Effect.gen(function* () {
      const grant = { directory: f.directory, host: "127.0.0.1" as const, port: 9042 }
      Reflect.set(grant, entry.field, entry.value)
      const held = yield* Effect.flip(f.wrap("", { requireSandbox: true, writeRoots: ["must/not/out"], sandbox: {
        enabled: true, scratch: true, unconfinedFallback: true, allowedLoopbackEndpoints: [grant],
      } }))
      // Unsupported hosts cannot canonicalize placement, but still HOLD before filesystem effects.
      expect(held.reason).toBe(process.platform !== "darwin" && process.platform !== "linux" && entry.reason === "directory-acquisition"
        ? "sandbox-loopback-endpoint-exact-policy-unsupported" : `sandbox-loopback-endpoint-${entry.reason}`)
      expect(yield* f.fs.exists(path.join(f.directory, "must"))).toBe(false)
    }), { discard: true })
    yield* Effect.forEach([{}, null, [null], ["127.0.0.1:9042"], Array.from({ length: 33 }, () => ({ directory: f.directory, host: "127.0.0.1", port: 9042 }))], (value) => Effect.gen(function* () {
      const profile = { requireSandbox: true, writeRoots: ["must/not/out"], sandbox: { enabled: true, unconfinedFallback: true,
        allowedLoopbackEndpoints: [{ directory: f.directory, host: "127.0.0.1" as const, port: 9042 }] } }
      Reflect.set(profile.sandbox, "allowedLoopbackEndpoints", value)
      const held = yield* Effect.flip(f.wrap("", profile))
      expect(held.reason).toBe(Array.isArray(value)
        ? value.length > 32 ? "sandbox-loopback-endpoint-resource-limit" : "sandbox-loopback-endpoint-invalid-directory"
        : "sandbox-loopback-endpoint-invalid-grants")
      expect(yield* f.fs.exists(path.join(f.directory, "must"))).toBe(false)
    }), { discard: true })
  }),
)
