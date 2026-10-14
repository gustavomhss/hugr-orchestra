// Harness processes only. Product commands remain on AppProcess / Orchestra's PTY adapter.
import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { LOGS, afterCleanup, captureStarted, kill9, members, own, prepareCapture, table, until, verdict } from "./lib.ts"

export function record<T extends Record<string, unknown> & { pass: boolean }>(name: string, result: T) {
  if (!result.pass) return { ...verdict(name, result), ...result }
  afterCleanup((error) => verdict(name, error === undefined ? result : { ...result, pass: false, cleanupError: String(error) }))
  return result
}

export function authorized() {
  if (!process.env.CI && process.env.ORCHESTRA_LOCAL_TESTS !== "1")
    throw new Error("Local campaign requires ORCHESTRA_LOCAL_TESTS=1; Windows cells require a real Windows host.")
}

export function deliveryEnv(env: Record<string, string>) {
  return {
    ...Object.fromEntries(Object.entries(env).filter(([key]) =>
      !/API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|SSH_AUTH_SOCK/i.test(key) &&
      !/^(BUN_BE_BUN|BUN_OPTIONS|NODE_OPTIONS|NODE_PATH)$/.test(key))),
    ORCHESTRA_INHERIT_CREDENTIALS: "0",
    APPDATA: path.join(env.HOME, "AppData/Roaming"),
    LOCALAPPDATA: path.join(env.HOME, "AppData/Local"),
    NPM_CONFIG_USERCONFIG: path.join(env.HOME, ".npmrc"),
    NPM_CONFIG_CACHE: path.join(env.HOME, ".npm"),
  }
}

export function evidence(name: string, value: unknown) {
  mkdirSync(LOGS, { recursive: true })
  const file = path.join(LOGS, `${name}-${Date.now()}.json`)
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n")
  return file
}

/** Measures stdio close normally; watchdog resolves independently of descendants retaining those pipes. */
export async function execute(bin: string, args: string[], env: Record<string, string>, cwd: string, deadlineMs: number, nonces: string[] = []) {
  await prepareCapture()
  const started = performance.now()
  const proc = spawn(bin, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  proc.stdout.setEncoding("utf8")
  proc.stderr.setEncoding("utf8")
  const state = { stdout: "", stderr: "", timedOut: false, error: "", firstOutputMs: undefined as number | undefined }
  const closed = { value: false }
  proc.once("close", () => (closed.value = true))
  proc.stdout.on("data", (chunk) => {
    state.firstOutputMs ??= performance.now() - started
    state.stdout += chunk
  })
  proc.stderr.on("data", (chunk) => {
    state.firstOutputMs ??= performance.now() - started
    state.stderr += chunk
  })
  const captured = captureStarted(env.ORCHESTRA_TEST_HOME ?? env.HOME, proc).then(
    (identity) => ({ identity, error: "" }),
    (error: unknown) => ({ identity: undefined, error: String(error) }),
  )
  const timer = { id: undefined as ReturnType<typeof setTimeout> | undefined }
  try {
    const exit = await new Promise<{ code: number | null; signal: string | null; ms: number }>((resolve) => {
      proc.once("error", (error) => {
        state.error = String(error)
        resolve({ code: null, signal: null, ms: performance.now() - started })
      })
      proc.once("close", (code, signal) => resolve({ code, signal, ms: performance.now() - started }))
      timer.id = setTimeout(() => {
        state.timedOut = true
        proc.kill("SIGKILL")
        proc.stdout.destroy()
        proc.stderr.destroy()
        resolve({ code: proc.exitCode, signal: proc.signalCode, ms: performance.now() - started })
      }, deadlineMs)
    })
    clearTimeout(timer.id)
    const capture = await captured
    const observed = { ...state, ...exit, error: state.error || capture.error, pid: proc.pid, identity: capture.identity }
    if (state.timedOut) await until(10_000, "watchdog host handle close", () => closed.value ? true : undefined)
    const cleanup = state.timedOut && nonces.length ? await cleanupOwned(nonces) : undefined
    return { ...observed, ...(cleanup ? { cleanup } : {}) }
  } finally {
    clearTimeout(timer.id)
  }
}

export async function owned(nonces: string[], _env?: Record<string, string>, _cwd?: string) {
  if (!nonces.length || nonces.some((nonce) => !nonce)) throw new Error("Owned inventory requires nonempty nonce markers")
  const rows = table()
  const fixtures = nonces.flatMap((nonce) => {
    const found = members(nonce, rows)
    return [...found.members, ...found.wrappers]
  })
  return fixtures.filter((row, index) => fixtures.findIndex((member) => member.pid === row.pid && member.startTime === row.startTime) === index)
}

async function cleanupOwned(nonces: string[]) {
  const rows = await owned(nonces)
  rows.forEach((row) => kill9(row))
  const left = await owned(nonces)
  if (left.length) throw new Error(`Owned cleanup left live processes: ${JSON.stringify(left)}`)
  return { killed: rows, left }
}

/** Unlike a returned-handle-only starter, kills a host that never reports readiness. */
export async function startServer(bin: string, args: string[], env: Record<string, string>, cwd: string) {
  const proc = spawn(bin, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  proc.stdout.setEncoding("utf8")
  proc.stderr.setEncoding("utf8")
  const state = { text: "", error: "" }
  proc.stdout.on("data", (chunk) => (state.text += chunk))
  proc.stderr.on("data", (chunk) => (state.text += chunk))
  proc.on("error", (error) => (state.error = String(error)))
  try {
    const captured = own(env.ORCHESTRA_TEST_HOME ?? env.HOME, proc)
    const url = await until(120_000, "campaign host readiness", () => {
      if (state.error || proc.exitCode !== null || proc.signalCode !== null)
        throw new Error(`Host startup failed: ${state.error} rc=${proc.exitCode} signal=${proc.signalCode}\n${state.text}`)
      return state.text.match(/listening on (http:\/\/\S+)/)?.[1]
    })
    if (proc.pid === undefined) throw new Error("Campaign host has no PID")
    return { proc, pid: proc.pid, identity: captured, url, out: () => state.text }
  } catch (error) {
    proc.kill("SIGKILL")
    throw error
  }
}

export async function appRuntime() {
  const { ManagedRuntime } = await effectModules()
  const { LayerNode } = await import("../../core/src/effect/layer-node.ts")
  const { AppProcess } = await import("../../core/src/process.ts")
  return ManagedRuntime.make(LayerNode.compile(AppProcess.node))
}

/** campaign has no manifest: resolve the caller's Effect, preserving its runtime and type identity. */
export async function effectModules() {
  const { Effect, ManagedRuntime, ChildProcess } = await import("../../core/test/fixture/omni-effect.ts")
  return { Effect, ManagedRuntime, ChildProcess }
}
