// Shared harness for the WP10 validation campaign (packages/omni/docs/orchestra-integration.md §4 WP10).
//
// Every scenario runs the real product (the compiled CLI by default) against an isolated HOME / XDG tree and a
// throwaway git project. Trees use the shared nonce fixture (packages/core/test/fixture/process-tree.ts), while
// hosts, supervisors and observed members retain PID/start-time identities. OS queries fail closed and are bounded.
// Each scenario prints one `CAMPAIGN_VERDICT {...}` JSON line.
//
// Plain node: builtins only, so the scripts run under bun on every OS and can be imported by bun:test wrappers.

import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync, appendFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { tree } from "../../core/test/fixture/process-tree.ts"

export { alive, gone, reap, sweep, tree } from "../../core/test/fixture/process-tree.ts"

export const ROOT = path.resolve(import.meta.dirname, "../../..")
export const OPENCODE = path.join(ROOT, "packages/opencode")
export const LOGS = path.join(import.meta.dirname, "logs")
export const win = process.platform === "win32"

/** The compiled CLI: OMNI_CAMPAIGN_CLI, else the one target under packages/opencode/dist. */
export function cli() {
  if (process.env.OMNI_CAMPAIGN_CLI) return process.env.OMNI_CAMPAIGN_CLI
  const dist = path.join(OPENCODE, "dist")
  const targets = existsSync(dist) ? readdirSync(dist).filter((name) => name.startsWith("opencode-")) : []
  if (targets.length !== 1) throw new Error(`expected one built CLI target in ${dist}, found [${targets.join(", ")}]`)
  return path.join(dist, targets[0]!, "bin", win ? "opencode.exe" : "opencode")
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
 * An isolated user: HOME and every XDG directory in a temp dir (never the real ~/.local/share/opencode), plus a
 * throwaway git project. The config goes inline through OPENCODE_CONFIG_CONTENT, as the repo's CLI harness does.
 */
export function isolated(name: string, config: Record<string, unknown>) {
  const home = realpathSync(mkdtempSync(path.join(os.tmpdir(), `omni-campaign-${name}-`)))
  const project = path.join(home, "project")
  mkdirSync(project, { recursive: true })
  writeFileSync(path.join(project, "a.ts"), "export const a = 1\n")
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env))
    if (value !== undefined && !/^(HUGR_|OPENCODE_|ORCHESTRA_|ANTHROPIC_|OPENAI_|AWS_|AZURE_|GOOGLE_|GEMINI_|GITHUB_|GH_|BUN_OPTIONS|NODE_OPTIONS|SSH_AUTH_SOCK)/i.test(key) && !/(TOKEN|SECRET|PASSWORD|API_KEY|CREDENTIAL)/i.test(key)) env[key] = value
  Object.assign(env, {
    OPENCODE_TEST_HOME: home,
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
    OPENCODE_CONFIG_CONTENT: JSON.stringify(config.provider ? {
      ...config,
      agent: { maestro: { model: "test/test-model", permission: { "*": "allow" } }, ...(config.agent as Record<string, unknown>) },
    } : config),
    OPENCODE_DISABLE_PROJECT_CONFIG: "1",
    OPENCODE_PURE: "1",
    OPENCODE_DISABLE_AUTOUPDATE: "1",
    OPENCODE_DISABLE_AUTOCOMPACT: "1",
    OPENCODE_DISABLE_MODELS_FETCH: "1",
    OPENCODE_AUTH_CONTENT: "{}",
    OPENCODE_DISABLE_CLAUDE_CODE: "1",
    OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
    OPENCODE_EXPERIMENTAL_OMNI_SPAWNER: process.env.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER ?? "1",
  })
  const git = spawnSync("git", ["init", "-q"], { cwd: project, env })
  if (git.status !== 0) throw new Error(`git init failed: ${git.error ?? git.stderr}`)
  return { home, project, env }
}

/** The provider block for the fake LLM (the shape of packages/opencode/test/lib/test-provider.ts). */
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

