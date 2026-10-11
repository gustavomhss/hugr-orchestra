// Independent PTY byte observations: same producer, core-loader Omni, Python stdlib OS PTY, real Orchestra WS.
// ORCHESTRA_LOCAL_TESTS=1 node --experimental-strip-types packages/omni/campaign/pty-byte-probe.ts
import { spawn } from "node:child_process"
import { randomUUID, createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { Omni } from "../../core/src/omni.ts"
import { cli, LOGS, until, verdict, win } from "./lib.ts"
import { api, evidence, finish, fixture, main, processTable, start, type Fixture } from "./protocol-fixtures.ts"

export function byteStats(bytes: Uint8Array) {
  const counts = { bytes: bytes.length, x: 0, cr: 0, lf: 0, crcrlf: 0 }
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] === 120) counts.x++
    if (bytes[index] === 13) counts.cr++
    if (bytes[index] === 10) counts.lf++
    if (bytes[index] === 10 && bytes[index - 1] === 13 && bytes[index - 2] === 13) counts.crcrlf++
  }
  return { ...counts, sha256: createHash("sha256").update(bytes).digest("hex") }
}

export function exactRaw(received: Buffer, source: Buffer, lost: readonly number[]) {
  return source.length > 50 * 1024 * 1024 && lost.length === 0 && received.equals(source)
}

/** Python changes/verifies the actual slave termios, then execs Node; it emits no stdout of its own. */
export function byteFixture(scratch: Fixture, nonce: string, mode: "cooked" | "raw", lane: string, profile?: string) {
  mkdirSync(path.join(LOGS, `${scratch.tag}.bytes`), { recursive: true })
  const base = path.join(LOGS, `${scratch.tag}.bytes`, `${lane}-${nonce}`)
  const files = { base, ready: `${base}.ready.json`, receipt: `${base}.receipt.json`, termios: `${base}.termios.json`, source: `${base}.source.bin`, output: `${base}.output.bin` }
  const producer = `${base}.cjs`
  const shim = `${base}.py`
  writeFileSync(producer, `
const fs = require('node:fs');
const crypto = require('node:crypto');
const readline = require('node:readline');
const nonce = ${JSON.stringify(nonce)};
const source = fs.openSync(${JSON.stringify(files.source)}, 'w');
const digest = crypto.createHash('sha256');
let sourceBytes = 0;
function out(text) {
  const data = Buffer.isBuffer(text) ? text : Buffer.from(text);
  let offset = 0;
  while (offset < data.length) {
    const count = fs.writeSync(1, data, offset, data.length - offset);
    if (count <= 0) throw Error('stdout made no progress');
    const accepted = data.subarray(offset, offset + count);
    digest.update(accepted); sourceBytes += count;
    let stored = 0;
    while (stored < accepted.length) stored += fs.writeSync(source, accepted, stored, accepted.length - stored);
    offset += count;
  }
  return offset;
}
out('READY-' + nonce + '\\n');
fs.writeFileSync(${JSON.stringify(files.ready)}, JSON.stringify({pid: process.pid, tty: process.stdout.isTTY, rows: process.stdout.rows, cols: process.stdout.columns}));
readline.createInterface({input: process.stdin}).on('line', line => {
  if (line === 'go') {
    const block = Buffer.from(('x'.repeat(1023) + '\\n').repeat(1024));
    let written = 0;
    const before = Date.now();
    out('PAYLOAD-BEGIN-' + nonce + '\\n');
    for (let i = 0; i < 50; i++) written += out(block);
    fs.writeFileSync(${JSON.stringify(files.receipt)}, JSON.stringify({written, ms: Date.now() - before, sourceBytes, sourceSHA256: digest.copy().digest('hex')}));
  }
  if (line === 'done') out('PRODUCER-DONE-' + nonce + '\\n');
  if (line === 'quit') { fs.closeSync(source); process.exit(0); }
});
`)
  writeFileSync(shim, `
import os, sys, json, termios, tty, fcntl, struct
def snapshot():
    a = termios.tcgetattr(1)
    return {'attrs': a[:6] + [[v[0] if isinstance(v, bytes) else v for v in a[6]]],
      'OPOST': bool(a[1] & termios.OPOST), 'ONLCR': bool(a[1] & termios.ONLCR),
      'ECHO': bool(a[3] & termios.ECHO), 'ICANON': bool(a[3] & termios.ICANON),
      'ISIG': bool(a[3] & termios.ISIG), 'size': list(struct.unpack('HHHH', fcntl.ioctl(1, termios.TIOCGWINSZ, bytes(8))))[:2]}
before = snapshot()
profile = ${JSON.stringify(profile ?? "")}
if profile:
    a = json.load(open(profile))['after']['attrs']
    a[6] = [v if i in (termios.VMIN, termios.VTIME) else bytes([v]) for i, v in enumerate(a[6])]
    termios.tcsetattr(1, termios.TCSANOW, a)
if ${JSON.stringify(mode)} == 'raw': tty.setraw(0, termios.TCSANOW)
after = snapshot()
if ${JSON.stringify(mode)} == 'raw' and (after['OPOST'] or after['ECHO'] or after['ICANON']): raise RuntimeError('raw termios verification failed')
json.dump({'before': before, 'after': after, 'pid': os.getpid(), 'mode': ${JSON.stringify(mode)}}, open(${JSON.stringify(files.termios)}, 'w'))
os.execve(${JSON.stringify(scratch.node)}, [${JSON.stringify(scratch.node)}, ${JSON.stringify(producer)}, ${JSON.stringify(nonce)}], dict(os.environ))
`)
  return { ...files, shim, args: [shim, nonce] }
}

