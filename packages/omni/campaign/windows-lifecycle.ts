// Windows lifecycle harness: real compiled CLI, real ConPTY via the product adapter.
// Outer terminal ownership is never evidence that the CLI supervised its own children.
import { createServer, type Socket } from "node:net"
import { spawn } from "node:child_process"
import os from "node:os"
import http from "node:http"
import { PtyOmni } from "../../core/src/pty/omni.ts"
import { adoptTree, cli, fakeLLM, identity, matches, members, sleep, table, until, verdict, win } from "./lib.ts"
import type { Identity, Row, ToolCall } from "./lib.ts"
import { deliveryEnv } from "./delivery-fixtures.ts"
import { WindowsInventory } from "./windows-inventory.ts"

export function backgroundCommand(tree: { command: string; args: string[] }, release: string) {
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
  const args = tree.args.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(" ")
  // -NoNewWindow inherits tool stdout/stderr. Redirecting to a file would evade the adoption pump oracle.
  return `$ErrorActionPreference='Stop'; $p=Start-Process -FilePath ${quote(tree.command)} -ArgumentList ${quote(args)} -NoNewWindow -PassThru; while (!(Test-Path -LiteralPath ${quote(release)})) { if ($p.HasExited) { throw 'background tree exited before release' }; Start-Sleep -Milliseconds 50 }; exit 0`
}

export async function consoleHost(env: Record<string, string>, project: string, target: "tui" | "serve" | { attach: string; sessionID: string } = "tui", args: string[] = [], inventory?: Awaited<ReturnType<typeof windowsInventory>>) {
  if (!win || !process.env.CI) throw new Error("Windows lifecycle requires real Windows CI")
  const preparation = performance.now()
  const backend = await PtyOmni.load()
  const server = createServer()
  const port = await new Promise<number>((resolve, reject) => {
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port
      server.close((error) => error ? reject(error) : resolve(port))
    })
  })
  const preparationMs = performance.now() - preparation
  const terminal = isolatedEnvironment(deliveryEnv(env), () => backend.spawn(cli(), ["--print-logs", "--log-level", "DEBUG", ...(typeof target === "object" ? ["attach", target.attach, "--dir", project, "--session", target.sessionID] : [...(target === "serve" ? ["serve"] : []), "--port", String(port), "--hostname", "127.0.0.1"]), ...args], {
    // The real session sidebar auto-renders only above 120 columns; attachment proves its session title.
    name: "xterm-256color", cols: typeof target === "object" ? 160 : 120, rows: 40, cwd: project,
    env: { ...deliveryEnv(env), TERM: "xterm-256color", COLUMNS: typeof target === "object" ? "160" : "120", LINES: "40" },
  }))
  const state = { output: "", exit: undefined as { exitCode: number; signal?: number | string } | undefined }
  terminal.onData((data) => { state.output += data })
  terminal.onExit((exit) => { state.exit = exit })
  const url = typeof target === "object" ? target.attach : `http://127.0.0.1:${port}`
  try {
    const recording = performance.now()
    const rows = inventory ? await inventory.query() : table()
    const captured = identity(terminal.pid, rows)
    const identityCaptureMs = performance.now() - recording
    if (!rows.some((row) => matches(row, captured) && row.args !== null)) throw new Error("compiled console identity/argv positive control failed")
    adoptTree(env.ORCHESTRA_TEST_HOME!, env.ORCHESTRA_TEST_HOME!, [captured])
    await until(120_000, "compiled console HTTP readiness", async () => {
      if (state.exit) throw new Error(`console exited before readiness: ${JSON.stringify(state.exit)}; ${state.output.slice(-4000)}`)
      return fetch(new URL("/global/health", url), { signal: AbortSignal.timeout(2000) })
        .then(async (response) => {
          const body: unknown = await response.json()
          return response.ok && typeof body === "object" && body !== null && "healthy" in body && body.healthy === true ? true : undefined
        }).catch(() => undefined)
    })
    if (target !== "serve") await until(30_000, "fullscreen TUI rendered in ConPTY", () => state.output.includes("\x1b[?1049h") ? true : undefined)
    return { pid: captured.pid, identity: captured, url, extra: [] as number[], out: () => state.output, terminal, state, preparationMs, identityCaptureMs }
  } catch (error) {
    await terminal.stop()
    throw new Error(`${error}; console output: ${state.output.slice(-4000)}`)
  }
}

/** Two real protocol stages, reusing the existing SSE fixture. A second user prompt selects stage 2;
 * tool-result continuation stays on its stage and cannot start foreground work ahead of admission. */