/** Retain handles of only campaign-owned hosts: serve's argv contains no isolated HOME marker. */
export function own(home: string, proc: ChildProcess) {
  const captured = identity(proc.pid!)
  const entries = hosts.get(home) ?? []
  entries.push({ proc, identity: captured })
  hosts.set(home, entries)
  return captured
}

/** Starts `opencode serve` (or another subcommand that prints `listening on http://...`) and waits for its URL. */
export async function serve(bin: string, args: string[], env: Record<string, string>, cwd: string): Promise<Started> {
  if (process.env.ORCHESTRA_LOCAL_TESTS !== "1" && !process.env.CI) throw new Error("local campaign requires ORCHESTRA_LOCAL_TESTS=1")
  const proc = spawn(bin, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  const captured = own(env.OPENCODE_TEST_HOME!, proc)
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
      headers: { "content-type": "application/json", "x-opencode-directory": encodeURIComponent(directory) },
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

const QUERY_MS = 2000
type Row = Identity & { parent: number; args: string; state: string }

/** Bounded, fail-closed OS table. Only named Windows kernel PIDs may lack command lines. */
export function table(timeoutMs = QUERY_MS): Row[] {
  if (timeoutMs <= 0) throw new Error("process table query has no deadline budget")
  const options = { encoding: "utf8" as const, windowsHide: true, maxBuffer: 64 * 1024 * 1024, timeout: timeoutMs, killSignal: "SIGKILL" as const }
  if (win) {
    const out = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine,@{Name='StartTime';Expression={if ($_.CreationDate) {$_.CreationDate.ToFileTimeUtc().ToString()}}} | ConvertTo-Json -Compress",
      ],
      options,
    )
    if (out.status !== 0 || out.error) throw new Error(`Get-CimInstance failed: ${out.error ?? out.stderr}`)
    const parsed = decodeWindowsTable(JSON.parse(out.stdout), out.pid)
    parsed.forEach((row) => { if (!pins.has(row.pid)) pins.set(row.pid, { pid: row.pid, startTime: row.startTime }) })
    return parsed
  }
  const out = spawnSync("ps", [process.platform === "darwin" ? "-axww" : "-eww", "-o", "pid=,ppid=,stat=,lstart=,args="], options)
  if (out.status !== 0 || out.error || !out.stdout.trim()) throw new Error(`ps failed: ${out.error ?? out.stderr}`)
  const rows = decodeUnixTable(out.stdout, out.pid)
  rows.forEach((row) => { if (!pins.has(row.pid)) pins.set(row.pid, { pid: row.pid, startTime: row.startTime }) })
  return rows
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
          if (!args && !now[0]!.startsWith("Z") && Number(now[1]) !== 0 && Number(now[1]) !== 2) throw new Error(`live PID ${pid} has unavailable argv`)
          return { fields: now, args: args || match[5]! }
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
    if (typeof row.ProcessId !== "number" || !Number.isSafeInteger(row.ProcessId) || row.ProcessId <= 0 || typeof row.ParentProcessId !== "number" || !Number.isSafeInteger(row.ParentProcessId) || row.ParentProcessId < 0 || typeof row.CommandLine !== "string" || !row.CommandLine.trim() || typeof row.StartTime !== "string" || !/^\d+$/.test(row.StartTime))
      throw new Error(`Get-CimInstance cannot establish process identity/argv for PID ${row.ProcessId}: ${JSON.stringify(row)}`)
    return [{ pid: row.ProcessId, parent: row.ParentProcessId, args: row.CommandLine, startTime: row.StartTime, state: "live" }]
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

export function hasNonce(args: string, nonce: string) {
  return new RegExp(`(?:^|[\\s"'])${nonce.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[\\s"'])`).test(args)
}

/** Exact fixture records are members; argv-bearing shells/wrappers are reported separately, never counted as members. */
export function members(nonce: string, rows = table()) {
  const live = rows.filter((row) => row.pid !== process.pid && !row.state.startsWith("Z"))
  const dir = path.join(os.tmpdir(), nonce)
  if (!nonce.startsWith("omni-tree-")) return { members: live.filter((row) => hasNonce(row.args, nonce)), wrappers: [] as Row[] }
  const records = readdirSync(dir).filter((name) => name.endsWith(".json")).map((name) => {
    const record = JSON.parse(readFileSync(path.join(dir, name), "utf8")) as Identity & { nonce: string }
    if (record.nonce !== nonce || !Number.isSafeInteger(record.pid) || record.pid <= 0 || typeof record.startTime !== "string" || !record.startTime)
      throw new Error(`malformed fixture identity: ${path.join(dir, name)}`)
    return record
  })
  const found = live.filter((row) => records.some((record) => matches(row, record)))
  // macOS may drop argv during kernel teardown before the PID disappears. A retained identity still counts live.
  return { members: found, wrappers: live.filter((row) => hasNonce(row.args, nonce) && !found.some((member) => matches(member, row))) }
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
    supervisors: above(row.pid).filter((ancestor) => SUPERVISOR.test(ancestor.args) && hosts.some((host) => above(ancestor.pid).some((parent) => matches(parent, host)))).map((row) => identity(row.pid, rows)),
  }))
  return { fixtureIds: found.members.map((row) => identity(row.pid, rows)), wrappers: found.wrappers.map((row) => identity(row.pid, rows)), protectedMembers, pass: found.members.length === size && protectedMembers.length > 0 && protectedMembers.every((member) => member.argvPresent && member.supervisors.length > 0) }
}

