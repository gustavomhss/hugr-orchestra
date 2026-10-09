#!/usr/bin/env bun

// Prepared dev Desktop only: default v1 utilityProcess, not the opt-in V2 daemon.
// CDP observes the shipped preload API; no replacement main, server, or readiness hook.
import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { access, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import { constants } from "node:fs"
import { createRequire } from "node:module"
import { tmpdir } from "node:os"
import { dirname, isAbsolute, join, resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"

class ProofFailure extends Error {}
function requireProof(value: unknown, code: string): asserts value {
  if (!value) throw new ProofFailure(code)
}
function object(value: unknown, code: string) {
  requireProof(value !== null && typeof value === "object" && !Array.isArray(value), code)
  return value as Record<string, unknown>
}
async function regular(path: string, code: string) {
  requireProof(await lstat(path).then((stat) => stat.isFile(), () => false), code)
}

await main().catch((error: unknown) => {
  console.error(error instanceof ProofFailure ? error.message : "DESKTOP_BOOTSTRAP_PREREQUISITE_FAILED")
  process.exitCode = 1
})

async function main() {
  const args = parseArgs({ options: { desktop: { type: "string" }, report: { type: "string" } }, strict: true, allowPositionals: false }).values
  requireProof(args.desktop && isAbsolute(args.desktop) && args.report && isAbsolute(args.report), "ABSOLUTE_DESKTOP_AND_REPORT_REQUIRED")
  const desktop = await realpath(args.desktop).catch(() => { throw new ProofFailure("DESKTOP_ROOT_MISSING") })
  const report = join(await realpath(dirname(args.report)), args.report.split(/[\\/]/).at(-1)!)
  requireProof(await lstat(report).then(() => false, (error: NodeJS.ErrnoException) => error.code === "ENOENT"), "REPORT_NOT_FRESH")
  requireProof(["darwin", "linux", "win32"].includes(process.platform) && ["arm64", "x64"].includes(process.arch), "UNSUPPORTED_HOST")
  // Main overwrites --user-data-dir with app.getPath("appData")/appId. Only Linux
  // has the XDG_CONFIG_HOME isolation contract here; do not touch native installed roots.
  requireProof(process.platform === "linux", "DESKTOP_APPDATA_ISOLATION_UNAVAILABLE: require production userData/sessionData override before initialization and singleton lock on Darwin/Windows")
  requireProof(process.platform !== "linux" || process.env.DISPLAY, "LINUX_X11_DISPLAY_REQUIRED")
  requireProof(process.platform !== "linux" || process.getuid?.() !== 0, "ELECTRON_SANDBOX_NONROOT_REQUIRED")
  const pkg = object(await Bun.file(join(desktop, "package.json")).json(), "DESKTOP_METADATA_INVALID")
  requireProof(pkg.name === "@orchestra/desktop" && typeof pkg.version === "string" && pkg.version.length, "DESKTOP_VERSION_INVALID")
  requireProof(typeof pkg.main === "string" && resolve(desktop, pkg.main) === join(desktop, "out/main/index.js"), "DESKTOP_MAIN_CONTRACT_CHANGED")
  const entry = resolve(desktop, pkg.main)
  await Promise.all([entry, join(desktop, "out/main/sidecar.js"), join(desktop, "out/preload/index.js"), join(desktop, "out/renderer/index.html")]
    .map((path) => regular(path, "DESKTOP_BUILD_OUTPUT_MISSING")))
  const mainSha256 = createHash("sha256").update(await readFile(entry)).digest("hex")
  const electronRoot = await Promise.resolve().then(() => dirname(createRequire(join(desktop, "package.json")).resolve("electron/package.json")))
    .catch(() => { throw new ProofFailure("ELECTRON_DEPENDENCY_MISSING") })
  const electronPkg = object(await Bun.file(join(electronRoot, "package.json")).json(), "ELECTRON_METADATA_INVALID")
  requireProof(electronPkg.name === "electron" && typeof electronPkg.version === "string" && object(pkg.devDependencies, "ELECTRON_DEPENDENCY_MISSING").electron === electronPkg.version, "ELECTRON_VERSION_MISMATCH")
  const executable = (await readFile(join(electronRoot, "path.txt"), "utf8").catch(() => { throw new ProofFailure("ELECTRON_INSTALL_PATH_MISSING") })).trim()
  requireProof(executable && !isAbsolute(executable) && !executable.split(/[\\/]/).includes(".."), "ELECTRON_PATH_INVALID")
  const electron = await realpath(join(electronRoot, "dist", executable)).catch(() => { throw new ProofFailure("ELECTRON_EXECUTABLE_MISSING") })
  requireProof(electron === join(await realpath(join(electronRoot, "dist")), executable), "ELECTRON_EXECUTABLE_NOT_CONFINED")
  await regular(electron, "ELECTRON_EXECUTABLE_MISSING")
  await access(electron, constants.X_OK).catch(() => { throw new ProofFailure("ELECTRON_EXECUTABLE_NOT_RUNNABLE") })
  await nativeExecutable(electron)
  const { desktopCliTargets } = await import(pathToFileURL(join(desktop, "scripts/cli-staging.ts")).href)
    .catch(() => { throw new ProofFailure("CLI_PRODUCTION_HELPER_MISSING") })
  const { verifyCliArtifact } = await import(pathToFileURL(join(desktop, "src/main/cli-artifacts.ts")).href)
    .catch(() => { throw new ProofFailure("CLI_PRODUCTION_HELPER_MISSING") })
  const targets: string[] = desktopCliTargets(process.platform, process.arch)
  requireProof(targets.length > 0, "CLI_TARGETS_EMPTY")
  const artifacts: { path: string; version: string }[] = await Promise.all(targets.map((target) =>
    verifyCliArtifact(join(desktop, "resources/cli"), target).catch(() => { throw new ProofFailure("CLI_RESOURCES_MISSING_OR_INVALID") })))
  requireProof(artifacts.every((artifact) => artifact.version === pkg.version), "CLI_DESKTOP_VERSION_MISMATCH")
  await access(artifacts[0].path, constants.X_OK).catch(() => { throw new ProofFailure("CLI_EXECUTABLE_NOT_RUNNABLE") })
  await nativeExecutable(artifacts[0].path)
  const sandbox = await mkdtemp(join(await realpath(tmpdir()), "orchestra-desktop-proof-"))
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => ["path", "systemroot", "windir", "comspec", "pathext", "lang", "lc_all", "display"].includes(key.toLowerCase()))),
    HOME: sandbox, USERPROFILE: sandbox, ORCHESTRA_TEST_HOME: sandbox,
    APPDATA: join(sandbox, "config"), LOCALAPPDATA: join(sandbox, "cache"),
    XDG_CONFIG_HOME: join(sandbox, "config"), XDG_DATA_HOME: join(sandbox, "data"),
    XDG_CACHE_HOME: join(sandbox, "cache"), XDG_STATE_HOME: join(sandbox, "state"), XDG_RUNTIME_DIR: join(sandbox, "run"),
    TMPDIR: join(sandbox, "tmp"), TMP: join(sandbox, "tmp"), TEMP: join(sandbox, "tmp"),
    ORCHESTRA_DB: join(sandbox, "proof.sqlite"), ORCHESTRA_INHERIT_CREDENTIALS: "0",
    // Prevent production shell-env probing from loading login scripts and restoring secrets.
    SHELL: "/usr/bin/false", NO_PROXY: "127.0.0.1,localhost,::1",
  }
  const owned: { child?: ReturnType<typeof spawn>; exited?: Promise<void>; version?: ReturnType<typeof Bun.spawn>; failed?: boolean; socket?: WebSocket; debugger?: string; tail: string; cleaning?: Promise<void> } = { tail: "" }
  const running = () => owned.child?.pid && owned.child.exitCode === null && owned.child.signalCode === null && !owned.failed
  const cleanup = () => (owned.cleaning ??= (async () => {
    owned.socket?.close()
    if (owned.version && owned.version.exitCode === null) { owned.version.kill("SIGKILL"); await owned.version.exited }
    const child = owned.child
    if (child?.pid && running()) {
      await signalOwnedGroup(child.pid, "SIGTERM")
      await Promise.race([owned.exited, Bun.sleep(6_000)])
      if (running()) await signalOwnedGroup(child.pid, "SIGKILL")
      await Promise.race([owned.exited, Bun.sleep(5_000)])
      requireProof(!running(), "OWNED_DESKTOP_CLEANUP_FAILED")
    }
    if (child?.pid) {
      const groupAlive = () => Promise.resolve().then(() => process.kill(-child.pid!, 0)).then(() => true, (error: NodeJS.ErrnoException) => {
        requireProof(error.code === "ESRCH", "OWNED_PROCESS_GROUP_INSPECTION_FAILED"); return false
      })
      const deadline = Date.now() + 5_000
      while (await groupAlive() && Date.now() < deadline) await Bun.sleep(100)
      requireProof(!(await groupAlive()), "OWNED_PROCESS_GROUP_STILL_ALIVE")
    }
    await rm(sandbox, { recursive: true, force: true })
  })())
  const interrupt = () => { void cleanup().then(() => process.exit(1), () => process.exit(1)) }
  process.once("SIGINT", interrupt)
  process.once("SIGTERM", interrupt)
  const timeout = setTimeout(() => { console.error("DESKTOP_BOOTSTRAP_TIMEOUT"); interrupt() }, 90_000)
  const result = await (async () => {
    await Promise.all(["config", "data", "cache", "state", "run", "tmp"].map((name) => mkdir(join(sandbox, name), { mode: 0o700 })))
    const version = async (binary: string) => {
      requireProof(!owned.cleaning, "DESKTOP_BOOTSTRAP_INTERRUPTED")
      const child = Bun.spawn([binary, "--version"], { env, cwd: sandbox, stdout: "pipe", stderr: "ignore" })
      owned.version = child
      const timer = setTimeout(() => child.kill("SIGKILL"), 15_000)
      const output = await Promise.all([child.exited, new Response(child.stdout).text()]).finally(() => clearTimeout(timer))
      requireProof(output[0] === 0, "EXECUTABLE_VERSION_COMMAND_FAILED")
      owned.version = undefined
      return output[1].trim()
    }
    requireProof(await version(electron) === `v${electronPkg.version}`, "ELECTRON_EXECUTABLE_VERSION_MISMATCH")
    requireProof([pkg.version, `orchestra v${pkg.version}`].includes(await version(artifacts[0].path)), "CLI_EXECUTABLE_VERSION_MISMATCH")
    // Unpackaged main selects v1 without ORCHESTRA_SIDECAR_V2. No CLI service start here.
    requireProof(!owned.cleaning, "DESKTOP_BOOTSTRAP_INTERRUPTED")
    const child = spawn(electron, [desktop, `--user-data-dir=${join(sandbox, "desktop")}`, "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0"],
      { env, cwd: sandbox, detached: true, stdio: ["ignore", "ignore", "pipe"] })
    owned.child = child
    owned.exited = new Promise<void>((resolve) => child.once("close", () => resolve()))
    child.once("error", () => { owned.failed = true })
    const deadline = Date.now() + 60_000
    const alive = () => requireProof(running(), "DESKTOP_EXITED_BEFORE_PROOF")
    void (async () => {
      for await (const chunk of child.stderr) {
        if (owned.debugger) continue
        owned.tail = (owned.tail + Buffer.from(chunk).toString("utf8")).slice(-4096)
        owned.debugger = /DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[a-f0-9-]+)/.exec(owned.tail)?.[1]
        if (owned.debugger) owned.tail = ""
      }
    })().catch(() => {})
    while (!owned.debugger && Date.now() < deadline) { alive(); await Bun.sleep(100) }
    requireProof(owned.debugger, "DESKTOP_READY_EVIDENCE_UNAVAILABLE: Electron CDP endpoint not observed")
    const socket = new WebSocket(owned.debugger)
    owned.socket = socket
    const cdp = await connect(socket)
    const processes = async () => {
      const value = object(await cdp("SystemInfo.getProcessInfo"), "PROCESS_EVIDENCE_INVALID")
      requireProof(Array.isArray(value.processInfo) && value.processInfo.length, "PROCESS_EVIDENCE_EMPTY")
      const list = value.processInfo.map((item: unknown) => object(item, "PROCESS_EVIDENCE_INVALID"))
      requireProof(list.some((item) => item.type === "browser" && item.id === child.pid), "DESKTOP_PROCESS_OWNERSHIP_FAILED")
      return list.filter((item) => item.type === "utility" && typeof item.id === "number")
    }
    const ready: { value?: Record<string, unknown> } = {}
    while (!ready.value && Date.now() < deadline) {
      alive()
      const list = object(await cdp("Target.getTargets"), "RENDERER_EVIDENCE_INVALID")
      requireProof(Array.isArray(list.targetInfos), "RENDERER_EVIDENCE_INVALID")
      const target = list.targetInfos.map((item: unknown) => object(item, "RENDERER_EVIDENCE_INVALID"))
        .find((item) => item.type === "page" && item.url === "oc://renderer/index.html")
      if (!target) { await Bun.sleep(100); continue }
      const session = object(await cdp("Target.attachToTarget", { targetId: target.targetId, flatten: true }), "RENDERER_ATTACH_FAILED")
      requireProof(typeof session.sessionId === "string", "RENDERER_ATTACH_FAILED")
      const evaluated = object(await cdp("Runtime.evaluate", { expression: "globalThis.api?.awaitInitialization?.() ?? null", awaitPromise: true, returnByValue: true }, session.sessionId), "READY_EVIDENCE_INVALID")
      requireProof(!evaluated.exceptionDetails, "DESKTOP_INITIALIZATION_FAILED")
      const value = object(evaluated.result, "READY_EVIDENCE_INVALID").value
      if (value) ready.value = object(value, "READY_EVIDENCE_INVALID")
      await cdp("Target.detachFromTarget", { sessionId: session.sessionId })
      if (!ready.value) await Bun.sleep(100)
    }
    requireProof(ready.value, "DESKTOP_READY_EVIDENCE_UNAVAILABLE: preload awaitInitialization not observed")
    const utility = await processes()
    requireProof(utility.length > 0, "DESKTOP_UTILITY_PROCESS_MISSING")
    requireProof(typeof ready.value.url === "string" && ready.value.username === "orchestra" && typeof ready.value.password === "string" && ready.value.password.length, "READY_CREDENTIAL_INVALID")
    const endpoint = new URL(ready.value.url)
    requireProof(endpoint.protocol === "http:" && endpoint.hostname === "127.0.0.1" && endpoint.port && endpoint.pathname === "/" && !endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash, "READY_ENDPOINT_NOT_LOOPBACK")
    const request = (path: string, password?: string) => fetch(new URL(path, endpoint), {
      headers: password === undefined ? {} : { Authorization: `Basic ${Buffer.from(`orchestra:${password}`).toString("base64")}` },
      signal: AbortSignal.timeout(3_000), redirect: "error",
    }).catch(() => { throw new ProofFailure("DESKTOP_HEALTH_REQUEST_FAILED") })
    const health: { path?: string } = {}
    for (const path of ["/api/health", "/global/health"]) {
      const response = await request(path, ready.value.password)
      const body: unknown = await response.json().catch(() => null)
      if (response.ok && body && typeof body === "object" && "healthy" in body && body.healthy === true) { health.path = path; break }
    }
    requireProof(health.path, "AUTHENTICATED_DESKTOP_HEALTH_FAILED")
    requireProof([401, 403].includes((await request(health.path, `${ready.value.password}-wrong`)).status), "WRONG_CREDENTIAL_ACCEPTED")
    requireProof([401, 403].includes((await request(health.path)).status), "NO_CREDENTIAL_ACCEPTED")
    ready.value = undefined
    alive()
    requireProof((await processes()).some((item) => utility.some((before) => before.id === item.id)), "DESKTOP_UTILITY_PROCESS_EXITED")
    await regular(env.ORCHESTRA_DB, "ISOLATED_DATABASE_MISSING")
    requireProof(createHash("sha256").update(await readFile(entry)).digest("hex") === mainSha256, "DESKTOP_MAIN_CHANGED_DURING_PROOF")
    return { schema: 1, desktopVersion: pkg.version, electronVersion: electronPkg.version, platform: process.platform, arch: process.arch,
      mainSha256, startup: "default-v1-utilityProcess",
      readyEvidence: "production-preload-awaitInitialization-via-owned-CDP", healthy: true, wrongCredentialRejected: true,
      noCredentialRejected: true, desktopAlive: true, utilityAlive: true, uiVerified: false, modelExecutionVerified: false }
  })().finally(async () => {
    clearTimeout(timeout)
    await cleanup()
    process.removeListener("SIGINT", interrupt)
    process.removeListener("SIGTERM", interrupt)
  })
  await writeFile(report, JSON.stringify(result) + "\n", { flag: "wx", mode: 0o600 })
  console.log(JSON.stringify(result))
}

