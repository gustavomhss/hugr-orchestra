// V10 natural event-loop boundary. A forced exit (process.exit, as `serve` ends) is NOT this proof.
// natural-host.ts composes the unchanged core process modules over omni; after disposal it must exit by itself,
// code zero and unsignalled, and leave no owned process behind. Bun only: V2 ships no Node host.
// This is not the compiled CLI and not the Electron desktop. Only the parent kills a failed host.
import { spawn } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { BUN, cleanup, control, fileTree, isolated, markerArgument, matches, members, own, table, until, verdict, type Identity } from "./lib.ts"
import { authorized } from "./delivery-fixtures.ts"

const BOUND_MS = 10_000

export async function run(input: { mutation?: "timer" } = {}) {
  authorized()
  const scratch = isolated("natural-bun", {})
  const tree = fileTree(scratch.home, 1)
  const native = `omni-natural-output-${tree.nonce.slice(10)}`
  const node = Bun.which("node")
  if (!node) throw new Error("Natural proof requires a direct Node executable, not a Windows .cmd wrapper")
  const addon = process.env.HUGR_OMNI_ADDON
  const supervisor = process.env.HUGR_OMNI_SUPERVISOR
  if (!addon || !supervisor || !existsSync(addon) || !existsSync(supervisor)) throw new Error("Natural proof needs release HUGR_OMNI_ADDON and HUGR_OMNI_SUPERVISOR at child start")
  const disposed = path.join(scratch.home, "disposed.json")
  const env = {
    ...scratch.env, HUGR_OMNI_ADDON: addon, HUGR_OMNI_SUPERVISOR: supervisor, ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: "strict",
    NATURAL_NODE: node, NATURAL_NATIVE_NONCE: native, NATURAL_TREE: JSON.stringify({ command: tree.command, args: tree.args }),
    NATURAL_DISPOSED: disposed, NATURAL_MUTATION: input.mutation ?? "none",
  }
  const hostFile = path.join(import.meta.dirname, "natural-host.ts")
  const proc = spawn(BUN, [hostFile, scratch.home], { env, cwd: scratch.project, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  const state = { output: "", error: "", closed: false, exitAt: 0 }
  proc.stdout.on("data", (chunk) => { state.output += chunk.toString() })
  proc.stderr.on("data", (chunk) => { state.output += chunk.toString() })
  proc.on("error", (error) => { state.error = String(error) })
  proc.on("exit", () => { state.exitAt = Date.now() })
  proc.on("close", () => { state.closed = true })
  const observation = { left: [] as Identity[], atMs: 0, disposed: false, exitCode: null as number | null, signalCode: null as string | null, closed: false }
  const retained: Identity[] = []
  const started = { value: 0 }
  let pass = false
  let failure = ""
  try {
    const host = own(scratch.home, proc)
    markerArgument(scratch.home, hostFile)
    const ready = await until(120_000, "natural host readiness", () => {
      if (state.error || proc.exitCode !== null || proc.signalCode !== null) throw new Error(`Natural host startup failed: ${state.error}; ${state.output}`)
      const line = state.output.split("\n").find((line) => line.startsWith("NATURAL_READY "))
      return line ? JSON.parse(line.slice("NATURAL_READY ".length)) as { pid: number; control: string } : undefined
    })
    if (ready.pid !== host.pid) throw new Error("Readiness PID disagrees with retained host identity")
    const post = async (route: string) => {
      const response = await fetch(new URL(route, ready.control), { method: "POST", signal: AbortSignal.timeout(60_000) })
      if (!response.ok) throw new Error(`${route} answered ${response.status}`)
      return response.json() as Promise<{ app?: { exitCode: number; stdout: string; stderr: string } }>
    }
    const activation = await post("/write")
    if (activation.app?.exitCode !== 0 || activation.app.stdout !== "APP_PROCESS_READY" || activation.app.stderr !== "APP_PROCESS_STDERR")
      throw new Error(`AppProcess activation did not return its output: ${JSON.stringify(activation)}`)
    const live = await until(30_000, "native fixtures under supervisors", () => {
      const rows = table()
      const found = { native: control(native, 1, [host], rows), tree: control(tree.nonce, tree.size, [host], rows) }
      return Object.values(found).every((item) => item.pass) ? found : undefined
    })
    const found = [live.native, live.tree]
    retained.push(host, ...found.flatMap((item) => [...item.fixtureIds, ...item.wrappers, ...item.protectedMembers.flatMap((member) => member.supervisors)]))
    started.value = Date.now()
    // An HTTP timeout is failure only. A successful host is never signalled and has no watchdog of its own.
    const shutdown = post("/dispose")
    void shutdown.catch(() => undefined)
    await until(BOUND_MS, "natural code-zero unsignalled host close and owned inventory zero", () => {
      const budget = BOUND_MS - (Date.now() - started.value)
      // Windows queries include executable startup. Do not start one without its full bounded query budget.
      if (budget < 2000) return undefined
      const rows = table(Math.min(2000, budget))
      const left = retained.filter((id) => rows.some((row) => matches(row, id) && !row.state.startsWith("Z")))
      const fixtures = [native, tree.nonce].map((nonce) => members(nonce, rows))
      Object.assign(observation, { left, atMs: Date.now() - started.value, disposed: existsSync(disposed), exitCode: proc.exitCode, signalCode: proc.signalCode, closed: state.closed })
      if (proc.exitCode !== null && proc.exitCode !== 0 || proc.signalCode !== null) throw new Error(`Host did not exit naturally: ${proc.exitCode}/${proc.signalCode}`)
      return state.closed && proc.exitCode === 0 && proc.signalCode === null && existsSync(disposed) && left.length === 0 && fixtures.every((fixture) => fixture.members.length + fixture.wrappers.length === 0) ? true : undefined
    })
    await shutdown
    if (!state.output.includes("NATURAL_RETAINED ") || !state.output.includes("NATIVE_OUTPUT_READY")) throw new Error("Retained native output reference or worker completion evidence missing")
    JSON.parse(readFileSync(disposed, "utf8"))
    pass = true
  } catch (error) {
    failure = String(error)
  } finally {
    // This only forces failed hosts. The final verdict comes after the fallback cleanup, never before it.
    if (!pass && proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL")
    await cleanup(scratch.home, [tree.nonce, native])
  }
  return verdict("v10-natural-exit", { runtime: "bun", mutation: input.mutation ?? "none", boundMs: BOUND_MS, pass, error: failure, hostPID: proc.pid, observation, output: state.output.slice(-4000) })
}

if (import.meta.main) process.exit((await run()).pass ? 0 : 1)
