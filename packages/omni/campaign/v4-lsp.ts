// V4: actual typescript-language-server/tsserver behind a node wrapper, launched by compiled Orchestra LSP service.
// Twenty explicit crash -> Instance.dispose -> restart cycles. Automatic in-instance recovery measured separately.
// npm install --prefix packages/omni/campaign/logs/tools --ignore-scripts typescript-language-server@4.3.4 typescript@5.8.2
// ORCHESTRA_LOCAL_TESTS=1 bun packages/omni/campaign/v4-lsp.ts [--mutation-legacy]
import { createServer } from "node:http"
import { cpSync, existsSync, readFileSync, appendFileSync } from "node:fs"
import path from "node:path"
import { alive, fileTree, kill9, LOGS, provider, supervised, sweep, until, verdict } from "./lib.ts"
import { api, evidence, finish, fixture, main, processTable, script, start } from "./protocol-fixtures.ts"

export async function run(options: { mutation?: "legacy" } = {}) {
  const scratch = fixture("v4-lsp")
  const tree = fileTree(scratch.home, 1)
  const cycles: { cycle: number; live: number; tsservers: number; recorded: number; supervised: boolean;
    crashMs: number; stopMs: number; left: number; idleNonceCount: number }[] = []
  const findings: string[] = []
  let error: string | undefined
  let automaticRestart: boolean | undefined
  let autoRecoveryStatus: unknown
  let pass = false
  let llm: ReturnType<typeof createServer> | undefined
  const rpcLog = path.join(scratch.home, `${tree.nonce}.rpc.jsonl`)
  const wrapperLog = path.join(scratch.home, `${tree.nonce}.wrapper.jsonl`)
  try {
    processTable()
    const tools = process.env.OMNI_CAMPAIGN_LSP_TOOLS ?? path.join(LOGS, "tools/node_modules")
    const source = path.join(tools, "typescript-language-server/lib/cli.mjs")
    const tsSource = path.join(tools, "typescript")
    if (!existsSync(source) || !existsSync(tsSource)) throw new Error(`LSP capability missing: install pinned tools in ${tools}`)
    for (const [name, expected] of [["typescript-language-server", "4.3.4"], ["typescript", "5.8.2"]]) {
      const installed = JSON.parse(readFileSync(path.join(tools, name, "package.json"), "utf8")) as { version: string }
      if (installed.version !== expected) throw new Error(`LSP capability version mismatch: ${name} ${installed.version}, expected ${expected}`)
    }
    const ts = path.join(scratch.home, tree.nonce, "typescript")
    cpSync(tsSource, ts, { recursive: true })
    const languageServer = path.join(scratch.home, tree.nonce, "typescript-language-server/lib/cli.mjs")
    cpSync(path.join(tools, "typescript-language-server"), path.dirname(path.dirname(languageServer)), { recursive: true })
    const wrapper = script(scratch, `${tree.nonce}-wrapper`, `
const fs = require('node:fs');
const cp = require('node:child_process');
const server = cp.spawn(process.execPath, [${JSON.stringify(languageServer)}, '--stdio'], {stdio: ['pipe', 'pipe', 'pipe']});
server.stderr.on('data', chunk => { fs.appendFileSync(${JSON.stringify(path.join(scratch.home, "language-server.stderr.log"))}, chunk); process.stderr.write(chunk); });
server.on('exit', (code, signal) => fs.appendFileSync(${JSON.stringify(wrapperLog)}, JSON.stringify({serverExit: server.pid, code, signal}) + '\\n'));
cp.spawn(process.execPath, ${JSON.stringify(tree.args)}, {stdio: 'ignore'});
fs.appendFileSync(${JSON.stringify(wrapperLog)}, JSON.stringify({pid: process.pid, server: server.pid, at: Date.now()}) + '\\n');
let input = Buffer.alloc(0);
process.stdin.on('data', chunk => {
  input = Buffer.concat([input, chunk]);
  for (;;) {
    const end = input.indexOf('\\r\\n\\r\\n'); if (end < 0) break;
    const length = Number(input.subarray(0, end).toString().match(/Content-Length: (\\d+)/i)?.[1]);
    if (!Number.isFinite(length)) throw Error('invalid LSP framing');
    if (input.length < end + 4 + length) break;
    const message = JSON.parse(input.subarray(end + 4, end + 4 + length));
    fs.appendFileSync(${JSON.stringify(rpcLog)}, JSON.stringify({pid: process.pid, method: message.method, at: Date.now()}) + '\\n');
    input = input.subarray(end + 4 + length);
  }
  server.stdin.write(chunk);
});
server.stdout.pipe(process.stdout);
process.stdin.on('end', () => server.stdin.end());
// npx-equivalent wrapper remains alive when its server crashes: product shutdown owns descendants.
setInterval(() => {}, 1e9);
`)
    const calls: { method: string; tool: boolean; at: number }[] = []
    const drive = { writes: 0, armed: true }
    llm = createServer((request, response) => {
      let body = ""
      request.on("data", (chunk) => { body += chunk })
      request.on("end", () => {
        const input = JSON.parse(body) as { tools?: { function: { name: string } }[] }
        const tool = drive.armed && !!input.tools?.some((entry) => entry.function.name === "write")
        if (tool) { drive.armed = false; drive.writes++ }
        calls.push({ method: request.url ?? "", tool, at: Date.now() })
        response.writeHead(200, { "content-type": "text/event-stream" })
        const send = (delta: unknown, finish_reason?: string) => response.write(`data: ${JSON.stringify({
          id: "campaign", object: "chat.completion.chunk", choices: [{ index: 0, delta, finish_reason }],
        })}\n\n`)
        send({ role: "assistant" })
        send(tool ? { tool_calls: [{ index: 0, id: `write_${drive.writes}`, type: "function", function: {
          name: "write", arguments: JSON.stringify({ filePath: path.join(scratch.project, "b.ts"), content: `export const b = ${drive.writes}\n` }),
        } }] } : { content: "done" })
        send({}, tool ? "tool_calls" : "stop")
        response.end("data: [DONE]\n\n")
      })
    })
    await new Promise<void>((resolve) => llm!.listen(0, "127.0.0.1", resolve))
    const port = (llm.address() as { port: number }).port
    const config = {
      plugin: [], formatter: false, share: "disabled", model: "test/test-model", default_agent: "campaign",
      agent: { campaign: { mode: "primary", prompt: "Use the write tool, then finish.", permission: { "*": "allow" } } },
      permission: { "*": "allow", edit: "allow", external_directory: "allow" }, provider: provider(`http://127.0.0.1:${port}/v1`),
      lsp: {
        ...Object.fromEntries(["typescript", "deno", "eslint", "oxlint", "biome"].map((id) => [id, { disabled: true }])),
        campaign: { command: [scratch.node, wrapper, tree.nonce], extensions: [".ts"],
          initialization: { disableAutomaticTypingAcquisition: true, tsserver: { path: path.join(ts, "lib/tsserver.js") } } },
      },
    }
    scratch.env.OPENCODE_CONFIG_CONTENT = JSON.stringify(config)
    if (options.mutation) scratch.env.OPENCODE_EXPERIMENTAL_OMNI_SPAWNER = "0"
    const host = await start(scratch)
    const call = api(host.url, scratch.project)
    const trigger = async () => {
      drive.armed = true
      const session = await call<{ id: string }>("POST", "/session", {}, 120_000)
      const response = await call("POST", `/session/${session.id}/message`, {
        agent: "campaign", model: { providerID: "test", modelID: "test-model" }, parts: [{ type: "text", text: "Write b.ts." }],
      }, 120_000)
      appendFileSync(path.join(scratch.home, "prompt.responses.jsonl"), JSON.stringify(response) + "\n")
    }
    const rows = () => processTable().filter((row) => row.args.includes(tree.nonce))
    const rpc = () => existsSync(rpcLog) ? readFileSync(rpcLog, "utf8").trim().split("\n").map((line) => JSON.parse(line) as { pid: number; method: string }) : []
    for (let cycle = 0; cycle < 20; cycle++) {
      console.error(`[v4-lsp] cycle ${cycle + 1}/20`)
      await trigger()
      const live = await until(45_000, "wrapper, real tsserver and nonce tree", async () => {
        const current = rows()
        const wrapperRow = current.find((row) => row.args.includes(wrapper))
        const tsservers = current.filter((row) => row.args.includes("tsserver.js"))
        const recorded = await alive(tree.nonce)
        // Pinned TLS starts syntax and semantic tsservers; wait for both before counting processes.
        return wrapperRow && tsservers.length === 2 && recorded === tree.size &&
          ["initialize", "initialized", "textDocument/didOpen"].every((method) => rpc().some((event) => event.pid === wrapperRow.pid && event.method === method))
          ? { current, wrapperRow, tsservers, recorded } : undefined
      })
      const control = supervised(tree.nonce)
      if (!control) throw new Error("LSP supervisor positive control failed (legacy transport)")
      const server = live.current.find((row) => row.parent === live.wrapperRow.pid && row.args.includes(languageServer))
      if (!server) throw new Error("node wrapper did not launch real language server")
      const crashed = Date.now()
      // Crash Orchestra's actual LSP handle (the node/npx-equivalent wrapper), leaving its descendants to shutdown.
      if (!kill9(live.wrapperRow.pid)) throw new Error("LSP crash injection failed")
      await until(10_000, "LSP wrapper crash observed", () => rows().every((row) => row.pid !== live.wrapperRow.pid) ? true : undefined)
      // Cycle 0 also probes natural recovery without clearing cached LSP clients.
      if (cycle === 0) {
        await trigger()
        automaticRestart = rows().some((row) => row.args.includes(wrapper) && row.pid !== live.wrapperRow.pid)
        autoRecoveryStatus = await call("GET", "/lsp")
        if (!automaticRestart) findings.push("LSP service reuses dead cached client; another write does not restart server. Explicit /instance/dispose required.")
      }
      const stopped = Date.now()
      await call("POST", "/instance/dispose", {}, 30_000)
      await until(8_000, "no nonce leftovers after LSP shutdown", async () => (await sweep(tree.nonce)).length === 0 ? true : undefined)
      const left = (await sweep(tree.nonce)).length
      cycles.push({ cycle: cycle + 1, live: live.current.length, tsservers: live.tsservers.length, recorded: live.recorded,
        supervised: control, crashMs: stopped - crashed, stopMs: Date.now() - stopped, left, idleNonceCount: rows().length })
    }
    const counts = cycles.map((cycle) => cycle.live)
    pass = cycles.length === 20 && new Set(counts).size === 1 && cycles.every((cycle) => cycle.left === 0 && cycle.idleNonceCount === 0)
    if (!pass) error = "LSP cycle count/leftovers/process-count KPI failed"
    appendFileSync(path.join(scratch.home, "llm.calls.json"), JSON.stringify({ calls, writes: drive.writes }))
  } catch (cause) { error = String(cause) }
  finally {
    llm?.closeAllConnections()
    llm?.close()
    await finish(scratch, [tree.nonce]).catch((cause) => { pass = false; error = `${error ?? ""} teardown: ${String(cause)}` })
  }
  const result = verdict("v4-lsp", { ...evidence(scratch), pass, status: pass ? "passed-local-explicit-restart" : "failed-local",
    mutation: options.mutation ?? null, cyclesCompleted: cycles.length, cycles,
    automaticRecovery: { pass: automaticRestart ?? null, statusAfterCrashAndWrite: autoRecoveryStatus }, findings, error,
    wp10Complete: pass && automaticRestart === true,
    protocolLog: rpcLog, wrapperLog, capability: { wrapper: "node (npx-equivalent)", lsp: "typescript-language-server 4.3.4 + TypeScript 5.8.2", oracle: "shared records + independent nonce process-table sweep", skipped: [] },
  })
  return { ...result, pass }
}

if (main(import.meta.url)) {
  const result = await run(process.argv.includes("--mutation-legacy") ? { mutation: "legacy" } : {})
  process.exitCode = result.pass ? 0 : 1
}