async function connect(socket: WebSocket) {
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  const state = { id: 0 }
  socket.addEventListener("message", (event) => {
    try {
      const message = object(JSON.parse(String(event.data)), "CDP_MESSAGE_INVALID")
      if (typeof message.id !== "number") return
      const request = pending.get(message.id)
      pending.delete(message.id)
      if (message.error) request?.reject(new ProofFailure("CDP_COMMAND_FAILED"))
      else request?.resolve(message.result)
    } catch { pending.forEach((request) => request.reject(new ProofFailure("CDP_MESSAGE_INVALID"))) }
  })
  socket.addEventListener("close", () => pending.forEach((request) => request.reject(new ProofFailure("CDP_CONNECTION_CLOSED"))))
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ProofFailure("CDP_CONNECT_TIMEOUT")), 5_000)
    socket.addEventListener("open", () => { clearTimeout(timer); resolve() }, { once: true })
    socket.addEventListener("error", () => { clearTimeout(timer); reject(new ProofFailure("CDP_CONNECT_FAILED")) }, { once: true })
  })
  return (method: string, params: Record<string, unknown> = {}, sessionId?: string) => new Promise<unknown>((resolve, reject) => {
    const id = ++state.id
    const timer = setTimeout(() => { pending.delete(id); reject(new ProofFailure("CDP_COMMAND_TIMEOUT")) }, 10_000)
    pending.set(id, { resolve: (value) => { clearTimeout(timer); resolve(value) }, reject: (error) => { clearTimeout(timer); reject(error) } })
    socket.send(JSON.stringify({ id, method, params, sessionId }))
  })
}

async function nativeExecutable(file: string) {
  const header = Buffer.from(await Bun.file(file).slice(0, 4096).arrayBuffer())
  requireProof(header.length >= 64, "NATIVE_EXECUTABLE_HEADER_MISSING")
  const arm = process.arch === "arm64"
  requireProof(header.readUInt32BE(0) === 0x7f454c46 && header[4] === 2 && header[5] === 1 && header[6] === 1 && [2, 3].includes(header.readUInt16LE(16)) && header.readUInt16LE(18) === (arm ? 183 : 62), "NATIVE_ELF_CPU_MISMATCH")
}

async function signalOwnedGroup(pid: number, signal: NodeJS.Signals) {
  await Promise.resolve().then(() => process.kill(-pid, signal)).catch((error: NodeJS.ErrnoException) => requireProof(error.code === "ESRCH", "OWNED_PROCESS_GROUP_SIGNAL_FAILED"))
}
