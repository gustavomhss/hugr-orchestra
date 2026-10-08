// The shared nonce tree (integration plan §4): a root that starts a chain of descendants, every one of them carrying
// the tree's nonce in argv, plus the oracles that tell whether any of them is still alive. Tests identify processes
// by the nonce and by a recorded start time, never by a bare pid: pids are reused on CI.
//
// Every fixture process runs `process.execPath -e <script>`, so the tree works under Bun and Node on every OS. Each
// one writes {pid, nonce, startTime} to <tmpdir>/<nonce>/<pid>.json before it starts its child; the leaf then prints
// `ready <nonce>`, which every ancestor forwards to its stdout. Seeing that line means every record is written.
//
// This file must also load under Node with --experimental-strip-types, so it uses node: builtins only.

import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

// One source for the start time, run inside the fixture processes and by the oracle: Linux reads /proc/<pid>/stat
// field 22, macOS asks `ps -o lstart=` in UTC/C once for all pids and prefixes UTC:, Windows makes one CIM query.
// A native Node watchdog owns Windows query startup/exit. Bun's direct synchronous PowerShell path can stall.
const START_TIMES = `
function startTimes(pids, helper) {
  const cp = process.getBuiltinModule("node:child_process")
  const fs = process.getBuiltinModule("node:fs")
  const result = {}
  if (!pids.length) return result
  if (process.platform === "win32") {
    try {
      const settings = JSON.parse(fs.readFileSync(helper + '.config', 'utf8'))
      const out = cp.spawnSync(settings.node, ['--experimental-strip-types', helper, JSON.stringify(pids)],
        {encoding: 'utf8', windowsHide: true, timeout: 15000, killSignal: 'SIGKILL'})
      if (out.error || out.status !== 0 || !out.stdout?.trim()) throw Error(String(out.error ?? out.stderr ?? 'empty identity reply'))
      const births = JSON.parse(out.stdout)
      if (!births || typeof births !== 'object' || Array.isArray(births)) throw Error('malformed identity reply')
      for (const pid of pids) {
        if (births[pid] === undefined) continue // A successful complete inventory can prove the process exited.
        if (typeof births[pid] !== 'string' || !/^\\d+$/.test(births[pid])) throw Error('invalid creation time for PID ' + pid)
        result[pid] = births[pid]
      }
      return result
    } catch (error) { throw Error('fixture birth query failed: ' + String(error)) }
  }
  if (process.platform === "linux") {
    for (const pid of pids) {
      try {
        const stat = fs.readFileSync("/proc/" + pid + "/stat", "utf8")
        const birth = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]
        if (!/^\\d+$/.test(birth ?? '')) throw Error('invalid procfs creation time for PID ' + pid)
        result[pid] = birth
      } catch (error) {
        if (error.code === 'ENOENT') continue
        throw Error('fixture birth query failed: ' + String(error))
      }
    }
    return result
  }
  const out = cp.spawnSync("ps", ["-o", "pid=,lstart=", "-p", pids.join(",")],
    { encoding: "utf8", timeout: 10000, killSignal: 'SIGKILL', env: { ...process.env, TZ: "UTC", LC_ALL: "C" } })
  // ps exits 1 without diagnostics when all requested PIDs have exited; every other failure is named.
  if (out.error || out.status !== 0 && !(out.status === 1 && !out.stderr?.trim()))
    throw Error('fixture birth query failed: ' + String(out.error ?? out.stderr))
  for (const line of (out.stdout || "").split("\\n")) {
    if (!line.trim()) continue
    const match = line.trim().match(/^(\\d+)\\s+(.+)$/)
    if (!match) throw Error('fixture birth query failed: malformed ps creation-time row ' + line)
    result[match[1]] = "UTC:" + match[2].trim()
  }
  return result
}
`

