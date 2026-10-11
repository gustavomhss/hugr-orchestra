import assert from "node:assert/strict"
import path from "node:path"
import { createRequire } from "node:module"
import { connect } from "node:net"
import { readFile, writeFile } from "node:fs/promises"
import { execFileSync } from "node:child_process"
import { setTimeout as sleep } from "node:timers/promises"
import type { ElectronApplication, Page } from "@playwright/test"
import type { ElectronAPI, ServerReadyData } from "../src/preload/types"
import { appID, desktop, productName } from "./lean-candidate-identity.fixture"
import type { CandidateRecorder } from "./lean-candidate-record.fixture"

const appRequire = createRequire(path.resolve(desktop, "../app/package.json"))
export const expect = (appRequire("@playwright/test") as typeof import("@playwright/test")).expect

export async function bounded<T>(label: string, task: Promise<T>, ms = 30000): Promise<T> {
  const timeout = Promise.withResolvers<never>()
  const timer = setTimeout(() => timeout.reject(new Error(`${label} timed out after ${ms} ms`)), ms)
  // A task that loses the race may still reject later; observe it so it never escapes as an unhandled rejection
  // past the recorder. The race result (including the task's own rejection when it settles first) is unchanged.
  task.catch(() => undefined)
  try { return await Promise.race([task, timeout.promise]) }
  finally { clearTimeout(timer) }
}

export async function until(label: string, check: () => Promise<boolean>, ms = 30000) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    if (await bounded(label, check(), Math.min(5000, deadline - Date.now()))) return
    await sleep(100)
  }
  throw new Error(`${label} did not settle within ${ms} ms`)
}

// Descendants of an owned process: [pid, command] pairs from one ps snapshot. Taken before quit, because survivors
// re-parent to launchd once the owned main process exits.
export function descendants(root: number) {
  const rows = execFileSync("ps", ["-A", "-o", "pid=,ppid=,comm="], { encoding: "utf8" }).trim().split("\n")
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)).filter((match) => match !== null)
    .map((match) => ({ pid: Number(match[1]), ppid: Number(match[2]), command: path.basename(match[3]!) }))
  const found = new Map<number, string>()
  for (let frontier = [root]; frontier.length; ) {
    frontier = rows.filter((row) => frontier.includes(row.ppid) && !found.has(row.pid)).map((row) => (found.set(row.pid, row.command), row.pid))
  }
  return [...found]
}

