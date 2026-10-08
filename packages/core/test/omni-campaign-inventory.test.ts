import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { BUN, ROOT, cleanup, control, decodeWindowsTable, identity, inventoryScope, isolated, kill9, matches, members, own, table, tree, until } from "../../omni/campaign/lib.ts"
import { execute, startServer } from "../../omni/campaign/delivery-fixtures.ts"

const host = { ProcessId: process.pid, ParentProcessId: 1, CommandLine: "campaign host", StartTime: "100", SessionId: 1 }
const kernel = { ProcessId: 72, ParentProcessId: 4, CommandLine: null, StartTime: "134358940677579360", SessionId: 0 }
const supervisor = { ProcessId: 700002, ParentProcessId: process.pid, CommandLine: '"C:/bin/hugr-omni-supervisor.exe"', StartTime: "200", SessionId: 1 }

test("CIM preserves unknown kernel identity; owner scope never calls it nonce-negative", () => {
  const rows = decodeWindowsTable([host, kernel], 700099)
  expect(rows.find((row) => row.pid === 72)).toMatchObject({ args: null, startTime: kernel.StartTime, state: "live" })
  expect(inventoryScope(rows).map((row) => row.pid)).toEqual([process.pid])
  expect(inventoryScope(rows, [{ pid: 72, startTime: kernel.StartTime }]).map((row) => row.pid)).toContain(72)
  expect(() => decodeWindowsTable([], 700099)).toThrow("no process table")
  expect(() => decodeWindowsTable([kernel], 700099)).toThrow("querying host missing")
  expect(() => decodeWindowsTable([host, { ...kernel, StartTime: null }], 700099)).toThrow("cannot establish process identity")
  expect(() => decodeWindowsTable([host, { ...kernel, CommandLine: 4 }], 700099)).toThrow("cannot establish process identity")
})

test("all recorded members enter scope; disappearing argv stays live but fresh supervision goes red", () => {
  const fixture = tree(0)
  writeFileSync(path.join(os.tmpdir(), fixture.nonce, "700001.json"), JSON.stringify({ pid: 700001, nonce: fixture.nonce, startTime: "300" }))
  const child = { ProcessId: 700001, ParentProcessId: supervisor.ProcessId, CommandLine: `bun fixture ${fixture.nonce}`, StartTime: "300", SessionId: 1 }
  const rows = decodeWindowsTable([host, kernel, supervisor, child], 700099)
  expect(control(fixture.nonce, 1, [identity(process.pid, rows)], rows).pass).toBe(true)
  const unknown = decodeWindowsTable([host, kernel, supervisor, { ...child, CommandLine: null, ParentProcessId: 4, SessionId: 0 }], 700099)
  expect(members(fixture.nonce, unknown).members).toHaveLength(1)
  expect(control(fixture.nonce, 1, [identity(process.pid, unknown)], unknown).pass).toBe(false)
  const noHostArgv = decodeWindowsTable([{ ...host, CommandLine: null }, supervisor, child], 700099)
  expect(() => control(fixture.nonce, 1, [identity(process.pid, rows)], noHostArgv)).toThrow("host identity/argv unavailable")
  const stale = decodeWindowsTable([host, kernel, { ...child, StartTime: "301", CommandLine: null, ParentProcessId: process.pid }], 700099)
  expect(() => members(fixture.nonce, stale)).toThrow("unknown argv in owner scope")
  const undiscovered = tree(0)
  expect(() => members(undiscovered.nonce, decodeWindowsTable([host, { ...child, ProcessId: 700003, ParentProcessId: process.pid, CommandLine: null }], 700099))).toThrow("unknown argv in owner scope")
})

test("real OS sees launched host; stale identity cannot kill; captured numeric identity can", async () => {
  const scratch = isolated("inventory", {})
  const server = await startServer(BUN, ["-e", 'console.log("listening on http://127.0.0.1:1"); setInterval(() => {}, 1000)'], scratch.env, ROOT)
  try {
    expect(table().some((row) => matches(row, server.identity))).toBe(true)
    expect(kill9({ pid: server.pid, startTime: `${server.identity.startTime}-stale` })).toBe(false)
    expect(table().some((row) => matches(row, server.identity))).toBe(true)
    expect(kill9(server.pid)).toBe(true)
    await until(10_000, "real host exit", () => server.proc.exitCode !== null || server.proc.signalCode !== null ? true : undefined)
    expect(table().some((row) => matches(row, server.identity) && !row.state.startsWith("Z"))).toBe(false)
  } finally {
    server.proc.kill("SIGKILL")
    await cleanup(scratch.home, [])
  }
}, 60_000)