const BODY = `${START_TIMES}
const fs = process.getBuiltinModule("node:fs")
const path = process.getBuiltinModule("node:path")
const [nonce, depth, dir] = process.argv.slice(-3)
const file = path.join(dir, process.pid + ".json")
const startTime = startTimes([process.pid], path.join(dir, 'identity.mjs'))[process.pid]
if (typeof startTime !== 'string' || !startTime) throw Error('fixture birth identity missing creation time for PID ' + process.pid)
fs.writeFileSync(file + ".tmp", JSON.stringify({ pid: process.pid, nonce, startTime }))
fs.renameSync(file + ".tmp", file)
setInterval(() => {}, 1 << 30)
if (Number(depth) === 0) console.log("ready " + nonce)
else {
  const child = process.getBuiltinModule("node:child_process").spawn(
    process.execPath,
    ["-e", "const S = " + JSON.stringify(S) + "; eval(S)", nonce, String(Number(depth) - 1), dir],
    { stdio: ["ignore", "pipe", "inherit"], windowsHide: true },
  )
  child.stdout.pipe(process.stdout)
}
`

const startTimes = new Function("pids", "helper", `${START_TIMES}\nreturn startTimes(pids, helper)`) as (
  pids: number[],
  helper: string,
) => Record<string, string>

type Entry = { pid: number; nonce: string; startTime: string }

// The standalone tree body uses only node builtins. This native Node bootstrap delegates PID/CIM decoding
// to the existing OS instrument, preserving exact FileTime strings rather than introducing another decoder.
const WINDOWS_READER = `
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { fileURLToPath } from 'node:url';
const settings = JSON.parse(readFileSync(import.meta.filename + '.config', 'utf8'));
// Its Bun namespace self-reexport is extensionless. Load the unchanged implementation with Node's own TS
// stripper, removing only that closed self-projection boundary; CIM and decode remain the authoritative exports.
const source = readFileSync(fileURLToPath(settings.decoder), 'utf8');
const projection = 'export * as WindowsInventory from "./windows-inventory"';
if (!source.includes(projection)) throw Error('fixture birth query failed: Windows decoder projection boundary missing');
const javascript = stripTypeScriptTypes(source.replace(projection, ''), {mode: 'strip'});
const WindowsInventory = await import('data:text/javascript;base64,' + Buffer.from(javascript).toString('base64'));
const requested = JSON.parse(process.argv[2]);
const output = {stdout: '', stderr: '', error: '', timedOut: false};
const child = spawn('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand',
  Buffer.from('[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); ' + WindowsInventory.CIM, 'utf16le').toString('base64')],
  {windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
const closed = new Promise(resolve => child.once('close', resolve));
child.on('error', error => {output.error = String(error)});
child.stdout.on('data', chunk => {output.stdout += chunk; if (output.stdout.length > 67108864) {output.error = 'identity reply exceeded 64 MiB'; child.kill('SIGKILL')}});
child.stderr.on('data', chunk => {output.stderr += chunk});
const timer = setTimeout(() => {output.timedOut = true; child.kill('SIGKILL')}, 10000);
try {
  await Promise.race([closed, new Promise((_, reject) => setTimeout(() => reject(Error('query OS/stdio close unconfirmed')), 12000).unref())]);
  if (output.timedOut || output.error || child.exitCode !== 0) throw Error('fixture birth query failed: ' + (output.error || output.stderr || 'query deadline expired'));
  const rows = WindowsInventory.decode(JSON.parse(output.stdout), child.pid);
  process.stdout.write(JSON.stringify(Object.fromEntries(rows.filter(row => requested.includes(row.pid)).map(row => [row.pid, row.startTime]))));
} catch (error) {console.error('fixture birth query failed: ' + String(error)); process.exitCode = 1}
finally {clearTimeout(timer); if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')}
`

/**
 * A tree of `depth + 1` processes (the root plus `depth` descendants in a chain). Spawn `command` with `args` through
 * the spawner under test and wait for the `ready` line on its stdout.
 */