type ByteFixture = ReturnType<typeof byteFixture>
type Termios = { after: { attrs: (number | number[])[]; OPOST: boolean; ONLCR: boolean; ECHO: boolean; ICANON: boolean; size: number[] } }

function observation(files: ByteFixture, lost: number[], chunks: number[], kind: string) {
  const bytes = readFileSync(files.output)
  const source = readFileSync(files.source)
  const tty = JSON.parse(readFileSync(files.termios, "utf8")) as Termios
  const receipt = JSON.parse(readFileSync(files.receipt, "utf8")) as { written: number; ms: number; sourceBytes: number; sourceSHA256: string }
  if (receipt.written !== 50 * 1024 * 1024 || byteStats(source.subarray(0, receipt.sourceBytes)).sha256 !== receipt.sourceSHA256)
    throw new Error("producer actual-stdout receipt/source mirror mismatch")
  const stats = byteStats(bytes)
  const plainSource = byteStats(source)
  writeFileSync(`${files.base}.chunks.json`, JSON.stringify(chunks))
  const boundaries: { outputOffset: number; payloadLine: number }[] = []
  let xs = 0
  for (let index = 0; index < bytes.length; index++) {
    if (bytes[index] === 120) xs++
    if (bytes[index] === 10 && bytes[index - 1] === 13 && bytes[index - 2] === 13)
      boundaries.push({ outputOffset: index, payloadLine: xs / 1023 })
  }
  writeFileSync(`${files.base}.crcrlf.json`, JSON.stringify(boundaries))
  return { kind, files, termios: tty, receipt, output: stats, source: plainSource, lostBefore: lost,
    reads: { count: chunks.length, min: Math.min(...chunks), max: Math.max(...chunks), file: `${files.base}.chunks.json` },
    expansionOffsets: { count: boundaries.length, first: boundaries.slice(0, 4), file: `${files.base}.crcrlf.json`,
      atFirstOrLastLFOf1MiBWrite: boundaries.length > 0 && boundaries.every((entry) => [0, 1].includes(entry.payloadLine % 1024)) },
    extraCR: stats.cr - (tty.after.ONLCR && tty.after.OPOST ? plainSource.lf + 3 : 0),
    rawExact: exactRaw(bytes, source, lost), bytes }
}

