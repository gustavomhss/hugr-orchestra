// Actual packaged Electron only. Crash/quit assertions precede every emergency signal.
import { spawn } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { adoptTree, control, identity, inventoryScope, kill9, matches, members, own, table, until, win, type Identity } from "../../../omni/campaign/lib"
import { WindowsInventory } from "../../../omni/campaign/windows-inventory"
import { digest, logs, provenance } from "./build"
import { activate, controls, events, fixtures, type Report } from "./fixtures"
import { emergency, observe, owned } from "./inventory"

type Cell = "main-kill" | "utility-kill" | "quit"
type Mutation = "legacy" | "forced-kill" | "empty"

export async function run(cell: Cell, mutation?: Mutation) {
  const manifest = provenance()
  try { requiredFixtures(mutation === "empty" ? [] : ["main", "shell", "terminal"]) }
  catch (error) { return { cell, mutation: mutation ?? "none", pass: false, error: String(error), cleanup: true } }
  const scratch = await fixtures()
  const destination = path.join(logs, `${cell}-${mutation ?? "restored"}`)
  mkdirSync(destination, { recursive: true })
  const launcher = process.platform === "linux" ? ["xvfb-run", "-a", manifest.executable] : [manifest.executable]
  const app = spawn(launcher[0]!, [...launcher.slice(1), "--no-sandbox"], { cwd: scratch.project, env: scratch.env, stdio: ["ignore", "pipe", "pipe"], windowsHide: false })
  const state = { output: "", error: "", exitedAt: 0, closed: false }
  app.stdout!.on("data", (chunk) => { state.output = (state.output + chunk).slice(-200_000) })
  app.stderr!.on("data", (chunk) => { state.output = (state.output + chunk).slice(-200_000) })
  app.once("error", (error) => { state.error = String(error) })
  app.once("exit", () => { state.exitedAt = Date.now() })
  app.once("close", () => { state.closed = true })
  const roots: Identity[] = []
  const retained: Identity[] = []
  const evidence: Record<string, unknown> = {}
  const result = { cell, mutation: mutation ?? "none", pass: false, error: "", cleanup: false }
  const legacy = { proc: undefined as ReturnType<typeof spawn> | undefined }
  try {
    if (win) await WindowsInventory.prepare()
    roots.push(own(scratch.home, app))
    const server = await until(120_000, "packaged desktop report", () => {
      if (state.error || app.exitCode !== null || app.signalCode !== null) throw new Error(`actual app startup failed: ${state.error}; ${state.output}`)
      return existsSync(scratch.report) ? JSON.parse(readFileSync(scratch.report, "utf8")) as Report : undefined
    })
    if (!server.packaged || !server.versions.electron || server.db !== ":memory:" || server.home !== scratch.home || server.nonce !== scratch.trees.main.nonce ||
      path.resolve(server.resources) !== path.resolve(manifest.resources) || server.main.line !== scratch.trees.main.ready || !server.main.bytes || !Number.isSafeInteger(server.utilityPID) || server.pid === server.utilityPID) throw new Error("actual packaged Electron/isolation/bytes/utility PID control failed")
    const rows = table()
    const main = identity(server.pid, rows)
    const utility = identity(server.utilityPID, rows)
    if (!inventoryScope(rows, [main]).some((row) => matches(row, utility))) throw new Error("actual utilityProcess not descendant of pinned Electron main")
    roots.push(main, utility)
    scratch.specs.forEach((spec) => adoptTree(scratch.home, spec.nonce, [spec.name === "main" ? main : utility]))
    evidence.hosts = { main, utility, launcher: roots[0], mainSession: rows.find((row) => matches(row, main))?.session, utilitySession: rows.find((row) => matches(row, utility))?.session,
      versions: server.versions, resources: server.resources, userData: server.userData, home: server.home, nonce: server.nonce }
    await until(30_000, "actual Electron visible GUI window/display", () => events(scratch.report).find((event) => event.name === "gui-visible" && event.pid === main.pid && event.windows?.some((window) => window.visible) && event.displays?.length) ?? undefined)
    evidence.protocols = await activate(scratch, server, mutation === "legacy")
    if (mutation === "legacy") {
      // Actual defect: second terminal tree bypasses utility ownership via legacy node child_process.
      legacy.proc = spawn(scratch.trees.terminal2.command, scratch.trees.terminal2.args, { env: scratch.env, cwd: scratch.project, stdio: "ignore" })
      roots.push(own(scratch.home, legacy.proc))
      adoptTree(scratch.home, scratch.trees.terminal2.nonce, roots)
    }
    const live = await until(90_000, "all actual desktop fixtures ACTIVE with exact member counts", () => {
      const rows = table()
      const found = controls(scratch, main, utility, rows)
      evidence.liveProbe = found
      // Mutant must have live members first; absence is a different failure, never expected mutant-red.
      return Object.values(found).every((value) => value.fixtureIds.length + value.wrappers.length > 0) && scratch.specs.every((spec) =>
        spec.nonce.startsWith("omni-tree-") ? found[spec.name]!.fixtureIds.length === spec.size : found[spec.name]!.protectedMembers.length === spec.size) ? found : undefined
    })
    evidence.live = live
    const mainSupervisors = live.main!.protectedMembers.flatMap((member) => member.supervisors)
    const utilitySupervisors = Object.entries(live).filter(([name]) => name !== "main").flatMap(([, found]) => found.protectedMembers.flatMap((member) => member.supervisors))
    if (mutation === "legacy") {
      if (!live.terminal2!.pass && Object.entries(live).filter(([name]) => name !== "terminal2").every(([, found]) => found.pass)) throw new Error("legacy unowned tree positive control rejected")
      throw new Error("legacy mutation did not isolate intended ownership defect")
    }
    if (!Object.values(live).every((found) => found.pass) || !mainSupervisors.length || !utilitySupervisors.length || mainSupervisors.some((id) => utilitySupervisors.some((other) => matches(id, other)))) throw new Error("fixture supervisor ancestry/main vs utility ownership control failed")
    evidence.allTrees3 = Object.fromEntries(["main", "shell", "terminal"].map((name) => [name, live[name]]))
    const before = table()
    owned(before, roots).forEach((row) => retained.push(identity(row.pid, before)))
    Object.values(live).flatMap((found) => [...found.fixtureIds, ...found.wrappers, ...found.protectedMembers.flatMap((member) => member.supervisors)]).forEach((id) => { if (!retained.some((old) => matches(old, id))) retained.push(id) })
    evidence.retained = retained
    const utilityOwned = owned(before, [utility]).map((row) => identity(row.pid, before))
    const selected = cell === "utility-kill" ? scratch.specs.filter((spec) => spec.name !== "main") : scratch.specs
    const boundMs = cell === "quit" ? 20_000 : 8000
    const started = Date.now()
    evidence.action = { cell, started, boundMs, input: cell === "quit" && mutation !== "forced-kill" ? "app.quit" : win ? "TerminateProcess (no tree kill)" : "SIGKILL", target: cell === "utility-kill" ? utility : main }
    if (cell === "quit" && mutation !== "forced-kill") writeFileSync(server.quit, server.token, { mode: 0o600 })
    if (cell !== "quit" || mutation === "forced-kill") {
      if (!kill9(cell === "utility-kill" ? utility : main)) throw new Error("pinned actual Electron kill not delivered")
    }
    const observed = await observe(started, boundMs, selected.map((spec) => spec.nonce), cell === "utility-kill" ? utilityOwned : retained)
    evidence.observed = observed
    evidence.events = events(scratch.report)
    evidence.exit = { exitCode: app.exitCode, signalCode: app.signalCode, closed: state.closed, exitMs: state.exitedAt ? state.exitedAt - started : undefined }
    if (cell === "quit") {
      const witnessed = events(scratch.report).filter((event) => event.pid === main.pid && event.at >= started)
      const orderly = ["quit-requested", "before-quit", "utility-stopped", "utility-exit", "will-quit", "quit"].every((name) => witnessed.some((event) => event.name === name)) &&
        !witnessed.some((event) => event.name === "utility-watchdog") && witnessed.some((event) => event.name === "utility-exit" && event.code === 0) && witnessed.some((event) => event.name === "quit" && event.code === 0) &&
        app.exitCode === 0 && app.signalCode === null && state.closed && state.exitedAt > started && state.exitedAt - started < boundMs
      evidence.orderly = orderly
      if (!orderly) throw new Error("actual app.quit did not prove orderly code-zero exit without watchdog/forced kill")
    }
    if (!observed.pass || observed.zeroAtMs === undefined) throw new Error("actual desktop owned inventory not zero inside deadline")
    if (cell === "utility-kill") {
      const independent = control(scratch.trees.main.nonce, scratch.trees.main.size, [main])
      evidence.mainStillActive = independent
      if (!independent.pass) throw new Error("utility kill also killed independent main supervisor/tree")
    }
    result.pass = true
  } catch (error) { result.error = String(error) }
  finally {
    scratch.llm.stop()
    // Capture newly observed descendants even after partial startup; kill only exact owned identities.
    try {
      const rows = table()
      owned(rows, [...roots, ...retained]).forEach((row) => { if (!retained.some((id) => matches(row, id))) retained.push(identity(row.pid, rows)) })
    } catch (error) { result.pass = false; result.error += `; cleanup capture: ${error}` }
    try { await emergency(app, roots, retained, scratch.specs.map((spec) => spec.nonce)); result.cleanup = true }
    catch (error) { result.pass = false; result.error += `; emergency cleanup: ${error}` }
    if (legacy.proc?.exitCode === null && legacy.proc.signalCode === null) legacy.proc.kill("SIGKILL")
    for (const file of readdirSync(scratch.home).filter((file) => file !== "smoke.json" && /\.(json|events)$/.test(file))) copyFileSync(path.join(scratch.home, file), path.join(destination, file))
    writeFileSync(path.join(destination, "app.log"), state.output)
  }
  const record = { ...result, at: new Date().toISOString(), os: process.platform, arch: process.arch, run: process.env.GITHUB_RUN_ID,
    sourceSHA: manifest.sourceSHA, sourceTree: manifest.sourceTree, buildManifestSha256: digest(path.join(logs, "build.json")),
    evidence, capabilities: { gui: process.platform === "linux" ? "actual Electron under Xvfb" : "actual Electron GUI on hosted VM", pty: win ? "ConPTY" : "POSIX PTY", lsp: "real product LSP service with stdio protocol fixture", mcp: "real product MCP stdio service + grandchild", signing: "unsigned probe; owner keys unavailable" } }
  writeFileSync(path.join(destination, "verdict.json"), JSON.stringify(record, null, 2))
  console.log("DESKTOP_CELL " + JSON.stringify({ ...record, evidence: { hosts: evidence.hosts, action: evidence.action, observed: evidence.observed, orderly: evidence.orderly } }))
  return record
}