test("real execute captures live child before watchdog and preserves measured close time", async () => {
  const scratch = isolated("execute-inventory", {})
  const observed = await execute(BUN, ["-e", 'console.log("EXECUTE_READY"); setInterval(() => {}, 1000)'], scratch.env, ROOT, 15_000)
  expect(observed.stdout).toContain("EXECUTE_READY")
  expect(observed.error).toBe("")
  expect(observed.identity?.pid).toBe(observed.pid)
  expect(observed.timedOut).toBe(true)
  expect(observed.ms).toBeLessThan(17_000)
  await cleanup(scratch.home, [])
}, 60_000)

test("real query failure remains red; finally kills retained host; no premature green verdict", async () => {
  const scratch = isolated("cleanup-control", {})
  const lib = JSON.stringify(path.join(ROOT, "packages/omni/campaign/lib.ts"))
  const delivery = JSON.stringify(path.join(ROOT, "packages/omni/campaign/delivery-fixtures.ts"))
  const script = `const { own, cleanup } = await import(${lib});
const { record } = await import(${delivery});
const { spawn } = await import('node:child_process');
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
const captured = own(${JSON.stringify(scratch.home)}, child);
console.log('CONTROL_ID ' + JSON.stringify(captured));
record('inventory-cleanup-control', { pass: true });
process.env.PATH = ${JSON.stringify(scratch.home)};
await cleanup(${JSON.stringify(scratch.home)}, []);`
  const proc = spawn(BUN, ["-e", script], { cwd: ROOT, env: scratch.env, stdio: ["ignore", "pipe", "pipe"] })
  const output = { stdout: "", stderr: "" }
  proc.stdout.on("data", (chunk) => (output.stdout += chunk))
  proc.stderr.on("data", (chunk) => (output.stderr += chunk))
  const code = await new Promise<number | null>((resolve, reject) => { proc.once("close", resolve); proc.once("error", reject) })
  expect(code).not.toBe(0)
  expect(output.stderr).toContain(process.platform === "win32" ? "Get-CimInstance failed" : "ps failed")
  expect(output.stdout).not.toContain("CAMPAIGN_VERDICT")
  const line = output.stdout.split("\n").find((line) => line.startsWith("CONTROL_ID "))
  expect(line).toBeDefined()
  const captured = JSON.parse(line!.slice("CONTROL_ID ".length)) as { pid: number; startTime: string }
  expect(table().some((row) => matches(row, captured) && !row.state.startsWith("Z"))).toBe(false)
}, 60_000)

test("actual oracle mutants lose unknown rows and kill stale identities; both controls turn red", async () => {
  const scratch = isolated("inventory-mutant", {})
  const source = await Bun.file(path.join(ROOT, "packages/omni/campaign/lib.ts")).text()
  const unknown = "return [{ pid: row.ProcessId, parent: row.ParentProcessId"
  const stale = 'if (!table().some((row) => matches(row, pinned) && !row.state.startsWith("Z"))) return false'
  const windows = " -ne '${pinned.startTime"
  expect(source).toContain(unknown)
  expect(source).toContain(stale)
  expect(source).toContain(windows)
  const file = path.join(scratch.home, "lib-mutant.ts")
  await Bun.write(file, source
    .replaceAll('"../../core/test/fixture/process-tree.ts"', JSON.stringify(path.join(ROOT, "packages/core/test/fixture/process-tree.ts")))
    .replace(unknown, `if (row.CommandLine === null) return []\n    ${unknown}`)
    .replace(stale, "if (false) return false")
    .replace(windows, " -eq '${pinned.startTime"))
  const mutant = await import(file) as typeof import("../../omni/campaign/lib.ts")
  const unknownGatePass = mutant.decodeWindowsTable([host, kernel], 700099).some((row) => row.pid === 72 && row.args === null && row.startTime === kernel.StartTime)
  expect(unknownGatePass).toBe(false)
  const proc = spawn(BUN, ["-e", "setInterval(() => {}, 1000)"], { cwd: ROOT, env: scratch.env, stdio: "ignore" })
  const captured = own(scratch.home, proc)
  try {
    const changed = { ...captured, startTime: `${captured.startTime}-stale` }
    expect(kill9(changed)).toBe(false)
    expect(table().some((row) => matches(row, captured))).toBe(true)
    expect(mutant.kill9(changed)).toBe(true)
    await until(10_000, "sacrificial mutant child exit", () => proc.exitCode !== null || proc.signalCode !== null ? true : undefined)
    const stalePIDGatePass = table().some((row) => matches(row, captured) && !row.state.startsWith("Z"))
    expect(stalePIDGatePass).toBe(false)
    console.log("INVENTORY_MUTATION_PROOF " + JSON.stringify({ unknownGatePass, stalePIDGatePass, restoredUnknown: decodeWindowsTable([host, kernel], 700099).some((row) => row.pid === 72), restoredStaleRefused: true }))
  } finally {
    proc.kill("SIGKILL")
    await cleanup(scratch.home, [])
  }
}, 60_000)
