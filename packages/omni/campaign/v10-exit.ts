// V10 serve: real CLI with initialized LSP/MCP, then SIGTERM through its normal runtime-disposal path.
// A forced exit during cleanup never counts as evidence. Bound: 20 s against long-lived fixtures.
// Desktop V10 belongs to the lead's Electron harness.
// Run: ORCHESTRA_LOCAL_TESTS=1 bun packages/omni/campaign/v10-exit.ts
import path from "node:path"
import { BUN, OPENCODE, cleanup, cli, client, fakeLLM, fileTree, isolated, mentioning, provider, remaining, serve, supervised, supervisorsOf, table, until, verdict, win } from "./lib.ts"

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
    const host = await serve(cli(), ["serve", "--port", "0", "--hostname", "127.0.0.1"], { ...scratch.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config) }, scratch.project)
    const api = client(host.url, scratch.project)
    const session = await api.post("/session", {})
    step(`host ${host.pid}; session ${session.id}; home ${scratch.home}`)
    await api.post(`/session/${session.id}/prompt_async`, { agent: "maestro", model: { providerID: "test", modelID: "test-model" }, parts: [{ type: "text", text: "Write b.ts and finish." }] })
    const live = await until(90_000, "LSP, MCP and full MCP child tree", async () => {
      const counts = { lsp: mentioning(lspNonce).length, mcp: mentioning(mcpNonce).length, tree: await remaining(tree.nonce) }
      return counts.lsp === 1 && counts.mcp === 1 && counts.tree === tree.size ? counts : undefined
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
    const control = { lsp: supervised(lspNonce), mcp: supervised(mcpNonce), tree: supervised(tree.nonce) }
    const supervisors = supervisorsOf([host.pid]).map((row) => row.pid)
    if (!Object.values(control).every(Boolean) || supervisors.length === 0) throw new Error("positive control failed before quit")
    step(`live ${JSON.stringify(live)}; status ${JSON.stringify(status)}; supervised ${JSON.stringify(control)}`)
    const quit = Date.now()
    if (!host.proc.kill("SIGTERM")) throw new Error("could not signal campaign serve")
    await until(20_000, "serve exiting after SIGTERM", () => host.proc.exitCode !== null || host.proc.signalCode !== null ? true : undefined)
    const exitMs = Date.now() - quit
    await until(Math.max(1, 20_000 - exitMs), "quit cleaning all owned trees and supervisor", async () =>
      mentioning(lspNonce).length === 0 && mentioning(mcpNonce).length === 0 && (await remaining(tree.nonce)) === 0 && !table().some((row) => supervisors.includes(row.pid)) ? true : undefined)
    const after = { lsp: mentioning(lspNonce).length, mcp: mentioning(mcpNonce).length, tree: await remaining(tree.nonce), supervisors: table().filter((row) => supervisors.includes(row.pid)).length }
    const totalMs = Date.now() - quit
    const leftovers = mentioning(scratch.home)
    step(`exit ${host.proc.exitCode ?? host.proc.signalCode} in ${exitMs} ms; cleanup ${totalMs} ms; after ${JSON.stringify(after)}`)
    return verdict("v10-exit", { target: "serve", kpi: "normal SIGTERM quit exits and cleans LSP/MCP within 20 s", home: scratch.home, nonce: tree.nonce, live, status, supervised: control, exitCode: host.proc.exitCode, signalCode: host.proc.signalCode, exitMs, totalMs, after, leftovers, llm: llm.seen, pass: totalMs <= 20_000 && Object.values(after).every((count) => count === 0) && leftovers.length === 0, steps })
  } catch (error) {
    return verdict("v10-exit", { target: "serve", pass: false, error: String(error), home: scratch.home, nonce: tree.nonce, llm: llm.seen, offered: llm.offered, steps })
  } finally {
    llm.stop()
    await cleanup(scratch.home, [tree.nonce])
  }
}

if (import.meta.main) process.exit((await run()).pass ? 0 : 1)