export function tree(depth = 2) {
  const nonce = `omni-tree-${randomUUID()}`
  const dir = path.join(os.tmpdir(), nonce)
  mkdirSync(dir)
  if (process.platform === "win32") {
    const node = spawnSync(process.env.OMNI_CAMPAIGN_NODE ?? "node", ["-p", "process.execPath"], {
      encoding: "utf8", windowsHide: true, timeout: 10_000, killSignal: "SIGKILL",
    })
    if (node.error || node.status !== 0 || !node.stdout.trim()) throw new Error(`fixture birth query failed: native Node bootstrap unavailable: ${node.error ?? node.stderr}`)
    writeFileSync(path.join(dir, "identity.mjs"), WINDOWS_READER)
    writeFileSync(path.join(dir, "identity.mjs.config"), JSON.stringify({ node: node.stdout.trim(),
      decoder: new URL("../../../omni/campaign/windows-inventory.ts", import.meta.url).href }))
  }
  return {
    nonce,
    size: depth + 1,
    ready: `ready ${nonce}`,
    command: process.execPath,
    args: ["-e", `const S = ${JSON.stringify(BODY)}; eval(S)`, nonce, String(depth), dir],
  }
}

function records(nonce: string): Entry[] {
  const dir = path.join(os.tmpdir(), nonce)
  return readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => {
      const record = JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Entry
      if (record.nonce !== nonce || !Number.isSafeInteger(record.pid) || record.pid <= 0 ||
        typeof record.startTime !== "string" || !record.startTime)
        throw new Error(`fixture birth identity missing creation time or invalid record: ${path.join(dir, file)}`)
      return record
    })
}

function signalable(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as { code?: string }).code === "EPERM"
  }
}

/** How many processes retain their recorded identity: Windows uses complete CIM, Unix signal 0 plus birth query. */
export async function alive(nonce: string) {
  // Bun's Windows signal-0 result can miss a live child; the authoritative CIM snapshot decides there.
  const running = process.platform === "win32" ? records(nonce) : records(nonce).filter((record) => signalable(record.pid))
  if (running.length === 0) return 0
  const now = startTimes(running.map((record) => record.pid), path.join(os.tmpdir(), nonce, "identity.mjs"))
  return running.filter((record) => now[record.pid] === record.startTime).length
}

/** Polls alive() until it reaches 0 or the deadline passes; returns the last count. Bounds a death, never a latency. */
export async function gone(nonce: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    // alive() reading 0 is confirmed by the command-line sweep: under Bun on Windows signal 0 was seen to miss live
    // processes, and a missed process must never pass as gone.
    const recorded = await alive(nonce)
    const count = recorded === 0 ? (await sweep(nonce)).length : recorded
    if (count === 0 || Date.now() > deadline) return count
    await new Promise((resolve) => setTimeout(resolve, recorded === 0 ? 500 : 100))
  }
}

/** Kills whatever is left of the tree (test cleanup; never an assertion). */
export async function reap(nonce: string) {
  const now = startTimes(records(nonce).map((record) => record.pid), path.join(os.tmpdir(), nonce, "identity.mjs"))
  for (const record of records(nonce)) {
    if (now[record.pid] !== record.startTime) continue
    try {
      process.kill(record.pid, "SIGKILL")
    } catch {}
  }
}

/**
 * The final sweep, independent of the records: the pids of every process whose command line holds the nonce. macOS
 * needs `ps -axww` (BSD ps truncates args); Windows makes one CIM query, filtered here, excluding its own powershell,
 * with one retry on an RPC error.
 */
export async function sweep(nonce: string) {
  if (process.platform !== "win32") {
    const out = spawnSync(
      "ps",
      process.platform === "darwin" ? ["-axww", "-o", "pid=,args="] : ["-eww", "-o", "pid=,args="],
      {
        encoding: "utf8",
      },
    )
    if (out.status !== 0) throw new Error(`ps failed: ${out.stderr}`)
    return out.stdout
      .split("\n")
      .filter((line) => line.includes(nonce))
      .map((line) => Number(line.trim().split(/\s+/)[0]))
  }
  for (let attempt = 0; ; attempt++) {
    const out = spawnSync(
      "powershell",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress",
      ],
      { encoding: "utf8", windowsHide: true, maxBuffer: 64 * 1024 * 1024 },
    )
    if (out.status === 0) {
      const rows = JSON.parse(out.stdout) as { ProcessId: number; CommandLine: string | null }[]
      return rows
        .filter((row) => row.ProcessId !== out.pid && row.CommandLine?.includes(nonce))
        .map((row) => row.ProcessId)
    }
    if (attempt > 0 || !/RPC/i.test(out.stderr)) throw new Error(`Get-CimInstance failed: ${out.stderr}`)
  }
}
