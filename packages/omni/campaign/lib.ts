// Shared harness for the WP10 validation campaign (packages/omni/docs/orchestra-integration.md §4 WP10).
//
// Every scenario runs the real product (the compiled CLI by default) against an isolated HOME / XDG tree and a
// throwaway git project. Trees use the shared nonce fixture (packages/core/test/fixture/process-tree.ts), while
// hosts, supervisors and observed members retain PID/start-time identities. OS queries fail closed and are bounded.
// Each scenario prints one `CAMPAIGN_VERDICT {...}` JSON line.
//
// Scripts run under Bun on every OS and can be imported by bun:test wrappers.

import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync, appendFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { tree } from "../../core/test/fixture/process-tree.ts"

export { alive, gone, reap, sweep, tree } from "../../core/test/fixture/process-tree.ts"

export const ROOT = path.resolve(import.meta.dirname, "../../..")
export const ORCHESTRA = path.join(ROOT, "packages/orchestra")
export const LOGS = path.join(import.meta.dirname, "logs")
export const win = process.platform === "win32"

/** The compiled CLI: OMNI_CAMPAIGN_CLI, else the one target under packages/orchestra/dist. */
export function cli() {
  if (process.env.OMNI_CAMPAIGN_CLI) return process.env.OMNI_CAMPAIGN_CLI
  const dist = path.join(ORCHESTRA, "dist")
  const targets = existsSync(dist) ? readdirSync(dist).filter((name) => name.startsWith("orchestra-")) : []
  if (targets.length !== 1) throw new Error(`expected one built CLI target in ${dist}, found [${targets.join(", ")}]`)
  return path.join(dist, targets[0]!, "bin", win ? "orchestra.exe" : "orchestra")
}

/** Load average as text, recorded with every measurement (this Mac is often heavily loaded). */
export function load() {
  return win ? "n/a (windows)" : os.loadavg().map((value) => value.toFixed(2)).join(" ")
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function until<T>(timeoutMs: number, what: string, probe: () => T | undefined | Promise<T | undefined>) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const left = deadline - Date.now()
    if (left <= 0) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)
    let timer: ReturnType<typeof setTimeout> | undefined
    const value = await Promise.race([
      Promise.resolve().then(probe),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)), left) }),
    ]).finally(() => clearTimeout(timer))
    if (Date.now() >= deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)
    if (value !== undefined) return value
    await sleep(Math.min(200, deadline - Date.now()))
  }
}

/**
 * An isolated user: HOME and every XDG directory in a temp dir (never the real ~/.local/share/orchestra), plus a
 * throwaway git project. The config goes inline through ORCHESTRA_CONFIG_CONTENT, as the repo's CLI harness does.
 */
export function isolated(name: string, config: Record<string, unknown>) {
  const home = realpathSync(mkdtempSync(path.join(os.tmpdir(), `omni-campaign-${name}-`)))
  const project = path.join(home, "project")
  mkdirSync(project, { recursive: true })
  writeFileSync(path.join(project, "a.ts"), "export const a = 1\n")
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env))
    if (value !== undefined && !/^(HUGR_|ORCHESTRA_|ORCHESTRA_|ANTHROPIC_|OPENAI_|AWS_|AZURE_|GOOGLE_|GEMINI_|GITHUB_|GH_|BUN_OPTIONS|NODE_OPTIONS|SSH_AUTH_SOCK)/i.test(key) && !/(TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL)/i.test(key)) env[key] = value
  Object.assign(env, {
    ORCHESTRA_TEST_HOME: home,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData/Roaming"),
    LOCALAPPDATA: path.join(home, "AppData/Local"),
    PWD: project,
    GIT_CONFIG_GLOBAL: path.join(home, ".gitconfig"),
    GIT_CONFIG_NOSYSTEM: "1",
    XDG_CONFIG_HOME: path.join(home, ".config"),
    XDG_DATA_HOME: path.join(home, ".local/share"),
    XDG_STATE_HOME: path.join(home, ".local/state"),
    XDG_CACHE_HOME: path.join(home, ".cache"),
    ORCHESTRA_CONFIG_CONTENT: JSON.stringify(config.provider ? {
      ...config,
      agent: { maestro: { model: "test/test-model", permission: { "*": "allow" } }, ...(config.agent as Record<string, unknown>) },
    } : config),
    ORCHESTRA_DISABLE_PROJECT_CONFIG: "1",
    ORCHESTRA_PURE: "1",
    ORCHESTRA_DISABLE_AUTOUPDATE: "1",
    ORCHESTRA_DISABLE_AUTOCOMPACT: "1",
    ORCHESTRA_DISABLE_MODELS_FETCH: "1",
    ORCHESTRA_AUTH_CONTENT: "{}",
    ORCHESTRA_DISABLE_CLAUDE_CODE: "1",
    ORCHESTRA_DISABLE_EXTERNAL_SKILLS: "1",
    ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER: process.env.ORCHESTRA_EXPERIMENTAL_OMNI_SPAWNER ?? "1",
  })
  const git = spawnSync("git", ["init", "-q"], { cwd: project, env })
  if (git.status !== 0) throw new Error(`git init failed: ${git.error ?? git.stderr}`)
  return { home, project, env }
}

