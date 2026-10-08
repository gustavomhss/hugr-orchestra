// Harness processes only. Product commands remain on AppProcess / Orchestra's PTY adapter.
import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { LOGS, kill9, until, verdict, win } from "./lib.ts"

export function record<T extends Record<string, unknown> & { pass: boolean }>(name: string, result: T) {
  return { ...verdict(name, result), ...result }
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
  const started = performance.now()
  const proc = spawn(bin, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  proc.stdout.setEncoding("utf8")
  proc.stderr.setEncoding("utf8")
  const state = { stdout: "", stderr: "", timedOut: false, error: "", firstOutputMs: undefined as number | undefined }
  proc.stdout.on("data", (chunk) => {
    state.firstOutputMs ??= performance.now() - started
    state.stdout += chunk
  })
  proc.stderr.on("data", (chunk) => {
    state.firstOutputMs ??= performance.now() - started
    state.stderr += chunk
  })
  const timer = { id: undefined as ReturnType<typeof setTimeout> | undefined }
  try {
    const exit = await new Promise<{ code: number | null; signal: string | null }>((resolve) => {
      proc.once("error", (error) => {
        state.error = String(error)
        resolve({ code: null, signal: null })
      })
      proc.once("close", (code, signal) => resolve({ code, signal }))
      timer.id = setTimeout(() => {
        state.timedOut = true
        proc.kill("SIGKILL")
        proc.stdout.destroy()
        proc.stderr.destroy()
        resolve({ code: proc.exitCode, signal: proc.signalCode })
      }, deadlineMs)
    })
    const observed = { ...state, ...exit, ms: performance.now() - started, pid: proc.pid }
    clearTimeout(timer.id)
    // Only nonce-bearing trees owned by this invocation. Inventory itself uses a bounded async child.
    const cleanup = state.timedOut && nonces.length ? await cleanupOwned(nonces, env, cwd) : undefined
    return { ...observed, ...(cleanup ? { cleanup } : {}) }
  } finally {
    clearTimeout(timer.id)
  }
}

export async function owned(nonces: string[], env: Record<string, string>, cwd: string): Promise<{ pid: number; args: string }[]> {
  if (!nonces.length || nonces.some((nonce) => !nonce)) throw new Error("Owned inventory requires nonempty nonce markers")
  const result = await execute(win ? "powershell.exe" : "ps", win
    ? ["-NoProfile", "-NonInteractive", "-Command", "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress"]
    : ["-axww", "-o", "pid=,args="], env, cwd, 2000)
  if (result.timedOut || result.error || result.code !== 0) throw new Error(`Owned inventory failed: ${JSON.stringify(result)}`)
  const rows = win
    ? (JSON.parse(result.stdout) as { ProcessId: number; CommandLine: string | null }[])
      .map((row) => ({ pid: row.ProcessId, args: row.CommandLine ?? "" }))
    : result.stdout.split("\n").flatMap((line) => {
      const match = line.trim().match(/^(\d+)\s+(.+)$/)
      return match ? [{ pid: Number(match[1]), args: match[2] }] : []
    })
  if (!rows.some((row) => row.pid === process.pid)) throw new Error("Owned inventory cannot see the harness process; refusing an empty-tree verdict")
  return rows.filter((row) => row.pid !== process.pid && row.pid !== result.pid && nonces.some((nonce) => row.args.includes(nonce)))
}

async function cleanupOwned(nonces: string[], env: Record<string, string>, cwd: string) {
  return owned(nonces, env, cwd).then(async (rows) => {
    rows.forEach((row) => kill9(row.pid))
    return { killed: rows, left: await owned(nonces, env, cwd) }
  }).catch((error: unknown) => ({ error: String(error) }))
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
    const url = await until(120_000, "campaign host readiness", () => {
      if (state.error || proc.exitCode !== null || proc.signalCode !== null)
        throw new Error(`Host startup failed: ${state.error} rc=${proc.exitCode} signal=${proc.signalCode}\n${state.text}`)
      return state.text.match(/listening on (http:\/\/\S+)/)?.[1]
    })
    if (proc.pid === undefined) throw new Error("Campaign host has no PID")
    return { proc, pid: proc.pid, url, out: () => state.text }
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
  const parent = new URL("../../core/package.json", import.meta.url).href
  const { Effect, ManagedRuntime } = await import(import.meta.resolve("effect", parent)) as typeof import("effect")
  const { ChildProcess } = await import(import.meta.resolve("effect/unstable/process", parent)) as typeof import("effect/unstable/process")
  return { Effect, ManagedRuntime, ChildProcess }
}
