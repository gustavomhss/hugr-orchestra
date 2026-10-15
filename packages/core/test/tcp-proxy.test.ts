import { expect } from "bun:test"
import path from "node:path"
import { createConnection, createServer, type Socket } from "node:net"
import { lstat } from "node:fs/promises"
import { Cause, Deferred, Effect, Exit, Fiber } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { LayerNode } from "../src/effect/layer-node"
import { FSUtil } from "../src/fs-util"
import { AppProcess } from "../src/process"
import { Global } from "../src/global"
import { Flag } from "../src/flag/flag"
import { Omni } from "../src/omni"
import { TcpProxy } from "../src/tcp-proxy"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const live = process.platform === "win32" ? it.live.skip : it.live

// Unix broker cases are skipped on Windows; still exercise the real spawner required by the suite-wide control.
if (process.platform === "win32") it.live("Windows real AppProcess control runs while Unix broker cases stay skipped", () => Effect.gen(function* () {
  const processes = yield* AppProcess.Service
  const before = Omni.snapshot()
  const response = yield* processes.run(ChildProcess.make("node", ["-e", "process.stdout.write('process-control')"]))
  expect(response.exitCode).toBe(0)
  expect(response.stdout.toString()).toBe("process-control")
  expect(Omni.snapshot().delegations - before.delegations).toBe(0)
  expect(Omni.snapshot().spawns - before.spawns).toBe(Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off" ? 0 : 1)
}))

const target = (host = "127.0.0.1", port = 0, reply?: string, stream = false) => Effect.gen(function* () {
  const clients = new Set<Socket>()
  const accepted: Socket[] = []
  const server = yield* Effect.acquireRelease(Effect.sync(() => createServer({ allowHalfOpen: true }, (socket) => {
    clients.add(socket)
    accepted.push(socket)
    socket.on("error", () => socket.destroy())
    socket.on("close", () => clients.delete(socket))
    if (stream) { socket.pipe(socket); return }
    const chunks: Buffer[] = []
    socket.on("data", (chunk) => chunks.push(chunk))
    // Reply only after FIN: dropping half-close in either direction fails this control.
    socket.on("end", () => socket.write(reply ?? Buffer.concat(chunks), () => socket.end()))
  })), (server) => Effect.promise(() => new Promise<void>((resolve) => {
    clients.forEach((socket) => socket.destroy())
    server.close(() => resolve())
  })))
  yield* Effect.promise(() => new Promise<void>((resolve, reject) => {
    server.once("error", reject)
    server.listen(port, host, () => { server.removeListener("error", reject); resolve() })
  }))
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("TCP fixture address unavailable")
  return { server, port: address.port, accepted }
})

const exchange = (destination: string | { host: string; port: number }, payload = Buffer.from("echo")) =>
  Effect.gen(function* () {
    // Native Node client controls FIN independently of Bun's node:net compatibility layer in the host broker.
    const processes = yield* AppProcess.Service
    const node = yield* ToolSafetySandbox.available("node")
    if (!node) throw new Error("BLOCKED: Node TCP client unavailable")
    const script = "const d=JSON.parse(process.argv[1]),p=require('fs').readFileSync(0);" +
      "const c=require('net').createConnection(typeof d==='string'?{path:d,allowHalfOpen:true}:{...d,allowHalfOpen:true});" +
      "c.on('data',d=>process.stdout.write(d));c.on('end',()=>c.destroy());" +
      "c.on('error',e=>{console.error(e.code);process.exitCode=2});" +
      "c.setTimeout(5000,()=>{c.destroy();process.exitCode=3});c.on('connect',()=>c.end(p))"
    const response = yield* processes.run(ChildProcess.make(node, ["-e", script, JSON.stringify(destination)]), {
      stdin: payload, timeout: "8 seconds",
    })
    if (response.exitCode !== 0) return yield* Effect.fail(new Error(`exchange ${JSON.stringify(destination)} (${response.stdout.length} reply bytes): ` +
      (response.stderr.toString() || `client exit ${response.exitCode}`)))
    return response.stdout
  })

live("native broker startup uses AppProcess without delegation before client exchange", () => Effect.gen(function* () {
  const one = yield* target()
  const before = Omni.snapshot()
  const sockets = yield* TcpProxy.listen([one.port])
  const after = Omni.snapshot()
  expect(after.delegations - before.delegations).toBe(0)
  expect(after.spawns - before.spawns).toBe(Flag.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER === "off" ? 0 : 1)
  expect(one.accepted.length).toBe(0)
  expect((yield* exchange(sockets[0])).toString()).toBe("echo")
}))

live("scoped broker is private, lazy, snapshots ports and preserves backpressure plus half-close", () => Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const one = yield* target()
  const two = yield* target("127.0.0.1", 0, "wrong endpoint")
  const ports = [one.port]
  const pending = TcpProxy.listen(ports)
  ports[0] = two.port
  const payload = Buffer.alloc(8 * 1024 * 1024, 0x61)
  expect((yield* exchange({ host: "127.0.0.1", port: one.port }, payload)).equals(payload)).toBe(true)
  const sockets = yield* Effect.scoped(Effect.gen(function* () {
    const sockets = yield* pending
    expect(one.accepted.length).toBe(1) // Unconfined control only; idle broker opens no TCP target.
    const directory = yield* Effect.promise(() => lstat(path.dirname(sockets[0])))
    const socket = yield* Effect.promise(() => lstat(sockets[0]))
    expect(directory.mode & 0o777).toBe(0o700)
    expect(socket.mode & 0o777).toBe(0o600)
    expect(socket.isSocket()).toBe(true)
    expect(Buffer.byteLength(sockets[0], "utf8")).toBeLessThan(104)
    expect((yield* exchange(sockets[0], payload)).equals(payload)).toBe(true)
    expect(two.accepted.length).toBe(0)
    return sockets
  }))
  expect(yield* fs.exists(path.dirname(sockets[0]))).toBe(false)
  expect((yield* Effect.result(exchange(sockets[0])))._tag).toBe("Failure")
}), 30_000)

