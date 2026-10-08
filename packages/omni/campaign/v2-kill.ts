// V2: `kill -9` (TerminateProcess on Windows) of a live Orchestra host, while it runs a bash tool tree, an LSP, an MCP
// stdio server (with a grandchild) and 2 terminals. KPI: 0 omni-tree processes 8 s after the kill.
//
//   bun packages/omni/campaign/v2-kill.ts [serve|tui|hold]
//
//   serve  the compiled CLI's `orchestra serve`; a fake LLM drives a real agent turn (bash + write tools)
//   tui    compiled TUI/Worker, fixed HTTP port; product ConPTY on Windows, python pty on Unix
//   hold   the compiled CLI's `debug omni --hold` (the WP5 crash smoke, as a baseline)

import { spawn, type ChildProcess } from "node:child_process"
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
  members,
  own,
  provider,
  serve,
  table,
  until,
  verdict,
  win,
} from "./lib.ts"
import { deliveryEnv } from "./delivery-fixtures.ts"
import { consoleHost, consoleInput, finishCampaign, gracefulEvidence, isolatedEnvironment, windowsInventory, windowsSnapshots } from "./windows-lifecycle.ts"
import { PtyOmni } from "../../core/src/pty/omni.ts"

const KPI_MS = 8_000

export async function run(target: "serve" | "tui" | "hold" = "serve", action: "kill" | "quit" = "kill") {
  if (process.env.ORCHESTRA_LOCAL_TESTS !== "1" && !process.env.CI) throw new Error("local campaign requires ORCHESTRA_LOCAL_TESTS=1")
  if (target === "hold") return hold()
  return host(target, action)
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

async function host(target: "serve" | "tui", action: "kill" | "quit") {
  if (action === "quit" && !win) throw new Error("Windows console quit cell requires Windows")
  const scenario = `${action === "quit" ? "v10" : "v2"}-${target}`
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
    // The CLI canonicalizes Windows 8.3 temp paths. Resolve inside its Location, not through RUNNER~1.
    { name: "write", args: { filePath: "b.ts", content: "export const b = 2\n" } },
    { name: "bash", args: { command: win ? `& ${trees.bash.line}` : trees.bash.line, timeout: 600_000, description: "Run the campaign tree" } },
  ])
  const config = {
    formatter: false,
    shell: win ? "powershell.exe" : "/bin/bash",
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
  const { env, home, project } = { ...scratch, env: deliveryEnv({ ...scratch.env, ORCHESTRA_CONFIG_CONTENT: JSON.stringify(config) }) }
  const terminalHost = { host: undefined as Awaited<ReturnType<typeof consoleHost>> | undefined }
  const processHost = { proc: undefined as ChildProcess | undefined }
  const outside = { terminal: undefined as PtyOmni.OmniProc | undefined }
  const probes = { controls: undefined as Record<string, ReturnType<typeof control>> | undefined }
  const recorder = { inventory: undefined as Awaited<ReturnType<typeof windowsInventory>> | undefined }
  const teardown = { recorder: undefined as ReturnType<Awaited<ReturnType<typeof windowsInventory>>["snapshot"]> | undefined, cleanupComplete: false }
  const nonces = Object.values(trees).map((t) => t.nonce)
  const steps: string[] = []
  const step = (line: string) => {
    steps.push(`${new Date().toISOString()} ${line}`)
    console.error(`[v2-${target}] ${line}`)
  }
  return finishCampaign(scenario, async () => { try {
    if (win) recorder.inventory = await windowsInventory(env)
    const started = win && (target === "tui" || action === "quit") ? await consoleHost(env, project, target, [], recorder.inventory) : target === "serve" ? await serve(bin, ["serve", "--port", "0", "--hostname", "127.0.0.1"], env, project) : await tui(bin, env, project)
    if ("terminal" in started) terminalHost.host = started
    if ("proc" in started) processHost.proc = started.proc
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
    if (process.env.OMNI_CAMPAIGN_MUTATION === "skip-inner-owner") {
      const backend = await PtyOmni.load()
      outside.terminal = isolatedEnvironment(env, () => backend.spawn(trees.pty2.command, trees.pty2.args, { name: "xterm-256color", cols: 100, rows: 30, cwd: project, env }))
      outside.terminal.onData(() => {})
    }
    if (!outside.terminal) await api.post("/pty", { command: trees.pty2.command, args: trees.pty2.args, cols: 100, rows: 30 })
    step("prompt sent, 2 terminals created")

    const hostIdentity = started.identity ?? identity(started.pid)
    const specs = [...Object.entries(trees).map(([name, tree]) => ({ name, nonce: tree.nonce, size: tree.size })), { name: "lsp", nonce: lspNonce, size: 1 }, { name: "mcpServer", nonce: mcpNonce, size: 1 }]
    const live = await until(outside.terminal ? 15_000 : 90_000, "every exact fixture member protected under the pinned host", async () => {
      const rows = recorder.inventory ? await recorder.inventory.query() : table()
      const found = Object.fromEntries(specs.map((spec) => [spec.name, control(spec.nonce, spec.size, [hostIdentity], rows)]))
      probes.controls = found
      return Object.values(found).every((found) => found.pass) ? found : undefined
    }).catch(async (error) => {
      const messages = await api.get(`/session/${session.id}/message`) as { info: { error?: unknown }; parts: { type: string; tool?: string; state?: { status: string; error?: string } }[] }[]
      throw new Error(`${error}; tool states ${JSON.stringify(messages.flatMap((message) => message.parts.filter((part) => part.type === "tool")))}; llm ${JSON.stringify(llm.seen)}; host ${started.out().slice(-2000)}`)
    })
    const supervisors = [...new Map(Object.values(live).flatMap((found) => found.protectedMembers.flatMap((member) => member.supervisors)).map((pinned) => [pinned.pid, pinned])).values()]
    step(`exact tree controls: ${JSON.stringify(live)}; supervisors ${JSON.stringify(supervisors)}`)
    if (supervisors.length === 0) throw new Error("positive control found no pinned supervisors")
    const input = action === "quit" && process.env.OMNI_CAMPAIGN_MUTATION !== "forced-kill-graceful" ? "Ctrl+C" : "TerminateProcess"
    const killed = Date.now()
    if (input === "Ctrl+C") await consoleInput(terminalHost.host!, "Ctrl+C", recorder.inventory)
    if (input === "TerminateProcess" && !kill9(hostIdentity)) throw new Error(`could not kill pinned host ${started.pid}`)
    step(`${input} ${started.pid}`)
    const all = [...nonces, lspNonce, mcpNonce]
    const retained = [hostIdentity, ...supervisors, ...Object.values(live).flatMap((found) => [...found.fixtureIds, ...found.wrappers])]
    const observed = recorder.inventory ? await windowsSnapshots(recorder.inventory, killed, action === "quit" ? 20_000 : KPI_MS, all, retained) : await deadlineSnapshots(killed, KPI_MS, all, retained)
    const shutdown = action === "quit" ? gracefulEvidence(target, terminalHost.host!, input) : undefined
    const leftovers = mentioning(home).map((row) => `${row.pid} ${row.args?.slice(0, 160) ?? "<argv unavailable>"}`)
    step(`deadline snapshots zero at ${observed.zeroAtMs} ms; last ${JSON.stringify(observed.last)}`)
    return {
      target,
      home,
      nonces: all,
      hostIdentity,
      supervisors,
      observationEndedMs: Date.now() - killed,
      observed,
      input, shutdown, recorderPreparationMs: recorder.inventory?.preparationMs, preparationMs: terminalHost.host?.preparationMs, identityCaptureMs: terminalHost.host?.identityCaptureMs,
      kpi: action === "quit" ? "real console Ctrl+C exits and cleans every owned fixture within 20 s" : "0 omni-tree processes 8 s after kill -9 of the host",
      live,
      leftovers,
      llm: llm.seen,
      offered: llm.offered,
      teardown,
      pass: (shutdown === undefined || shutdown.pass) && observed.zeroAtMs !== undefined && observed.last.counts.every((count) => count === 0) && observed.last.retained.length === 0 && leftovers.length === 0,
      steps,
    }
  } catch (error) {
    return { target, pass: false, error: String(error).slice(0, 4000), home, teardown, controls: probes.controls, output: terminalHost.host?.out().slice(-4000), steps }
  } }, async () => {
    llm.stop()
    try {
      await outside.terminal?.stop()
      await terminalHost.host?.terminal.stop()
      // Teardown follows the completed/red observation. Let the product supervisor finish first so a
      // snapshot of descendants cannot race its own host's forced teardown inside lib.cleanup.
      if (processHost.proc?.exitCode === null && processHost.proc.signalCode === null) processHost.proc.kill("SIGKILL")
      await until(10_000, "post-verdict fixture teardown", async () => {
        const rows = recorder.inventory ? await recorder.inventory.query() : table()
        return [...nonces, lspNonce, mcpNonce].every((nonce) => {
          const found = members(nonce, rows)
          return found.members.length === 0 && found.wrappers.length === 0
        }) ? true : undefined
      })
    } finally {
      try { await recorder.inventory?.stop() }
      finally {
        teardown.recorder = recorder.inventory?.snapshot()
        await cleanup(home, nonces)
        teardown.cleanupComplete = true
      }
    }
  })
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
      .then(async (response) => {
        const body: unknown = await response.json()
        return response.ok && typeof body === "object" && body !== null && "healthy" in body && body.healthy === true ? true : undefined
      })
      .catch(() => undefined),
  ).catch((error) => {
    throw new Error(`${error}; TUI output: ${out.slice(-2000)}`)
  })
  const captured = await until(10_000, "the TUI identity", () =>
    table().find((row) => row.parent === host.pid && row.args?.includes(`--port ${port}`) && row.args.startsWith(bin)),
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
