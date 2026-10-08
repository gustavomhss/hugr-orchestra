export * as TcpProxy from "./tcp-proxy"

import path from "node:path"
import { createHash } from "node:crypto"
import { execFile, spawn } from "node:child_process"
import { lstat } from "node:fs/promises"
import which from "which"
import { Effect } from "effect"
import { BackendToolkitDiagnostics } from "./backend-toolkit/diagnostics"
import { FSUtil } from "./fs-util"
import { Global } from "./global"
import { ToolSafety } from "./tool-safety"

const ROUTES = "ORCHESTRA_TCP_PROXY_ROUTES"
const TRUSTED_PATH = "/usr/bin:/bin:/usr/sbin:/sbin"
const NODE_PATH = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

/** Host-owned command resource. Caller keeps its Scope open through child exit. */
export const open = (ports: readonly number[], deny: readonly string[] = []) => openScoped(Array.from(ports), Array.from(deny))

const openScoped = Effect.fn("TcpProxy.open")(function* (snapshot: readonly number[], deny: readonly string[]) {
  yield* requirePorts(snapshot)
  if (process.platform !== "darwin")
    return yield* new ToolSafety.Denied({ reason: "sandbox-loopback-endpoint-exact-policy-unsupported" })
  const reserved = yield* plan(snapshot, deny)
  const library = yield* compiled(reserved.cache)
  const sockets = yield* broker(snapshot, reserved)
  return { library, sockets, env: { [ROUTES]: snapshot.map((port, index) =>
    `${port}:${Buffer.from(sockets[index], "utf8").toString("hex")}`).join(";") } satisfies Record<string, string> }
})

/** Broker boundary shared with live network tests; destinations come only from host-owned ports. */
export const listen = (ports: readonly number[], deny: readonly string[] = []) => listenScoped(Array.from(ports), Array.from(deny))

const listenScoped = Effect.fn("TcpProxy.listen")(function* (snapshot: readonly number[], deny: readonly string[]) {
  const reserved = yield* plan(snapshot, deny)
  return yield* broker(snapshot, reserved)
})

/** Host-bound canonical denies only. Planning reserves a scoped private directory, never a build or listener. */
export const plan = (ports: readonly number[], deny: readonly string[] = []) => planScoped(Array.from(ports), Array.from(deny))

const planScoped = Effect.fn("TcpProxy.plan")(function* (snapshot: readonly number[], deny: readonly string[]) {
  yield* requirePorts(snapshot)
  if (process.platform !== "darwin" && process.platform !== "linux")
    return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-platform-unsupported" })
  const fs = yield* FSUtil.Service
  const cache = yield* infrastructure(fs, path.join(Global.Path.cache, "tcp-proxy"))
  const base = yield* infrastructure(fs, "/tmp")
  // A denied cache subtree cannot be touched while discovering/building the eventual content-addressed entry.
  // A narrower /tmp deny is checked against the reservation below; an unrelated temporary subtree grants nothing.
  if (deny.some((entry) => FSUtil.overlaps(entry, cache) || FSUtil.contains(entry, base)))
    return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-denied-path" })
  // /tmp keeps canonical Darwin sockaddr_un paths below 104 bytes even when owner TMPDIR is long.
  const directory = yield* fs.makeTempDirectoryScoped({ directory: base, prefix: "otcp-" }).pipe(
    Effect.flatMap(fs.realPath),
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-directory-acquisition" })),
  )
  const sockets = snapshot.map((_, index) => path.join(directory, `${index}.sock`))
  if ([directory, ...sockets].some((target) => deny.some((entry) => FSUtil.contains(entry, target))))
    return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-denied-path" })
  if (sockets.some((socket) => Buffer.byteLength(socket, "utf8") >= 104 || socket.includes("\0")))
    return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-socket-path-overflow" })
  return { cache, directory, sockets: sockets as readonly string[] }
})

