// Shared harness for the WP10 validation campaign (packages/omni/docs/orchestra-integration.md §4 WP10).
//
// Every scenario runs the real product (the compiled CLI by default) against an isolated HOME / XDG tree and a
// throwaway git project, and identifies processes only through the shared nonce oracle
// (packages/core/test/fixture/process-tree.ts). Each scenario prints one `CAMPAIGN_VERDICT {...}` JSON line.
//
// Plain node: builtins only, so the scripts run under bun on every OS and can be imported by bun:test wrappers.

import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, writeFileSync, appendFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { alive, reap, sweep, tree } from "../../core/test/fixture/process-tree.ts"

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
    const value = await probe()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`)
    await sleep(200)
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

export type Started = { proc: ChildProcess; url: string; pid: number; extra: number[]; out: () => string }

const hosts = new Map<string, Set<ChildProcess>>()

/** Retain handles of only campaign-owned hosts: serve's argv contains no isolated HOME marker. */
export function own(home: string, proc: ChildProcess) {
  const entries = hosts.get(home) ?? new Set<ChildProcess>()
  entries.add(proc)
  hosts.set(home, entries)
}

/** Starts `opencode serve` (or another subcommand that prints `listening on http://...`) and waits for its URL. */
export async function serve(bin: string, args: string[], env: Record<string, string>, cwd: string): Promise<Started> {
  if (process.env.ORCHESTRA_LOCAL_TESTS !== "1" && !process.env.CI) throw new Error("local campaign requires ORCHESTRA_LOCAL_TESTS=1")
  const proc = spawn(bin, args, { env, cwd, stdio: ["ignore", "pipe", "pipe"], windowsHide: true })
  own(env.OPENCODE_TEST_HOME!, proc)
  let out = ""
  proc.stdout!.on("data", (chunk) => (out += chunk))
  proc.stderr!.on("data", (chunk) => (out += chunk))
  const url = await until(120_000, `${path.basename(bin)} ${args[0]} to listen`, () => {
    if (proc.exitCode !== null || proc.signalCode !== null) throw new Error(`exited ${proc.exitCode ?? proc.signalCode} before listening: ${out.slice(-2000)}`)
    return out.match(/listening on (http:\/\/\S+)/)?.[1]
  })
  return { proc, url, pid: proc.pid!, extra: [] as number[], out: () => out }
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

/** The process table as rows (pid, parent, command line). Windows: one CIM query. */
export function table() {
  if (win) {
    const out = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$ErrorActionPreference='Stop'; Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,CommandLine | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    )
    if (out.status !== 0 || out.error) throw new Error(`Get-CimInstance failed: ${out.error ?? out.stderr}`)
    const rows = JSON.parse(out.stdout) as { ProcessId: number; ParentProcessId: number; CommandLine: string | null }[]
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("Get-CimInstance returned no process table")
    if (!rows.some((row) => row.ProcessId === process.pid)) throw new Error("Get-CimInstance returned an incomplete process table (querying host missing)")
    return rows.filter((row) => row.ProcessId !== out.pid).map((row) => ({ pid: row.ProcessId, parent: row.ParentProcessId, args: row.CommandLine ?? "" }))
  }
  const out = spawnSync("ps", process.platform === "darwin" ? ["-axww", "-o", "pid=,ppid=,args="] : ["-eww", "-o", "pid=,ppid=,args="], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
  if (out.status !== 0 || out.error || !out.stdout.trim()) throw new Error(`ps failed: ${out.error ?? out.stderr}`)
  const rows = out.stdout.split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/))
    .filter((match) => match !== null)
    .map((match) => ({ pid: Number(match[1]), parent: Number(match[2]), args: match[3]! }))
    .filter((row) => row.pid !== out.pid)
  if (!rows.some((row) => row.pid === process.pid)) throw new Error("ps returned an incomplete or malformed process table (querying host missing)")
  return rows
}

const SUPERVISOR = /(^|[\\/"])hugr-omni-supervisor(\.exe)?("|\s|$)/

/** Positive control: some process carrying the nonce has a hugr-omni-supervisor ancestor (not a legacy spawn). */
export function supervised(nonce: string) {
  const rows = new Map(table().map((row) => [row.pid, row]))
  const above = (pid: number, depth = 0): string[] => {
    const row = rows.get(pid)
    if (!row || row.parent <= 1 || depth > 32) return []
    return [rows.get(row.parent)?.args ?? "", ...above(row.parent, depth + 1)]
  }
  return [...rows.values()]
    .filter((row) => row.args.includes(nonce))
    .some((row) => above(row.pid).some((args) => SUPERVISOR.test(args)))
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
export function kill9(pid: number) {
  try {
    process.kill(pid, "SIGKILL")
    return true
  } catch {
    return false
  }
}

/** Last resort cleanup: kill every process that mentions the marker, then reap recorded trees. */
export async function cleanup(marker: string, nonces: string[]) {
  const owned = [...(hosts.get(marker) ?? [])]
  for (const proc of owned) if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL")
  for (const row of mentioning(marker)) kill9(row.pid)
  await Promise.all(nonces.map((nonce) => reap(nonce).catch(() => undefined)))
  await until(10_000, "owned campaign hosts exiting during cleanup", () => owned.every((proc) => proc.exitCode !== null || proc.signalCode !== null) ? true : undefined)
  hosts.delete(marker)
}

/** Counts the nonce trees still alive: records plus the shared sweep and checked table, taking their maximum. */
export async function remaining(nonce: string) {
  return Math.max(await alive(nonce), (await sweep(nonce)).length, mentioning(nonce).length)
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
