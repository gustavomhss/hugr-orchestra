// V1: a real Maestro bash turn starts a background nonce tree. The tool and turn finish,
// /session/:id/processes exposes the tree and post-adoption output, and Session.remove stops it.
// Run: ORCHESTRA_LOCAL_TESTS=1 bun packages/omni/campaign/v1-background.ts
import { appendFileSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { cleanup, cli, client, control, fakeLLM, fileTree, identity, isolated, matches, members, provider, remaining, serve, until, verdict, win } from "./lib.ts"

type Message = {
  info: { role: string; finish?: string; error?: unknown }
  parts: { type: string; tool?: string; state?: { status: string; error?: string; time?: { start: number; end?: number } } }[]
}
type Listed = { id: string; pid: number; title: string; output: string; written: number; processes: { pid: number }[] }

export async function run() {
  if (win) return verdict("v1-background", { pass: false, error: "Windows V1 needs a shell-specific background/readiness barrier; this harness uses Unix bash" })
  const scratch = isolated("v1", {})
  const tree = fileTree(scratch.home, 2)
  const channel = path.join(scratch.home, "post-tool-output-control")
  // The unique payload does not exist until the tool AND adoption have completed.
  appendFileSync(path.join(scratch.home, `${tree.nonce}.js`), `\nlet last = ""; setInterval(() => { const fs = process.getBuiltinModule("node:fs"); const file = ${JSON.stringify(channel)}; if (!fs.existsSync(file)) return; const value = fs.readFileSync(file, "utf8"); if (value === last) return; last = value; console.log(value) }, 100)\n`)
  const release = path.join(scratch.home, "release-background")
  // Background descendants reparent to init when bash exits; measure supervisor ancestry before that boundary.
  const llm = await fakeLLM([{ name: "bash", args: { command: `${tree.line} & while [ ! -f "${release}" ]; do sleep 0.05; done`, timeout: 600_000, description: "Start background dev-server tree" } }])
  const config = {
    formatter: false, lsp: false, shell: "/bin/bash", share: "disabled", model: "test/test-model", provider: provider(llm.url),
    permission: { "*": "allow" }, agent: { maestro: { model: "test/test-model", permission: { "*": "allow" } } },
  }
  const env = { ...scratch.env, OPENCODE_CONFIG_CONTENT: JSON.stringify(config) }
  const steps: string[] = []
  const step = (line: string) => { steps.push(`${new Date().toISOString()} ${line}`); console.error(`[v1] ${line}`) }
  try {
    const host = await serve(cli(), ["serve", "--port", "0", "--hostname", "127.0.0.1"], env, scratch.project)
    const api = client(host.url, scratch.project)
    const session = await api.post("/session", {})
    step(`host ${host.pid}; session ${session.id}; nonce ${tree.nonce}; home ${scratch.home}`)
    await api.post(`/session/${session.id}/prompt_async`, { agent: "maestro", model: { providerID: "test", modelID: "test-model" }, parts: [{ type: "text", text: "Start the background campaign tree, then finish the turn." }] })
    const pinnedHost = host.identity ?? identity(host.pid)
    const before = await until(90_000, "every exact background member protected", () => {
      const found = control(tree.nonce, tree.size, [pinnedHost])
      return found.pass ? found : undefined
    })
    writeFileSync(release, "release\n")
    const completed = await until(30_000, "completed bash tool and final assistant turn", async () => {
      const messages = await api.get(`/session/${session.id}/message`) as Message[]
      const failed = messages.find((message) => message.info.error)
      if (failed) throw new Error(`assistant error: ${JSON.stringify(failed.info.error)}`)
      const tool = messages.flatMap((message) => message.parts).find((part) => part.type === "tool" && part.tool === "bash")
      if (tool?.state?.status === "error") throw new Error(`bash failed: ${tool.state.error}`)
      return tool?.state?.status === "completed" && messages.some((message) => message.info.role === "assistant" && message.info.finish === "stop") ? tool.state : undefined
    })
    const toolMs = completed.time?.end === undefined ? undefined : completed.time.end - completed.time.start
    if (toolMs === undefined) throw new Error("completed tool has no start/end timing")
    step(`turn finished; tool ${toolMs} ms; full positive control ${JSON.stringify(before)}`)
    const adopted = await until(20_000, "exact tree adopted after tool completion", async () => {
      const jobs = await api.get(`/session/${session.id}/processes`) as Listed[]
      const found = members(tree.nonce)
      return jobs.find((job) => found.members.length === tree.size && found.wrappers.length === 0 && job.processes.length === tree.size && found.members.every((row) => before.fixtureIds.some((original) => matches(row, original)) && job.processes.some((node) => node.pid === row.pid)))
    })
    const marker = `post-tool-${randomUUID()}`
    const markerSent = Date.now()
    if (markerSent < completed.time!.end!) throw new Error("marker generated before tool completion")
    if (adopted.output.includes(marker)) throw new Error("unique post-tool marker already present before injection")
    // Named fault injection lets the real post-adoption output oracle be tested in both directions.
    if (process.env.OMNI_CAMPAIGN_MUTATION !== "omit-post-tool-marker") writeFileSync(channel, marker)
    const listed = await until(20_000, "new post-tool output traversing adoption pump into registry", async () => {
      const jobs = await api.get(`/session/${session.id}/processes`) as Listed[]
      return jobs.find((job) => job.id === adopted.id && job.written > adopted.written && job.output.includes(marker))
    })
    const afterTurn = await remaining(tree.nonce)
    const removed = Date.now()
    await until(20_000, "Session.remove stopping adopted nonce tree", async () => {
      await api.del(`/session/${session.id}`)
      return until(20_000 - (Date.now() - removed), "adopted tree gone", async () => (await remaining(tree.nonce)) === 0 ? true : undefined)
    })
    const afterRemove = await remaining(tree.nonce)
    const stopMs = Date.now() - removed
    step(`Session.remove stopped tree in ${stopMs} ms`)
    return verdict("v1-background", {
      kpi: "tool returns within 20 s against a 600 s hang; background tree survives turn, is listed with output, stops on Session.remove",
      home: scratch.home, nonce: tree.nonce, sessionID: session.id, pinnedHost, before, toolMs, adopted, marker, markerSent, listed, afterTurn, afterRemove, stopMs,
      llm: llm.seen, offered: llm.offered, pass: before.pass && toolMs <= 20_000 && afterTurn === tree.size && afterRemove === 0 && stopMs < 20_000, steps,
    })
  } catch (error) {
    return verdict("v1-background", { pass: false, error: String(error), home: scratch.home, nonce: tree.nonce, llm: llm.seen, offered: llm.offered, steps })
  } finally {
    llm.stop()
    await cleanup(scratch.home, [tree.nonce])
  }
}

if (import.meta.main) process.exit((await run()).pass ? 0 : 1)
