// V2: `kill -9` (TerminateProcess on Windows) of a live Orchestra host, while it runs a bash tool tree, an LSP, an MCP
// stdio server (with a grandchild) and 2 terminals. KPI: 0 omni-tree processes 8 s after the kill.
//
//   bun packages/omni/campaign/v2-kill.ts [serve|tui|hold]
//
//   serve  the compiled CLI's `orchestra serve`; a fake LLM drives a real agent turn (bash + write tools)
//   tui    the compiled CLI's TUI (its server runs in a Bun Worker) on a fixed port, inside a python pty (Unix only)
//   hold   the compiled CLI's `debug omni --hold` (the WP5 crash smoke, as a baseline)

import { spawn } from "node:child_process"
import { createServer } from "node:net"
import path from "node:path"
import {
  BUN,
  ORCHESTRA,
  cleanup,
  cli,
  client,
  control,
  deadlineSnapshots,
  fakeLLM,
  fileTree,
  isolated,
  identity,
  kill9,
  mentioning,
  own,
  provider,
  serve,
  table,
  until,
  verdict,
  win,
} from "./lib.ts"

const KPI_MS = 8_000

export async function run(target: "serve" | "tui" | "hold" = "serve") {
  if (process.env.ORCHESTRA_LOCAL_TESTS !== "1" && !process.env.CI) throw new Error("local campaign requires ORCHESTRA_LOCAL_TESTS=1")
  if (target === "hold") return hold()
  return host(target)
}

async function hold() {
  const bin = cli()
  const { env, home, project } = isolated("v2-hold", {})
  const proc = spawn(bin, ["debug", "omni", "--hold"], { env, cwd: project, stdio: ["ignore", "pipe", "pipe"] })
  const hostIdentity = own(home, proc)
  let out = ""
  const steps: Record<string, unknown>[] = []
  proc.stdout!.on("data", (chunk) => (out += chunk))
  proc.stderr!.on("data", (chunk) => (out += chunk))
  let nonce: string | undefined
  try {
    nonce = await until(60_000, "holding line", () => out.match(/holding (\S+)/)?.[1])
    const marker = nonce
    const before = await until(30_000, "both exact debug members protected", () => {
      const found = control(marker, 2, [hostIdentity])
      return found.pass ? found : undefined
    })
    const supervisors = [...new Map(before.protectedMembers.flatMap((member) => member.supervisors).map((pinned) => [pinned.pid, pinned])).values()]
    steps.push({ phase: "control", before, supervisors, at: Date.now() })
    if (!kill9(hostIdentity)) throw new Error("could not kill pinned hold host")
    const killed = Date.now()
    steps.push({ phase: "host-killed", at: killed })
    const observed = await deadlineSnapshots(killed, KPI_MS, [nonce], [hostIdentity, ...supervisors, ...before.fixtureIds, ...before.wrappers])
    return verdict("v2-hold", { target: "hold", nonce, hostIdentity, before, supervisors, observed, pass: observed.zeroAtMs !== undefined && observed.last.counts[0] === 0 && observed.last.retained.length === 0 })
  } catch (error) {
    return verdict("v2-hold", { pass: false, nonce, hostIdentity, steps, error: String(error), output: out })
  } finally {
    await cleanup(home, nonce ? [nonce] : [])
  }
}