export async function twoStageLLM(calls: [ToolCall, ToolCall], foregroundPrompt: string) {
  const stages = await Promise.all(calls.map((call) => fakeLLM([call])))
  const errors: string[] = []
  const server = http.createServer((request, response) => {
    void (async () => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const body = Buffer.concat(chunks).toString("utf8")
      const input = JSON.parse(body) as { messages?: { role: string; content?: unknown }[] }
      const stage = JSON.stringify(input.messages?.filter((message) => message.role === "user").at(-1)?.content ?? "").includes(foregroundPrompt) ? 1 : 0
      const result = await fetch(`${stages[stage]!.url}/chat/completions`, { method: "POST", headers: { "content-type": "application/json" }, body })
      response.writeHead(result.status, { "content-type": result.headers.get("content-type") ?? "text/event-stream" })
      if (!result.body) throw new Error("two-stage LLM response has no body")
      const reader = result.body.getReader()
      for (;;) {
        const chunk = await reader.read()
        if (chunk.done) break
        response.write(chunk.value)
      }
      reader.releaseLock()
      response.end()
    })().catch((error) => { errors.push(String(error)); response.writeHead(500); response.end(String(error)) })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  return {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
    get seen() { return stages.flatMap((stage) => stage.seen) },
    get offered() { return stages.flatMap((stage) => stage.offered) },
    stages, errors,
    async stop() {
      stages.forEach((stage) => stage.stop())
      await until(2000, "two-stage LLM proxy close", () => new Promise<true>((resolve, reject) => server.close((error) => error ? reject(error) : resolve(true))))
    },
  }
}

/** Only the attached frontend connects here. Parent prompts use the upstream URL directly;
 * captured abort requests therefore witness the real UI handler, never a harness fallback. */
export async function observeFrontend(upstream: string) {
  const requests: { method: string; path: string; at: number; status?: number; error?: string }[] = []
  const controllers = new Set<AbortController>()
  const sockets = new Set<Socket>()
  const server = http.createServer((request, response) => {
    const controller = new AbortController()
    controllers.add(controller)
    response.once("close", () => { controller.abort(); controllers.delete(controller) })
    const observed = { method: request.method ?? "", path: new URL(request.url!, upstream).pathname, at: Date.now(), status: undefined as number | undefined, error: undefined as string | undefined }
    requests.push(observed)
    void (async () => {
      const chunks: Buffer[] = []
      for await (const chunk of request) chunks.push(Buffer.from(chunk))
      const result = await fetch(new URL(request.url!, upstream), {
        method: request.method,
        headers: Object.fromEntries(Object.entries(request.headers).flatMap(([key, value]) => value === undefined ? [] : [[key, Array.isArray(value) ? value.join(", ") : value]])),
        body: chunks.length ? Buffer.concat(chunks) : undefined,
        signal: controller.signal,
      })
      observed.status = result.status
      // Bun fetch decoded upstream gzip. Strip its byte headers instead of decompressing twice.
      response.writeHead(result.status, Object.fromEntries([...result.headers].filter(([key]) => !["content-encoding", "content-length", "transfer-encoding"].includes(key))))
      if (!result.body) throw new Error("frontend proxy response has no body")
      const reader = result.body.getReader()
      try {
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          response.write(chunk.value)
        }
        response.end()
      } finally { reader.releaseLock() }
    })().catch((error) => {
      observed.error = String(error)
      if (response.destroyed) return
      response.destroy(error instanceof Error ? error : new Error(String(error)))
    })
  })
  server.on("connection", (socket) => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)) })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}`, requests, async stop() {
    const closed = new Promise<true>((resolve, reject) => server.close((error) => error ? reject(error) : resolve(true)))
    controllers.forEach((controller) => controller.abort())
    controllers.clear()
    sockets.forEach((socket) => socket.destroy())
    await until(2000, "frontend observation proxy OS/socket close", () => closed)
  } }
}

/** Never enqueue a green before teardown: recorder, frontend and shared cleanup errors all reach
 * the one published verdict. The teardown callback's nested finally always runs shared cleanup. */
export async function finishCampaign<T extends Record<string, unknown> & { pass: boolean }>(scenario: string, execute: () => Promise<T>, teardown: () => Promise<void>): Promise<T | { pass: false; error: string } | ((T | { pass: false; error: string }) & { pass: false; measurementPass: boolean; teardownError: string })> {
  const result = await execute().catch((error) => ({ pass: false as const, error: String(error) }))
  const error = await teardown().then(() => undefined, (error) => String(error))
  return verdict(scenario, error === undefined ? result : { ...result, measurementPass: result.pass, pass: false as const, teardownError: error })
}

export function gracefulEvidence(target: "tui" | "serve", host: Awaited<ReturnType<typeof consoleHost>>, input: string) {
  if (target === "tui") return {
    input, exit: host.state.exit,
    fullscreenEntered: host.out().includes("\x1b[?1049h"), fullscreenLeft: host.out().includes("\x1b[?1049l"),
    pass: input === "Ctrl+C" && host.state.exit?.exitCode === 0 && host.state.exit.signal === undefined && host.out().includes("\x1b[?1049l"),
  }
  const events = [...host.out().matchAll(/CLI_SHUTDOWN (\{[^\r\n]+\})/g)].map((match) => JSON.parse(match[1]!) as {
    event: string; level: string; pid: number; signal: string; status: string; elapsedMs: number
  }).filter((event) => event.pid === host.pid)
  const signalCodes: Readonly<Record<string, number | undefined>> = os.constants.signals
  const signalCode = events[0] && ["SIGINT", "SIGBREAK"].includes(events[0].signal)
    ? signalCodes[events[0].signal]
    : undefined
  const expectedExitCode = signalCode === undefined ? undefined : 128 + signalCode
  const pass = input === "Ctrl+C" && host.state.exit !== undefined && host.state.exit.exitCode === expectedExitCode &&
    host.state.exit.signal === undefined && Number.isFinite(expectedExitCode) && events.length === 2 &&
    events.every((event) => event.event === "cli.shutdown" && event.level === "DEBUG" && ["SIGINT", "SIGBREAK"].includes(event.signal) && Number.isFinite(event.elapsedMs)) &&
    events[0]!.status === "started" && events[1]!.status === "disposed"
  return { input, exit: host.state.exit, expectedExitCode, events, pass,
    ...(!pass ? { blocker: "Windows Ctrl+C did not prove runtime disposal; owner required: packages/orchestra/src/cli/effect-cmd.ts (SIGINT/SIGBREAK shutdown handler)" } : {}) }
}

/** Exact pinned host must still own the console before injecting input. No signals or stop calls here. */
export async function consoleInput(host: Awaited<ReturnType<typeof consoleHost>>, input: "Escape" | "Ctrl+C", inventory?: Awaited<ReturnType<typeof windowsInventory>>) {
  if (!(inventory ? await inventory.query() : table()).some((row) => matches(row, host.identity))) throw new Error("console host identity changed before input")
  host.terminal.write(input === "Escape" ? "\x1b" : "\x03")
}

/** Warm CIM once outside the KPI. Each requested snapshot is fresh, tagged, bounded, and decoded by
 * the unchanged fail-closed library boundary. No cached rows, fresh PowerShell startup, or empty fallback. */
export async function windowsInventory(env: Record<string, string>) {
  if (!win) throw new Error("Windows inventory recorder requires Windows")
  const started = performance.now()
  const proc = spawn("powershell", ["-NoProfile", "-NonInteractive", "-Command", `