/** Recheck captured bytes and actual termios files; a previous prose verdict cannot certify this oracle. */
export function cookedCertificate(cliHash: string) {
  const record = JSON.parse(readFileSync(path.join(LOGS, "pty-byte-probe.jsonl"), "utf8").trim().split("\n").at(-1) ?? "") as {
    cliSha256: string; os: string; pass: boolean; observations: Record<string, {
      files: ByteFixture; termios: Termios; output: ReturnType<typeof byteStats>; extraCR: number; lostBefore: number[]
    }>
  }
  if (!record.pass || record.cliSha256 !== cliHash || record.os !== `${process.platform}-${process.arch}`)
    throw new Error("cooked PTY certificate does not match current binary/OS or failed its raw controls")
  const native = record.observations.nativeCooked
  if (!native) throw new Error("native cooked PTY observation missing")
  const reference = readFileSync(native.files.output)
  for (const lane of ["nativeCooked", "legacyCooked", "wsCooked"]) {
    const item = record.observations[lane]
    if (!item) throw new Error(`${lane} observation missing`)
    const bytes = readFileSync(item.files.output)
    const mode = JSON.parse(readFileSync(item.files.termios, "utf8")) as Termios
    if (!bytes.equals(reference) || byteStats(bytes).sha256 !== item.output.sha256 || !mode.after.OPOST || !mode.after.ONLCR ||
      JSON.stringify(mode.after.attrs) !== JSON.stringify(native.termios.after.attrs) || item.lostBefore.length > 0)
      throw new Error(`${lane} cooked PTY byte/termios comparison failed`)
  }
  for (const lane of ["nativeRaw", "legacyRaw", "wsRaw"]) {
    const item = record.observations[lane]
    if (!item) throw new Error(`${lane} raw observation missing`)
    const mode = JSON.parse(readFileSync(item.files.termios, "utf8")) as Termios
    if (!readFileSync(item.files.output).equals(readFileSync(item.files.source)) || item.lostBefore.length > 0 ||
      mode.after.OPOST || mode.after.ECHO || mode.after.ICANON)
      throw new Error(`${lane} no-translation control failed`)
  }
  return { os: record.os, cliSha256: record.cliSha256, cookedSHA256: native.output.sha256,
    cookedExtraCR: native.extraCR, termios: native.termios.after, file: path.join(LOGS, "pty-byte-probe.jsonl") }
}

