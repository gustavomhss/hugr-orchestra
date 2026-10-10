export * as TcpProxy from "./tcp-proxy"

import path from "node:path"
import which from "which"
import { Deferred, Effect, Exit, Fiber, Queue, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { BackendToolkitDiagnostics } from "./backend-toolkit/diagnostics"
import { LayerNode } from "./effect/layer-node"
import { FSUtil } from "./fs-util"
import { AppProcess } from "./process"
import { ToolSafety } from "./tool-safety"

const ROUTES = "ORCHESTRA_TCP_PROXY_ROUTES"
const NODE_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

/** Host services for owned route-adapted clients, not transparent TCP. Keep Scope open through child exit. */
export const open = (ports: readonly number[], deny: readonly string[] = []) => openScoped(Array.from(ports), Array.from(deny))

const openScoped = Effect.fn("TcpProxy.open")(function* (snapshot: readonly number[], deny: readonly string[]) {
  yield* requirePorts(snapshot)
  if (process.platform !== "darwin")
    return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-exact-policy-unsupported" })
  const reserved = yield* plan(snapshot, deny)
  const sockets = yield* broker(snapshot, reserved)
  return { sockets, env: { [ROUTES]: snapshot.map((port, index) =>
    `${port}:${Buffer.from(sockets[index], "utf8").toString("hex")}`).join(";") } satisfies Record<string, string> }
})

/** Direct Unix broker boundary shared with live network tests. */
export const listen = (ports: readonly number[], deny: readonly string[] = []) => listenScoped(Array.from(ports), Array.from(deny))

const listenScoped = Effect.fn("TcpProxy.listen")(function* (snapshot: readonly number[], deny: readonly string[]) {
  const reserved = yield* plan(snapshot, deny)
  return yield* broker(snapshot, reserved)
})

/** Host-bound canonical denies only. Reserve a scoped private directory before any listener starts. */
export const plan = (ports: readonly number[], deny: readonly string[] = []) => planScoped(Array.from(ports), Array.from(deny))

const planScoped = Effect.fn("TcpProxy.plan")(function* (snapshot: readonly number[], deny: readonly string[]) {
  yield* requirePorts(snapshot)
  if (process.platform !== "darwin" && process.platform !== "linux")
    return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-platform-unsupported" })
  const fs = yield* FSUtil.Service
  const base = yield* fs.realPath("/tmp").pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-infrastructure-acquisition" })),
  )
  const info = yield* fs.stat(base).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-infrastructure-acquisition" })),
  )
  if (info.type !== "Directory") return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-infrastructure-acquisition" })
  if (deny.some((entry) => FSUtil.contains(entry, base)))
    return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-denied-path" })
  // Canonical Darwin sockaddr_un paths must stay below 104 bytes even when owner TMPDIR is long.
  const directory = yield* fs.makeTempDirectoryScoped({ directory: base, prefix: "otcp-" }).pipe(
    Effect.flatMap(fs.realPath),
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-directory-acquisition" })),
  )
  const sockets = snapshot.map((_, index) => path.join(directory, `${index}.sock`))
  if ([directory, ...sockets].some((target) => deny.some((entry) => FSUtil.contains(entry, target))))
    return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-denied-path" })
  if (sockets.some((socket) => Buffer.byteLength(socket, "utf8") >= 104 || socket.includes("\0")))
    return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-socket-path-overflow" })
  return { directory, sockets: sockets as readonly string[] }
})