const running = (pid: number) => {
  try { process.kill(pid, 0); return true }
  catch (error) { return !(error instanceof Error && "code" in error && error.code === "ESRCH") }
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

export async function launchCandidate(executable: string, root: string, recorder: CandidateRecorder) {
  assert.ok(path.isAbsolute(root), "Candidate ROOT must be absolute")
  recorder.protectPath(root, "candidate-root")
  // Resolve the installed Playwright through the package that declares it. Never attach to a user app.
  const { _electron } = appRequire("@playwright/test") as typeof import("@playwright/test")
  const env = Object.fromEntries(["PATH", "LANG", "LC_ALL", "GOROOT", "RUSTUP_HOME"].flatMap((key) =>
    process.env[key] === undefined ? [] : [[key, process.env[key]!]]))
  // --use-mock-keychain: on quit Chromium creates the "<name> Safe Storage" keychain item, and an unattended runner
  // never answers the keychain authorization prompt, so the process hangs (sampled stack: SecItemAdd ->
  // makeLoginAuthUI -> AuthorizationCopyRights). The proof never needs or touches the runner's real keychain.
  const application: ElectronApplication = await _electron.launch({ executablePath: executable, timeout: 60000,
    args: ["--use-mock-keychain"], cwd: path.dirname(root), env: { ...env, ORCHESTRA_CANDIDATE_PROFILE_ROOT: root } })
  // Recorder-owned bounded streams join chunks before redaction; overflow publishes only a named marker.
  const stdout = recorder.stream("owned Electron main stdout")
  const stderr = recorder.stream("owned Electron main stderr")
  const renderer = recorder.stream("owned renderer diagnostics")
  application.process().stdout?.on("data", (bytes: Buffer) => stdout.push(bytes))
  application.process().stderr?.on("data", (bytes: Buffer) => stderr.push(bytes))
  const state: { backend?: ServerReadyData; page?: Page; closed: boolean } = { closed: false }
  const close = async () => {
    if (state.closed) return
    try {
      // Quit through the app's own path (app.quit, as Cmd+Q). Native runs showed two chained holds: Node keeps an
      // exiting main alive while Playwright's inspector stays attached ("Waiting for the debugger to disconnect"),
      // and Playwright's close() then waits for stdio pipes a descendant may hold. close() releases the inspector;
      // the gate is the main process exit, then pipe holders are named and ended so close() can finish.
      const child = application.process()
      const exited = child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve() : new Promise<void>((resolve) => child.once("exit", () => resolve()))
      const tree = child.pid ? descendants(child.pid) : []
      const started = performance.now()
      await bounded("owned Electron quit request", application.evaluate(({ app }) => { setImmediate(() => app.quit()) }), 10000)
      const closing = application.close()
      closing.catch(() => undefined)
      await bounded("owned Electron quit", exited, 60000)
      console.log(`owned Electron quit ms=${Math.round(performance.now() - started)} descendants=${tree.length}`)
      // Descendants still alive after main exited would hold inherited pipes open; name them, then end them.
      const survivors = tree.filter(([pid]) => running(pid))
      if (survivors.length) {
        recorder.fail("cleanup", "owned descendants survived quit", new Error(`Survivors: ${JSON.stringify(survivors)}`))
        for (const [pid] of survivors) { try { process.kill(pid, "SIGKILL") } catch {} }
      }
      child.stdout?.destroy()
      child.stderr?.destroy()
      await bounded("owned Electron connection close", closing, 15000)
      if (state.backend) await portClosed(state.backend.url)
      state.closed = true
    } catch (error) {
      recorder.fail("cleanup", "owned Electron quit", error)
      // Only the child returned by this launch is eligible for forced cleanup.
      const child = application.process()
      // A main that never exits after app.quit: keep its native thread stacks (sanitized) as evidence first.
      if (process.platform === "darwin" && child.pid && child.exitCode === null && child.signalCode === null) {
        try {
          const sample = execFileSync("/usr/bin/sample", [String(child.pid), "3"], { encoding: "utf8", timeout: 30000, maxBuffer: 32 << 20 })
          await writeFile(path.join(desktop, "dist-candidate/proof", `quit-sample-${child.pid}.txt`), recorder.clean(sample))
        } catch (error) { recorder.fail("cleanup", "owned Electron quit sample", error) }
      }
      try { if (child.exitCode === null) child.kill("SIGKILL") }
      catch (error) { recorder.fail("cleanup", "owned Electron forced termination", error) }
      if (state.backend) {
        try { await portClosed(state.backend.url) } catch (error) { recorder.fail("cleanup", "owned backend port closure", error) }
      }
      state.closed = true
    }
  }
  try {
    const page = await application.firstWindow({ timeout: 60000 })
    state.page = page
    page.setDefaultTimeout(30000)
    page.setDefaultNavigationTimeout(30000)
    await page.waitForURL((url) => url.protocol === "oc:" && url.hostname === "renderer", { timeout: 60000 })
    page.on("pageerror", (error) => { recorder.fail("primary", "owned renderer", error); renderer.push(`renderer error: ${error.stack}\n`) })
    page.on("console", (message) => { if (message.type() === "error") renderer.push(`renderer console: ${message.text()}\n`) })
    assert.ok(page.url().startsWith("oc://renderer/"), `Unexpected packaged renderer URL: ${page.url()}`)
    // Production await-initialization returns main's own Deferred ServerReadyData (url/username/password).
    // Register generated credentials before assertions or diagnostics can reach an output sink.
    const backend = await bounded("own production initialization IPC", page.evaluate(async () => {
      const api = (window as unknown as { api: ElectronAPI }).api
      return api.awaitInitialization()
    }), 60000)
    state.backend = backend
    recorder.protectBackend(backend.username, backend.password)
    const snapshot = await bounded("actual Electron candidate paths", application.evaluate(({ app }) => ({
      packaged: app.isPackaged, name: app.getName(), lock: app.hasSingleInstanceLock(),
      paths: { userData: app.getPath("userData"), sessionData: app.getPath("sessionData"), home: app.getPath("home"), temp: app.getPath("temp") },
      env: { ...process.env }, utility: app.getAppMetrics().filter((metric) => metric.type === "Utility").length,
    })))
    for (const [key, value] of Object.entries(snapshot.paths)) recorder.protectPath(value, `observed-${key}`)
    const pathKeys = ["HOME", "XDG_DATA_HOME", "XDG_CONFIG_HOME", "XDG_STATE_HOME", "XDG_CACHE_HOME", "ORCHESTRA_DB", "ORCHESTRA_TEST_MANAGED_CONFIG_DIR", "TMPDIR"]
    for (const key of pathKeys) if (snapshot.env[key]) recorder.protectPath(snapshot.env[key]!, `observed-${key}`)
    assert.equal(snapshot.packaged, true)
    assert.equal(snapshot.name, productName)
    assert.equal(snapshot.lock, true, "Candidate did not hold its own single-instance lock")
    for (const [key, value] of Object.entries(snapshot.paths)) inside(root, value, `app.getPath(${key})`)
    assert.equal(snapshot.paths.userData, path.join(root, "desktop"))
    assert.equal(snapshot.paths.sessionData, path.join(root, "session"))
    assert.equal(snapshot.env.ORCHESTRA_LEAN_CANDIDATE, "1")
    assert.equal(snapshot.env.ORCHESTRA_INHERIT_CREDENTIALS, "0")
    assert.equal(snapshot.env.ORCHESTRA_CANDIDATE_PROFILE_ROOT, root)
    for (const key of pathKeys)
      inside(root, snapshot.env[key]!, key)
    for (const key of Object.keys(snapshot.env))
      assert.ok(!/^(OPENAI|ANTHROPIC|AWS|AZURE|GOOGLE|SENTRY|GH_|GITHUB_TOKEN|SSH_|NODE_OPTIONS|ELECTRON_RUN_AS_NODE|SHELL$)/.test(key), `Inherited host environment: ${key}`)
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
      if (!response.ok) throw new Error(`${method} ${route}: ${response.status}`, { cause: { privateResponse: bytes } })
      try { return JSON.parse(bytes) as T }
      catch (error) { throw new Error(`${method} ${route}: invalid JSON`, { cause: { privateResponse: { bytes, error } } }) }
    }
    assert.equal((await fetch(new URL("global/health", backend.url + "/"), { signal: AbortSignal.timeout(5000) })).status, 401,
      "Unauthenticated own backend must reject access")
    assert.equal((await request<{ healthy: boolean }>("global/health")).healthy, true)
    const paths = await request<{ home: string; state: string; config: string }>("path")
    for (const [key, value] of Object.entries(paths).filter(([key]) => ["home", "state", "config"].includes(key))) inside(root, value, `backend path.${key}`)
    const utilities = await bounded("actual sidecar child counter", application.evaluate(({ app }) =>
      app.getAppMetrics().filter((metric) => metric.type === "Utility" && metric.name === "Orchestra server").length))
    assert.equal(utilities, 1, "Missing actual owned utility sidecar child")
    const marker = JSON.parse(await readFile(path.join(root, ".orchestra-lean-candidate.json"), "utf8"))
    assert.deepEqual(marker, { appId: appID, version: 1, root })
    return { application, page, backend, request, close, get diagnostics() { return [stdout.read(), stderr.read(), renderer.read()] }, root }
  } catch (error) {
    recorder.fail("primary", "owned candidate launch", error)
    await close()
    throw error
  }
}

export type OwnedCandidate = Awaited<ReturnType<typeof launchCandidate>>