const infrastructure = Effect.fnUntraced(function* (fs: FSUtil.Interface, target: string): Effect.fn.Return<string, ToolSafety.Denied> {
  return yield* fs.realPath(target).pipe(
    Effect.flatMap((physical) => fs.stat(physical).pipe(Effect.flatMap((info) => info.type === "Directory"
      ? Effect.succeed(physical)
      : Effect.fail(new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-infrastructure-acquisition" }))))),
    Effect.catchReason("PlatformError", "NotFound", () => Effect.gen(function* () {
      const parent = path.dirname(target)
      if (parent === target) return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-infrastructure-acquisition" })
      const anchor = yield* infrastructure(fs, parent)
      return path.join(anchor, path.basename(target))
    })),
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-infrastructure-acquisition" })),
  )
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

// Host-only JavaScript worker, not the injected C helper. No destinations come from data, env, or model arguments.
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

/** Cache identity binds actual source, trusted compiler identity, flags, architecture and host target. */
const compiled = Effect.fn("TcpProxy.compiled")(function* (parent: string) {
  const { TcpProxyNative } = yield* step("sandbox-tcp-proxy-native-acquisition", () => import("./tcp-proxy-native"))
  if (TcpProxyNative.ROUTES !== ROUTES || !TcpProxyNative.SOURCE.length)
    return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-native-abi" })
  const fs = yield* FSUtil.Service
  const compiler = yield* step("sandbox-tcp-proxy-compiler-acquisition", () => which("clang", { path: TRUSTED_PATH, nothrow: true }))
  if (!compiler) return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-clang-missing" })
  yield* fs.makeDirectory(parent, { recursive: true, mode: 0o700 }).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-cache-acquisition" })),
  )
  const owner = { unreaped: false }
  const staging = yield* Effect.acquireRelease(fs.makeTempDirectory({ directory: parent, prefix: ".build-" }).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-build-directory" })),
  ), (directory) => owner.unreaped ? Effect.void : fs.remove(directory, { recursive: true, force: true }).pipe(Effect.orDie))
  yield* fs.chmod(staging, 0o700).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-build-directory" })),
  )
  yield* fs.makeDirectory(path.join(staging, ".installer-home"), { mode: 0o700 }).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-build-directory" })),
  )
  const run = (args: string[], timeout = 30_000) => runCompiler(compiler, args, { cwd: staging, timeout, owner })
  const version = yield* run(["--no-default-config", "--version"], 5000)
  const target = yield* run(["--no-default-config", "-dumpmachine"], 5000)
  const flags = ["--no-default-config", "-dynamiclib", "-O2", "-std=c11", "-pthread", "-arch",
    process.arch === "arm64" ? "arm64" : "x86_64"]
  if (process.arch !== "arm64" && process.arch !== "x64")
    return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-architecture-unsupported" })
  const key = createHash("sha256").update(JSON.stringify([
    TcpProxyNative.SOURCE, yield* fs.realPath(compiler).pipe(
      Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-compiler-acquisition" })),
    ), version.stdout, target.stdout, flags, process.platform, process.arch,
  ])).digest("hex")
  const directory = path.join(parent, key)
  if (yield* fs.exists(directory).pipe(Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-cache-acquisition" }))))
    return yield* verified(fs, directory)
  yield* fs.writeFileString(path.join(staging, "proxy.c"), TcpProxyNative.SOURCE, { mode: 0o600 }).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-source-write" })),
  )
  yield* run([...flags, "proxy.c", "-o", "proxy.dylib"])
  const bytes = yield* fs.readFile(path.join(staging, "proxy.dylib")).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-build-artifact" })),
  )
  yield* fs.chmod(path.join(staging, "proxy.dylib"), 0o500).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-build-artifact" })),
  )
  yield* fs.writeFileString(path.join(staging, "sha256"), createHash("sha256").update(bytes).digest("hex"), { mode: 0o600 }).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-build-artifact" })),
  )
  yield* verified(fs, staging)
  yield* fs.rename(staging, directory).pipe(
    Effect.catch(() => verified(fs, directory).pipe(Effect.asVoid)),
  )
  return yield* verified(fs, directory)
})