/** Compatibility control, strengthened from any-member to all-member supervision. */
export function supervised(nonce: string) {
  const rows = table()
  const hosts = rows.filter((row) => rows.some((supervisor) => SUPERVISOR.test(supervisor.args) && supervisor.parent === row.pid)).map((row) => identity(row.pid, rows))
  const found = members(nonce, rows)
  return control(nonce, found.members.length, hosts, rows).pass
}

/** Supervisors whose parent is one of `pids` (the ones a given host started). */
export function supervisorsOf(pids: number[]) {
  return table().filter((row) => SUPERVISOR.test(row.args) && pids.includes(row.parent))
}

/** Every process whose command line mentions `marker` (a temp home, a nonce), except this one. */
export function mentioning(marker: string) {
  return table().filter((row) => row.pid !== process.pid && row.args.includes(marker))
}

/** Kill -9 on Unix; TerminateProcess on Windows (what `taskkill /F` does, without /T: the tree is omni's job). */
export function kill9(target: Identity | number) {
  // Numeric compatibility uses FIRST observed identity, never a fresh meaning for a retained/reused PID.
  const pinned = typeof target === "number" ? pins.get(target) : target
  if (!pinned) throw new Error(`kill9 requires a captured process identity for PID ${target}`)
  if (!table().some((row) => matches(row, pinned) && !row.state.startsWith("Z"))) return false
  try {
    process.kill(pinned.pid, "SIGKILL")
    return true
  } catch {
    return false
  }
}

/** Last resort cleanup: kill every process that mentions the marker, then reap recorded trees. */
export async function cleanup(marker: string, nonces: string[]) {
  const owned = hosts.get(marker) ?? []
  for (const host of owned) if (host.proc.exitCode === null && host.proc.signalCode === null) kill9(host.identity)
  const rows = table()
  const targets = rows.filter((row) => row.pid !== process.pid && !row.state.startsWith("Z") && (row.args.includes(marker) || nonces.some((nonce) => hasNonce(row.args, nonce))))
  for (const target of targets) kill9(identity(target.pid, rows))
  await until(10_000, "owned campaign hosts exiting during cleanup", () => owned.every((host) => host.proc.exitCode !== null || host.proc.signalCode !== null) ? true : undefined)
  hosts.delete(marker)
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
    const rows = table(Math.min(QUERY_MS, deadline - Date.now()))
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