$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false);
$self=Get-CimInstance Win32_Process -Filter ('ProcessId='+$PID);
$warm=& { ${WindowsInventory.CIM} }; if (!$warm) {throw 'CIM warmup returned no table'};
ConvertTo-Json -Compress -InputObject @{ready=$true;pid=$PID;startTime=$self.CreationDate.ToFileTimeUtc().ToString()};
while ($line=[Console]::ReadLine()) {
  if ($line -notmatch '^[1-9][0-9]*$') {throw 'invalid recorder request'};
  $snapshot=& { ${WindowsInventory.CIM} };
  [Console]::WriteLine('{"request":'+$line+',"rows":'+$snapshot+'}');
}`], { env: deliveryEnv(env), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] })
  const ready = Promise.withResolvers<Identity>()
  const closed = Promise.withResolvers<void>()
  const pending = new Map<number, ReturnType<typeof Promise.withResolvers<Row[]>>>()
  const state = { text: "", stderr: "", serial: 0, identity: undefined as Identity | undefined, failure: undefined as Error | undefined, closed: false }
  const fail = (error: unknown) => {
    state.failure = error instanceof Error ? error : new Error(String(error))
    ready.reject(state.failure)
    pending.forEach((reply) => reply.reject(state.failure))
    pending.clear()
  }
  proc.once("error", fail)
  proc.stdin.on("error", fail)
  proc.stderr.on("data", (chunk) => { state.stderr += chunk })
  proc.once("close", () => { state.closed = true; closed.resolve(); fail(new Error(`CIM recorder closed: ${state.stderr}`)) })
  proc.stdout.on("data", (chunk) => {
    state.text += chunk
    if (state.text.length > 64 * 1024 * 1024) { fail(new Error("CIM recorder exceeded 64 MiB snapshot cap")); proc.kill("SIGKILL"); return }
    for (;;) {
      const end = state.text.indexOf("\n")
      if (end < 0) return
      const line = state.text.slice(0, end)
      state.text = state.text.slice(end + 1)
      try {
        const reply = JSON.parse(line) as { ready?: boolean; pid?: number; startTime?: string; request?: number; rows?: unknown }
        if (!state.identity) {
          if (reply.ready !== true || !Number.isSafeInteger(reply.pid) || reply.pid! <= 0 || reply.pid !== proc.pid || typeof reply.startTime !== "string" || !/^\d+$/.test(reply.startTime)) throw new Error(`malformed CIM recorder identity: ${line}`)
          state.identity = { pid: reply.pid!, startTime: reply.startTime }
          ready.resolve(state.identity)
          continue
        }
        const request = reply.request === undefined ? undefined : pending.get(reply.request)
        if (!request || reply.ready !== undefined) throw new Error("CIM recorder returned unrequested or malformed snapshot")
        const rows = WindowsInventory.decode(reply.rows, state.identity.pid)
        pending.delete(reply.request!)
        request.resolve(rows)
      } catch (error) { fail(error); proc.kill("SIGKILL") }
    }
  })
  const stop = async () => {
    if (!state.closed) proc.stdin.end()
    await until(2000, "CIM recorder OS/stdio close", () => closed.promise.then(() => true)).catch(async () => {
      proc.kill("SIGKILL")
      await until(2000, "forced CIM recorder OS/stdio close", () => closed.promise.then(() => true))
      throw new Error("CIM recorder required forced teardown")
    })
    if (process.env.OMNI_CAMPAIGN_MUTATION === "recorder-stop-error") throw new Error("CIM recorder injected stop error after confirmed OS/stdio close")
  }
  try {
    await until(30_000, "CIM recorder warmup before KPI", () => ready.promise)
    const query = async (budgetMs = 10_000) => {
      if (state.failure || state.closed) throw state.failure ?? new Error("CIM recorder unavailable")
      const id = ++state.serial
      const request = Promise.withResolvers<Row[]>()
      pending.set(id, request)
      proc.stdin.write(`${id}\n`)
      return until(budgetMs, "fresh tagged CIM snapshot", () => request.promise).catch((error) => {
        fail(error)
        proc.kill("SIGKILL")
        throw error
      })
    }
    const rows = await query()
    if (!rows.some((row) => row.pid === process.pid && row.args !== null)) throw new Error("CIM recorder querying-host positive control failed")
    // Warm lib's separate exact-identity kill watchdog too: its first pwsh startup belongs to setup,
    // not the 8 s host-death clock. Its table retains the existing independent visibility control.
    table()
    return { query, stop, preparationMs: performance.now() - started, identity: state.identity!, snapshot: () => ({ identity: state.identity, closed: state.closed, pending: pending.size }) }
  } catch (error) {
    proc.kill("SIGKILL")
    await until(2000, "failed CIM recorder OS/stdio close", () => closed.promise.then(() => true))
    throw error
  }
}

export async function windowsSnapshots(inventory: Awaited<ReturnType<typeof windowsInventory>>, started: number, boundMs: number, nonces: string[], retained: Identity[]) {
  const samples: { atMs: number; counts: number[]; fixtureIds: Identity[][]; wrappers: Identity[][]; retained: Identity[] }[] = []
  const deadline = started + boundMs
  while (Date.now() < deadline - 250) {
    const rows = await inventory.query(Math.min(2000, deadline - Date.now()))
    const found = nonces.map((nonce) => members(nonce, rows))
    const atMs = Date.now() - started
    if (atMs >= boundMs) throw new Error(`CIM snapshot missed ${boundMs} ms deadline (${atMs} ms)`)
    samples.push({ atMs, counts: found.map((tree) => tree.members.length + tree.wrappers.length), fixtureIds: found.map((tree) => tree.members.map((row) => identity(row.pid, rows))), wrappers: found.map((tree) => tree.wrappers.map((row) => identity(row.pid, rows))), retained: retained.filter((pinned) => rows.some((row) => matches(row, pinned))) })
    await sleep(Math.min(250, Math.max(0, deadline - Date.now())))
  }
  if (!samples.length) throw new Error("Windows deadline observation produced no valid snapshots")
  await sleep(Math.max(0, deadline - Date.now()))
  return { samples, zeroAtMs: samples.find((sample) => sample.counts.every((count) => count === 0) && sample.retained.length === 0)?.atMs, last: samples[samples.length - 1]! }
}

/** PtyOmni merges ambient process.env. Replace that JS-side source only during synchronous spawn,
 * then restore before yielding; otherwise filtered credentials silently re-enter the compiled child. */
export function isolatedEnvironment<T>(env: Record<string, string>, spawn: () => T) {
  const inherited = process.env
  process.env = env
  try { return spawn() }
  finally { process.env = inherited }
}

export async function run(target: "serve" | "tui" = "tui") {
  const campaign = await import("./v2-kill.ts")
  return campaign.run(target, "quit")
}

if (import.meta.main) process.exit((await run(process.argv[2] === "serve" ? "serve" : "tui")).pass ? 0 : 1)
