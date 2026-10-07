// V2: `kill -9` (TerminateProcess on Windows) of a live Orchestra host, while it runs a bash tool tree, an LSP, an MCP
// stdio server (with a grandchild) and 2 terminals. KPI: 0 omni-tree processes 8 s after the kill.
//
//   bun packages/omni/campaign/v2-kill.ts [serve|tui|hold]
//
//   serve  the compiled CLI's `opencode serve`; a fake LLM drives a real agent turn (bash + write tools)
//   tui    the compiled CLI's TUI (its server runs in a Bun Worker) on a fixed port, inside a python pty (Unix only)
//   hold   the compiled CLI's `debug omni --hold` (the WP5 crash smoke, as a baseline)

import { spawn } from "node:child_process"
import { createServer } from "node:net"
import path from "node:path"
import {
  BUN,
  OPENCODE,
  cleanup,
  cli,
  client,
  fakeLLM,
  fileTree,
  isolated,
  kill9,
  mentioning,
  provider,
  remaining,
  serve,
  sleep,
  supervised,
  supervisorsOf,
  sweep,
  table,
  until,
  verdict,
  win,
} from "./lib.ts"

const KPI_MS = 8_000

export async function run(target: "serve" | "tui" | "hold" = "serve") {
  if (target === "hold") return hold()
  return host(target)
}

async function hold() {
  const bin = cli()
  const { env, home, project } = isolated("v2-hold", {})
  const proc = spawn(bin, ["debug", "omni", "--hold"], { env, cwd: project, stdio: ["ignore", "pipe", "pipe"] })
  let out = ""
  proc.stdout!.on("data", (chunk) => (out += chunk))
  proc.stderr!.on("data", (chunk) => (out += chunk))
  const nonce = await until(60_000, "holding line", () => out.match(/holding (\S+)/)?.[1]).catch((error) => {
    throw new Error(`${error}: ${out}`)
  })
  const before = (await sweep(nonce)).length
  const control = supervised(nonce)
  kill9(proc.pid!)
  const killed = Date.now()
  await sleep(KPI_MS)
  const after = (await sweep(nonce)).length
  await cleanup(home, [])
  return verdict("v2-hold", {
    target: "hold",
    kpi: "0 nonce processes 8 s after kill -9 of `opencode debug omni --hold` (compiled CLI)",
    before,
    supervised: control,
    after,
    waitedMs: Date.now() - killed,
    pass: before >= 2 && control && after === 0,
  })
}

