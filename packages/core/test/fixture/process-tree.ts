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
import { mkdirSync, readdirSync, readFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

// One source for the start time, run inside the fixture processes and by the oracle: Linux reads /proc/<pid>/stat
// field 22, macOS asks `ps -o lstart=` in UTC/C once for all pids and prefixes UTC:, Windows makes one CIM query.
const START_TIMES = `
function startTimes(pids) {
  const cp = process.getBuiltinModule("node:child_process")
  const result = {}
  if (process.platform === "linux") {
    for (const pid of pids) {
      try {
        const stat = process.getBuiltinModule("node:fs").readFileSync("/proc/" + pid + "/stat", "utf8")
        result[pid] = stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]
      } catch {}
    }
    return result
  }
  const out = process.platform === "win32"
    ? cp.spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command",
        "Get-CimInstance Win32_Process -Filter '" + pids.map((pid) => "ProcessId=" + pid).join(" OR ") + "' | " +
        "ForEach-Object { [string]$_.ProcessId + ' ' + $_.CreationDate.ToFileTimeUtc() }"],
        { encoding: "utf8", windowsHide: true })
    : cp.spawnSync("ps", ["-o", "pid=,lstart=", "-p", pids.join(",")], { encoding: "utf8", env: { ...process.env, TZ: "UTC", LC_ALL: "C" } })
  for (const line of (out.stdout || "").split("\\n")) {
    const match = line.trim().match(/^(\\d+)\\s+(.+)$/)
    if (match) result[match[1]] = (process.platform === "darwin" ? "UTC:" : "") + match[2].trim()
  }
  return result
}
`

const BODY = `${START_TIMES}
const fs = process.getBuiltinModule("node:fs")
const path = process.getBuiltinModule("node:path")
const [nonce, depth, dir] = process.argv.slice(-3)
const file = path.join(dir, process.pid + ".json")
fs.writeFileSync(file + ".tmp", JSON.stringify({ pid: process.pid, nonce, startTime: startTimes([process.pid])[process.pid] }))
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

const startTimes = new Function("pids", `${START_TIMES}\nreturn startTimes(pids)`) as (
  pids: number[],
) => Record<string, string>

type Entry = { pid: number; nonce: string; startTime?: string }

/**
 * A tree of `depth + 1` processes (the root plus `depth` descendants in a chain). Spawn `command` with `args` through
 * the spawner under test and wait for the `ready` line on its stdout.
 */
export function tree(depth = 2) {
  const nonce = `omni-tree-${randomUUID()}`
  const dir = path.join(os.tmpdir(), nonce)
  mkdirSync(dir)
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
    .map((file) => JSON.parse(readFileSync(path.join(dir, file), "utf8")) as Entry)
}

function signalable(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as { code?: string }).code === "EPERM"
  }
}

/** How many of the tree's processes are alive: the pid answers signal 0 and still has its recorded start time. */
export async function alive(nonce: string) {
  const running = records(nonce).filter((record) => signalable(record.pid))
  if (running.length === 0) return 0
  const now = startTimes(running.map((record) => record.pid))
  return running.filter((record) => record.startTime !== undefined && now[record.pid] === record.startTime).length
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
  const now = startTimes(records(nonce).map((record) => record.pid))
  for (const record of records(nonce)) {
    if (record.startTime === undefined || now[record.pid] !== record.startTime) continue
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