/** The provider block for the fake LLM (the shape of packages/orchestra/test/lib/test-provider.ts). */
export function provider(url: string) {
  return {
    test: {
      name: "Test",
      id: "test",
      env: [],
      npm: "@ai-sdk/openai-compatible",
      models: {
        "test-model": {
          id: "test-model",
          name: "Test Model",
          attachment: false,
          reasoning: false,
          temperature: false,
          tool_call: true,
          release_date: "2025-01-01",
          limit: { context: 100_000, output: 10_000 },
          cost: { input: 0, output: 0 },
          options: {},
        },
      },
      options: { apiKey: "test-key", baseURL: url },
    },
  }
}

export type ToolCall = { name: string; args: Record<string, unknown> }

/**
 * A minimal OpenAI-compatible chat-completions server. The first request offering all requested tools gets them
 * as parallel tool calls; every other request (tool results, titles) gets a short text answer.
 */
export async function fakeLLM(calls: ToolCall[]) {
  const seen: string[] = []
  const offered: string[][] = []
  let issued = false
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    let body = ""
    request.on("data", (chunk) => (body += chunk))
    request.on("end", () => {
      const parsed = (() => {
        try {
          return JSON.parse(body) as { tools?: { function: { name: string } }[]; messages?: { role: string }[] }
        } catch {
          return {}
        }
      })()
      const names = (parsed.tools ?? []).map((tool) => tool.function.name)
      if (names.length > 0) offered.push(names)
      const available = calls.filter((call) => names.includes(call.name))
      const withTools = !issued && calls.length > 0 && available.length === calls.length
      seen.push(withTools ? "tools" : "text")
      if (withTools) issued = true
      response.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache" })
      const send = (delta: Record<string, unknown>, finish?: string) =>
        response.write(
          `data: ${JSON.stringify({
            id: "chatcmpl-campaign",
            object: "chat.completion.chunk",
            choices: [{ index: 0, delta, ...(finish ? { finish_reason: finish } : {}) }],
          })}\n\n`,
        )
      send({ role: "assistant" })
      if (withTools)
        available.forEach((call, index) =>
          send({
            tool_calls: [
              {
                index,
                id: `call_${index}`,
                type: "function",
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              },
            ],
          }),
        )
      else send({ content: "done" })
      send({}, withTools ? "tool_calls" : "stop")
      response.end("data: [DONE]\n\n")
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address() as { port: number }
  return { url: `http://127.0.0.1:${address.port}/v1`, seen, offered, stop: () => server.close() }
}

export type Identity = { pid: number; startTime: string }
export type Started = { proc: ChildProcess; url: string; pid: number; extra: number[]; identity?: Identity; out: () => string }

const hosts = new Map<string, { proc: ChildProcess; identity: Identity }[]>()
const pins = new Map<number, Identity>()
const pendingVerdicts: ((error?: unknown) => void)[] = []

/** Retain handles of only campaign-owned hosts: serve's argv contains no isolated HOME marker. */
export function own(home: string, proc: ChildProcess) {
  const captured = identity(proc.pid!)
  pins.set(captured.pid, captured)
  const entries = hosts.get(home) ?? []
  entries.push({ proc, identity: captured })
  hosts.set(home, entries)
  return captured
}

/** Starts `orchestra serve` (or another subcommand that prints `listening on http://...`) and waits for its URL. */
export async function serve(bin: string, args: string[], env: Record<string, string>, cwd: string): Promise<Started> {
  if (process.env.ORCHESTRA_LOCAL_TESTS !== "1" && !process.env.CI) throw new Error("local campaign requires ORCHESTRA_LOCAL_TESTS=1")
  const proc = spawn(bin, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  const captured = own(env.ORCHESTRA_TEST_HOME!, proc)
  let out = ""
  proc.stdout!.on("data", (chunk) => (out += chunk))
  proc.stderr!.on("data", (chunk) => (out += chunk))
  const url = await until(120_000, `${path.basename(bin)} ${args[0]} to listen`, () => {
    if (proc.exitCode !== null || proc.signalCode !== null) throw new Error(`exited ${proc.exitCode ?? proc.signalCode} before listening: ${out.slice(-2000)}`)
    return out.match(/listening on (http:\/\/\S+)/)?.[1]
  })
  return { proc, url, pid: proc.pid!, extra: [] as number[], identity: captured, out: () => out }
}

/** JSON calls against an Orchestra server for one project directory. */
export function client(url: string, directory: string) {
  const call = async (method: string, route: string, body?: unknown) => {
    const response = await fetch(new URL(route, url), {
      method,
      signal: AbortSignal.timeout(120_000),
      headers: { "content-type": "application/json", "x-orchestra-directory": encodeURIComponent(directory) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${route} answered ${response.status}: ${text.slice(0, 500)}`)
    return text ? JSON.parse(text) : undefined
  }
  return {
    get: (route: string) => call("GET", route),
    post: (route: string, body?: unknown) => call("POST", route, body ?? {}),
    put: (route: string, body: unknown) => call("PUT", route, body),
    del: (route: string) => call("DELETE", route),
  }
}

/** A nonce tree written as a script file, so a shell command line carries only plain words (and the nonce). */
export function fileTree(home: string, depth = 2) {
  const t = tree(depth)
  const file = path.join(home, `${t.nonce}.js`)
  writeFileSync(file, t.args[1]!)
  const slash = (value: string) => value.replaceAll("\\", "/")
  const args = [file, ...t.args.slice(2)]
  return { ...t, args, line: [t.command, ...args].map((value) => `"${slash(value)}"`).join(" ") }
}

const QUERY_MS = 10_000
export type Row = Identity & { parent: number; args: string | null; state: string; session?: number }
// CIM can retain an exited row. Only the OS's missing/exited process result removes it; access denial keeps unknown.
const CIM = "$ErrorActionPreference='Stop'; ConvertTo-Json -Compress -InputObject @(Get-CimInstance Win32_Process | Where-Object {if ($null -ne $_.CommandLine) {return $true}; $p=$null; try {$p=[Diagnostics.Process]::GetProcessById([int]$_.ProcessId); return !$p.HasExited} catch [ArgumentException] {return $false} catch {return $true} finally {if ($p) {$p.Dispose()}}} | Select-Object ProcessId,ParentProcessId,CommandLine,SessionId,@{Name='StartTime';Expression={if ($_.CreationDate) {$_.CreationDate.ToFileTimeUtc().ToString()}}})"

/** Bounded live inventory. Unavailable argv remains unknown, never evidence of absence. */
export function table(timeoutMs = QUERY_MS): Row[] {
  if (timeoutMs <= 0) throw new Error("process table query has no deadline budget")
  const options = { encoding: "utf8" as const, windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs, killSignal: "SIGKILL" as const }
  if (win) {
    const out = windowsQuery(CIM, timeoutMs)
    if (out.status !== 0 || out.error) throw new Error(`Get-CimInstance failed: ${out.error ?? out.stderr}`)
    const parsed = decodeWindowsTable(JSON.parse(out.stdout), out.pid)
    return parsed
  }
  const out = spawnSync("ps", [process.platform === "darwin" ? "-axww" : "-eww", "-o", "pid=,ppid=,stat=,lstart=,args="], options)
  if (out.status !== 0 || out.error || !out.stdout.trim()) throw new Error(`ps failed: ${out.error ?? out.stderr}`)
  const rows = decodeUnixTable(out.stdout, out.pid)
  return rows
}

/** Bun 1.3.14 Windows sync timeout fired after 4 ms in a 15 s-old caller with a 10 s budget.
 * Node's real child-process timeout owns the same absolute wall deadline, including helper startup.
 * The caller never trusts a late/incomplete query. No retry or larger KPI budget.
 */
function windowsQuery(command: string, timeoutMs = QUERY_MS) {
  const deadline = Date.now() + timeoutMs
  const out = spawnSync("node", ["-e", `
const { spawnSync } = require("node:child_process");
const left = Number(process.argv[1]) - Date.now();
if (left <= 0) throw new Error("Windows query helper missed deadline before query");
const out = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", ${JSON.stringify(command)}], {
  encoding: "utf8", windowsHide: true, timeout: left, killSignal: "SIGKILL", maxBuffer: 64 * 1024 * 1024,
});
process.stdout.write(JSON.stringify({ pid: out.pid, status: out.status, stdout: out.stdout, stderr: out.stderr, error: out.error?.message }));
`, String(deadline)], { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
  if (out.status !== 0 || out.error || Date.now() >= deadline) throw new Error(`Windows query helper failed within ${timeoutMs} ms budget: ${out.error ?? out.stderr}`)
  return JSON.parse(out.stdout) as { pid: number; status: number | null; stdout: string; stderr: string; error?: string }
}

const recorder = { proc: undefined as ChildProcess | undefined, ready: undefined as Promise<void> | undefined,
  pending: new Map<number, ReturnType<typeof Promise.withResolvers<Identity | undefined>>>() }

/** Start the OS recorder before the KPI clock: creating PowerShell during a cell can block Bun's stdio delivery. */
export async function prepareCapture() {
  if (!win) return
  if (recorder.ready) {
    if (!recorder.proc || recorder.proc.exitCode !== null || recorder.proc.signalCode !== null) throw new Error("identity recorder is not live")
    return recorder.ready
  }
  const ready = Promise.withResolvers<void>()
  recorder.ready = ready.promise
  const proc = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", `
$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process -Filter 'ProcessId=${process.pid}' | Out-Null;
Write-Output '{"ready":true}';
while ($line=[Console]::ReadLine()) {
  $request=ConvertFrom-Json $line;
  try {$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$request.pid);
    $reply=if ($p) {@{pid=[int]$p.ProcessId;startTime=$p.CreationDate.ToFileTimeUtc().ToString()}} else {@{pid=[int]$request.pid;gone=$true}}
  } catch {$reply=@{pid=[int]$request.pid;error=$_.Exception.Message}}
  ConvertTo-Json -Compress -InputObject $reply
}`], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] })
  recorder.proc = proc
  const text = { stdout: "", stderr: "" }
  const fail = (error: unknown) => { ready.reject(error); recorder.pending.forEach((request) => request.reject(error)); recorder.pending.clear() }
  proc.stderr!.on("data", (chunk) => (text.stderr += chunk))
  proc.stdin!.on("error", fail)
  proc.on("error", fail)
  proc.on("close", () => fail(new Error(`identity recorder closed: ${text.stderr}`)))
  proc.stdout!.on("data", (chunk) => {
    text.stdout += chunk
    for (;;) {
      const end = text.stdout.indexOf("\n")
      if (end < 0) return
      const line = text.stdout.slice(0, end)
      text.stdout = text.stdout.slice(end + 1)
      try {
        const reply = JSON.parse(line) as { ready?: boolean; pid: number; startTime?: string; gone?: boolean; error?: string }
        if (reply.ready === true) { ready.resolve(); continue }
        const request = recorder.pending.get(reply.pid)
        if (!request) throw new Error(`unexpected identity recorder PID ${reply.pid}`)
        recorder.pending.delete(reply.pid)
        if (reply.error || !reply.gone && (typeof reply.startTime !== "string" || !/^\d+$/.test(reply.startTime))) { request.reject(new Error(`identity recorder failed: ${JSON.stringify(reply)}`)); continue }
        request.resolve(reply.gone ? undefined : { pid: reply.pid, startTime: reply.startTime! })
      } catch (error) { fail(error); proc.kill("SIGKILL") }
    }
  })
  const timer = setTimeout(() => { fail(new Error("identity recorder readiness deadline expired")); proc.kill("SIGKILL") }, QUERY_MS)
  await ready.promise.finally(() => clearTimeout(timer))
}

/** Request identity immediately after spawn; short exited commands retain only their exact ChildProcess handle. */
export async function captureStarted(home: string, proc: ChildProcess) {
  if (!win) return own(home, proc)
  await prepareCapture()
  if (proc.pid === undefined) throw new Error("spawned campaign process has no PID")
  const request = Promise.withResolvers<Identity | undefined>()
  recorder.pending.set(proc.pid, request)
  const timer = setTimeout(() => { request.reject(new Error(`identity capture deadline expired for PID ${proc.pid}`)); recorder.proc?.kill("SIGKILL") }, QUERY_MS)
  recorder.proc!.stdin!.write(JSON.stringify({ pid: proc.pid }) + "\n")
  const captured = await request.promise.finally(() => clearTimeout(timer))
  if (proc.exitCode !== null || proc.signalCode !== null) return
  if (!captured) throw new Error(`cannot capture live process identity for PID ${proc.pid}`)
  pins.set(captured.pid, captured)
  const entries = hosts.get(home) ?? []
  entries.push({ proc, identity: captured })
  hosts.set(home, entries)
  return captured
}

async function stopCapture() {
  const proc = recorder.proc
  if (!proc) return
  proc.stdin!.end()
  try {
    await until(QUERY_MS, "identity recorder close", () => proc.exitCode !== null || proc.signalCode !== null ? true : undefined)
  } finally {
    if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL")
    recorder.proc = undefined
    recorder.ready = undefined
  }
}

/** Exact ps decoding boundary; Linux cross-checks start time and argv through the same /proc identity. */
export function decodeUnixTable(stdout: string, queryPID: number): Row[] {
  const rows = stdout.split("\n")
    .filter((line) => line.trim().length > 0)
    .flatMap((line) => {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\w{3}\s+\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.*)$/)
      if (!match) throw new Error(`malformed ps row: ${line}`)
      const pid = Number(match[1])
      if (process.platform !== "linux") return [{ pid, parent: Number(match[2]), state: match[3]!, startTime: match[4]!, args: match[5]! }]
      const observed = (() => {
        try {
          const stat = readFileSync(`/proc/${pid}/stat`, "utf8")
          const args = readFileSync(`/proc/${pid}/cmdline`, "utf8").replaceAll("\0", " ").trim()
          const checked = readFileSync(`/proc/${pid}/stat`, "utf8")
          const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
          const now = checked.slice(checked.lastIndexOf(")") + 2).split(" ")
          if (fields[19] !== now[19]) throw new Error(`PID ${pid} changed identity during /proc query`)
          return { fields: now, args: args || null }
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined // It exited after the ps snapshot.
          throw error
        }
      })()
      if (observed === undefined) return []
      if (!/^\d+$/.test(observed.fields[19]!)) throw new Error(`malformed /proc/${pid}/stat start time`)
      return [{ pid, parent: Number(observed.fields[1]), state: observed.fields[0]!, startTime: observed.fields[19]!, args: observed.args }]
    })
    .filter((row) => row.pid !== queryPID)
  if (!rows.some((row) => row.pid === process.pid)) throw new Error("ps returned an incomplete or malformed process table (querying host missing)")
  return rows
}

/** Pure CIM decoding boundary, separately falsifiable without claiming a Windows runtime run. */
export function decodeWindowsTable(input: unknown, queryPID: number): Row[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error("Get-CimInstance returned no process table")
  const rows = input.flatMap((value: unknown) => {
    if (typeof value !== "object" || value === null) throw new Error("malformed Get-CimInstance row")
    const row = value as Record<string, unknown>
    // PID 0 is System Idle Process; PID 4 is System. Neither can be an owned campaign child.
    if (row.ProcessId === queryPID || row.ProcessId === 0 || row.ProcessId === 4) return []
    if (typeof row.ProcessId !== "number" || !Number.isSafeInteger(row.ProcessId) || row.ProcessId <= 0 || typeof row.ParentProcessId !== "number" || !Number.isSafeInteger(row.ParentProcessId) || row.ParentProcessId < 0 || (row.CommandLine !== null && typeof row.CommandLine !== "string") || typeof row.StartTime !== "string" || !/^\d+$/.test(row.StartTime) || typeof row.SessionId !== "number" || !Number.isSafeInteger(row.SessionId) || row.SessionId < 0)
      throw new Error(`Get-CimInstance cannot establish process identity for PID ${row.ProcessId}: ${JSON.stringify(row)}`)
    return [{ pid: row.ProcessId, parent: row.ParentProcessId, args: typeof row.CommandLine === "string" && row.CommandLine.trim() ? row.CommandLine : null, startTime: row.StartTime, session: row.SessionId, state: "live" }]
  })
  if (!rows.some((row) => row.pid === process.pid)) throw new Error("Get-CimInstance returned an incomplete process table (querying host missing)")
  return rows
}

export function identity(pid: number, rows = table()): Identity {
  const row = rows.find((row) => row.pid === pid && !row.state.startsWith("Z"))
  if (!row) throw new Error(`cannot capture live process identity for PID ${pid}`)
  return { pid: row.pid, startTime: row.startTime }
}

export function matches(row: Identity, pinned: Identity) {
  return row.pid === pinned.pid && row.startTime === pinned.startTime
}

export function hasNonce(args: string | null, nonce: string) {
  return args !== null && new RegExp(`(?:^|[\\s"'])${nonce.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s"'])`).test(args)
}

/** Nonce search covers the campaign-launched owner subtree plus named identities, not the system table.
 * Named fixtures and previously observed descendants survive reparenting; every live fixture enters this scope.
 * Unknown rows outside it are not nonce-negative proof. Unknown rows inside it make discovery red.
 */
export function inventoryScope(rows: Row[], named: Identity[] = []) {
  const host = rows.find((row) => row.pid === process.pid && !row.state.startsWith("Z"))
  if (!host || !host.args) throw new Error("campaign querying host identity/argv unavailable")
  const live = rows.filter((row) => !row.state.startsWith("Z"))
  const scope = new Set(live.filter((row) => matches(row, host) || named.some((id) => matches(row, id))).map((row) => row.pid))
  for (;;) {
    const descendants = live.filter((row) => !scope.has(row.pid) && scope.has(row.parent))
    if (!descendants.length) return live.filter((row) => scope.has(row.pid))
    descendants.forEach((row) => scope.add(row.pid))
  }
}

/** Exact fixture records are members; argv-bearing shells/wrappers are reported separately, never counted as members. */
export function members(nonce: string, rows = table()) {
  const dir = path.join(os.tmpdir(), nonce)
  const records = !nonce.startsWith("omni-tree-") ? (hosts.get(nonce) ?? []).map((host) => host.identity) : readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => {
    const record = JSON.parse(readFileSync(path.join(dir, name), "utf8")) as Identity & { nonce: string }
    if (record.nonce !== nonce || !Number.isSafeInteger(record.pid) || record.pid <= 0 || typeof record.startTime !== "string" || !record.startTime)
      throw new Error(`malformed fixture identity: ${path.join(dir, name)}`)
    return record
  })
  const named = [...records, ...pins.values()]
  const live = inventoryScope(rows, named).filter((row) => row.pid !== process.pid)
  const unknown = live.filter((row) => row.args === null && !named.some((id) => matches(row, id)))
  if (unknown.length) throw new Error(`campaign nonce discovery has unknown argv in owner scope: ${JSON.stringify(unknown)}`)
  live.forEach((row) => { if (!pins.has(row.pid)) pins.set(row.pid, { pid: row.pid, startTime: row.startTime }) })
  const found = live.filter((row) => records.some((record) => matches(row, record)))
  // macOS may drop argv during kernel teardown before the PID disappears. A retained identity still counts live.
  return { members: found, wrappers: live.filter((row) => (hasNonce(row.args, nonce) || row.args === null && named.some((id) => matches(row, id))) && !found.some((member) => matches(member, row))) }
}

const SUPERVISOR = /(^|[\\/"])hugr-omni-supervisor(\.exe)?("|\s|$)/

/** Every exact member AND wrapper must have a supervisor under a pinned campaign host. */
export function control(nonce: string, size: number, hosts: Identity[], rows = table()) {
  const found = members(nonce, rows)
  const above = (pid: number, depth = 0): Row[] => {
    const row = rows.find((row) => row.pid === pid)
    const parent = rows.find((parent) => parent.pid === row?.parent)
    if (!parent || depth > 32) return []
    return [parent, ...above(parent.pid, depth + 1)]
  }
  const protectedMembers = [...found.members, ...found.wrappers].map((row) => ({
    identity: identity(row.pid, rows),
    argvPresent: hasNonce(row.args, nonce),
    supervisors: above(row.pid).filter((ancestor) => ancestor.args !== null && SUPERVISOR.test(ancestor.args) && hosts.some((host) => above(ancestor.pid).some((parent) => matches(parent, host)))).map((row) => identity(row.pid, rows)),
  }))
  return { fixtureIds: found.members.map((row) => identity(row.pid, rows)), wrappers: found.wrappers.map((row) => identity(row.pid, rows)), protectedMembers, pass: hosts.length > 0 && hosts.every((host) => rows.some((row) => matches(row, host) && row.args !== null)) && found.members.length === size && protectedMembers.length > 0 && protectedMembers.every((member) => member.argvPresent && member.supervisors.length > 0) }
}

/** Compatibility control, strengthened from any-member to all-member supervision. */
export function supervised(nonce: string) {
  const rows = table()
  const hosts = rows.filter((row) => rows.some((supervisor) => supervisor.args !== null && SUPERVISOR.test(supervisor.args) && supervisor.parent === row.pid)).map((row) => identity(row.pid, rows))
  const found = members(nonce, rows)
  return control(nonce, found.members.length, hosts, rows).pass
}

/** Supervisors whose parent is one of `pids` (the ones a given host started). */
export function supervisorsOf(pids: number[]) {
  return table().filter((row) => row.args !== null && SUPERVISOR.test(row.args) && pids.includes(row.parent))
}

/** Every process whose command line mentions `marker` (a temp home, a nonce), except this one. */
export function mentioning(marker: string) {
  const rows = inventoryScope(table(), [...pins.values()])
  if (rows.some((row) => row.args === null)) throw new Error("campaign marker discovery has unknown argv in owner scope")
  return rows.filter((row) => row.pid !== process.pid && row.args!.includes(marker))
}

/** Already owned identities are live even when their command lines become unavailable. */
export function ownedIdentities(marker: string) {
  return (hosts.get(marker) ?? []).map((host) => host.identity)
}

/** Kill -9 on Unix; TerminateProcess on Windows (what `taskkill /F` does, without /T: the tree is omni's job). */
export function kill9(target: Identity | number) {
  // Numeric compatibility uses FIRST observed identity, never a fresh meaning for a retained/reused PID.
  const pinned = typeof target === "number" ? pins.get(target) : target
  if (!pinned) throw new Error(`kill9 requires a captured process identity for PID ${target}`)
  if (!Number.isSafeInteger(pinned.pid) || pinned.pid <= 0 || typeof pinned.startTime !== "string" || !pinned.startTime)
    throw new Error("kill9 requires a valid captured process identity")
  if (win) {
    // Open and retain the OS process handle BEFORE checking CIM creation time; Kill uses that same handle.
    const out = windowsQuery(`$ErrorActionPreference='Stop'; try {$p=[Diagnostics.Process]::GetProcessById(${pinned.pid}); $h=$p.Handle} catch [ArgumentException] {exit 3}; try {$r=Get-CimInstance Win32_Process -Filter 'ProcessId=${pinned.pid}'; if (!$r -or !$r.CreationDate -or $r.CreationDate.ToFileTimeUtc().ToString() -ne '${pinned.startTime.replaceAll("'", "''")}') {exit 3}; $p.Kill()} finally {$p.Dispose()}`)
    if (out.status === 3 && !out.error) return false
    if (out.status !== 0 || out.error) throw new Error(`captured Windows process kill failed: ${out.error ?? out.stderr}`)
    return true
  }
  if (!table().some((row) => matches(row, pinned) && !row.state.startsWith("Z"))) return false
  try {
    process.kill(pinned.pid, "SIGKILL")
    return true
  } catch {
    return false
  }
}

/** Last resort cleanup: exact owned identities and scoped markers; failed inventory cannot print green. */
export async function cleanup(marker: string, nonces: string[]) {
  const owned = hosts.get(marker) ?? []
  try {
    await stopCapture()
    const rows = table()
    const fixtures = nonces.flatMap((nonce) => { const found = members(nonce, rows); return [...found.members, ...found.wrappers] })
    const named = [...owned.map((host) => host.identity), ...fixtures]
    const scope = inventoryScope(rows, named)
    const unknown = scope.filter((row) => row.args === null && !named.some((id) => matches(row, id)))
    const targets = scope.filter((row) => row.pid !== process.pid && (named.some((id) => matches(row, id)) || row.args?.includes(marker)))
    for (const target of targets) kill9(identity(target.pid, rows))
    if (unknown.length) throw new Error(`cleanup has unknown argv in owner scope: ${JSON.stringify(unknown)}`)
    const deadline = Date.now() + 10_000
    await until(10_000, "campaign cleanup inventory empty", () => {
      const current = table(Math.max(1, deadline - Date.now()))
      const found = nonces.flatMap((nonce) => { const found = members(nonce, current); return [...found.members, ...found.wrappers] })
      const live = inventoryScope(current, named)
      if (live.some((row) => row.args === null && !named.some((id) => matches(row, id)))) throw new Error("cleanup verification has unknown argv in owner scope")
      return found.length === 0 && !live.some((row) => row.pid !== process.pid && (targets.some((id) => matches(row, id)) || row.args?.includes(marker))) ? true : undefined
    })
  } catch (error) {
    pendingVerdicts.splice(0).forEach((print) => print(error))
    throw error
  } finally {
    // Retained OS child handles still guarantee host teardown if the inventory oracle failed.
    for (const host of owned) if (host.proc.exitCode === null && host.proc.signalCode === null) host.proc.kill("SIGKILL")
    await until(10_000, "owned campaign hosts exiting during cleanup", () => owned.every((host) => host.proc.exitCode !== null || host.proc.signalCode !== null) ? true : undefined).catch((error) => { pendingVerdicts.splice(0).forEach((print) => print(error)); throw error })
    hosts.delete(marker)
  }
  pendingVerdicts.splice(0).forEach((print) => print())
}

/** Delivery scripts return inside try/finally: publish only after their cleanup succeeds. */
export function afterCleanup(print: (error?: unknown) => void) {
  pendingVerdicts.push(print)
}

/** Same live/zero semantics on every OS: exact records plus exact argv wrappers, excluding zombies. */
export async function remaining(nonce: string) {
  const found = members(nonce)
  return found.members.length + found.wrappers.length
}

/** Retained PID+start-time identities and nonce trees observed only inside the stated deadline. */
export async function deadlineSnapshots(started: number, boundMs: number, nonces: string[], retained: Identity[]) {
  const deadline = started + boundMs
  const samples: { atMs: number; counts: number[]; fixtureIds: Identity[][]; wrappers: Identity[][]; retained: Identity[] }[] = []
  while (Date.now() < deadline - 250) {
    const rows = table(Math.min(2000, deadline - Date.now()))
    const found = nonces.map((nonce) => members(nonce, rows))
    const atMs = Date.now() - started
    if (atMs >= boundMs) throw new Error(`process observation missed ${boundMs} ms deadline (${atMs} ms)`)
    samples.push({ atMs, counts: found.map((tree) => tree.members.length + tree.wrappers.length), fixtureIds: found.map((tree) => tree.members.map((row) => identity(row.pid, rows))), wrappers: found.map((tree) => tree.wrappers.map((row) => identity(row.pid, rows))), retained: retained.filter((pinned) => rows.some((row) => matches(row, pinned) && !row.state.startsWith("Z"))) })
    await sleep(Math.min(250, Math.max(0, deadline - Date.now())))
  }
  if (samples.length === 0) throw new Error("deadline observation produced no valid snapshots")
  await sleep(Math.max(0, deadline - Date.now()))
  return { samples, zeroAtMs: samples.find((sample) => sample.counts.every((count) => count === 0) && sample.retained.length === 0)?.atMs, last: samples[samples.length - 1]! }
}

/** Prints the verdict line and appends it to logs/<scenario>.jsonl. */
export function verdict<T extends Record<string, unknown>>(scenario: string, result: T) {
  const provenance = path.join(LOGS, "build-provenance.json")
  const line = { scenario, os: `${process.platform}-${process.arch}`, at: new Date().toISOString(), load: load(), command: process.argv, cliBuildSHA: process.env.OMNI_CAMPAIGN_BUILD_SHA ?? (!process.env.OMNI_CAMPAIGN_CLI && existsSync(provenance) ? JSON.parse(readFileSync(provenance, "utf8")).sha : undefined), ...result }
  mkdirSync(LOGS, { recursive: true })
  appendFileSync(path.join(LOGS, `${scenario}.jsonl`), JSON.stringify(line) + "\n")
  console.log(`CAMPAIGN_VERDICT ${JSON.stringify(line)}`)
  return line
}

/** The bun to run JS fixtures with (the harness's own runtime). */
export const BUN = process.execPath