export async function run() {
  const scratch = fixture("pty-byte-probe", { lsp: false })
  const nonce = `omni-bytes-${randomUUID()}`
  const observations: Record<string, unknown> = {}
  const errors: string[] = []
  let pass = false
  if (win) return { ...verdict("pty-byte-probe", { pass: false, error: "Python stdlib OS PTY/termios oracle requires POSIX; Windows not run" }), pass: false }
  try {
    processTable()
    const bin = path.dirname(cli())
    Omni.configure({ addon: path.join(bin, "hugr_omni.node"), supervisor: path.join(bin, "hugr-omni-supervisor") })
    const binding = await Omni.load()
    const native = async (mode: "cooked" | "raw") => {
      const files = byteFixture(scratch, nonce, mode, `native-${mode}`)
      const child = binding.spawn("python3", files.args, { pty: { cols: 120, rows: 40 }, text: false,
        cwd: scratch.project, inheritEnv: false, env: scratch.env })
      const buffers: Buffer[] = []
      const lost: number[] = []
      const chunks: number[] = []
      const state = { tail: "" }
      const pump = (async () => {
        for await (const item of child.output) {
          if (item.lostBefore) lost.push(item.lostBefore)
          const data = Buffer.from(item.data)
          buffers.push(data); chunks.push(data.length)
          state.tail = (state.tail + data.subarray(-256).toString("ascii")).slice(-512)
        }
      })()
      try {
        await until(20_000, "native producer ready + termios", () => existsSync(files.ready) && existsSync(files.termios) ? true : undefined)
        await child.write("go\n")
        await until(120_000, "native producer completion", () => existsSync(files.receipt) ? true : undefined)
        await child.write("done\n")
        await until(20_000, "native post-flood response", () => state.tail.includes(`PRODUCER-DONE-${nonce}`) ? true : undefined)
        await child.write("quit\n")
        const exit = await child.wait()
        if (!exit.success) throw new Error(`native producer exit ${JSON.stringify(exit)}`)
        await pump
        writeFileSync(files.output, Buffer.concat(buffers))
        return observation(files, lost, chunks, `native-${mode}`)
      } finally { await child.stop({ graceMs: 1000 }); await pump }
    }
    const cooked = await native("cooked")
    observations.nativeCooked = { ...cooked, bytes: undefined }
    const legacy = async (mode: "cooked" | "raw") => {
      const files = byteFixture(scratch, nonce, mode, `legacy-${mode}`, cooked.files.termios)
      const parent = `${files.base}-parent.py`
      writeFileSync(parent, `
import os, sys, pty, fcntl, termios, struct, select, errno, json
pid, master = pty.fork()
if pid == 0:
    fcntl.ioctl(1, termios.TIOCSWINSZ, struct.pack('HHHH', 40, 120, 0, 0))
    os.execvp('python3', ['python3', ${JSON.stringify(files.shim)}, ${JSON.stringify(nonce)}])
sizes = []
waited = False
try:
    with open(${JSON.stringify(files.output)}, 'wb', buffering=0) as output:
      while True:
        ready, _, _ = select.select([master, sys.stdin.fileno()], [], [], 1)
        if sys.stdin.fileno() in ready:
          data = os.read(sys.stdin.fileno(), 4096)
          if not data: break
          os.write(master, data)
        if master in ready:
          try: data = os.read(master, 65536)
          except OSError as error:
            if error.errno == errno.EIO: break
            raise
          if not data: break
          sizes.append(len(data)); output.write(data)
    _, status = os.waitpid(pid, 0)
    waited = True
    if os.waitstatus_to_exitcode(status) != 0: raise RuntimeError('OS producer exit ' + str(status))
    json.dump(sizes, open(${JSON.stringify(`${files.base}.chunks.json`)}, 'w'))
finally:
    os.close(master)
    if not waited:
      try: os.kill(pid, 9)
      except ProcessLookupError: pass
      os.waitpid(pid, 0)
`)
      const proc = spawn("python3", [parent, nonce], { cwd: scratch.project, env: scratch.env, stdio: ["pipe", "pipe", "pipe"] })
      scratch.hosts.push(proc)
      let err = ""
      proc.stderr!.on("data", (data) => { err += data })
      try {
        await until(20_000, "legacy system PTY ready", () => {
          if (proc.exitCode !== null) throw new Error(`OS PTY exited ${proc.exitCode}: ${err}`)
          return existsSync(files.ready) ? true : undefined
        })
        proc.stdin!.write("go\n")
        await until(120_000, "legacy producer completion", () => existsSync(files.receipt) ? true : undefined)
        proc.stdin!.write("done\n")
        // Python owns the master capture; read the actual terminal suffix before requesting exit.
        await until(20_000, "legacy post-flood response", () => readFileSync(files.output).subarray(-512).includes(`PRODUCER-DONE-${nonce}`) ? true : undefined)
        proc.stdin!.write("quit\n")
        await until(20_000, "legacy OS PTY exit", () => proc.exitCode !== null ? true : undefined)
        if (proc.exitCode !== 0) throw new Error(`OS PTY exit ${proc.exitCode}: ${err}`)
        return observation(files, [], JSON.parse(readFileSync(`${files.base}.chunks.json`, "utf8")) as number[], `legacy-${mode}`)
      } finally { if (proc.exitCode === null) proc.kill("SIGKILL") }
    }
    const osCooked = await legacy("cooked")
    observations.legacyCooked = { ...osCooked, bytes: undefined }
    if (JSON.stringify(cooked.termios.after.attrs) !== JSON.stringify(osCooked.termios.after.attrs))
      throw new Error("native and OS PTY termios conditions differ")
    const host = await start(scratch)
    const call = api(host.url, scratch.project)
    const websocket = async (mode: "cooked" | "raw") => {
      const files = byteFixture(scratch, nonce, mode, `ws-${mode}`, cooked.files.termios)
      const terminal = await call<{ id: string }>("POST", "/pty", { command: "python3", args: files.args, cols: 120, rows: 40 })
      const url = new URL(`/pty/${terminal.id}/connect`, host.url)
      url.protocol = "ws:"
      url.searchParams.set("directory", scratch.project)
      url.searchParams.set("cursor", "0")
      const ws = new WebSocket(url)
      ws.binaryType = "arraybuffer"
      const buffers: Buffer[] = []
      const chunks: number[] = []
      const state = { tail: "", meta: false, closed: false, error: "" }
      ws.addEventListener("message", (event) => {
        const data = typeof event.data === "string" ? Buffer.from(event.data, "utf8") : Buffer.from(event.data as ArrayBuffer)
        if (data[0] === 0) { state.meta = true; return }
        buffers.push(data); chunks.push(data.length)
        state.tail = (state.tail + data.subarray(-256).toString("ascii")).slice(-512)
      })
      ws.addEventListener("close", () => { state.closed = true })
      ws.addEventListener("error", () => { state.error = "WS error" })
      try {
        await until(20_000, "WS producer + replay metadata ready", () => {
          if (state.error) throw new Error(state.error)
          return state.meta && existsSync(files.ready) ? true : undefined
        })
        ws.send("go\n")
        await until(120_000, "WS producer completion", () => existsSync(files.receipt) ? true : undefined)
        ws.send("done\n")
        await until(20_000, "WS response after producer completion", () => state.tail.includes(`PRODUCER-DONE-${nonce}`) ? true : undefined)
        ws.send("quit\n")
        await until(20_000, "WS producer normal exit", () => state.closed ? true : undefined)
        writeFileSync(files.output, Buffer.concat(buffers))
        return observation(files, [], chunks, `ws-${mode}`)
      } finally {
        ws.close()
        await call("DELETE", `/pty/${terminal.id}`).catch(() => undefined)
      }
    }
    const wsCooked = await websocket("cooked")
    observations.wsCooked = { ...wsCooked, bytes: undefined }
    const raw = await native("raw")
    const osRaw = await legacy("raw")
    observations.nativeRaw = { ...raw, bytes: undefined }
    observations.legacyRaw = { ...osRaw, bytes: undefined }
    const wsRaw = await websocket("raw")
    observations.wsRaw = { ...wsRaw, bytes: undefined }
    const controls = {
      rawCorruptionDetected: (() => { const changed = Buffer.from(raw.bytes); changed[100] ^= 1; return !exactRaw(changed, readFileSync(raw.files.source), []) })(),
      rawTruncationDetected: !exactRaw(raw.bytes.subarray(0, -1), readFileSync(raw.files.source), []),
      reportedGapRejected: !exactRaw(raw.bytes, readFileSync(raw.files.source), [1]),
    }
    observations.controls = controls
    pass = raw.rawExact && osRaw.rawExact && wsRaw.rawExact && raw.lostBefore.length === 0 && osRaw.lostBefore.length === 0 &&
      cooked.bytes.equals(osCooked.bytes) && cooked.bytes.equals(wsCooked.bytes) && Object.values(controls).every(Boolean)
    if (!pass) errors.push("deterministic raw PTY capture differs from actual producer stdout or reported a gap")
  } catch (cause) { errors.push(String(cause)) }
  finally { await finish(scratch).catch((cause) => { errors.push(`cleanup: ${String(cause)}`) }) }
  const result = verdict("pty-byte-probe", { ...evidence(scratch), pass: pass && errors.length === 0, observations, errors })
  return { ...result, pass: pass && errors.length === 0 }
}

if (main(import.meta.url)) { const result = await run(); process.exitCode = result.pass ? 0 : 1 }