if (process.platform === "linux") live("fixed host cannot be changed by client bytes, even with same-port alternative working", () => Effect.gen(function* () {
  const one = yield* target("127.0.0.1", 0, "fixed target")
  const other = yield* target("127.0.0.2", one.port, "wrong host")
  expect((yield* exchange({ host: "127.0.0.2", port: other.port })).toString()).toBe("wrong host")
  const sockets = yield* TcpProxy.listen([one.port])
  expect((yield* exchange(sockets[0], Buffer.from(`127.0.0.2:${other.port}\n`))).toString()).toBe("fixed target")
  expect(other.accepted.length).toBe(1)
}))

live("scope failure closes active owned connections and sockets; upstream refusal cleans connection", () => Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const one = yield* target()
  const observed: { sockets?: readonly string[]; client?: Socket } = {}
  const outcome = yield* Effect.scoped(Effect.gen(function* () {
    const sockets = yield* TcpProxy.listen([one.port])
    observed.sockets = sockets
    const client = yield* Effect.promise(() => new Promise<Socket>((resolve, reject) => {
      const client = createConnection(sockets[0])
      client.on("error", reject)
      client.on("connect", () => resolve(client))
    }))
    observed.client = client
    client.on("error", () => client.destroy())
    client.resume()
    yield* Effect.promise(() => new Promise<void>((resolve) => {
      if (one.accepted.length) { resolve(); return }
      one.server.once("connection", () => resolve())
    }))
    return yield* Effect.fail("fixture failure")
  })).pipe(Effect.result)
  expect(outcome._tag).toBe("Failure")
  if (!observed.sockets || !observed.client) throw new Error("cleanup control did not acquire broker/client")
  yield* Effect.promise(() => new Promise<void>((resolve) => {
    if (observed.client?.closed) { resolve(); return }
    observed.client?.once("close", () => resolve())
  }))
  expect(yield* fs.exists(path.dirname(observed.sockets[0]))).toBe(false)
  // Only fixture's own formerly-bound port is used for refusal, never an arbitrary owner service.
  yield* Effect.promise(() => new Promise<void>((resolve) => one.server.close(() => resolve())))
  const refused = yield* TcpProxy.listen([one.port])
  const response = yield* Effect.result(exchange(refused[0]))
  expect(response._tag === "Failure" || response.success.length === 0).toBe(true)
}), 15_000)

live("64 active connections cap is shared across declared endpoints and scope teardown waits for listeners", () => Effect.gen(function* () {
  const one = yield* target("127.0.0.1", 0, undefined, true)
  const two = yield* target("127.0.0.1", 0, undefined, true)
  const clients = yield* Effect.acquireRelease(Effect.sync(() => new Set<Socket>()),
    (clients) => Effect.sync(() => clients.forEach((client) => client.destroy())))
  const sockets = yield* TcpProxy.listen([one.port, two.port])
  yield* Effect.forEach(Array.from({ length: 64 }, (_, index) => index), (index) => Effect.promise(() =>
    new Promise<void>((resolve, reject) => {
      const client = createConnection(sockets[index % 2])
      clients.add(client)
      client.on("error", reject)
      client.on("connect", () => resolve())
    })), { discard: true })
  // Wait for an acknowledged round-trip on every target rather than assuming connect() means host acceptance.
  yield* Effect.forEach([...clients], (client) => Effect.promise(() => new Promise<void>((resolve, reject) => {
    client.on("error", reject)
    client.once("data", () => resolve())
    client.write("ready")
  })), { discard: true })
  const before = one.accepted.length + two.accepted.length
  expect(before).toBe(64)
  const overflow = yield* Effect.result(exchange(sockets[1]))
  expect(overflow._tag === "Failure" || overflow.success.length === 0).toBe(true)
  expect(one.accepted.length + two.accepted.length).toBe(before)
}), 30_000)

