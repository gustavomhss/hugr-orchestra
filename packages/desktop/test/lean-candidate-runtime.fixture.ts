import assert from "node:assert/strict"
import path from "node:path"
import { createRequire } from "node:module"
import { connect } from "node:net"
import type { ElectronApplication, Page } from "@playwright/test"
import type { ElectronAPI, ServerReadyData } from "../src/preload/types"
import { appID, desktop, productName } from "./lean-candidate-archive.fixture"

export async function bounded<T>(label: string, task: Promise<T>, ms = 30000): Promise<T> {
  const timeout = Promise.withResolvers<never>()
  const timer = setTimeout(() => timeout.reject(new Error(`${label} timed out after ${ms} ms`)), ms)
  try { return await Promise.race([task, timeout.promise]) }
  finally { clearTimeout(timer) }
}

export async function until(label: string, check: () => Promise<boolean>, ms = 30000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await bounded(label, check(), Math.min(5000, deadline - Date.now()))) return
    await Bun.sleep(100)
  }
  throw new Error(`${label} did not settle within ${ms} ms`)
}

export function inside(root: string, value: string, label: string) {
  assert.ok(path.isAbsolute(value), `${label} must be absolute: ${value}`)
  const relative = path.relative(root, value)
  assert.ok(relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `${label} escapes owned ROOT: ${value}`)
}

export async function portClosed(url: string) {
  await until("owned backend port closure", () => new Promise<boolean>((resolve, reject) => {
    const address = new URL(url)
    assert.equal(address.hostname, "127.0.0.1")
    const socket = connect({ host: address.hostname, port: Number(address.port) })
    socket.setTimeout(1000)
    socket.once("connect", () => { socket.destroy(); resolve(false) })
    socket.once("timeout", () => { socket.destroy(); reject(new Error("Owned backend port probe timed out")) })
    socket.once("error", (error: NodeJS.ErrnoException) => {
      socket.destroy()
      if (error.code === "ECONNREFUSED") resolve(true)
      else reject(error)
    })
  }))
}

