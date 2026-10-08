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
import { TcpProxy } from "../src/tcp-proxy"
import { ToolSafety } from "../src/tool-safety"
import { ToolSafetySandbox } from "../src/tool-safety-sandbox"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(LayerNode.group([FSUtil.node, AppProcess.node])))
const live = process.platform === "win32" ? it.live.skip : it.live

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

live("scoped broker is private, lazy, snapshots ports and preserves backpressure plus half-close", () => Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const one = yield* target()
  const two = yield* target("127.0.0.1", 0, "wrong endpoint")
  const ports = [one.port]
  const pending = TcpProxy.listen(ports)
  ports[0] = two.port
  const payload = Buffer.alloc(2 * 1024 * 1024, 0x61)
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

live("planning denies canonical infrastructure before builds or listeners and reserves only private empty sockets", () => Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const one = yield* target()
  const cache = path.join(yield* fs.realPath(Global.Path.cache), "tcp-proxy")
  const base = yield* fs.realPath("/tmp")
  const before = (yield* fs.readDirectory(base)).filter((entry) => entry.startsWith("otcp-"))
  const existed = yield* fs.exists(cache)
  yield* Effect.forEach([path.dirname(cache), cache, path.join(cache, "denied-child"), base], (deny) => Effect.gen(function* () {
    const held = yield* Effect.scoped(TcpProxy.listen([one.port], [deny])).pipe(Effect.flip)
    expect(held.reason).toBe("sandbox-tcp-proxy-denied-path")
    expect(yield* fs.exists(cache)).toBe(existed)
    expect((yield* fs.readDirectory(base)).filter((entry) => entry.startsWith("otcp-")).sort()).toEqual(before.slice().sort())
    expect(one.accepted.length).toBe(0)
  }), { discard: true })
  const planned = yield* Effect.scoped(Effect.gen(function* () {
    const planned = yield* TcpProxy.plan([one.port])
    expect(yield* fs.exists(planned.directory)).toBe(true)
    expect((yield* fs.readDirectory(planned.directory)).length).toBe(0)
    expect((yield* Effect.result(exchange(planned.sockets[0])))._tag).toBe("Failure")
    expect(one.accepted.length).toBe(0)
    expect(yield* fs.exists(cache)).toBe(existed)
    return planned
  }))
  expect(yield* fs.exists(planned.directory)).toBe(false)
}))

live("actual compiler interruption reaps owned PID before removing staging; normal version controls survive", () => Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const compiler = yield* ToolSafetySandbox.available("clang")
  if (!compiler) throw new Error("BLOCKED: real Clang unavailable")
  const root = yield* fs.makeTempDirectoryScoped({ prefix: "compiler-control-" })
  expect((yield* TcpProxy.runCompiler(compiler, ["--version"], { cwd: root, timeout: 5000 })).stdout).toContain("clang")
  const started = yield* Deferred.make<number>()
  const observed: { staging?: string; reapedBeforeRemoval?: boolean } = {}
  const fiber = yield* Effect.forkScoped(Effect.scoped(Effect.gen(function* () {
    const staging = yield* fs.makeTempDirectoryScoped({ directory: root, prefix: "build-" })
    observed.staging = staging
    yield* AppProcess.requireSuccess(yield* processes.run(ChildProcess.make("mkfifo", [path.join(staging, "input.c")]), { timeout: "5 seconds" }))
    const pid = { value: 0 }
    yield* Effect.addFinalizer(() => Effect.gen(function* () {
      const alive = running(pid.value)
      observed.reapedBeforeRemoval = !alive
      // Independent fixture cleanup keeps a deliberately broken ownership mutation from leaving a live child.
      if (alive) {
        process.kill(pid.value, "SIGKILL")
        yield* Effect.whileLoop({ while: () => running(pid.value), body: () => Effect.sleep("10 millis"), step: () => undefined }).pipe(Effect.timeout("2 seconds"), Effect.orDie)
      }
      expect(yield* fs.exists(staging)).toBe(true)
    }).pipe(Effect.orDie))
    return yield* TcpProxy.runCompiler(compiler, ["-x", "c", "-fsyntax-only", path.join(staging, "input.c")], {
      cwd: staging, timeout: 30_000,
      onStart: (value) => { pid.value = value; Deferred.doneUnsafe(started, Effect.succeed(value)) },
    })
  })))
  const pid = yield* Deferred.await(started)
  const identity = yield* processes.run(ChildProcess.make("ps", ["-p", String(pid), "-o", "comm="]), { timeout: "5 seconds" })
  expect(identity.stdout.toString()).toContain("clang")
  expect(running(pid)).toBe(true)
  if (!observed.staging) throw new Error("compiler did not reserve staging")
  expect(yield* fs.exists(observed.staging)).toBe(true)
  yield* Fiber.interrupt(fiber)
  const exit = yield* Fiber.await(fiber)
  expect(observed.reapedBeforeRemoval).toBe(true)
  expect(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause)).toBe(true)
  expect(running(pid)).toBe(false)
  expect(yield* fs.exists(observed.staging)).toBe(false)
  expect((yield* TcpProxy.runCompiler(compiler, ["--version"], { cwd: root, timeout: 5000 })).stdout).toContain("clang")
}), 15_000)