/** Actual child close, not execFile's abort callback, owns completion and precedes the build directory finalizer. */
export const runCompiler = Effect.fn("TcpProxy.runCompiler")((binary: string, args: readonly string[], options: {
  readonly cwd: string
  readonly timeout: number
  readonly owner?: { unreaped: boolean }
  readonly onStart?: (pid: number) => void
}) => Effect.scoped(Effect.gen(function* () {
  const acquired = yield* Effect.acquireRelease(Effect.try({
    try: () => {
      const abort = new AbortController()
      const observed: { closed: boolean; result?: { error: unknown; stdout: string; stderr: string } } = { closed: false }
      // No ambient SDKROOT, CC/CXX, DYLD_*, compiler config, Node config, or credentials reach this child.
      const child = execFile(binary, Array.from(args), {
        cwd: options.cwd, encoding: "utf8", signal: abort.signal, maxBuffer: 1024 * 1024,
        env: BackendToolkitDiagnostics.environment(options.cwd, { PATH: TRUSTED_PATH, TMPDIR: options.cwd, LANG: "C" }),
      }, (error, stdout, stderr) => { observed.result = { error, stdout, stderr } })
      const closed = new Promise<void>((resolve) => child.once("close", () => { observed.closed = true; resolve() }))
      child.stdin?.end()
      return { child, abort, observed, closed }
    },
    catch: () => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-compiler-acquisition" }),
  }), (acquired) => Effect.tryPromise({
    try: () => new Promise<void>((resolve, reject) => {
      if (acquired.observed.closed) { resolve(); return }
      const kill = setTimeout(() => acquired.child.kill("SIGKILL"), 250)
      const watchdog = setTimeout(() => {
        // Unknown reaping is a failure; retain staging rather than delete files beneath a potentially live compiler.
        if (options.owner) options.owner.unreaped = true
        reject(new Error("compiler close unobserved"))
      }, 2000)
      acquired.closed.then(() => { clearTimeout(kill); clearTimeout(watchdog); resolve() })
      acquired.abort.abort()
    }),
    catch: () => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-compiler-reap-unknown" }),
  }).pipe(Effect.orDie))
  const pid = acquired.child.pid
  if (pid !== undefined && options.onStart) yield* Effect.sync(() => options.onStart?.(pid))
  return yield* Effect.tryPromise({
    try: (signal) => {
      const abort = () => acquired.abort.abort()
      if (signal.aborted) abort()
      signal.addEventListener("abort", abort, { once: true })
      return acquired.closed.then(() => {
        if (!acquired.observed.result || acquired.observed.result.error) throw new Error("compiler failed or result unobserved")
        return { stdout: acquired.observed.result.stdout, stderr: acquired.observed.result.stderr }
      }).finally(() => signal.removeEventListener("abort", abort))
    },
    catch: () => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-compiler-failed" }),
  }).pipe(Effect.timeoutOrElse({
    duration: options.timeout,
    orElse: () => Effect.fail(new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-compiler-timeout" })),
  }))
})))

const verified = Effect.fnUntraced(function* (fs: FSUtil.Interface, directory: string) {
  const library = path.join(directory, "proxy.dylib")
  const info = yield* step("sandbox-tcp-proxy-cache-integrity", () => lstat(library))
  const manifest = yield* step("sandbox-tcp-proxy-cache-integrity", () => lstat(path.join(directory, "sha256")))
  const root = yield* step("sandbox-tcp-proxy-cache-integrity", () => lstat(directory))
  if (!root.isDirectory() || root.isSymbolicLink() || (root.mode & 0o077) ||
    !info.isFile() || info.isSymbolicLink() || info.size < 4 || info.size > 4 * 1024 * 1024 || (info.mode & 0o022) ||
    !manifest.isFile() || manifest.isSymbolicLink() || manifest.size !== 64 || (manifest.mode & 0o022))
    return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-cache-integrity" })
  const bytes = yield* fs.readFile(library).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-cache-integrity" })),
  )
  const digest = yield* fs.readFileString(path.join(directory, "sha256")).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-cache-integrity" })),
  )
  if (Buffer.from(bytes.subarray(0, 4)).toString("hex") !== "cffaedfe" ||
    !/^[a-f0-9]{64}$/.test(digest) || createHash("sha256").update(bytes).digest("hex") !== digest)
    return yield* new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-cache-integrity" })
  return yield* fs.realPath(library).pipe(
    Effect.mapError(() => new ToolSafety.Denied({ reason: "sandbox-tcp-proxy-cache-integrity" })),
  )
})

const step = <A>(reason: string, run: () => Promise<A>) =>
  Effect.tryPromise({ try: run, catch: () => new ToolSafety.Denied({ reason }) })