async function host(target: "serve" | "tui") {
  if (target === "tui" && win) return verdict("v2-tui", { target, pass: false, error: "Windows TUI requires a real console harness; python pty is Unix-only" })
  const bin = cli()
  const scratch = isolated(`v2-${target}`, {})
  const trees = {
    bash: fileTree(scratch.home, 2),
    mcp: fileTree(scratch.home, 1),
    pty1: fileTree(scratch.home, 2),
    pty2: fileTree(scratch.home, 2),
  }
  const lspNonce = `omni-lsp-${trees.bash.nonce.slice(10)}`
  const mcpNonce = `omni-mcp-${trees.bash.nonce.slice(10)}`
  const llm = await fakeLLM([
    { name: "bash", args: { command: trees.bash.line, timeout: 600_000, description: "Run the campaign tree" } },
    { name: "write", args: { filePath: path.join(scratch.project, "b.ts"), content: "export const b = 2\n" } },
  ])
  const config = {
    formatter: false,
    share: "disabled",
    permission: { "*": "allow", bash: "allow", edit: "allow", external_directory: "allow" },
    model: "test/test-model",
    provider: provider(llm.url),
    agent: { maestro: { model: "test/test-model", permission: { "*": "allow" } } },
    lsp: {
      typescript: { disabled: true },
      deno: { disabled: true },
      eslint: { disabled: true },
      oxlint: { disabled: true },
      biome: { disabled: true },
      campaign: { command: [BUN, path.join(ORCHESTRA, "test/fixture/lsp/fake-lsp-server.js"), lspNonce], extensions: [".ts"] },
    },
    mcp: {
      campaign: {
        type: "local",
        command: [BUN, path.join(ORCHESTRA, "test/fixture/mcp-omni-stdio.ts"), mcpNonce],
        environment: { MCP_OMNI_TREE: JSON.stringify({ command: trees.mcp.command, args: trees.mcp.args }) },
        timeout: 30_000,
      },
    },
  }
  const { env, home, project } = { ...scratch, env: { ...scratch.env, ORCHESTRA_CONFIG_CONTENT: JSON.stringify(config) } }
  const nonces = Object.values(trees).map((t) => t.nonce)
  const steps: string[] = []
  const step = (line: string) => {
    steps.push(`${new Date().toISOString()} ${line}`)
    console.error(`[v2-${target}] ${line}`)
  }
  try {
    const started = target === "serve" ? await serve(bin, ["serve", "--port", "0", "--hostname", "127.0.0.1"], env, project) : await tui(bin, env, project)
    step(`host ${started.pid} listening on ${started.url}`)
    const api = client(started.url, project)
    const session = await api.post("/session", {})
    step(`session ${session.id}`)
    await api.post(`/session/${session.id}/prompt_async`, {
      agent: "maestro",
      model: { providerID: "test", modelID: "test-model" },
      parts: [{ type: "text", text: "Run the campaign tree and write b.ts." }],
    })
    const shell = win ? undefined : "/bin/bash"
    await api.post("/pty", shell ? { command: shell, args: ["-c", trees.pty1.line] } : { command: trees.pty1.command, args: trees.pty1.args })
    await api.post("/pty", { command: trees.pty2.command, args: trees.pty2.args, cols: 100, rows: 30 })
    step("prompt sent, 2 terminals created")

    const hostIdentity = started.identity ?? identity(started.pid)
    const specs = [...Object.entries(trees).map(([name, tree]) => ({ name, nonce: tree.nonce, size: tree.size })), { name: "lsp", nonce: lspNonce, size: 1 }, { name: "mcpServer", nonce: mcpNonce, size: 1 }]
    const live = await until(90_000, "every exact fixture member protected under the pinned host", () => {
      const rows = table()
      const found = Object.fromEntries(specs.map((spec) => [spec.name, control(spec.nonce, spec.size, [hostIdentity], rows)]))
      return Object.values(found).every((found) => found.pass) ? found : undefined
    }).catch((error) => { throw new Error(`${error}; llm ${JSON.stringify(llm.seen)}; offered ${JSON.stringify(llm.offered)}; host ${started.out()}`) })
    const supervisors = [...new Map(Object.values(live).flatMap((found) => found.protectedMembers.flatMap((member) => member.supervisors)).map((pinned) => [pinned.pid, pinned])).values()]
    step(`exact tree controls: ${JSON.stringify(live)}; supervisors ${JSON.stringify(supervisors)}`)
    if (supervisors.length === 0) throw new Error("positive control found no pinned supervisors")
    if (!kill9(hostIdentity)) throw new Error(`could not kill pinned host ${started.pid}`)
    const killed = Date.now()
    step(`kill -9 ${started.pid}`)
    const all = [...nonces, lspNonce, mcpNonce]
    const observed = await deadlineSnapshots(killed, KPI_MS, all, [hostIdentity, ...supervisors, ...Object.values(live).flatMap((found) => [...found.fixtureIds, ...found.wrappers])])
    const leftovers = mentioning(home).map((row) => `${row.pid} ${row.args.slice(0, 160)}`)
    step(`deadline snapshots zero at ${observed.zeroAtMs} ms; last ${JSON.stringify(observed.last)}`)
    return verdict(`v2-${target}`, {
      target,
      home,
      nonces: all,
      hostIdentity,
      supervisors,
      observationEndedMs: Date.now() - killed,
      observed,
      kpi: "0 omni-tree processes 8 s after kill -9 of the host",
      live,
      leftovers,
      llm: llm.seen,
      offered: llm.offered,
      pass: observed.zeroAtMs !== undefined && observed.last.counts.every((count) => count === 0) && observed.last.retained.length === 0 && leftovers.length === 0,
      steps,
    })
  } catch (error) {
    return verdict(`v2-${target}`, { target, pass: false, error: String(error).slice(0, 4000), steps })
  } finally {
    llm.stop()
    await cleanup(home, nonces)
  }
}

/** The TUI on a fixed port inside a python pty; its pid is the orchestra process under python. */
async function tui(bin: string, env: Record<string, string>, project: string) {
  const port = await freePort()
  const command = [bin, "--port", String(port), "--hostname", "127.0.0.1"]
  // python's pty.spawn gives the TUI a real terminal without needing one on our stdin (`script` does need one).
  const host = spawn("python3", ["-c", "import pty, sys; pty.spawn(sys.argv[1:])", ...command], {
    env: { ...env, TERM: "xterm-256color", COLUMNS: "120", LINES: "40" },
    cwd: project,
    stdio: ["pipe", "pipe", "pipe"],
  })
  own(env.ORCHESTRA_TEST_HOME!, host)
  let out = ""
  host.stdout!.on("data", (chunk) => (out += chunk))
  host.stderr!.on("data", (chunk) => (out += chunk))
  const url = `http://127.0.0.1:${port}`
  await until(120_000, "the TUI's server", async () =>
    fetch(new URL("/global/health", url), { signal: AbortSignal.timeout(2000) })
      .then(async (response) => (response.ok && (await response.json()).healthy === true ? true : undefined))
      .catch(() => undefined),
  ).catch((error) => {
    throw new Error(`${error}; TUI output: ${out.slice(-2000)}`)
  })
  const captured = await until(10_000, "the TUI identity", () =>
    table().find((row) => row.parent === host.pid && row.args.includes(`--port ${port}`) && row.args.startsWith(bin)),
  )
  return { proc: host, url, pid: captured.pid, identity: { pid: captured.pid, startTime: captured.startTime }, extra: [] as number[], out: () => out }
}

function freePort() {
  return new Promise<number>((resolve) => {
    const server = createServer()
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as { port: number }).port
      server.close(() => resolve(port))
    })
  })
}

if (import.meta.main) {
  const result = await run((process.argv[2] as "serve" | "tui" | "hold" | undefined) ?? "serve")
  process.exit(result.pass ? 0 : 1)
}