live("actual stalled compiler timeout HOLDs only after close, never as an ordinary successful exit", () => Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const processes = yield* AppProcess.Service
  const compiler = yield* ToolSafetySandbox.available("clang")
  if (!compiler) throw new Error("BLOCKED: real Clang unavailable")
  const staging = yield* fs.makeTempDirectoryScoped({ prefix: "compiler-timeout-" })
  yield* AppProcess.requireSuccess(yield* processes.run(ChildProcess.make("mkfifo", [path.join(staging, "input.c")]), { timeout: "5 seconds" }))
  const observed = { pid: 0 }
  const held = yield* Effect.flip(TcpProxy.runCompiler(compiler, ["-x", "c", "-fsyntax-only", path.join(staging, "input.c")], {
    cwd: staging, timeout: 200, onStart: (pid) => { observed.pid = pid },
  }))
  expect(held.reason).toBe("sandbox-tcp-proxy-compiler-timeout")
  expect(observed.pid).toBeGreaterThan(0)
  expect(running(observed.pid)).toBe(false)
}))

function running(pid: number) {
  if (pid < 1) throw new Error("owned compiler PID missing")
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ESRCH") return false
    throw error
  }
}

darwin("real Darwin helper publication survives scope cleanup and routes name only removed private sockets", () => Effect.gen(function* () {
  const fs = yield* FSUtil.Service
  const one = yield* target()
  const proxy = yield* Effect.scoped(TcpProxy.open([one.port]))
  expect(proxy.env).toEqual({ ORCHESTRA_TCP_PROXY_ROUTES: `${one.port}:${Buffer.from(proxy.sockets[0], "utf8").toString("hex")}` })
  expect(yield* fs.exists(proxy.library)).toBe(true)
  expect(yield* fs.exists(path.dirname(proxy.sockets[0]))).toBe(false)
  expect((yield* Effect.promise(() => lstat(proxy.library))).mode & 0o777).toBe(0o500)
}))

it.live("port shape/resource limits HOLD before acquisition; non-Darwin open never widens policy", () => Effect.gen(function* () {
  yield* Effect.forEach([[], [0], [65536], [1.5], [NaN], [Infinity], [1234, 1234], Array.from({ length: 33 }, (_, index) => index + 1)],
    (ports) => Effect.gen(function* () {
      expect((yield* Effect.flip(TcpProxy.listen(ports))).reason).toBe("sandbox-tcp-proxy-invalid-ports")
    }), { discard: true })
  if (process.platform !== "darwin")
    expect((yield* Effect.flip(TcpProxy.open([1234]))).reason).toBe("sandbox-loopback-endpoint-exact-policy-unsupported")
}))

it.live("bridge argv sets loader values after protected POSIX initialization and preserves exact argv/quoting", () => Effect.sync(() => {
  const bridge = { library: "/private/tmp/quoted ' helper.dylib", env: { ORCHESTRA_TCP_PROXY_ROUTES: "9042:2f746d702f302e736f636b" } }
  const direct = ToolSafetySandbox.proxyInvocation(["/private/tmp/child spaced", "arg with spaces", "--flag"])
  if (direct instanceof ToolSafety.Denied) throw direct
  expect(direct(bridge)).toEqual(["/usr/bin/env", `DYLD_INSERT_LIBRARIES=${bridge.library}`,
    `ORCHESTRA_TCP_PROXY_ROUTES=${bridge.env.ORCHESTRA_TCP_PROXY_ROUTES}`, "/private/tmp/child spaced", "arg with spaces", "--flag"])
  ;["sh", "bash", "zsh"].forEach((name) => {
    const build = ToolSafetySandbox.proxyInvocation([`/bin/${name}`, "-c", 'exec "$1" "$2"', "fixture", "program", "argument"])
    if (build instanceof ToolSafety.Denied) throw build
    const result = build(bridge)
    expect(result.slice(-3)).toEqual(["fixture", "program", "argument"])
    expect(result[result.indexOf("-c") + 1]).toBe("export 'DYLD_INSERT_LIBRARIES=/private/tmp/quoted '\\'' helper.dylib' " +
      "'ORCHESTRA_TCP_PROXY_ROUTES=9042:2f746d702f302e736f636b';\nexec \"$1\" \"$2\"")
    if (name === "bash") expect(result.slice(1, 3)).toEqual(["--noprofile", "--norc"])
    if (name === "zsh") expect(result[1]).toBe("-f")
  })
  ;[["/bin/fish", "-c", "true"], ["/custom/bash", "-c", "true"], ["/bin/bash", "-lc", "true"]].forEach((args) => {
    expect(ToolSafetySandbox.proxyInvocation(args)).toBeInstanceOf(ToolSafety.Denied)
  })
  expect(ToolSafetySandbox.proxyInvocation(["/custom/unknown-shell", "-c", "true"], true)).toBeInstanceOf(ToolSafety.Denied)
}))
