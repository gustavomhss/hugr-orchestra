export * as TcpProxy from "./tcp-proxy"

import path from "node:path"
import { spawn } from "node:child_process"
import which from "which"
import { Effect } from "effect"
import { BackendToolkitDiagnostics } from "./backend-toolkit/diagnostics"
import { FSUtil } from "./fs-util"
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
  const stopped = { closed: false }
  const child = yield* Effect.acquireRelease(step("sandbox-tcp-proxy-broker-acquisition", async () => {
    const child = spawn(node, ["-e", BROKER, JSON.stringify(snapshot.map((port, index) => ({ port, socket: reserved.sockets[index] })))], {
      cwd: reserved.directory, env: BackendToolkitDiagnostics.environment(reserved.directory, { PATH: NODE_PATH, TMPDIR: reserved.directory, LANG: "C" }),
      stdio: ["pipe", "pipe", "pipe"],
    })
    child.on("error", () => undefined)
    child.once("close", () => { stopped.closed = true })
    return child
  }), (child) => Effect.promise(() => new Promise<void>((resolve) => {
    if (stopped.closed) { resolve(); return }
    const terminate = setTimeout(() => child.kill("SIGTERM"), 2000)
    const kill = setTimeout(() => child.kill("SIGKILL"), 4000)
    child.once("close", () => { clearTimeout(terminate); clearTimeout(kill); resolve() })
    child.stdin.end()
  })))
  child.stdin.on("error", () => undefined)
  child.stderr.resume()
  yield* Effect.tryPromise({
    try: () => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("broker startup timed out")), 5000)
      const failed = () => { clearTimeout(timer); reject(new Error("broker startup failed")) }
      child.once("error", failed)
      child.once("close", failed)
      child.stdout.once("data", (data: Buffer) => {
        clearTimeout(timer)
        child.removeListener("close", failed)
        if (data.toString() !== "READY\n") { reject(new Error("broker startup protocol")); return }
        resolve()
      })
    }),
    catch: () => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-listen-acquisition" }),
  })
  child.stdout.resume()
  return reserved.sockets
})

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