export async function launchCandidate(executable: string, root: string, errors: unknown[]) {
  assert.ok(path.isAbsolute(root), "Candidate ROOT must be absolute")
  // Resolve the installed Playwright through the package that declares it. Never attach to a user app.
  const require = createRequire(path.resolve(desktop, "../app/package.json"))
  const { _electron } = require("@playwright/test") as typeof import("@playwright/test")
  const env = Object.fromEntries(["PATH", "LANG", "LC_ALL", "GOROOT", "RUSTUP_HOME"].flatMap((key) =>
    process.env[key] === undefined ? [] : [[key, process.env[key]!]]))
  const application: ElectronApplication = await _electron.launch({ executablePath: executable, timeout: 60000,
    cwd: path.dirname(root), env: { ...env, ORCHESTRA_CANDIDATE_PROFILE_ROOT: root } })
  const diagnostics: string[] = []
  application.process().stdout?.on("data", (bytes) => diagnostics.push(`main stdout: ${bytes}`))
  application.process().stderr?.on("data", (bytes) => diagnostics.push(`main stderr: ${bytes}`))
  const state: { backend?: ServerReadyData; page?: Page; closed: boolean } = { closed: false }
  const close = async () => {
    if (state.closed) return
    try {
      await bounded("owned Electron quit", application.close(), 15000)
      if (state.backend) await portClosed(state.backend.url)
      state.closed = true
    } catch (error) {
      errors.push(error)
      // Only the child returned by this launch is eligible for forced cleanup.
      const child = application.process()
      if (child.exitCode === null) child.kill("SIGKILL")
      if (state.backend) {
        try { await portClosed(state.backend.url) } catch (error) { errors.push(error) }
      }
      state.closed = true
    }
    if (errors.length) console.error(diagnostics.join("\n"))
  }
  try {
    const page = await application.firstWindow({ timeout: 60000 })
    state.page = page
    page.setDefaultTimeout(30000)
    page.setDefaultNavigationTimeout(30000)
    page.on("pageerror", (error) => { errors.push(error); diagnostics.push(`renderer error: ${error.stack}`) })
    page.on("console", (message) => { if (message.type() === "error") diagnostics.push(`renderer console: ${message.text()}`) })
    assert.ok(page.url().startsWith("oc://renderer/"), `Unexpected packaged renderer URL: ${page.url()}`)
    const snapshot = await bounded("actual Electron candidate paths", application.evaluate(({ app }) => ({
      packaged: app.isPackaged, name: app.getName(), lock: app.hasSingleInstanceLock(),
      paths: { userData: app.getPath("userData"), sessionData: app.getPath("sessionData"), home: app.getPath("home"), temp: app.getPath("temp") },
      env: { ...process.env }, utility: app.getAppMetrics().filter((metric) => metric.type === "Utility").length,
    })))
    assert.equal(snapshot.packaged, true)
    assert.equal(snapshot.name, productName)
    assert.equal(snapshot.lock, true, "Candidate did not hold its own single-instance lock")
    for (const [key, value] of Object.entries(snapshot.paths)) inside(root, value, `app.getPath(${key})`)
    assert.equal(snapshot.paths.userData, path.join(root, "desktop"))
    assert.equal(snapshot.paths.sessionData, path.join(root, "session"))
    assert.equal(snapshot.env.ORCHESTRA_LEAN_CANDIDATE, "1")
    assert.equal(snapshot.env.ORCHESTRA_INHERIT_CREDENTIALS, "0")
    assert.equal(snapshot.env.ORCHESTRA_CANDIDATE_PROFILE_ROOT, root)
    for (const key of ["HOME", "XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "ORCHESTRA_DB", "ORCHESTRA_TEST_MANAGED_CONFIG_DIR", "TMPDIR"])
      inside(root, snapshot.env[key]!, key)
    for (const key of Object.keys(snapshot.env))
      assert.ok(!/^(OPENAI|ANTHROPIC|AWS|AZURE|GOOGLE|SENTRY|GH_|GITHUB_TOKEN|SSH_|NODE_OPTIONS|ELECTRON_RUN_AS_NODE|SHELL$)/.test(key), `Inherited host environment: ${key}`)
    const backend = await bounded("own production initialization IPC", page.evaluate(async () => {
      const api = (window as unknown as { api: ElectronAPI }).api
      return api.awaitInitialization()
    }), 60000)
    state.backend = backend
    assert.equal(new URL(backend.url).hostname, "127.0.0.1")
    assert.equal(backend.username, "orchestra")
    assert.ok(backend.password, "Own backend authentication is missing")
    async function request<T>(route: string, method = "GET", body?: unknown, directory = root): Promise<T> {
      const url = new URL(route, backend.url + "/")
      url.searchParams.set("directory", directory)
      const response = await fetch(url, { method, signal: AbortSignal.timeout(120000), headers: {
        authorization: `Basic ${Buffer.from(`${backend.username}:${backend.password}`).toString("base64")}`,
        "content-type": "application/json",
      }, body: body === undefined ? undefined : JSON.stringify(body) })
      const bytes = await response.text()
      assert.ok(response.ok, `${method} ${route}: ${response.status} ${bytes}`)
      return JSON.parse(bytes) as T
    }
    assert.equal((await fetch(new URL("global/health", backend.url + "/"), { signal: AbortSignal.timeout(5000) })).status, 401,
      "Unauthenticated own backend must reject access")
    assert.equal((await request<{ healthy: boolean }>("global/health")).healthy, true)
    const paths = await request<{ home: string; state: string; config: string }>("path")
    for (const [key, value] of Object.entries(paths).filter(([key]) => ["home", "state", "config"].includes(key))) inside(root, value, `backend path.${key}`)
    const utilities = await bounded("actual sidecar child counter", application.evaluate(({ app }) =>
      app.getAppMetrics().filter((metric) => metric.type === "Utility" && metric.name === "Orchestra server").length))
    assert.equal(utilities, 1, "Missing actual owned utility sidecar child")
    const marker = await Bun.file(path.join(root, ".orchestra-lean-candidate.json")).json()
    assert.deepEqual(marker, { appId: appID, version: 1, root })
    return { application, page, backend, request, close, diagnostics, root }
  } catch (error) {
    errors.push(error)
    await close()
    throw new AggregateError(errors, "Candidate launch primary and cleanup diagnostics")
  }
}

export type OwnedCandidate = Awaited<ReturnType<typeof launchCandidate>>
