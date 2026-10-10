// Actual packaged Electron only. Crash/quit assertions precede every emergency signal.
import { spawn, spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs"
import path from "node:path"
import { adoptTree, control, identity, inventoryScope, kill9, matches, members, own, table, until, win, type Identity } from "../../../omni/campaign/lib"
import { WindowsInventory } from "../../../omni/campaign/windows-inventory"
import { digest, logs, provenance } from "./build"
import { activate, controls, events, fixtures, type Report } from "./fixtures"
import { emergency, observe, owned } from "./inventory"
import { keychain } from "./keychain"

type Cell = "main-kill" | "utility-kill" | "quit"
type Mutation = "legacy" | "forced-kill" | "empty" | "missing-keychain"
type Diagnostic = "stop-main" | "no-main-native" | "load-only" | "completed-run" | "private-keychain"

export async function run(cell: Cell, mutation?: Mutation, diagnostic?: Diagnostic) {
  const manifest = provenance()
  try { requiredFixtures(mutation === "empty" ? [] : ["main", "shell", "terminal"]) }
  catch (error) { return { cell, diagnostic, mutation: mutation ?? "none", pass: false, error: String(error), cleanup: true } }
  const scratch = await fixtures()
  const trace = process.argv.includes("--trace-server")
  // Default acceptance retains the original sanitized fixture environment.
  if (trace) Object.assign(scratch.env, { ORCHESTRA_PRINT_LOGS: "1", ORCHESTRA_LOG_LEVEL: "INFO" })
  const withoutMain = diagnostic === "no-main-native" || diagnostic === "load-only" || diagnostic === "completed-run"
  if (diagnostic) Object.assign(scratch.env, { ORCHESTRA_DESKTOP_OMNI_DIAGNOSTIC: diagnostic,
    ORCHESTRA_DESKTOP_OMNI_DIAGNOSTIC_ARGV: JSON.stringify([scratch.trees.main.command, "-e", "process.stdout.write('SHORT_RUN_READY')"]) })
  if (diagnostic === "stop-main") Object.assign(scratch.env, { ORCHESTRA_DESKTOP_OMNI_DIAGNOSE_MAIN: "1" })
  if (withoutMain) {
    // Isolate addon initialization from an active child; utility keeps every original fixture.
    scratch.env.ORCHESTRA_DESKTOP_OMNI_SMOKE_ARGV = "[]"
    scratch.specs = scratch.specs.filter((spec) => spec.name !== "main")
  }
  const destination = path.join(logs, `${cell}-${diagnostic ? `diagnostic-${diagnostic}` : mutation ?? "restored"}`)
  mkdirSync(destination, { recursive: true })
  const store = await Promise.resolve().then(() => process.platform === "darwin" && mutation !== "missing-keychain" ? keychain(scratch.home, scratch.env) : undefined)
    .catch((error: unknown) => { scratch.llm.stop(); throw error })
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
  evidence.keychain = store?.evidence
  const logReport = { source: scratch.report, userData: undefined as string | undefined }
  evidence.logReport = logReport
  evidence.logEnvironment = { trace, ORCHESTRA_PRINT_LOGS: scratch.env.ORCHESTRA_PRINT_LOGS ?? null,
    ORCHESTRA_LOG_LEVEL: scratch.env.ORCHESTRA_LOG_LEVEL ?? null,
    scope: trace ? "opt-in --trace-server fixture logging intervention" : "original sanitized fixture environment; trace disabled" }
  const result = { cell, cellID: scratch.trees.main.nonce, mutation: mutation ?? "none", diagnostic,
    scope: diagnostic ? `diagnostic ${diagnostic} intervention; NOT production shutdown proof` : "actual production shutdown",
    hostFixture: process.platform === "darwin" ? store ? "real isolated unlocked keychain" : "missing-keychain root mutation" : "native hosted OS", pass: false, error: "", cleanup: false }
  const legacy = { proc: undefined as ReturnType<typeof spawn> | undefined }
  try {
    if (win) await WindowsInventory.prepare()
    roots.push(own(scratch.home, app))
    const server = await until(120_000, "packaged desktop report", () => {
      if (state.error || app.exitCode !== null || app.signalCode !== null) throw new Error(`actual app startup failed: ${state.error}; ${state.output}`)
      return existsSync(scratch.report) ? JSON.parse(readFileSync(scratch.report, "utf8")) as Report : undefined
    })
    if (!server.packaged || !server.versions.electron || server.db !== ":memory:" || server.home !== scratch.home || server.nonce !== scratch.trees.main.nonce ||
      path.resolve(server.resources) !== path.resolve(manifest.resources) || !withoutMain && (server.main?.line !== scratch.trees.main.ready || !server.main.bytes) ||
      !Number.isSafeInteger(server.utilityPID) || server.pid === server.utilityPID) throw new Error("actual packaged Electron/isolation/bytes/utility PID control failed")
    logReport.userData = server.userData
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
    const mainSupervisors = live.main?.protectedMembers.flatMap((member) => member.supervisors) ?? []
    const utilitySupervisors = Object.entries(live).filter(([name]) => name !== "main").flatMap(([, found]) => found.protectedMembers.flatMap((member) => member.supervisors))
    if (mutation === "legacy") {
      if (!live.terminal2!.pass && Object.entries(live).filter(([name]) => name !== "terminal2").every(([, found]) => found.pass)) throw new Error("legacy unowned tree positive control rejected")
      throw new Error("legacy mutation did not isolate intended ownership defect")
    }
    if (!Object.values(live).every((found) => found.pass) || !withoutMain && !mainSupervisors.length || !utilitySupervisors.length || mainSupervisors.some((id) => utilitySupervisors.some((other) => matches(id, other)))) throw new Error("fixture supervisor ancestry/main vs utility ownership control failed")
    evidence.allTrees3 = Object.fromEntries(["main", "shell", "terminal"].map((name) => [name, live[name]]))
    const before = table()
    evidence.ownerRows = owned(before, roots)
    owned(before, roots).forEach((row) => retained.push(identity(row.pid, before)))
    Object.values(live).flatMap((found) => [...found.fixtureIds, ...found.wrappers, ...found.protectedMembers.flatMap((member) => member.supervisors)]).forEach((id) => { if (!retained.some((old) => matches(old, id))) retained.push(id) })
    evidence.retained = retained
    // A dying known Electron root can lose argv before ps marks it zombie. Keep its exact birth identity
    // in every observation scope; unknown NEW descendants still fail the unchanged campaign decoder.
    scratch.specs.forEach((spec) => adoptTree(scratch.home, spec.nonce, [...roots, ...retained]))
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
  } catch (error) {
    result.error = String(error)
    try { evidence.failureRows = table().filter((row) => retained.some((id) => matches(row, id))) }
    catch (error) { evidence.failureInventoryError = String(error) }
    if (process.platform === "darwin" && cell === "quit") {
      try {
        const host = roots[1]
        if (!host || !table().some((row) => matches(row, host) && !row.state.startsWith("Z"))) throw new Error("sample requires still-live exact owned Electron main")
        const sample = spawnSync("sample", [String(host.pid), "1", "1", "-file", path.join(scratch.home, "main-stack.txt")], { encoding: "utf8", timeout: 7000, killSignal: "SIGKILL" })
        evidence.nativeStack = { host, command: ["sample", String(host.pid), "1", "1"], status: sample.status, error: String(sample.error ?? ""), stdout: sample.stdout, stderr: sample.stderr }
      } catch (error) { evidence.nativeStackError = String(error) }
    }
  }
  finally {
    try { scratch.llm.stop() }
    catch (error) { result.pass = false; result.error += `; LLM fixture cleanup: ${error}` }
    // Capture newly observed descendants even after partial startup; kill only exact owned identities.
    try {
      const rows = table()
      owned(rows, [...roots, ...retained]).forEach((row) => { if (!retained.some((id) => matches(row, id))) retained.push(identity(row.pid, rows)) })
    } catch (error) { result.pass = false; result.error += `; cleanup capture: ${error}` }
    try { await emergency(app, roots, retained, scratch.specs.map((spec) => spec.nonce)); result.cleanup = true }
    catch (error) { result.pass = false; result.error += `; emergency cleanup: ${error}` }
    try { store?.dispose() }
    catch (error) { result.pass = false; result.cleanup = false; result.error += `; keychain fixture cleanup: ${error}` }
    try {
      if (legacy.proc?.exitCode === null && legacy.proc.signalCode === null) legacy.proc.kill("SIGKILL")
      if (legacy.proc) await until(5000, "legacy mutation handle exit", () => legacy.proc!.exitCode !== null || legacy.proc!.signalCode !== null ? true : undefined)
    } catch (error) { result.pass = false; result.cleanup = false; result.error += `; legacy handle cleanup: ${error}` }
    try {
      for (const file of readdirSync(scratch.home).filter((file) => file !== "smoke.json" && /\.(json|events|txt)$/.test(file))) copyFileSync(path.join(scratch.home, file), path.join(destination, file))
      writeFileSync(path.join(destination, "app.log"), state.output)
    } catch (error) { result.pass = false; result.error += `; evidence preservation: ${error}` }
    // Onboarding replaces XDG_DATA_HOME with the actual report's sibling data directory.
    const serverLog = preserveLog(logReport.userData ? path.join(path.dirname(logReport.userData), "data", "orchestra", "log", "orchestra.log") : undefined,
      path.join(destination, "server.log"))
    evidence.serverLog = serverLog
    const desktopLogDirectory = { source: logReport.userData ? path.join(logReport.userData, "logs") : undefined,
      destination: path.join(destination, "desktop-logs"), status: "missing", error: "verified desktop report unavailable", runs: [] as string[] }
    evidence.desktopLogDirectory = desktopLogDirectory
    if (desktopLogDirectory.source) {
      try {
        desktopLogDirectory.runs = readdirSync(desktopLogDirectory.source, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && /^\d{8}T\d{6}$/.test(entry.name)).map((entry) => entry.name)
        desktopLogDirectory.status = desktopLogDirectory.runs.length ? "found" : "missing"
        desktopLogDirectory.error = desktopLogDirectory.runs.length ? "" : "no UTC-stamped desktop log directory"
      }
      catch (error) {
        desktopLogDirectory.status = error instanceof Error && "code" in error && error.code === "ENOENT" ? "missing" : "failed"
        desktopLogDirectory.error = String(error)
      }
    }
    const desktopLogs: ReturnType<typeof preserveLog>[] = []
    evidence.desktopLogs = desktopLogs
    desktopLogDirectory.runs.forEach((stamp) => {
      const target = path.join(desktopLogDirectory.destination, stamp)
      try {
        mkdirSync(target, { recursive: true })
        ;["main.log", "server.log"].forEach((file) => desktopLogs.push(preserveLog(path.join(desktopLogDirectory.source!, stamp, file), path.join(target, file))))
      } catch (error) {
        desktopLogs.push({ source: path.join(desktopLogDirectory.source!, stamp), destination: target, status: "failed", bytes: 0, error: String(error) })
      }
    })
    const failures = [serverLog, desktopLogDirectory, ...desktopLogs].filter((receipt) => receipt.status === "failed")
    if (failures.length) {
      // Accepted mutant-red cells still require successful cleanup/preservation completion.
      result.pass = false; result.cleanup = false
      result.error += `; evidence preservation: ${failures.map((receipt) => `${receipt.source}: ${receipt.error}`).join("; ")}`
    }
  }
  const record = { ...result, at: new Date().toISOString(), os: process.platform, arch: process.arch, run: process.env.GITHUB_RUN_ID,
    sourceSHA: manifest.sourceSHA, sourceTree: manifest.sourceTree, buildManifestSha256: digest(path.join(logs, "build.json")),
    evidence, capabilities: { gui: process.platform === "linux" ? "actual Electron under Xvfb" : "actual Electron GUI on hosted VM", pty: win ? "ConPTY" : "POSIX PTY", lsp: "real product LSP service with stdio protocol fixture", mcp: "real product MCP stdio service + grandchild", signing: "unsigned probe; owner keys unavailable" } }
  writeFileSync(path.join(destination, "verdict.json"), JSON.stringify(record, null, 2))
  console.log("DESKTOP_CELL " + JSON.stringify({ ...record, evidence: { hosts: evidence.hosts, action: evidence.action, orderly: evidence.orderly,
    observation: evidence.observed ? Object.fromEntries(Object.entries(evidence.observed).filter(([key]) => key !== "samples")) : undefined, failureRows: evidence.failureRows } }))
  return record
}

function preserveLog(source: string | undefined, destination: string) {
  const receipt = { source: source ?? null, destination, status: "missing", bytes: 0, error: source ? "" : "verified desktop report unavailable" }
  if (!source) return receipt
  try { receipt.bytes = statSync(source).size }
  catch (error) {
    receipt.status = error instanceof Error && "code" in error && error.code === "ENOENT" ? "missing" : "failed"
    receipt.error = String(error)
    return receipt
  }
  try { copyFileSync(source, destination); receipt.status = "copied" }
  catch (error) { receipt.status = "failed"; receipt.error = String(error) }
  return receipt
}

export async function matrix() {
  // A helper/preservation failure is red evidence, never permission to skip the remaining real cells.
  const execute = (cell: Cell, mutation?: Mutation, diagnostic?: Diagnostic) => run(cell, mutation, diagnostic)
    .catch((error: unknown) => ({ cell, mutation: mutation ?? "none", diagnostic, pass: false, error: String(error), cleanup: false }))
  const mutations = [await execute("main-kill", "legacy"), await execute("quit", "forced-kill"), await execute("quit", "empty")]
  // Measured root cause was host keychain authorization, not native child ownership. Remove only the
  // real host fixture and require the unchanged Mac host-exit gate to reject the actual app.
  const rootMutation = process.platform === "darwin" ? await execute("quit", "missing-keychain") : undefined
  const restored = [await execute("main-kill"), await execute("utility-kill"), await execute("quit")]
  const diagnostic = process.argv.includes("--diagnose-main") ? [await execute("quit", undefined, "stop-main"), await execute("quit", undefined, "no-main-native"),
    await execute("quit", undefined, "load-only"), await execute("quit", undefined, "completed-run"), await execute("quit", undefined, "private-keychain")] : []
  const expected = ["legacy unowned tree positive control rejected", "actual app.quit did not prove orderly code-zero exit", "empty required fixtures rejected"]
  const pass = mutations.every((cell, index) => !cell.pass && cell.cleanup && cell.error.includes(expected[index]!)) &&
    (rootMutation === undefined || !rootMutation.pass && rootMutation.cleanup && rootMutation.error.includes("actual app.quit did not prove orderly code-zero exit")) && restored.every((cell) => cell.pass && cell.cleanup)
  const summary = { pass, sourceSHA: provenance().sourceSHA, os: process.platform, arch: process.arch, at: new Date().toISOString(), mutations: mutations.map(({ cell, mutation, pass, error, cleanup }) => ({ cell, mutation, pass, error, cleanup })),
    rootMutation: rootMutation && { pass: rootMutation.pass, error: rootMutation.error, cleanup: rootMutation.cleanup },
    restored: restored.map(({ cell, pass, error, cleanup }) => ({ cell, pass, error, cleanup })),
    diagnostic: diagnostic.map((result) => ({ diagnostic: result.diagnostic, pass: result.pass, error: result.error, cleanup: result.cleanup, scope: "diagnostic ONLY" })) }
  writeFileSync(path.join(logs, "matrix.json"), JSON.stringify(summary, null, 2))
  console.log("DESKTOP_MATRIX " + JSON.stringify(summary))
  return summary
}

export function requiredFixtures(required: string[]) {
  if (!required.length) throw new Error("empty required fixtures rejected")
  if (required.length !== 3 || new Set(required).size !== 3 || ["main", "shell", "terminal"].some((name) => !required.includes(name))) throw new Error("allTrees3 requires exactly main,shell,terminal")
  return required
}
