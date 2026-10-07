// V6 terminal slice: real /pty API + WS, real vim edit/resize, UTF-16 replay, 50 MiB producer completion.
// TUI quit belongs to the lifecycle owner; this verdict cannot claim full WP10 V6 acceptance.
// ORCHESTRA_LOCAL_TESTS=1 bun packages/omni/campaign/v6-terminal.ts [--mutation-missing-replay]
import { randomUUID, createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { supervised, sweep, until, verdict, win } from "./lib.ts"
import { api, evidence, finish, fixture, main, plain, processTable, script, start } from "./protocol-fixtures.ts"

type Terminal = { id: string; pid: number }

export async function run(options: { mutation?: "missing-replay" } = {}) {
  const scratch = fixture("v6-terminal", { lsp: false })
  const nonce = `omni-terminal-${randomUUID()}`
  const metrics: Record<string, unknown> = {}
  const checks: Record<string, string> = { vim: "not-run", resize: "not-run", replay: "not-run", output: "not-run" }
  const sockets: WebSocket[] = []
  const errors: string[] = []
  const ids: string[] = []
  const hash = (text: string) => createHash("sha256").update(text).digest("hex")
  try {
    processTable()
    const host = await start(scratch)
    const call = api(host.url, scratch.project)
    const boot = Date.now()
    await call("GET", "/lsp")
    metrics.bootstrapMs = Date.now() - boot
    const attach = async (id: string, cursor?: number) => {
      const url = new URL(`/pty/${id}/connect`, host.url)
      url.protocol = "ws:"
      url.searchParams.set("directory", scratch.project)
      if (cursor !== undefined) url.searchParams.set("cursor", String(cursor))
      const ws = new WebSocket(url)
      sockets.push(ws)
      ws.binaryType = "arraybuffer"
      const state = { text: "", replay: "", meta: undefined as number | undefined, frames: 0, wireBytes: 0, error: "" }
      ws.addEventListener("error", () => { state.error = "WebSocket error" })
      ws.addEventListener("message", (event) => {
        state.frames++
        const data = typeof event.data === "string" ? new TextEncoder().encode(event.data) : new Uint8Array(event.data as ArrayBuffer)
        state.wireBytes += data.byteLength
        if (data[0] === 0) {
          const frame = JSON.parse(new TextDecoder().decode(data.subarray(1))) as { cursor: number }
          state.meta = frame.cursor
          state.replay = state.text
          return
        }
        state.text += new TextDecoder().decode(data)
      })
      await until(20_000, "terminal WS replay cursor", () => {
        if (state.error) throw new Error(state.error)
        return state.meta !== undefined ? true : undefined
      })
      const close = async () => {
        if (ws.readyState === WebSocket.CLOSED) return
        ws.close()
        await until(10_000, "WS close", () => ws.readyState === WebSocket.CLOSED ? true : undefined)
      }
      return { ws, state, close }
    }

    // Use an actual editor, not a terminal-shaped fixture. A missing vim is a failed capability, never green.
    try {
      const edited = path.join(scratch.home, `${nonce}.edited`)
      const size = path.join(scratch.home, `${nonce}.vim-size`)
      const vim = await call<Terminal>("POST", "/pty", {
        command: process.env.OMNI_CAMPAIGN_VIM ?? (win ? "vim.exe" : "vim"),
        args: ["-Nu", "NONE", "-n", "-i", "NONE", edited], cols: 100, rows: 30,
      })
      ids.push(vim.id)
      const editor = await attach(vim.id)
      await until(30_000, "vim screen", () => plain(editor.state.text).includes("[New") ? true : undefined)
      metrics.vimSupervised = supervised(nonce)
      if (!metrics.vimSupervised) throw new Error("vim supervisor positive control failed")
      editor.ws.send(`iEDIT-${nonce}\x1b:w\r`)
      await until(20_000, "vim interactive write", () => existsSync(edited) && readFileSync(edited, "utf8").includes(`EDIT-${nonce}`) ? true : undefined)
      const query = `:call writefile([string(&lines) . ' ' . string(&columns)], '${size.replaceAll("\\", "/").replaceAll("'", "''")}')\r`
      editor.ws.send(query)
      await until(20_000, "vim initial size 30x100", () => existsSync(size) && readFileSync(size, "utf8").trim() === "30 100" ? true : undefined)
      await call("PUT", `/pty/${vim.id}`, { size: { cols: 120, rows: 40 } })
      editor.ws.send(query)
      await until(20_000, "vim resized size 40x120", () => readFileSync(size, "utf8").trim() === "40 120" ? true : undefined)
      metrics.vimSize = readFileSync(size, "utf8").trim()
      metrics.vimEdited = readFileSync(edited, "utf8").trim()
      editor.ws.send(":q!\r")
      await until(20_000, "vim exits after interactive quit", async () => (await sweep(nonce)).length === 0 ? true : undefined)
      writeFileSync(path.join(scratch.home, "vim.ws.txt"), editor.state.text)
      checks.vim = "passed"
    } catch (cause) { checks.vim = "failed"; errors.push(`vim: ${String(cause)}`) }

    const done = path.join(scratch.home, `${nonce}.producer.json`)
    const producer = script(scratch, nonce, `
const fs = require('node:fs');
const readline = require('node:readline');
const nonce = process.argv[2];
process.stdout.write('READY-' + nonce + '\\n');
readline.createInterface({input: process.stdin}).on('line', line => {
  if (line === 'size') process.stdout.write('SIZE ' + process.stdout.rows + ' ' + process.stdout.columns + '\\n');
  if (line === 'unicode') process.stdout.write('aé😀b '.repeat(500) + 'UNICODE-' + nonce + '\\n');
  if (line === 'more') process.stdout.write('MISSED-é😀-' + nonce + '\\n');
  if (line === 'flood') {
    const block = Buffer.from(('x'.repeat(1023) + '\\n').repeat(1024));
    const start = Date.now();
    let bytes = 0;
    for (let i = 0; i < 50; i++) {
      let offset = 0;
      while (offset < block.length) {
        const written = fs.writeSync(1, block, offset, block.length - offset);
        if (written <= 0) throw Error('producer write made no progress');
        offset += written; bytes += written;
      }
    }
    fs.writeFileSync(${JSON.stringify(done)}, JSON.stringify({bytes, completed: true, ms: Date.now() - start}));
    fs.writeSync(1, 'PRODUCER-DONE-' + nonce + '\\n');
  }
});
`)
    const terminal = await call<Terminal>("POST", "/pty", { command: scratch.node, args: [producer, nonce], cols: 100, rows: 30 })
    ids.push(terminal.id)
    const first = await attach(terminal.id, 0)
    await until(20_000, "producer READY", () => first.state.text.includes(`READY-${nonce}`) ? true : undefined)
    metrics.producerSupervised = supervised(nonce)
    metrics.processTablePositive = (await sweep(nonce)).length
    if (!metrics.producerSupervised || Number(metrics.processTablePositive) < 1) throw new Error("PTY supervision positive control failed")
    try {
      first.ws.send("size\r")
      await until(20_000, "PTY initial size", () => plain(first.state.text).includes("SIZE 30 100") ? true : undefined)
      await call("PUT", `/pty/${terminal.id}`, { size: { cols: 120, rows: 40 } })
      first.ws.send("size\r")
      await until(20_000, "PTY resized size", () => plain(first.state.text).includes("SIZE 40 120") ? true : undefined)
      metrics.size = "40 120"
      checks.resize = "passed"
    } catch (cause) { checks.resize = "failed"; errors.push(`resize: ${String(cause)}`) }
    try {
      first.ws.send("unicode\r")
      await until(20_000, "Unicode replay seed", () => plain(first.state.text).includes(`UNICODE-${nonce}`) ? true : undefined)
      const snapshot = await attach(terminal.id, 0)
      if (snapshot.state.replay !== first.state.text.slice(0, snapshot.state.meta) || snapshot.state.meta !== snapshot.state.replay.length)
        throw new Error("initial replay differs from live UTF-16 stream/cursor")
      const cursor = snapshot.state.meta!
      const baseline = snapshot.state.replay
      await snapshot.close()
      await first.close()
      const observer = await attach(terminal.id, -1)
      observer.ws.send("more\r")
      await until(20_000, "output while original client disconnected", () => observer.state.text.includes(`MISSED-é😀-${nonce}`) ? true : undefined)
      const reconnect = await attach(terminal.id, options.mutation ? -1 : cursor)
      const whole = await attach(terminal.id, 0)
      const expected = whole.state.replay.slice(cursor, reconnect.state.meta)
      metrics.replay = { requestedCursor: cursor, returnedCursor: reconnect.state.meta, wholeCursor: whole.state.meta,
        expectedUnits: expected.length, receivedUnits: reconnect.state.replay.length,
        expectedSha256: hash(expected), receivedSha256: hash(reconnect.state.replay), utf16: true }
      if (whole.state.replay.slice(0, cursor) !== baseline || expected.length === 0 || expected !== reconnect.state.replay ||
        reconnect.state.meta !== cursor + reconnect.state.replay.length || whole.state.meta !== whole.state.replay.length)
        throw new Error("reconnection replay/cursor mismatch (missing replay)")
      writeFileSync(path.join(scratch.home, "replay.ws.txt"), whole.state.replay)
      await Promise.all([observer.close(), reconnect.close(), whole.close()])
      checks.replay = "passed"
    } catch (cause) { checks.replay = "failed"; errors.push(`replay: ${String(cause)}`) }
    try {
      const output = await attach(terminal.id, -1)
      const started = Date.now()
      const healthMs: number[] = []
      output.ws.send("flood\r")
      await until(120_000, "50 MiB producer completion and terminal end marker", async () => {
        const probe = Date.now()
        await call("GET", "/global/health", undefined, 10_000)
        healthMs.push(Date.now() - probe)
        return existsSync(done) && output.state.text.includes(`PRODUCER-DONE-${nonce}`) ? true : undefined
      })
      const produced = JSON.parse(readFileSync(done, "utf8")) as { bytes: number; completed: boolean; ms: number }
      if (!produced.completed || produced.bytes !== 50 * 1024 * 1024) throw new Error("producer did not finish exactly 50 MiB")
      const from = output.state.text.length
      output.ws.send("size\r")
      await until(20_000, "terminal responds after flood", () => plain(output.state.text.slice(from)).includes("SIZE 40 120") ? true : undefined)
      metrics.output = { ...produced, elapsedMs: Date.now() - started, receivedUTF16: output.state.text.length,
        wireBytes: output.state.wireBytes, frames: output.state.frames, gaps: [...output.state.text.matchAll(/\[orchestra: (\d+) bytes of output skipped\]/g)].map((m) => Number(m[1])),
        healthProbes: healthMs.length, maxHealthMs: Math.max(...healthMs), postFloodResponsive: true }
      await output.close()
      checks.output = "passed"
    } catch (cause) {
      checks.output = "failed"
      errors.push(`output: ${String(cause)}`)
      // Producer progress is independent of HTTP/WS health: keep it even when responsiveness fails.
      metrics.outputFailure = { producer: existsSync(done) ? JSON.parse(readFileSync(done, "utf8")) : null,
        healthTimeoutMs: 10_000, failure: String(cause) }
    }
    // Also discover sessions from a create whose HTTP request timed out after admission.
    const owned = await call<Terminal[]>("GET", "/pty")
    for (const id of new Set([...ids, ...owned.map((terminal) => terminal.id)]))
      await call("DELETE", `/pty/${id}`).catch((cause) => { errors.push(`remove ${id}: ${String(cause)}`) })
    await until(8_000, "terminal nonce processes gone", async () => (await sweep(nonce)).length === 0 ? true : undefined)
    metrics.leftovers = (await sweep(nonce)).length
  } catch (cause) { errors.push(String(cause)) }
  finally {
    for (const ws of sockets) if (ws.readyState !== WebSocket.CLOSED) ws.close()
    metrics.beforeCleanup = await sweep(nonce)
    await finish(scratch).catch((cause) => { errors.push(`teardown: ${String(cause)}`) })
  }
  const pass = errors.length === 0 && Object.values(checks).every((status) => status === "passed")
  const result = verdict("v6-terminal", { ...evidence(scratch), pass, status: pass ? "passed-local-terminal-slice" : "failed-local",
    wp10Complete: false, tuiQuit: { status: "not-run", owner: "lifecycle", pass: null },
    mutation: options.mutation ?? null, checks, metrics, errors,
    capability: { editor: process.env.OMNI_CAMPAIGN_VIM ?? "vim", websocket: typeof WebSocket, windows: "requires vim.exe + ConPTY", skipped: [] },
  })
  return { ...result, pass }
}

if (main(import.meta.url)) {
  const result = await run(process.argv.includes("--mutation-missing-replay") ? { mutation: "missing-replay" } : {})
  process.exitCode = result.pass ? 0 : 1
}
