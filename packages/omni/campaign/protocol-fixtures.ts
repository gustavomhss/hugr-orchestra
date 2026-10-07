// Local WP10 helpers. lib.ts and the product remain frozen. Node builtins only.
import { spawn, spawnSync, type ChildProcess } from "node:child_process"
import { createHash, randomUUID } from "node:crypto"
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { cleanup, cli, isolated, LOGS, reap, ROOT, sweep, table, until } from "./lib.ts"

export function requireLocal() {
  if (process.env.ORCHESTRA_LOCAL_TESTS !== "1") throw new Error("campaign requires ORCHESTRA_LOCAL_TESTS=1")
}

export function fixture(name: string, config: Record<string, unknown> = {}) {
  requireLocal()
  const scratch = isolated(name, { plugin: [], ...config })
  // Do not inherit provider tokens, server credentials, npm/git auth, or a user configuration path.
  const env = Object.fromEntries(Object.entries(scratch.env).filter(([key]) =>
    /^(PATH|PATHEXT|SYSTEMROOT|WINDIR|COMSPEC|TEMP|TMP|TMPDIR|LANG|LC_.*|TERM|HOME|USERPROFILE|XDG_.*|OPENCODE_.*)$/i.test(key),
  ))
  Object.assign(env, { ORCHESTRA_LOCAL_TESTS: "1", TERM: "xterm-256color", OPENCODE_DISABLE_DEFAULT_PLUGINS: "1" })
  delete env.OPENCODE_SERVER_PASSWORD
  delete env.OPENCODE_SERVER_USERNAME
  const resolved = spawnSync(process.env.OMNI_CAMPAIGN_NODE ?? "node", ["-p", "process.execPath"], {
    env, encoding: "utf8", windowsHide: true, timeout: 10_000,
  })
  if (resolved.status !== 0) throw new Error(`node unavailable: ${resolved.stderr}`)
  mkdirSync(LOGS, { recursive: true })
  const tag = `${name}-${Date.now()}-${randomUUID().slice(0, 8)}`
  return { ...scratch, env, node: resolved.stdout.trim(), tag, hosts: [] as ChildProcess[], log: path.join(LOGS, `${tag}.host.log`) }
}

export type Fixture = ReturnType<typeof fixture>

export function evidence(scratch: Fixture) {
  const bin = cli()
  const built = JSON.parse(readFileSync(path.join(LOGS, "cli-provenance.json"), "utf8")) as {
    sourceSHA: string; cliSha256: string; sourceHashes: Record<string, string>; addonSha256: string; supervisorSha256: string
  }
  const digest = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex")
  if (!/^[a-f0-9]{40}$/.test(built.sourceSHA) || digest(bin) !== built.cliSha256 ||
    ["packages/opencode/src/lsp/client.ts", "packages/opencode/src/lsp/lsp.ts", "bun.lock"].some((file) => digest(path.join(ROOT, file)) !== built.sourceHashes?.[file]))
    throw new Error("CLI provenance mismatch: rebuild this worktree after product changes")
  return {
    baseline: "1b5f6e68201349cb5dab6298d0ac3388beac2a45",
    cli: bin, ...Object.fromEntries(Object.entries(built).map(([key, value]) => [key === "at" ? "buildAt" : key, value])),
    harnessHashes: Object.fromEntries(["protocol-fixtures.ts", "v4-lsp.ts", "v5-mcp.ts", "v6-terminal.ts", "lib.ts"].map((file) => [file, digest(path.join(LOGS, "..", file))])),
    node: scratch.node, harnessRuntime: process.version, home: scratch.home, hostLog: scratch.log,
    fixtureEvidence: path.join(LOGS, `${scratch.tag}.evidence`), osRelease: os.release(),
    osCoverage: Object.fromEntries(["darwin", "linux", "win32"].map((os) => [os, os === process.platform ? "executed-local" : "not-run"])),
    ownedHosts: scratch.hosts.map((proc) => ({ pid: proc.pid, exitCode: proc.exitCode, signalCode: proc.signalCode })),
  }
}

export function processTable() {
  const rows = table()
  if (!rows.some((row) => row.pid === process.pid && row.args.length > 0))
    throw new Error("process-table positive control failed: harness PID absent")
  return rows
}

export async function start(scratch: Fixture) {
  evidence(scratch)
  const proc = spawn(cli(), ["--print-logs", "--log-level", "DEBUG", "serve", "--port", "0", "--hostname", "127.0.0.1"], {
    env: scratch.env, cwd: scratch.project, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  })
  scratch.hosts.push(proc)
  let out = ""
  let failure: Error | undefined
  proc.on("error", (error) => { failure = error })
  for (const stream of [proc.stdout!, proc.stderr!]) stream.on("data", (chunk: Buffer) => {
    appendFileSync(scratch.log, chunk)
    out = (out + chunk.toString()).slice(-64 * 1024)
  })
  const url = await until(120_000, "compiled Orchestra serve", () => {
    if (failure) throw failure
    if (proc.exitCode !== null) throw new Error(`CLI exited ${proc.exitCode}: ${out}`)
    return out.match(/listening on (http:\/\/\S+)/)?.[1]
  }).catch((error) => { proc.kill("SIGKILL"); throw error })
  return { proc, url, pid: proc.pid!, out: () => out }
}

