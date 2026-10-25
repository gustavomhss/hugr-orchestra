// V1: a real Maestro bash turn starts a background nonce tree. The tool and turn finish,
// /api/session/:id/processes exposes the tree and post-adoption output, and Session.remove stops it.
// Run: ORCHESTRA_LOCAL_TESTS=1 bun native/omni/campaign/v1-background.ts
import { appendFileSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import path from "node:path"
import { stripVTControlCharacters } from "node:util"
import { cleanup, cli, client, control, fileTree, identity, isolated, matches, members, provider, remaining, serve, until, win, writeConfig } from "./lib.ts"
import { deliveryEnv } from "./delivery-fixtures.ts"
import { backgroundCommand, consoleHost, consoleInput, finishCampaign, observeFrontend, twoStageLLM, windowsInventory } from "./windows-lifecycle.ts"
import type { ChildProcess } from "node:child_process"

/** The foreground bash call for a nonce, in the V1 part shape the checks below read. */
function foregroundTool(calls: Awaited<ReturnType<ReturnType<typeof client>["tools"]>>, nonce: string) {
  const call = calls.find((item) => item.tool === "bash" && String(item.input.command).includes(nonce))
  return call && { state: { status: call.status, input: call.input, error: call.error, metadata: { ...call.structured, ...call.metadata }, output: String(call.structured?.output ?? "") } }
}

export async function run() {
  const scratch = isolated("v1", {})
  const tree = fileTree(scratch.home, 2)
  const foreground = fileTree(scratch.home, 2)
  const foregroundPrompt = `foreground-${randomUUID()}`
  const channel = path.join(scratch.home, "post-tool-output-control")
  // The unique payload does not exist until the tool AND adoption have completed.
  appendFileSync(path.join(scratch.home, `${tree.nonce}.js`), `\nlet last = ""; setInterval(() => { const fs = process.getBuiltinModule("node:fs"); const file = ${JSON.stringify(channel)}; if (!fs.existsSync(file)) return; const value = fs.readFileSync(file, "utf8"); if (value === last) return; last = value; console.log(value) }, 100)\n`)
  const release = path.join(scratch.home, "release-background")
  // Background descendants reparent to init when bash exits; measure supervisor ancestry before that boundary.
  const llm = await twoStageLLM([
    { name: "bash", args: { command: win ? backgroundCommand(tree, release) : `${tree.line} & while [ ! -f "${release}" ]; do sleep 0.05; done`, timeout: 600_000, description: "Start background dev-server tree" } },
    { name: "bash", args: { command: win ? `& ${foreground.line}` : foreground.line, timeout: 600_000, description: `Foreground ${foreground.nonce}` } },
  ], foregroundPrompt)
  const config = {
    formatter: false, lsp: false, shell: win ? "powershell.exe" : "/bin/bash", share: "disabled", model: "test/test-model", provider: provider(llm.url),
    permission: { "*": "allow" }, agent: { maestro: { model: "test/test-model", permission: { "*": "allow" } } },
  }
  writeConfig(scratch.project, config)
  const env = deliveryEnv(scratch.env)
  const terminalHost = { host: undefined as Awaited<ReturnType<typeof consoleHost>> | undefined }
  const recorder = { inventory: undefined as Awaited<ReturnType<typeof windowsInventory>> | undefined }
  const processHost = { proc: undefined as ChildProcess | undefined }
  const frontend = { proxy: undefined as Awaited<ReturnType<typeof observeFrontend>> | undefined }
  const esc = { sent: 0, displayedSession: undefined as string | undefined, firstAcknowledged: false, before: undefined as ReturnType<typeof control> | undefined, probe: undefined as { protected: boolean; toolStatus?: string; status?: string; title: boolean; interrupt: boolean; sessionGet: boolean } | undefined, abortRequests: [] as Awaited<ReturnType<typeof observeFrontend>>["requests"] }
  const teardown = { recorder: undefined as ReturnType<Awaited<ReturnType<typeof windowsInventory>>["snapshot"]> | undefined, cleanupComplete: false }
  const steps: string[] = []
  const step = (line: string) => { steps.push(`${new Date().toISOString()} ${line}`); console.error(`[v1] ${line}`) }
  return finishCampaign("v1-background", async () => { try {
    const prompt = "Start the background campaign tree, then finish the turn."
    if (win) recorder.inventory = await windowsInventory(env)
    const host = await serve(cli(), ["serve", "--port", "0", "--hostname", "127.0.0.1"], env, scratch.project)
    processHost.proc = host.proc
    const api = client(host.url, scratch.project)
    const title = `esc-${randomUUID().slice(0, 12)}`
    const session = await api.session()
    await api.post(`/api/session/${session.id}/rename`, { title })
    step(`host ${host.pid}; session ${session.id}; nonce ${tree.nonce}; home ${scratch.home}`)
    await api.prompt(session.id, prompt)
    const pinnedHost = host.identity ?? identity(host.pid)
    const before = await until(90_000, "every exact background member protected", async () => {
      const found = control(tree.nonce, tree.size, [pinnedHost], recorder.inventory ? await recorder.inventory.query() : undefined)
      return found.pass ? found : undefined
    })
    writeFileSync(release, "release\n")
    const completed = await until(30_000, "completed bash tool and final assistant turn", async () => {
      const tool = (await api.tools(session.id)).find((call) => call.tool === "bash")
      if (tool?.status === "error") throw new Error(`bash failed: ${JSON.stringify(tool.error)}`)
      return tool?.status === "completed" && !(await api.active())[session.id] ? { time: { start: tool.start, end: tool.end } } : undefined
    })
    const toolMs = completed.time?.end === undefined ? undefined : completed.time.end - completed.time.start
    if (toolMs === undefined) throw new Error("completed tool has no start/end timing")
    step(`turn finished; tool ${toolMs} ms; full positive control ${JSON.stringify(before)}`)
    if (process.env.OMNI_CAMPAIGN_MUTATION === "omit-adoption") {
      // Remove the actual registered job, rather than falsifying an HTTP response or masking the oracle.
      const job = await until(20_000, "registered job for omission fault", async () => {
        const jobs = await api.processes(session.id)
        return jobs.find((job) => job.processes.some((node) => before.fixtureIds.some((id) => id.pid === node.pid)))
      })
      await api.post(`/api/session/${session.id}/processes/${job.id}/stop`)
    }
    const adopted = await until(process.env.OMNI_CAMPAIGN_MUTATION === "omit-adoption" ? 3000 : 20_000, "exact tree adopted after tool completion", async () => {
      const jobs = await api.processes(session.id)
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
      const jobs = await api.processes(session.id)
      return jobs.find((job) => job.id === adopted.id && job.written > adopted.written && job.output.includes(marker))
    })
    const afterTurn = await remaining(tree.nonce)
    const afterEsc = win ? await (async () => {
      frontend.proxy = await observeFrontend(host.url)
      terminalHost.host = await consoleHost(env, scratch.project, { attach: frontend.proxy.url, sessionID: session.id }, [], recorder.inventory)
      const ui = terminalHost.host
      await api.prompt(session.id, foregroundPrompt)
      esc.before = await until(90_000, "foreground tool live, busy, displayed on attached same-session UI", async () => {
        if (ui.state.exit) throw new Error(`attached UI exited before foreground control: ${JSON.stringify(ui.state.exit)}`)
        const rows = await recorder.inventory!.query()
        const found = control(foreground.nonce, foreground.size, [pinnedHost], rows)
        const tool = foregroundTool(await api.tools(session.id), foreground.nonce)
        const status = Object.fromEntries(Object.keys(await api.active()).map((id) => [id, { type: "busy" }])) as Record<string, { type: string }>
        const output = stripVTControlCharacters(ui.out()).replaceAll("\r", "")
        esc.probe = { protected: found.pass, toolStatus: tool?.state?.status, status: status[session.id]?.type, title: output.includes(title), interrupt: output.includes("interrupt"), sessionGet: frontend.proxy!.requests.some((request) => request.method === "GET" && request.path === `/api/session/${session.id}` && request.status === 200) }
        return esc.probe.protected && esc.probe.toolStatus === "running" && esc.probe.status === "busy" && esc.probe.title && esc.probe.interrupt && esc.probe.sessionGet ? found : undefined
      })
      esc.displayedSession = session.id
      const abortPath = `/api/session/${session.id}/interrupt`
      if (frontend.proxy.requests.some((request) => request.path === abortPath)) throw new Error("frontend aborted before Esc injection")
      const outputAt = ui.out().length
      const injected = Date.now()
      if (process.env.OMNI_CAMPAIGN_MUTATION !== "disable-esc") {
        await consoleInput(ui, "Escape", recorder.inventory)
        esc.sent++
        await until(4000, "first Esc acknowledged by real UI", () => stripVTControlCharacters(ui.out().slice(outputAt)).replaceAll("\r", "").includes("again to interrupt") ? true : undefined)
        esc.firstAcknowledged = true
        await consoleInput(ui, "Escape", recorder.inventory)
        esc.sent++
      }
      const canceled = await until(20_000, "foreground cancel from two frontend Esc", async () => {
        esc.abortRequests = frontend.proxy!.requests.filter((request) => request.method === "POST" && request.path === abortPath && request.at >= injected)
        const tool = foregroundTool(await api.tools(session.id), foreground.nonce)
        const found = members(foreground.nonce, await recorder.inventory!.query())
        if (ui.state.exit) throw new Error("attached UI exited instead of canceling foreground")
        // Processor interruption and Shell's completed-but-aborted result are both durable cancellation
        // projections (session/processor.ts and tool/shell.ts). Normal completion is never cancellation.
        const cancellation = tool?.state?.status === "error" ? "processor-interrupted"
          : tool?.state?.status === "completed" && tool.state.metadata?.exit === null ? "shell-aborted" : undefined
        return esc.abortRequests.length === 1 && esc.abortRequests[0]!.status === 200 && cancellation !== undefined && found.members.length === 0 && found.wrappers.length === 0 ? { cancellation, tool: tool!.state!, foregroundRemaining: 0, cancelMs: Date.now() - injected } : undefined
      })
      const next = `post-escape-${randomUUID()}`
      writeFileSync(channel, next)
      const survived = await until(20_000, "original adopted identities and fresh output surviving two Esc", async () => {
        const jobs = await api.processes(session.id)
        const found = members(tree.nonce, await recorder.inventory!.query())
        return found.members.length === tree.size && found.members.every((row) => before.fixtureIds.some((original) => matches(row, original))) && jobs.some((job) => job.id === adopted.id && job.written > listed.written && job.output.includes(next)) ? { marker: next, count: found.members.length, fixtureIds: found.members.map((row) => identity(row.pid, found.members)) } : undefined
      })
      return { ...canceled, ...survived, pass: esc.sent === 2 && esc.firstAcknowledged }
    })() : undefined
    const removed = Date.now()
    await until(20_000, "Session.remove stopping adopted nonce tree", async () => {
      await api.del(`/api/session/${session.id}`)
      return until(20_000 - (Date.now() - removed), "adopted tree gone", async () => (await remaining(tree.nonce)) === 0 ? true : undefined)
    })
    const afterRemove = await remaining(tree.nonce)
    const stopMs = Date.now() - removed
    step(`Session.remove stopped tree in ${stopMs} ms`)
    return {
      kpi: "tool returns within 20 s against a 600 s hang; background tree survives turn, is listed with output, stops on Session.remove",
      home: scratch.home, nonce: tree.nonce, foregroundNonce: foreground.nonce, sessionID: session.id, pinnedHost, before, toolMs, adopted, marker, markerSent, listed, afterTurn, afterEsc, esc, afterRemove, stopMs, recorderPreparationMs: recorder.inventory?.preparationMs, teardown,
      llm: llm.seen, offered: llm.offered, protocolErrors: llm.errors, pass: before.pass && toolMs <= 20_000 && afterTurn === tree.size && (!win || afterEsc?.pass === true) && afterRemove === 0 && stopMs < 20_000 && llm.errors.length === 0, steps,
    }
  } catch (error) {
    return { pass: false, error: String(error), home: scratch.home, nonce: tree.nonce, foregroundNonce: foreground.nonce, esc, teardown, llm: llm.seen, offered: llm.offered, output: terminalHost.host?.out().slice(-4000), steps }
  } }, async () => {
    try {
      step("teardown attached terminal")
      try { if (terminalHost.host) await until(6000, "attached ConPTY teardown", () => terminalHost.host!.terminal.stop().then(() => true)) }
      finally {
        step("teardown frontend proxy")
        try { await frontend.proxy?.stop() }
        finally {
          step("teardown two-stage LLM")
          try { await llm.stop() }
          finally {
            step("teardown owned serve host")
            if (processHost.proc?.exitCode === null && processHost.proc.signalCode === null) processHost.proc.kill("SIGKILL")
            await until(10_000, "post-observation V1 fixtures and serve teardown", async () => {
              const rows = recorder.inventory ? await recorder.inventory.query() : undefined
              return [tree.nonce, foreground.nonce].every((nonce) => { const found = members(nonce, rows); return found.members.length === 0 && found.wrappers.length === 0 }) && (processHost.proc?.exitCode !== null || processHost.proc.signalCode !== null) ? true : undefined
            })
          }
        }
      }
    }
    finally {
      try { await recorder.inventory?.stop() }
      finally {
        step("teardown shared cleanup")
        teardown.recorder = recorder.inventory?.snapshot()
        await cleanup(scratch.home, [tree.nonce, foreground.nonce])
        teardown.cleanupComplete = true
      }
    }
  })
}

if (import.meta.main) process.exit((await run()).pass ? 0 : 1)