async function host(target: "serve" | "tui") {
  if (target === "tui" && win) return verdict("v2-tui", { target, pass: null, note: "not run: the harness hosts the TUI in a python pty (Unix only)" })
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
    lsp: {
      typescript: { disabled: true },
      deno: { disabled: true },
      eslint: { disabled: true },
      oxlint: { disabled: true },
      biome: { disabled: true },
      campaign: { command: [BUN, path.join(OPENCODE, "test/fixture/lsp/fake-lsp-server.js"), lspNonce], extensions: [".ts"] },
    },
    mcp: {
      campaign: {
        type: "local",
        command: [BUN, path.join(OPENCODE, "test/fixture/mcp-omni-stdio.ts"), mcpNonce],
        environment: { MCP_OMNI_TREE: JSON.stringify({ command: trees.mcp.command, args: trees.mcp.args }) },
        timeout: 30_000,
      },
    },
  }
  const { env, home, project } = { ...scratch, env: { ...scratch.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config) } }
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
      model: { providerID: "test", modelID: "test-model" },
      parts: [{ type: "text", text: "Run the campaign tree and write b.ts." }],
    })
    const shell = win ? undefined : "/bin/bash"
    await api.post("/pty", shell ? { command: shell, args: ["-c", trees.pty1.line] } : { command: trees.pty1.command, args: trees.pty1.args })
    await api.post("/pty", { command: trees.pty2.command, args: trees.pty2.args, cols: 100, rows: 30 })
    step("prompt sent, 2 terminals created")

    const live = await until(90_000, "every tree, the LSP and the MCP server alive", async () => {
      const counts = {
        bash: await remaining(trees.bash.nonce),
        mcp: await remaining(trees.mcp.nonce),
        pty1: await remaining(trees.pty1.nonce),
        pty2: await remaining(trees.pty2.nonce),
        lsp: (await sweep(lspNonce)).length,
        mcpServer: (await sweep(mcpNonce)).length,
      }
      const full =
        counts.bash === trees.bash.size &&
        counts.mcp === trees.mcp.size &&
        counts.pty1 === trees.pty1.size &&
        counts.pty2 === trees.pty2.size &&
        counts.lsp >= 1 &&
        counts.mcpServer >= 1
      return full ? counts : undefined
    }).catch(async (error) => {
      const state = {
        bash: await remaining(trees.bash.nonce),
        mcp: await remaining(trees.mcp.nonce),
        pty1: await remaining(trees.pty1.nonce),
        pty2: await remaining(trees.pty2.nonce),
        lsp: (await sweep(lspNonce)).length,
        mcpServer: (await sweep(mcpNonce)).length,
        llm: llm.seen,
      }
      throw new Error(`${error}; state ${JSON.stringify(state)}; host output: ${started.out().slice(-3000)}`)
    })
    step(`live: ${JSON.stringify(live)}`)
    const control = Object.fromEntries(
      [...Object.entries(trees).map(([name, t]) => [name, t.nonce]), ["lsp", lspNonce], ["mcpServer", mcpNonce]].map(
        ([name, nonce]) => [name, supervised(nonce!)],
      ),
    )
    const supervisors = supervisorsOf([started.pid, ...started.extra]).map((row) => row.pid)
    step(`positive control (supervisor above each): ${JSON.stringify(control)}; supervisors ${supervisors.join(",")}`)

    kill9(started.pid)
    const killed = Date.now()
    step(`kill -9 ${started.pid}`)
    let zeroAt: number | undefined
    const all = [...nonces, lspNonce, mcpNonce]
    while (Date.now() - killed < KPI_MS) {
      const counts = await Promise.all(all.map((nonce) => sweep(nonce).then((rows) => rows.length)))
      if (zeroAt === undefined && counts.every((count) => count === 0)) zeroAt = Date.now() - killed
      await sleep(250)
    }
    await sleep(Math.max(0, KPI_MS - (Date.now() - killed)))
    const after = {
      bash: await remaining(trees.bash.nonce),
      mcp: await remaining(trees.mcp.nonce),
      pty1: await remaining(trees.pty1.nonce),
      pty2: await remaining(trees.pty2.nonce),
      lsp: (await sweep(lspNonce)).length,
      mcpServer: (await sweep(mcpNonce)).length,
      supervisors: table().filter((row) => supervisors.includes(row.pid)).length,
    }
    const leftovers = mentioning(home).map((row) => `${row.pid} ${row.args.slice(0, 160)}`)
    step(`8 s after the kill: ${JSON.stringify(after)}; zero at ${zeroAt} ms; leftovers mentioning the temp home: ${leftovers.length}`)
    const total = Object.values(after).reduce((sum, count) => sum + count, 0)
    return verdict(`v2-${target}`, {
      target,
      kpi: "0 omni-tree processes 8 s after kill -9 of the host",
      live,
      supervised: control,
      after,
      zeroAtMs: zeroAt ?? null,
      leftovers,
      llm: llm.seen,
      pass: Object.values(control).every(Boolean) && total === 0 && leftovers.length === 0,
      steps,
    })
  } catch (error) {
    return verdict(`v2-${target}`, { target, pass: false, error: String(error).slice(0, 4000), steps })
  } finally {
    llm.stop()
    await cleanup(home, nonces)
  }
}

/** The TUI on a fixed port inside a python pty; its pid is the opencode process under python. */
async function tui(bin: string, env: Record<string, string>, project: string) {
  const port = await freePort()
  const command = [bin, "--port", String(port), "--hostname", "127.0.0.1"]
  // python's pty.spawn gives the TUI a real terminal without needing one on our stdin (`script` does need one).
  const host = spawn("python3", ["-c", "import pty, sys; pty.spawn(sys.argv[1:])", ...command], {
    env: { ...env, TERM: "xterm-256color", COLUMNS: "120", LINES: "40" },
    cwd: project,
    stdio: ["pipe", "pipe", "pipe"],
  })
  let out = ""
  host.stdout!.on("data", (chunk) => (out += chunk))
  host.stderr!.on("data", (chunk) => (out += chunk))
  const url = `http://127.0.0.1:${port}`
  await until(120_000, "the TUI's server", async () =>
    fetch(new URL("/global/health", url))
      .then((response) => (response.status < 500 ? true : undefined))
      .catch(() => undefined),
  ).catch((error) => {
    throw new Error(`${error}; TUI output: ${out.slice(-2000)}`)
  })
  const pid = await until(10_000, "the TUI pid", () =>
    table().find((row) => row.args.includes(`--port ${port}`) && row.args.startsWith(bin) && row.pid !== host.pid)?.pid,
  )
  return { proc: host, url, pid, extra: [] as number[], out: () => out }
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
