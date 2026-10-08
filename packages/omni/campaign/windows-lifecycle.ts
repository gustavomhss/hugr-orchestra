// Windows lifecycle harness: real compiled CLI, real ConPTY via the product adapter.
// Outer terminal ownership is never evidence that the CLI supervised its own children.
import { createServer } from "node:net"
import { PtyOmni } from "../../core/src/pty/omni.ts"
import { adoptTree, cli, identity, matches, prepareCapture, table, until, win } from "./lib.ts"
import { deliveryEnv } from "./delivery-fixtures.ts"

export function backgroundCommand(tree: { command: string; args: string[] }, release: string) {
  const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
  const args = tree.args.map((value) => `"${value.replaceAll('"', '\\"')}"`).join(" ")
  // -NoNewWindow inherits tool stdout/stderr. Redirecting to a file would evade the adoption pump oracle.
  return `$ErrorActionPreference='Stop'; $p=Start-Process -FilePath ${quote(tree.command)} -ArgumentList ${quote(args)} -NoNewWindow -PassThru; while (!(Test-Path -LiteralPath ${quote(release)})) { if ($p.HasExited) { throw 'background tree exited before release' }; Start-Sleep -Milliseconds 50 }; exit 0`
}

export async function consoleHost(env: Record<string, string>, project: string, target: "tui" | "serve" = "tui", args: string[] = []) {
  if (!win || !process.env.CI) throw new Error("Windows lifecycle requires real Windows CI")
  const preparation = performance.now()
  await prepareCapture()
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
  const terminal = isolatedEnvironment(deliveryEnv(env), () => backend.spawn(cli(), ["--print-logs", "--log-level", "DEBUG", ...(target === "serve" ? ["serve"] : []), "--port", String(port), "--hostname", "127.0.0.1", ...args], {
    name: "xterm-256color", cols: 120, rows: 40, cwd: project,
    env: { ...deliveryEnv(env), TERM: "xterm-256color", COLUMNS: "120", LINES: "40" },
  }))
  const state = { output: "", exit: undefined as { exitCode: number; signal?: number | string } | undefined }
  terminal.onData((data) => { state.output += data })
  terminal.onExit((exit) => { state.exit = exit })
  const url = `http://127.0.0.1:${port}`
  try {
    const captured = await until(10_000, "compiled console host creation time", () => {
      const rows = table()
      return rows.some((row) => row.pid === terminal.pid && row.args !== null) ? identity(terminal.pid, rows) : undefined
    })
    adoptTree(env.ORCHESTRA_TEST_HOME!, env.ORCHESTRA_TEST_HOME!, [captured])
    await until(120_000, "compiled console HTTP readiness", async () => {
      if (state.exit) throw new Error(`console exited before readiness: ${JSON.stringify(state.exit)}; ${state.output.slice(-4000)}`)
      return fetch(new URL("/global/health", url), { signal: AbortSignal.timeout(2000) })
        .then(async (response) => {
          const body: unknown = await response.json()
          return response.ok && typeof body === "object" && body !== null && "healthy" in body && body.healthy === true ? true : undefined
        }).catch(() => undefined)
    })
    if (target === "tui") await until(30_000, "fullscreen TUI rendered in ConPTY", () => state.output.includes("\x1b[?1049h") ? true : undefined)
    return { pid: captured.pid, identity: captured, url, extra: [] as number[], out: () => state.output, terminal, state, preparationMs }
  } catch (error) {
    await terminal.stop()
    throw new Error(`${error}; console output: ${state.output.slice(-4000)}`)
  }
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
  const pass = input === "Ctrl+C" && host.state.exit !== undefined && events.length === 2 &&
    events.every((event) => event.event === "cli.shutdown" && event.level === "DEBUG" && ["SIGINT", "SIGBREAK"].includes(event.signal) && Number.isFinite(event.elapsedMs)) &&
    events[0]!.status === "started" && events[1]!.status === "disposed"
  return { input, exit: host.state.exit, events, pass,
    ...(!pass ? { blocker: "Windows Ctrl+C did not prove runtime disposal; owner required: packages/orchestra/src/cli/effect-cmd.ts (SIGINT/SIGBREAK shutdown handler)" } : {}) }
}

/** Exact pinned host must still own the console before injecting input. No signals or stop calls here. */
export function consoleInput(host: Awaited<ReturnType<typeof consoleHost>>, input: "Escape" | "Ctrl+C") {
  if (!table().some((row) => matches(row, host.identity))) throw new Error("console host identity changed before input")
  host.terminal.write(input === "Escape" ? "\x1b" : "\x03")
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
