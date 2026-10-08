// V6 terminal slice: real /pty API + WS, real vim edit/resize, UTF-16 replay, 50 MiB producer completion.
// TUI quit belongs to the lifecycle owner; this verdict cannot claim full WP10 V6 acceptance.
// ORCHESTRA_LOCAL_TESTS=1 bun packages/omni/campaign/v6-terminal.ts [--mutation-missing-replay]
import { randomUUID, createHash } from "node:crypto"
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { adoptTree, markerArgument, supervised, sweep, until, verdict, win } from "./lib.ts"
import { api, evidence, finalSweep, finish, fixture, main, plain, processTable, script, start } from "./protocol-fixtures.ts"
import { byteFixture, byteStats, exactRaw } from "./pty-byte-probe.ts"

type Terminal = { id: string; pid: number }

export async function run(options: { mutation?: "missing-replay" | "truncated-replay" | "gap-count" } = {}) {
  const scratch = fixture("v6-terminal", { lsp: false })
  const nonce = `omni-terminal-${randomUUID()}`
  adoptTree(scratch.home, nonce)
  markerArgument(nonce, path.join(scratch.home, `${nonce}.edited`))
  const missed = `MISSED-BEGIN-${nonce}-é😀-${randomUUID()}-MISSED-END-${nonce}`
  const metrics: Record<string, unknown> = {}
  const checks: Record<string, string> = { vim: "not-run", resize: "not-run", replay: "not-run", output: "not-run", rawAccounting: "not-run" }
  const sockets: WebSocket[] = []
  const errors: string[] = []
  const ids: string[] = []
  const hash = (text: string) => createHash("sha256").update(text).digest("hex")
  const gap = /\x1b\[0m\r\n\[orchestra: (\d+) bytes of output skipped\]\r\n/g
  try {
    processTable()
    const host = await start(scratch)
    const call = api(host.url, scratch.project)
    const boot = Date.now()
    await call("GET", "/lsp")
    metrics.bootstrapMs = Date.now() - boot
    const attach = async (id: string, cursor?: number, fault?: "truncate" | "gap-count") => {
      const url = new URL(`/pty/${id}/connect`, host.url)
      url.protocol = "ws:"
      url.searchParams.set("directory", scratch.project)
      if (cursor !== undefined) url.searchParams.set("cursor", String(cursor))
      const ws = new WebSocket(url)
      sockets.push(ws)
      ws.binaryType = "arraybuffer"
      const state = { text: "", replay: "", meta: undefined as number | undefined, frames: 0, wireBytes: 0, error: "", lastDataAt: Date.now(), mutatedGaps: 0 }
      ws.addEventListener("error", () => { state.error = "WebSocket error" })
      ws.addEventListener("message", (event) => {
        state.frames++
        state.lastDataAt = Date.now()
        const data = typeof event.data === "string" ? new TextEncoder().encode(event.data) : new Uint8Array(event.data as ArrayBuffer)
        state.wireBytes += data.byteLength
        if (data[0] === 0) {
          const frame = JSON.parse(new TextDecoder().decode(data.subarray(1))) as { cursor: number }
          // Wire-boundary mutation: a consistent truncated prefix plus its shorter cursor fooled the old oracle.
          if (fault === "truncate") { state.text = state.text.slice(0, -7); frame.cursor -= 7 }
          state.meta = frame.cursor
          state.replay = state.text
          return
        }
        const text = new TextDecoder().decode(data)
        state.text += fault !== "gap-count" ? text : text.replace(/\[orchestra: (\d+) bytes of output skipped\]/g, (_, bytes: string) => {
          state.mutatedGaps++
          return `[orchestra: ${Number(bytes) + 1} bytes of output skipped]`
        })
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
    const quiet = (state: { lastDataAt: number }) => until(20_000, "terminal output quiescence", () =>
      Date.now() - state.lastDataAt >= 500 ? true : undefined)

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
const partial = {writes: 0, beforeLF: 0};
function write(text) {
  const block = Buffer.isBuffer(text) ? text : Buffer.from(text);
  let offset = 0;
  while (offset < block.length) {
    const written = fs.writeSync(1, block, offset, block.length - offset);
    if (written <= 0) throw Error('producer write made no progress');
    if (written < block.length - offset) { partial.writes++; if (block[offset + written] === 10) partial.beforeLF++; }
    offset += written;
  }
  return offset;
}
write('READY-' + nonce + '\\n');
readline.createInterface({input: process.stdin}).on('line', line => {
  if (line === 'size') write('SIZE ' + process.stdout.rows + ' ' + process.stdout.columns + '\\n');
  if (line === 'unicode') write('aé😀b '.repeat(500) + 'UNICODE-' + nonce + '\\n');
  if (line === 'more') write(${JSON.stringify(missed)} + '\\n');
  if (line === 'calibrate') write('CAL-' + nonce + '\\n');
  if (line === 'gap-control') write('\\x1b[0m\\n[orchestra: 7 bytes of output skipped]\\n');
  if (line === 'done') write('PRODUCER-DONE-' + nonce + '\\n');
  if (line === 'flood') {
    const block = Buffer.from(('x'.repeat(1023) + '\\n').repeat(1024));
    const start = Date.now();
    let bytes = 0;
    write('PAYLOAD-BEGIN-' + nonce + '\\n');
    for (let i = 0; i < 50; i++) bytes += write(block);
    const lines = block.reduce((count, byte) => count + (byte === 10 ? 1 : 0), 0) * 50;
    fs.writeFileSync(${JSON.stringify(done)}, JSON.stringify({bytes, lines, partial, completed: true, ms: Date.now() - start}));
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
      await quiet(first.state)
      const snapshot = await attach(terminal.id, 0)
      if (snapshot.state.replay !== first.state.text || snapshot.state.meta !== first.state.text.length)
        throw new Error("initial replay differs from live UTF-16 stream/cursor")
      const cursor = snapshot.state.meta!
      const baseline = snapshot.state.replay
      await snapshot.close()
      await first.close()
      const observer = await attach(terminal.id, -1)
      observer.ws.send("more\r")
      await until(20_000, "whole unique output while original client disconnected", () => observer.state.text.includes(missed) ? true : undefined)
      await quiet(observer.state)
      const whole = await attach(terminal.id, 0)
      const expectedEnd = whole.state.meta
      const expected = whole.state.replay.slice(cursor)
      const reconnect = await attach(terminal.id, options.mutation === "missing-replay" ? -1 : cursor,
        options.mutation === "truncated-replay" ? "truncate" : undefined)
      metrics.replay = { requestedCursor: cursor, returnedCursor: reconnect.state.meta, expectedEndCursor: expectedEnd,
        expectedUnits: expected.length, receivedUnits: reconnect.state.replay.length,
        expectedSha256: hash(expected), receivedSha256: hash(reconnect.state.replay), missed, utf16: true }
      if (whole.state.replay.slice(0, cursor) !== baseline || expected.length === 0 || expected !== reconnect.state.replay ||
        reconnect.state.meta !== expectedEnd || expectedEnd !== cursor + expected.length || expectedEnd !== whole.state.replay.length ||
        observer.state.text !== expected || !plain(expected).includes(missed) || !plain(reconnect.state.replay).includes(missed))
        throw new Error("reconnection replay differs from independent whole missed text/end cursor")
      writeFileSync(path.join(scratch.home, "replay.ws.txt"), whole.state.replay)
      await Promise.all([observer.close(), reconnect.close(), whole.close()])
      checks.replay = "passed"
    } catch (cause) { checks.replay = "failed"; errors.push(`replay: ${String(cause)}`) }
    try {
      metrics.outputTier = win ? "ConPTY cooked render/frame; no lossless byte promise" : "POSIX cooked responsiveness; raw identity checked separately"
      const output = await attach(terminal.id, -1)
      output.ws.send("calibrate\r")
      await until(20_000, "ASCII PTY echo/newline calibration", () => output.state.text.includes(`CAL-${nonce}`) ? true : undefined)
      await quiet(output.state)
      const calibration = `calibrate\r\nCAL-${nonce}\r\n`
      if (!win && output.state.text !== calibration) throw new Error(`PTY byte-accounting capability: non-canonical echo/rendering ${JSON.stringify(output.state.text)}`)
      if (!win) output.ws.send("gap-control\r")
      await until(20_000, "gap annotation parser positive control", () =>
        win || [...output.state.text.matchAll(gap)].some((match) => Number(match[1]) === 7) ? true : undefined)
      await quiet(output.state)
      metrics.syntheticGapParserPositiveControl = win ? "not applicable to ConPTY render frames" : 7
      const from = output.state.text.length
      const started = Date.now()
      const healthMs: number[] = []
      output.ws.send("flood\r")
      await until(120_000, "50 MiB producer completion", async () => {
        const probe = Date.now()
        await call("GET", "/global/health", undefined, 10_000)
        healthMs.push(Date.now() - probe)
        return existsSync(done) ? true : undefined
      })
      await quiet(output.state)
      // Flush a pending final lostBefore only after the producer finished and the consumer caught up.
      output.ws.send("done\r")
      await until(20_000, "post-completion terminal marker", () => plain(output.state.text).includes(`PRODUCER-DONE-${nonce}`) ? true : undefined)
      await quiet(output.state)
      const produced = JSON.parse(readFileSync(done, "utf8")) as { bytes: number; lines: number; completed: boolean; ms: number }
      if (!produced.completed || produced.bytes !== 50 * 1024 * 1024) throw new Error("producer did not finish exactly 50 MiB")
      const flood = output.state.text.slice(from)
      writeFileSync(path.join(scratch.home, "flood.ws.txt"), flood)
      metrics.gapDiagnostics = [...flood.matchAll(/\[orchestra: (\d+) bytes of output skipped\]/g)].map((match) => ({
        bytes: Number(match[1]), context: flood.slice(Math.max(0, match.index - 12), match.index + match[0].length + 12),
      }))
      metrics.asciiDiagnostics = { carriageReturns: [...flood.matchAll(/\r/g)].length,
        doubledCarriageReturns: [...flood.matchAll(/\r\r\n/g)].length, linefeeds: [...flood.matchAll(/\n/g)].length,
        prefix: flood.slice(0, 100), suffix: flood.slice(-100) }
      const gaps = [...flood.matchAll(gap)].map((match) => Number(match[1]))
      const received = flood.replace(gap, "")
      const prefix = `flood\r\nPAYLOAD-BEGIN-${nonce}\r\n`
      const suffix = `done\r\nPRODUCER-DONE-${nonce}\r\n`
      const expectedNativeBytes = produced.bytes + produced.lines + Buffer.byteLength(prefix + suffix)
      const lostNativeBytes = gaps.reduce((total, bytes) => total + bytes, 0)
      const receivedNativeBytes = Buffer.byteLength(received)
      metrics.byteAccounting = { expectedNativeBytes, receivedNativeBytes, lostNativeBytes, producerBytes: produced.bytes,
        newlineExpansionBytes: produced.lines, echoAndMarkerBytes: Buffer.byteLength(prefix + suffix), mutatedGaps: output.state.mutatedGaps }
      const tail = output.state.text.length
      output.ws.send("size\r")
      await until(20_000, "terminal responds after flood", () => plain(output.state.text.slice(tail)).includes("SIZE 40 120") ? true : undefined)
      metrics.output = { ...produced, elapsedMs: Date.now() - started, receivedUTF16: output.state.text.length,
        wireBytes: output.state.wireBytes, frames: output.state.frames, gaps,
        healthProbes: healthMs.length, maxHealthMs: Math.max(...healthMs), postFloodResponsive: true }
      // Cooked ONLCR is not a uniform LF -> CRLF byte function on macOS (independent OS PTY evidence above).
      // Preserve this original workload and raw transcript; byte identity is required separately with OPOST off.
      metrics.cookedByteIdentity = { claimed: false, discrepancyFromUniformONLCR: receivedNativeBytes + lostNativeBytes - expectedNativeBytes }
      await output.close()
      checks.output = "passed"
    } catch (cause) {
      checks.output = "failed"
      errors.push(`output: ${String(cause)}`)
      // Producer progress is independent of HTTP/WS health: keep it even when responsiveness fails.
      metrics.outputFailure = { producer: existsSync(done) ? JSON.parse(readFileSync(done, "utf8")) : null,
        healthTimeoutMs: 10_000, failure: String(cause) }
    }
    if (win) {
      checks.rawAccounting = "unsupported-ConPTY-no-POSIX-slave-termios"
      metrics.rawAccounting = { supported: false, pass: null, reason: "ConPTY render/frame output has no POSIX raw slave or lossless byte contract" }
    }
    if (!win) try {
      const files = byteFixture(scratch, nonce, "raw", "v6-raw")
      const raw = await call<Terminal>("POST", "/pty", { command: "python3", args: files.args, cols: 120, rows: 40 })
      ids.push(raw.id)
      const stream = await attach(raw.id, 0)
      await until(20_000, "raw producer ready + verified slave termios", () => existsSync(files.ready) && existsSync(files.termios) ? true : undefined)
      const mode = JSON.parse(readFileSync(files.termios, "utf8")) as { after: { OPOST: boolean; ECHO: boolean; ICANON: boolean; size: number[] } }
      if (mode.after.OPOST || mode.after.ECHO || mode.after.ICANON || mode.after.size.join(" ") !== "40 120")
        throw new Error("raw/no-translation terminal mode not observed on actual slave")
      stream.ws.send("go\n")
      await until(120_000, "raw 50 MiB producer completion", () => existsSync(files.receipt) ? true : undefined)
      stream.ws.send("done\n")
      await until(20_000, "raw terminal responds after completion", () => stream.state.text.includes(`PRODUCER-DONE-${nonce}\n`) ? true : undefined)
      stream.ws.send("quit\n")
      await until(20_000, "raw output drained and producer exited", () => stream.ws.readyState === WebSocket.CLOSED ? true : undefined)
      const source = readFileSync(files.source)
      const actual = Buffer.from(stream.state.text, "utf8")
      // Falsifying control at the receiving transport boundary: report an impossible gap in a complete raw stream.
      const observed = options.mutation === "gap-count" ? Buffer.concat([actual, Buffer.from("\x1b[0m\r\n[orchestra: 1 bytes of output skipped]\r\n")]) : actual
      writeFileSync(files.output, observed)
      const lost = [...observed.toString("utf8").matchAll(gap)].map((match) => Number(match[1]))
      const receipt = JSON.parse(readFileSync(files.receipt, "utf8")) as { written: number; sourceBytes: number; sourceSHA256: string }
      metrics.rawAccounting = { files, mode, receipt, actualWire: byteStats(actual), observed: byteStats(observed), source: byteStats(source), lostBefore: lost }
      if (receipt.written !== 50 * 1024 * 1024 || byteStats(source.subarray(0, receipt.sourceBytes)).sha256 !== receipt.sourceSHA256 ||
        !exactRaw(observed, source, lost)) throw new Error("raw PTY output differs from actual producer stdout or contains a gap")
      checks.rawAccounting = "passed"
    } catch (cause) { checks.rawAccounting = "failed"; errors.push(`raw-accounting: ${String(cause)}`) }
    // Also discover sessions from a create whose HTTP request timed out after admission.
    const owned = await call<Terminal[]>("GET", "/pty")
    for (const id of new Set([...ids, ...owned.map((terminal) => terminal.id)]))
      await call("DELETE", `/pty/${id}`).catch((cause) => { errors.push(`remove ${id}: ${String(cause)}`) })
    await until(8_000, "terminal nonce processes gone", async () => (await sweep(nonce)).length === 0 ? true : undefined)
    metrics.leftovers = (await sweep(nonce)).length
  } catch (cause) { errors.push(String(cause)) }
  finally {
    for (const ws of sockets) if (ws.readyState !== WebSocket.CLOSED) ws.close()
    try { metrics.beforeCleanup = await finalSweep(nonce) }
    catch (cause) { errors.push(`oracle: ${String(cause)}`) }
    finally { await finish(scratch).catch((cause) => { errors.push(`teardown: ${String(cause)}`) }) }
  }
  const pass = errors.length === 0 && Object.entries(checks).every(([cell, status]) => status === "passed" ||
    win && cell === "rawAccounting" && status === "unsupported-ConPTY-no-POSIX-slave-termios")
  const result = verdict("v6-terminal", { ...evidence(scratch), pass, status: pass ? "passed-local-terminal-slice" : "failed-local",
    wp10Complete: false, tuiQuit: { status: "not-run", owner: "lifecycle", pass: null },
    mutation: options.mutation ?? null, checks, metrics, errors,
    capability: { editor: process.env.OMNI_CAMPAIGN_VIM ?? "vim", websocket: typeof WebSocket, windows: "requires vim.exe + ConPTY", skipped: [] },
  })
  return { ...result, pass }
}

if (main(import.meta.url)) {
  const mutation = process.argv.includes("--mutation-truncated-replay") ? "truncated-replay" :
    process.argv.includes("--mutation-missing-replay") ? "missing-replay" : process.argv.includes("--mutation-gap-count") ? "gap-count" : undefined
  const result = await run({ mutation })
  process.exitCode = result.pass ? 0 : 1
}