live("32 declared endpoints remain separate fixed targets at the supported boundary", () => Effect.gen(function* () {
  const targets = yield* Effect.forEach(Array.from({ length: 32 }, (_, index) => index), (index) =>
    target("127.0.0.1", 0, `target-${index}`))
  const sockets = yield* TcpProxy.listen(targets.map((entry) => entry.port))
  expect(sockets.length).toBe(32)
  expect(new Set(sockets).size).toBe(32)
  expect((yield* exchange(sockets[0])).toString()).toBe("target-0")
  expect((yield* exchange(sockets[31])).toString()).toBe("target-31")
  expect(targets.slice(1, 31).every((entry) => entry.accepted.length === 0)).toBe(true)
}), 30_000)

const darwin = process.platform === "darwin" ? it.live : it.live.skip

live("planning denies canonical socket parent before listeners; unrelated denied cache paths do not affect broker", () => Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const one = yield* target()
  const cache = path.join(yield* fs.realPath(Global.Path.cache), "tcp-proxy")
  const base = yield* fs.realPath("/tmp")
  const before = (yield* fs.readDirectory(base)).filter((entry) => entry.startsWith("otcp-"))
  const existed = yield* fs.exists(cache)
  yield* Effect.forEach([path.dirname(base), base], (deny) => Effect.gen(function* () {
    const held = yield* Effect.scoped(TcpProxy.listen([one.port], [deny])).pipe(Effect.flip)
    expect(held.reason).toBe("sandbox-tcp-proxy-denied-path")
    expect(yield* fs.exists(cache)).toBe(existed)
    expect((yield* fs.readDirectory(base)).filter((entry) => entry.startsWith("otcp-")).sort()).toEqual(before.slice().sort())
    expect(one.accepted.length).toBe(0)
  }), { discard: true })
  yield* Effect.forEach([path.dirname(cache), cache, path.join(cache, "denied-child")], (deny) => Effect.scoped(Effect.gen(function* () {
    const sockets = yield* TcpProxy.listen([one.port], [deny])
    expect((yield* exchange(sockets[0])).toString()).toBe("echo")
    expect(yield* fs.exists(cache)).toBe(existed)
  })), { discard: true })
  const accepted = one.accepted.length
  const planned = yield* Effect.scoped(Effect.gen(function* () {
    const planned = yield* TcpProxy.plan([one.port])
    expect(yield* fs.exists(planned.directory)).toBe(true)
    expect((yield* fs.readDirectory(planned.directory)).length).toBe(0)
    expect((yield* Effect.result(exchange(planned.sockets[0])))._tag).toBe("Failure")
    expect(one.accepted.length).toBe(accepted)
    expect(yield* fs.exists(cache)).toBe(existed)
    return planned
  }))
  expect(yield* fs.exists(planned.directory)).toBe(false)
}))

live("interrupted broker scope closes owned active connections before removing socket directory", () => Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const one = yield* target("127.0.0.1", 0, undefined, true)
  const started = yield* Deferred.make<readonly string[]>()
  const fiber = yield* Effect.forkScoped(Effect.scoped(Effect.gen(function* () {
    const sockets = yield* TcpProxy.listen([one.port])
    yield* Deferred.succeed(started, sockets)
    return yield* Effect.never
  })))
  const sockets = yield* Deferred.await(started)
  const client = yield* Effect.acquireRelease(Effect.promise(() => new Promise<Socket>((resolve, reject) => {
    const client = createConnection(sockets[0])
    client.on("error", reject)
    client.on("data", () => resolve(client))
    client.once("connect", () => client.write("active-control"))
  })), (client) => Effect.sync(() => client.destroy()))
  expect(one.accepted.length).toBe(1)
  yield* Fiber.interrupt(fiber)
  const exit = yield* Fiber.await(fiber)
  expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true)
  yield* Effect.promise(() => new Promise<void>((resolve) => {
    if (client.closed) { resolve(); return }
    client.once("close", () => resolve())
  }))
  expect(yield* fs.exists(path.dirname(sockets[0]))).toBe(false)
  expect((yield* Effect.result(exchange(sockets[0])))._tag).toBe("Failure")
}), 15_000)

darwin("Darwin open supplies only owned routes and removed scoped sockets, without a library", () => Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const one = yield* target()
  const proxy = yield* Effect.scoped(TcpProxy.open([one.port]))
  expect(proxy.env).toEqual({ ORCHESTRA_TCP_PROXY_ROUTES: `${one.port}:${Buffer.from(proxy.sockets[0], "utf8").toString("hex")}` })
  expect(Object.keys(proxy).sort()).toEqual(["env", "sockets"])
  expect(yield* fs.exists(path.dirname(proxy.sockets[0]))).toBe(false)
}))

it.live("port shape/resource limits HOLD before acquisition; non-Darwin open never widens policy", () => Effect.gen(function* () {
  yield* Effect.forEach([[], [0], [65536], [1.5], [NaN], [Infinity], [1234, 1234], Array.from({ length: 33 }, (_, index) => index + 1)],
    (ports) => Effect.gen(function* () {
      expect((yield* Effect.flip(TcpProxy.listen(ports))).reason).toBe("sandbox-tcp-proxy-invalid-ports")
    }), { discard: true })
  if (process.platform !== "darwin")
    expect((yield* Effect.flip(TcpProxy.open([1234]))).reason).toBe("sandbox-loopback-endpoint-exact-policy-unsupported")
}))
