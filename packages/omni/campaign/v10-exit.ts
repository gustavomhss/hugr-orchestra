// V10 serve: real CLI with initialized LSP/MCP, then SIGTERM through its normal runtime-disposal path.
// A forced exit during cleanup never counts as evidence. Bound: 20 s against long-lived fixtures.
// Desktop V10 belongs to the lead's Electron harness.
// Run: ORCHESTRA_LOCAL_TESTS=1 bun packages/omni/campaign/v10-exit.ts
import path from "node:path"
import { BUN, OPENCODE, cleanup, cli, client, control, fakeLLM, fileTree, identity, isolated, matches, members, mentioning, provider, remaining, serve, table, until, verdict, win } from "./lib.ts"

export async function run() {
  if (win) return verdict("v10-exit", { target: "serve", pass: false, error: "Windows V10 needs a real console graceful-quit harness; SIGTERM there terminates instead of running Unix shutdown handlers" })
  const scratch = isolated("v10", {})
  const tree = fileTree(scratch.home, 1)
  const lspNonce = `omni-lsp-${tree.nonce.slice(10)}`
  const mcpNonce = `omni-mcp-${tree.nonce.slice(10)}`
  const llm = await fakeLLM([{ name: "write", args: { filePath: path.join(scratch.project, "b.ts"), content: "export const b = 2\n" } }])
  const config = {
    formatter: false, share: "disabled", permission: { "*": "allow" }, model: "test/test-model", provider: provider(llm.url),
    agent: { maestro: { model: "test/test-model", permission: { "*": "allow" } } },
    lsp: {
      typescript: { disabled: true }, deno: { disabled: true }, eslint: { disabled: true }, oxlint: { disabled: true }, biome: { disabled: true },
      campaign: { command: [BUN, path.join(OPENCODE, "test/fixture/lsp/fake-lsp-server.js"), lspNonce], extensions: [".ts"] },
    },
    mcp: { campaign: { type: "local", command: [BUN, path.join(OPENCODE, "test/fixture/mcp-omni-stdio.ts"), mcpNonce], environment: { MCP_OMNI_TREE: JSON.stringify({ command: tree.command, args: tree.args }) }, timeout: 30_000 } },
  }
  const steps: string[] = []
  const step = (line: string) => { steps.push(`${new Date().toISOString()} ${line}`); console.error(`[v10] ${line}`) }
  try {
    const host = await serve(cli(), ["--print-logs", "--log-level", "DEBUG", "serve", "--port", "0", "--hostname", "127.0.0.1"], { ...scratch.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config) }, scratch.project)
    const pinnedHost = host.identity ?? identity(host.pid)
    const api = client(host.url, scratch.project)
    const session = await api.post("/session", {})
    step(`host ${host.pid}; session ${session.id}; home ${scratch.home}`)
    await api.post(`/session/${session.id}/prompt_async`, { agent: "maestro", model: { providerID: "test", modelID: "test-model" }, parts: [{ type: "text", text: "Write b.ts and finish." }] })
    const live = await until(90_000, "all exact LSP/MCP members protected", () => {
      const rows = table()
      const found = { lsp: control(lspNonce, 1, [pinnedHost], rows), mcp: control(mcpNonce, 1, [pinnedHost], rows), tree: control(tree.nonce, tree.size, [pinnedHost], rows) }
      return Object.values(found).every((found) => found.pass) ? found : undefined
    }).catch(async (error) => {
      throw new Error(`${error}; state ${JSON.stringify({ lsp: mentioning(lspNonce), mcp: mentioning(mcpNonce), tree: await remaining(tree.nonce), messages: await api.get(`/session/${session.id}/message`) })}; host ${host.out()}`)
    })
    await until(30_000, "completed assistant turn before quit", async () => {
      const messages = await api.get(`/session/${session.id}/message`) as { info: { role: string; finish?: string; error?: unknown } }[]
      const failed = messages.find((message) => message.info.error)
      if (failed) throw new Error(`assistant error: ${JSON.stringify(failed.info.error)}`)
      return messages.some((message) => message.info.role === "assistant" && message.info.finish === "stop") ? true : undefined
    })
    const status = { lsp: await api.get("/lsp"), mcp: await api.get("/mcp") }
    const supervisors = [...new Map(Object.values(live).flatMap((found) => found.protectedMembers.flatMap((member) => member.supervisors)).map((pinned) => [pinned.pid, pinned])).values()]
    if (supervisors.length === 0) throw new Error("positive control failed before quit")
    step(`live ${JSON.stringify(live)}; status ${JSON.stringify(status)}`)
    if (!table().some((row) => matches(row, pinnedHost) && !row.state.startsWith("Z"))) throw new Error("serve identity changed before SIGTERM")
    const quit = Date.now()
    if (!host.proc.kill("SIGTERM")) throw new Error("could not signal campaign serve")
    await until(20_000, "serve exiting after SIGTERM", () => host.proc.exitCode !== null || host.proc.signalCode !== null ? true : undefined)
    const exitMs = Date.now() - quit
    const after = await until(20_000 - exitMs, "quit cleaning all owned trees and supervisor", () => {
      const rows = table(Math.min(2000, 20_000 - (Date.now() - quit)))
      const found = { lsp: members(lspNonce, rows), mcp: members(mcpNonce, rows), tree: members(tree.nonce, rows) }
      const counts = { ...Object.fromEntries(Object.entries(found).map(([name, tree]) => [name, tree.members.length + tree.wrappers.length])), supervisors: rows.filter((row) => !row.state.startsWith("Z") && supervisors.some((pinned) => matches(row, pinned))).length }
      return Object.values(counts).every((count) => count === 0) ? counts : undefined
    })
    const totalMs = Date.now() - quit
    const leftovers = mentioning(scratch.home)
    const shutdown = shutdownEvidence(host.out(), host.pid, host.proc.exitCode, host.proc.signalCode)
    step(`exit ${host.proc.exitCode ?? host.proc.signalCode} in ${exitMs} ms; cleanup ${totalMs} ms; after ${JSON.stringify(after)}`)
    return verdict("v10-exit", { target: "serve", kpi: "runtime.dispose completes, exits exactly 143, cleans LSP/MCP within 20 s", eventLoopRetention: "unproven: this serve command explicitly process.exit()s", home: scratch.home, nonce: tree.nonce, pinnedHost, live, supervisors, status, shutdown, exitCode: host.proc.exitCode, signalCode: host.proc.signalCode, exitMs, totalMs, after, leftovers, llm: llm.seen, pass: shutdown.pass && totalMs < 20_000 && leftovers.length === 0, steps })
  } catch (error) {
    return verdict("v10-exit", { target: "serve", pass: false, error: String(error), home: scratch.home, nonce: tree.nonce, llm: llm.seen, offered: llm.offered, steps })
  } finally {
    llm.stop()
    await cleanup(scratch.home, [tree.nonce])
  }
}

export function shutdownEvidence(output: string, pid: number, exitCode: number | null, signalCode: string | null) {
  const events = [...output.matchAll(/(?:^|\n)CLI_SHUTDOWN ([^\r\n]+)/g)].map((match) => {
    const event = JSON.parse(match[1]!) as { event: string; level: string; pid: number; signal: string; status: string; elapsedMs: number }
    if (event.event !== "cli.shutdown" || event.level !== "DEBUG" || !Number.isSafeInteger(event.pid) || typeof event.elapsedMs !== "number" || !["started", "disposed", "timed-out", "failed"].includes(event.status)) throw new Error(`malformed shutdown evidence: ${match[1]}`)
    return event
  }).filter((event) => event.pid === pid)
  return { events, pass: exitCode === 143 && signalCode === null && events.length === 2 && events.every((event) => event.signal === "SIGTERM") && events[0]!.status === "started" && events[1]!.status === "disposed" }
}

if (import.meta.main) process.exit((await run()).pass ? 0 : 1)