const broker = Effect.fn("TcpProxy.broker")(function* (snapshot: readonly number[], reserved: Effect.Success<ReturnType<typeof plan>>) {
  const node = yield* step("sandbox-tcp-proxy-node-acquisition", () => which("node", { path: NODE_PATH, nothrow: true }))
  if (!node) return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-node-missing" })
  const fs = yield* FSUtil.Service
  yield* fs.chmod(reserved.directory, 0o700).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-directory-mode" })),
  )
  // Bun 1.3 ignores Unix listener allowHalfOpen. A private native Node worker preserves Node pipe/FIN semantics.
  const processes = yield* AppProcess.Service
  const child = yield* processes.spawn(ChildProcess.make(node,
    ["-e", BROKER, JSON.stringify(snapshot.map((port, index) => ({ port, socket: reserved.sockets[index] })))], {
      cwd: reserved.directory,
      env: BackendToolkitDiagnostics.environment(reserved.directory, { PATH: NODE_PATH, TMPDIR: reserved.directory, LANG: "C" }),
      stdin: "pipe", forceKillAfter: "2 seconds",
    })).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-broker-acquisition" })))
  // Keep stdin open without bytes. Normal queue completion runs the sink's EOF action on both spawners.
  const input = yield* Queue.make<Uint8Array>()
  const writer = yield* Stream.fromQueue(input).pipe(Stream.run(child.stdin), Effect.forkScoped)
  yield* child.stderr.pipe(Stream.runDrain, Effect.ignore, Effect.forkScoped)
  const ready = yield* Deferred.make<void, ToolSafety.Denied>()
  const frame = Buffer.from("READY\n")
  const received = { bytes: 0 }
  yield* Effect.gen(function* () {
    yield* Stream.runForEach(child.stdout, (chunk) => Effect.gen(function* () {
      if (received.bytes === frame.length) return
      if (chunk.length > frame.length - received.bytes ||
        chunk.some((byte, index) => byte !== frame[received.bytes + index]))
        return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-listen-acquisition" })
      received.bytes += chunk.length
      if (received.bytes === frame.length) yield* Deferred.succeed(ready, undefined)
    }))
    if (received.bytes !== frame.length)
      return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-listen-acquisition" })
  }).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-listen-acquisition" })),
    Effect.onExit((exit) => Exit.isFailure(exit) ? Deferred.failCause(ready, exit.cause) : Effect.void),
    Effect.ignore,
    Effect.forkScoped,
  )
  // LIFO: close stdin and confirm exit before interrupting pumps or releasing the spawner/directory.
  yield* Effect.addFinalizer(() => Effect.gen(function* () {
    yield* Queue.end(input)
    yield* Effect.all([Fiber.join(writer).pipe(Effect.exit), child.exitCode.pipe(Effect.exit)], {
      concurrency: "unbounded",
    }).pipe(Effect.timeoutOrElse({
      duration: "2 seconds",
      orElse: () => child.kill({ forceKillAfter: "2 seconds" }).pipe(
        Effect.ensuring(Fiber.interrupt(writer)), Effect.orDie,
      ),
    }))
  }))
  yield* Deferred.await(ready).pipe(
    Effect.raceFirst(child.exitCode.pipe(Effect.andThen(
      Effect.fail(new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-listen-acquisition" })),
    ))),
    Effect.timeout("5 seconds"),
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-listen-acquisition" })),
  )
  return reserved.sockets
// Broker is a host resource even when its client is sandboxed; do not widen Sandbox's service requirements.
}, Effect.provide(LayerNode.compile(AppProcess.node)))

function requirePorts(ports: readonly number[]) {
  return ports.length < 1 || ports.length > 32 || new Set(ports).size !== ports.length ||
    ports.some((port) => !Number.isSafeInteger(port) || port < 1 || port > 65535)
    ? Effect.fail(new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-invalid-ports" }))
    : Effect.void
}

// No destinations come from client bytes, environment, or model arguments.
const BROKER = String.raw`
const net = require("node:net")
const fs = require("node:fs")
const routes = JSON.parse(process.argv[1])
const active = new Set()
const servers = []
let closing = false
const close = () => {
  if (closing) return
  closing = true
  active.forEach(({ client, upstream }) => { client.destroy(); upstream.destroy() })
  Promise.all(servers.map(server => new Promise(resolve => server.close(resolve)))).then(() => process.stdin.destroy())
}
process.stdin.resume()
process.stdin.once("end", close)
process.once("SIGTERM", close)
process.once("SIGINT", close)
Promise.all(routes.map(route => new Promise((resolve, reject) => {
  const server = net.createServer({ allowHalfOpen: true }, client => {
    client.on("error", () => client.destroy())
    if (closing || active.size >= 64) { client.destroy(); return }
    const upstream = net.createConnection({ host: "127.0.0.1", port: route.port, allowHalfOpen: true })
    const pair = { client, upstream }
    active.add(pair)
    const destroy = () => { client.destroy(); upstream.destroy() }
    const closed = () => { if (client.closed && upstream.closed) active.delete(pair) }
    client.on("error", destroy)
    upstream.on("error", destroy)
    client.on("close", () => { if (!client.readableEnded) destroy(); closed() })
    upstream.on("close", () => { if (!upstream.readableEnded) destroy(); closed() })
    client.pipe(upstream)
    upstream.pipe(client)
  })
  servers.push(server)
  server.on("error", error => { reject(error); process.exitCode = 1; close() })
  server.listen(route.socket, () => { fs.chmodSync(route.socket, 0o600); resolve() })
}))).then(() => { if (!closing) process.stdout.write("READY\n") }, () => close())
`

const step = <A>(reason: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: () => new ToolSafety.Denied({ reason }) })