export async function finish(scratch: Fixture, nonces: string[] = []) {
  // A serve command line does not contain HOME. Kill only handles created by this fixture.
  try {
    for (const proc of scratch.hosts) if (proc.exitCode === null && proc.signalCode === null) proc.kill("SIGKILL")
    await until(10_000, "owned CLI host exit", () =>
      scratch.hosts.every((proc) => proc.exitCode !== null || proc.signalCode !== null) ? true : undefined)
  } finally {
    try { await cleanup(scratch.home, nonces) }
    finally {
      try { await Promise.all(nonces.map((nonce) => reap(nonce))) }
      finally {
        const destination = path.join(LOGS, `${scratch.tag}.evidence`)
        mkdirSync(destination, { recursive: true })
        for (const file of readdirSync(scratch.home).filter((file) => /\.(jsonl|json|log|txt|edited|vim-size)$/.test(file)))
          copyFileSync(path.join(scratch.home, file), path.join(destination, file))
        for (const nonce of nonces) {
          const dir = path.join(os.tmpdir(), nonce)
          for (const file of readdirSync(dir).filter((file) => file.endsWith(".json")))
            copyFileSync(path.join(dir, file), path.join(destination, `${nonce}-${file}`))
        }
      }
    }
  }
}

export function finalSweep(nonce: string) {
  if (process.env.OMNI_CAMPAIGN_FINAL_ORACLE_FAILURE === "1") throw new Error("injected final oracle query failure")
  return sweep(nonce)
}

export function api(url: string, directory: string) {
  return async <T = unknown>(method: string, route: string, body?: unknown, timeoutMs = 120_000): Promise<T> => {
    const response = await fetch(new URL(route, url), {
      method, headers: { "content-type": "application/json", "x-opencode-directory": encodeURIComponent(directory) },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    })
    const text = await response.text()
    if (!response.ok) throw new Error(`${method} ${route}: ${response.status} ${text.slice(0, 2000)}`)
    return (text ? JSON.parse(text) : undefined) as T
  }
}

export function script(scratch: Fixture, name: string, code: string) {
  const file = path.join(scratch.home, `${name}.cjs`)
  writeFileSync(file, code)
  return file
}

export function hostLog(scratch: Fixture) {
  return existsSync(scratch.log) ? readFileSync(scratch.log, "utf8") : ""
}

export function main(url: string) {
  return !!process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === url
}

export const plain = (text: string) => text.replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][0-9A-Za-z]|\x1b[=>78]/g, "")

/** A real stdio MCP peer; synchronous stderr writes precede every initialize response. */
export function mcpFixture(scratch: Fixture, nonce: string, fail = false) {
  return script(scratch, nonce, `
const fs = require('node:fs');
const readline = require('node:readline');
const nonce = process.argv[2];
function write(data) {
  let offset = 0;
  while (offset < data.length) {
    const count = fs.writeSync(2, data, offset, data.length - offset);
    if (count <= 0) throw Error('stderr write made no progress');
    offset += count;
  }
  return offset;
}
const block = Buffer.from('x'.repeat(1023) + '\\n');
let bytes = 0;
for (let i = 0; i < 1024; i++) bytes += write(block);
const marker = 'LAST-STDERR-' + nonce;
const markerBytes = write(Buffer.from(marker + '\\n'));
fs.writeFileSync(${JSON.stringify(path.join(scratch.home, `${nonce}.written.json`))}, JSON.stringify({bytes, markerBytes, marker, pid: process.pid}));
${fail ? "process.exit(17);" : ""}
readline.createInterface({input: process.stdin}).on('line', line => {
  const req = JSON.parse(line);
  if (req.id === undefined) return;
  const result = req.method === 'initialize'
    ? {protocolVersion: req.params.protocolVersion, capabilities: {tools: {}}, serverInfo: {name: nonce, version: '1'}}
    : req.method === 'tools/list' ? {tools: [{name: 'probe', inputSchema: {type: 'object', properties: {}}}]} : {};
  fs.appendFileSync(${JSON.stringify(path.join(scratch.home, `${nonce}.requests.jsonl`))}, JSON.stringify({method: req.method, at: Date.now()}) + '\\n');
  process.stdout.write(JSON.stringify({jsonrpc: '2.0', id: req.id, result}) + '\\n');
});
process.stdin.on('end', () => process.exit(0));
`)
}
