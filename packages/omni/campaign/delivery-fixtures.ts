// Harness processes only. Product commands remain on AppProcess / Orchestra's PTY adapter.
import { spawn } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { LOGS, verdict } from "./lib.ts"

export function record<T extends Record<string, unknown> & { pass: boolean }>(name: string, result: T) {
  return { ...verdict(name, result), ...result }
}

export function authorized() {
  if (!process.env.CI && process.env.ORCHESTRA_LOCAL_TESTS !== "1")
    throw new Error("Local campaign requires ORCHESTRA_LOCAL_TESTS=1; Windows cells require a real Windows host.")
}

export function evidence(name: string, value: unknown) {
  mkdirSync(LOGS, { recursive: true })
  const file = path.join(LOGS, `${name}-${Date.now()}.json`)
  writeFileSync(file, JSON.stringify(value, null, 2) + "\n")
  return file
}

/** Measures process start through stdio close; a watchdog kill is never a successful cell. */
export async function execute(bin: string, args: string[], env: Record<string, string>, cwd: string, deadlineMs: number) {
  const started = performance.now()
  const proc = spawn(bin, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  const state = { stdout: "", stderr: "", timedOut: false, error: "" }
  proc.stdout.on("data", (chunk) => (state.stdout += chunk))
  proc.stderr.on("data", (chunk) => (state.stderr += chunk))
  const timer = setTimeout(() => {
    state.timedOut = true
    proc.kill("SIGKILL")
  }, deadlineMs)
  try {
    const exit = await new Promise<{ code: number | null; signal: string | null }>((resolve) => {
      proc.once("error", (error) => (state.error = String(error)))
      proc.once("close", (code, signal) => resolve({ code, signal }))
    })
    return { ...state, ...exit, ms: performance.now() - started }
  } finally {
    clearTimeout(timer)
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