export async function matrix() {
  const mutations = [await run("main-kill", "legacy"), await run("quit", "forced-kill"), await run("quit", "empty")]
  const restored = [await run("main-kill"), await run("utility-kill"), await run("quit")]
  const expected = ["legacy unowned tree positive control rejected", "actual app.quit did not prove orderly code-zero exit", "empty required fixtures rejected"]
  const pass = mutations.every((cell, index) => !cell.pass && cell.cleanup && cell.error.includes(expected[index]!)) && restored.every((cell) => cell.pass && cell.cleanup)
  const summary = { pass, sourceSHA: provenance().sourceSHA, os: process.platform, arch: process.arch, at: new Date().toISOString(), mutations: mutations.map(({ cell, mutation, pass, error, cleanup }) => ({ cell, mutation, pass, error, cleanup })),
    restored: restored.map(({ cell, pass, error, cleanup }) => ({ cell, pass, error, cleanup })) }
  writeFileSync(path.join(logs, "matrix.json"), JSON.stringify(summary, null, 2))
  console.log("DESKTOP_MATRIX " + JSON.stringify(summary))
  return summary
}

export function requiredFixtures(required: string[]) {
  if (!required.length) throw new Error("empty required fixtures rejected")
  if (required.length !== 3 || new Set(required).size !== 3 || ["main", "shell", "terminal"].some((name) => !required.includes(name))) throw new Error("allTrees3 requires exactly main,shell,terminal")
  return required
}
