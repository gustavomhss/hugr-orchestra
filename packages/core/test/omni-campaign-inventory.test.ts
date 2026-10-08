import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { BUN, ROOT, adoptTree, cleanup, control, decodeWindowsTable, hasNonce, identity, inventoryScope, isolated, kill9, matches, members, own, table, tree, until, win } from "../../omni/campaign/lib.ts"
import { execute, startServer } from "../../omni/campaign/delivery-fixtures.ts"
import { WindowsInventory } from "../../omni/campaign/windows-inventory.ts"
import { closeWithinDeadline } from "../../omni/campaign/v8-windows.ts"

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

test("recorded members retain their own nonce; unknown and stale owned argv stay red", () => {
  const fixture = tree(0)
  writeFileSync(path.join(os.tmpdir(), fixture.nonce, "700001.json"), JSON.stringify({ pid: 700001, nonce: fixture.nonce, startTime: "300" }))
  const child = { ProcessId: 700001, ParentProcessId: supervisor.ProcessId, CommandLine: `bun fixture ${fixture.nonce}`, StartTime: "300", SessionId: 1 }
  const rows = decodeWindowsTable([host, kernel, supervisor, child], 700099)
  expect(control(fixture.nonce, 1, [identity(process.pid, rows)], rows).pass).toBe(true)
  const unknown = decodeWindowsTable([host, kernel, supervisor, { ...child, CommandLine: null, ParentProcessId: 4, SessionId: 0 }], 700099)
  expect(members(fixture.nonce, unknown).members).toHaveLength(1)
  expect(control(fixture.nonce, 1, [identity(process.pid, unknown)], unknown).pass).toBe(false)
  expect(() => control(fixture.nonce, 1, [identity(process.pid, rows)], decodeWindowsTable([{ ...host, CommandLine: null }, supervisor, child], 700099))).toThrow("host identity/argv unavailable")
  expect(() => members(fixture.nonce, decodeWindowsTable([host, { ...child, StartTime: "301", CommandLine: null, ParentProcessId: process.pid }], 700099))).toThrow("unknown argv in owner scope")
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

test("real execute captures before watchdog; fast refusal and aged-caller queries stay bounded", async () => {
  const scratch = isolated("execute-inventory", {})
  try {
    const observed = await execute(BUN, ["-e", 'console.log("EXECUTE_READY"); setInterval(() => {}, 1000)'], scratch.env, ROOT, 15_000)
    expect(observed.stdout).toContain("EXECUTE_READY")
    expect(observed.error).toBe("")
    expect(observed.identity?.pid).toBe(observed.pid)
    expect(observed.timedOut).toBe(true)
    expect(observed.ms).toBeLessThan(17_000)
    const fast = await execute(BUN, ["-e", 'console.error("FAST_REFUSAL"); process.exit(1)'], scratch.env, ROOT, 2000)
    expect(fast.error).toBe("")
    expect(fast.timedOut).toBe(false)
    expect(fast.code).toBe(1)
    expect(fast.stderr).toContain("FAST_REFUSAL")
    expect(fast.ms).toBeLessThanOrEqual(2000)
  } finally {
    await cleanup(scratch.home, [])
  }
}, 60_000)

test("real query failure stays red; finally kills retained host; no premature green verdict", async () => {
  const scratch = isolated("cleanup-control", {})
  const missing = JSON.stringify(path.join(scratch.home, "absent-oracle-executable"))
  await instrumentCopy(scratch.home, (source) => replace(source, 'spawnSync("ps",', `spawnSync(process.env.CONTROL_BROKEN ? ${missing} : "ps",`),
    (source) => replace(source, "JSON.stringify({ command, args, deadline:", `JSON.stringify({ command: process.env.CONTROL_BROKEN ? ${missing} : command, args, deadline:`))
  const script = `const { own, cleanup } = await import(${JSON.stringify(path.join(scratch.home, "lib.ts"))});
const { record } = await import(${JSON.stringify(path.join(scratch.home, "delivery-fixtures.ts"))});
const { spawn } = await import('node:child_process');
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
const captured = own(${JSON.stringify(scratch.home)}, child);
console.log('CONTROL_ID ' + JSON.stringify(captured));
record('inventory-cleanup-control', { pass: true });
process.env.CONTROL_BROKEN = '1';
await cleanup(${JSON.stringify(scratch.home)}, []);`
  const result = await controller(script, scratch.env)
  expect(result.code).not.toBe(0)
  expect(result.stderr + result.stdout).toContain("absent-oracle-executable")
  expect(result.stdout).not.toContain('"pass":true')
  const line = result.stdout.split("\n").find((line) => line.startsWith("CONTROL_ID "))
  expect(line).toBeDefined()
  const captured = JSON.parse(line!.slice("CONTROL_ID ".length)) as { pid: number; startTime: string }
  expect(table().some((row) => matches(row, captured) && !row.state.startsWith("Z"))).toBe(false)
}, 60_000)

test("actual unknown-row and stale-PID mutants turn both controls red", async () => {
  const scratch = isolated("inventory-mutant", {})
  await instrumentCopy(scratch.home,
    (source) => replace(source, 'if (!table().some((row) => matches(row, pinned) && !row.state.startsWith("Z"))) return false', "if (false) return false"),
    (source) => replace(replace(source, "return [{ pid: row.ProcessId, parent: row.ParentProcessId", "if (row.CommandLine === null) return []\n    return [{ pid: row.ProcessId, parent: row.ParentProcessId"), " -ne '${pinned.startTime", " -eq '${pinned.startTime"))
  const mutant = await import(path.join(scratch.home, "lib.ts")) as typeof import("../../omni/campaign/lib.ts")
  const unknownGatePass = mutant.decodeWindowsTable([host, kernel], 700099).some((row) => row.pid === 72 && row.args === null && row.startTime === kernel.StartTime)
  expect(unknownGatePass).toBe(false)
  const proc = spawn(BUN, ["-e", "setInterval(() => {}, 1000)"], { cwd: ROOT, env: scratch.env, stdio: "ignore" })
  const captured = own(scratch.home, proc)
  try {
    const stale = { ...captured, startTime: `${captured.startTime}-stale` }
    expect(kill9(stale)).toBe(false)
    expect(table().some((row) => matches(row, captured))).toBe(true)
    expect(mutant.kill9(stale)).toBe(true)
    await until(10_000, "sacrificial mutant child exit", () => proc.exitCode !== null || proc.signalCode !== null ? true : undefined)
    const stalePIDGatePass = table().some((row) => matches(row, captured) && !row.state.startsWith("Z"))
    expect(stalePIDGatePass).toBe(false)
    console.log("INVENTORY_MUTATION_PROOF " + JSON.stringify({ unknownGatePass, stalePIDGatePass, restoredUnknown: decodeWindowsTable([host, kernel], 700099).some((row) => row.pid === 72) }))
  } finally {
    proc.kill("SIGKILL")
    await cleanup(scratch.home, [])
  }
}, 60_000)

test("two real owned trees: argv loss in B cannot make cleanup A kill B; global-owner mutant does", async () => {
  for (const mutation of [false, true]) {
    const scratch = isolated("two-owner-control", {})
    await instrumentCopy(scratch.home, (source) => {
      const masked = replace(replace(source, "const parsed = decodeWindowsTable(JSON.parse(out.stdout), out.pid).filter((row) => !matches(row, out.instrument))", "const parsed = decodeWindowsTable(JSON.parse(out.stdout), out.pid).filter((row) => !matches(row, out.instrument)).map((row) => row.pid === Number(process.env.CONTROL_HIDE_PID) ? { ...row, args: null } : row)"), "const rows = decodeUnixTable(out.stdout, out.pid)", "const rows = decodeUnixTable(out.stdout, out.pid).map((row) => row.pid === Number(process.env.CONTROL_HIDE_PID) ? { ...row, args: null } : row)")
      if (!mutation) return masked
      return replace(replace(masked, "const known = established.get(nonce) ?? []", "const known = process.env.CONTROL_HIDE_PID ? [...established.values()].flat() : established.get(nonce) ?? []"), "const available = rows.filter((row) => row.pid === process.pid || !foreign.some((id) => matches(row, id)))", "const available = rows")
    })
    const script = `const { isolated, fileTree, own, members, table, matches, until, cleanup } = await import(${JSON.stringify(path.join(scratch.home, "lib.ts"))});
const { spawn } = await import('node:child_process');
const A=isolated('owner-A', {}), B=isolated('owner-B', {});
const a=fileTree(A.home, 0), b=fileTree(B.home, 0);
const pa=spawn(a.command,a.args,{env:A.env,stdio:'ignore'}), pb=spawn(b.command,b.args,{env:B.env,stdio:'ignore'});
const aid=own(A.home,pa), bid=own(B.home,pb);
try {
  await until(25000,'both fixture records',()=>members(a.nonce).members.length===1 && members(b.nonce).members.length===1 ? true : undefined);
  process.env.CONTROL_HIDE_PID=String(pb.pid);
  const aCount=members(a.nonce).members.length+members(a.nonce).wrappers.length;
  const bCount=members(b.nonce).members.length;
  await cleanup(A.home,[a.nonce]);
  const bLive=table().some(row=>matches(row,bid));
  console.log('OWNER_PROOF '+JSON.stringify({bid,bNonce:b.nonce,aCount,bCount,bLive,gatePass:aCount===1 && bCount===1 && bLive}));
  await new Promise(resolve=>{process.stdin.once('data',resolve);process.stdin.resume()});
} finally {
  delete process.env.CONTROL_HIDE_PID;
  try {await cleanup(A.home,[a.nonce])} finally {await cleanup(B.home,[b.nonce]);pa.kill('SIGKILL');pb.kill('SIGKILL')}
}`
    const proc = spawn(BUN, ["-e", script], { cwd: ROOT, env: scratch.env, stdio: ["pipe", "pipe", "pipe"] })
    const output = { stdout: "", stderr: "" }
    proc.stdout.on("data", (chunk) => (output.stdout += chunk))
    proc.stderr.on("data", (chunk) => (output.stderr += chunk))
    try {
      const proof = await until(60_000, "two-owner proof", () => {
        const line = output.stdout.split("\n").find((line) => line.startsWith("OWNER_PROOF "))
        if (line) return JSON.parse(line.slice("OWNER_PROOF ".length)) as { bid: { pid: number; startTime: string }; bNonce: string; aCount: number; bCount: number; bLive: boolean; gatePass: boolean }
        if (proc.exitCode !== null || proc.signalCode !== null) throw new Error(`two-owner controller exited: ${output.stderr}`)
      })
      const independentlyLive = table().some((row) => matches(row, proof.bid) && hasNonce(row.args, proof.bNonce))
      expect(proof.gatePass).toBe(!mutation)
      expect(independentlyLive).toBe(!mutation)
      console.log("OWNER_MUTATION_PROOF " + JSON.stringify({ mutation, ...proof, independentlyLive }))
    } finally {
      proc.stdin.end("finish\n")
      await until(30_000, "two-owner controller teardown", () => proc.exitCode !== null || proc.signalCode !== null ? true : undefined)
      if (proc.exitCode !== 0) throw new Error(`two-owner controller teardown rc=${proc.exitCode}: ${output.stderr}`)
      expect(proc.exitCode).toBe(0)
    }
  }
}, 120_000)

test("real recorder no-ready, malformed-ready, early-close and stuck-shutdown faults are red and closed", async () => {
  const healthyNonce = `recorder-control-${crypto.randomUUID()}`
  const healthy = WindowsInventory.makeRecorder({ command: BUN, args: ["-e", 'console.log(JSON.stringify({ready:true})); process.stdin.resume(); process.stdin.on("end",()=>process.exit(0)); setInterval(()=>{},1000)', healthyNonce] }, 2000)
  try {
    await healthy.prepare()
    expect(table().some((row) => row.pid === healthy.snapshot().pid && hasNonce(row.args, healthyNonce))).toBe(true)
    await healthy.stop()
    expect(healthy.snapshot()).toMatchObject({ pid: undefined, closed: true })
    expect(table().some((row) => hasNonce(row.args, healthyNonce))).toBe(false)
  } finally { await healthy.stop(true) }
  const faults = [
    { name: "no-ready", script: "setInterval(()=>{},1000)", error: "readiness deadline expired", shutdown: false },
    { name: "malformed-ready", script: 'console.log(JSON.stringify({ready:"yes"}));setInterval(()=>{},1000)', error: "malformed identity recorder ready", shutdown: false },
    { name: "early-close", script: "process.exit(0)", error: "identity recorder closed", shutdown: false },
    { name: "early-close-after-ready", script: 'console.log(JSON.stringify({ready:true}));process.exit(0)', error: "identity recorder closed", shutdown: false, capture: true },
    { name: "stuck-shutdown", script: 'console.log(JSON.stringify({ready:true}));process.stdin.resume();setInterval(()=>{},1000)', error: "shutdown deadline expired", shutdown: true },
  ]
  for (const fault of faults) {
    const nonce = `recorder-fault-${crypto.randomUUID()}`
    const recorder = WindowsInventory.makeRecorder({ command: BUN, args: ["-e", fault.script, nonce] }, 500)
    try {
      const result = await (fault.shutdown ? recorder.prepare().then(() => recorder.stop()) : fault.capture ? recorder.prepare().then(() => recorder.capture(process.pid)) : recorder.prepare()).then(() => ({ error: "" }), (error: unknown) => ({ error: String(error) }))
      expect(result.error).toContain(fault.error)
      expect(recorder.snapshot()).toMatchObject({ pid: undefined, closed: true, pending: 0 })
      expect(table().some((row) => hasNonce(row.args, nonce))).toBe(false)
      console.log("RECORDER_FAULT_PROOF " + JSON.stringify({ name: fault.name, red: !!result.error, closed: recorder.snapshot().closed }))
    } finally { await recorder.stop(true) }
  }
}, 90_000)

test("unconfirmed recorder kill keeps its handle; delayed close confirmation permits teardown", async () => {
  const scratch = isolated("recorder-close-control", {})
  await instrumentCopy(scratch.home, (source) => source, (source) => replace(replace(source,
    'proc.on("close", () => { state.closed = true; close.resolve(); fail(new Error(`identity recorder closed: ${text.stderr}`)) })',
    'proc.on("close", () => { setTimeout(() => { state.closed = true; close.resolve(); fail(new Error(`identity recorder closed: ${text.stderr}`)) }, 500) })'),
    'const timer = setTimeout(() => resolve(false), timeoutMs)\n    state.close!.finally', 'const timer = setTimeout(() => resolve(false), 100)\n    state.close!.finally'))
  const module = await import(path.join(scratch.home, "windows-inventory.ts")) as typeof import("../../omni/campaign/windows-inventory.ts")
  const recorder = module.WindowsInventory.makeRecorder({ command: BUN, args: ["-e", 'console.log(JSON.stringify({ready:true}));process.stdin.resume();process.stdin.on("end",()=>process.exit(0));setInterval(()=>{},1000)'] }, 2000)
  try {
    await recorder.prepare()
    const pid = recorder.snapshot().pid
    const result = await recorder.stop().then(() => "", (error: unknown) => String(error))
    expect(result).toContain("kill did not confirm close")
    expect(recorder.snapshot().pid).toBe(pid)
    await Bun.sleep(600)
    await recorder.stop(true)
    expect(recorder.snapshot()).toMatchObject({ pid: undefined, closed: true })
    console.log("RECORDER_RETAINED_HANDLE_PROOF " + JSON.stringify({ red: !!result, retainedUntilConfirmed: true, closed: recorder.snapshot().closed }))
  } finally { await recorder.stop(true) }
}, 30_000)

test("full close deadline rejects a delayed OS disappearance and delayed reachability; late-check mutant is red", async () => {
  const scratch = isolated("late-disappearance", {})
  const source = await Bun.file(path.join(ROOT, "packages/omni/campaign/v8-windows.ts")).text()
  const file = path.join(scratch.home, "v8-mutant.ts")
  await Bun.write(file, replace(replace(source
    .replace('"./lib.ts"', JSON.stringify(path.join(ROOT, "packages/omni/campaign/lib.ts")))
    .replace('"./delivery-fixtures.ts"', JSON.stringify(path.join(ROOT, "packages/omni/campaign/delivery-fixtures.ts"))),
    'const within = () => { if (performance.now() >= deadline) throw new Error(`ConPTY complete close exceeded ${boundMs} ms`); return deadline - performance.now() }',
    'const within = () => deadline - performance.now()'),
    'timer.id = setTimeout(() => reject(new Error(`ConPTY stop + EOF + onExit watchdog expired after ${boundMs} ms`)), Math.max(0, deadline - performance.now()))',
    'timer.id = setTimeout(() => reject(new Error(`ConPTY stop + EOF + onExit watchdog expired after ${boundMs} ms`)), 10000)'))
  const mutant = await import(file) as typeof import("../../omni/campaign/v8-windows.ts")
  for (const stage of ["OS-zero", "reachability"] as const) {
    for (const mutation of [false, true]) {
      const fixture = tree(0)
      adoptTree(scratch.home, fixture.nonce)
      // Real root closes stop/exit/EOF while an independently recorded descendant remains alive.
      const proc = spawn(BUN, ["-e", `const {spawn}=require('node:child_process'); const child=spawn(${JSON.stringify(fixture.command)},${JSON.stringify(fixture.args)},{stdio:'ignore'}); console.log('DESCENDANT '+child.pid); process.stdin.resume(); process.stdin.once('data',()=>process.exit(0));setInterval(()=>{},1000)`], { cwd: ROOT, env: scratch.env, stdio: ["pipe", "pipe", "pipe"] })
      own(scratch.home, proc)
      const output = { text: "" }
      proc.stdout.on("data", (chunk) => (output.text += chunk))
      try {
        await until(25_000, "delayed disappearance fixture ready", () => output.text.includes("DESCENDANT ") && members(fixture.nonce).members.length === 1 ? true : undefined)
        expect(members(fixture.nonce).members).toHaveLength(1)
        const descendant = identity(members(fixture.nonce).members[0].pid)
        const ended = new Promise<void>((resolve) => proc.once("close", () => resolve()))
        const exited = new Promise<void>((resolve) => proc.once("exit", () => resolve()))
        const eof = new Promise<void>((resolve) => proc.stdout.once("end", () => resolve()))
        const checked = Promise.withResolvers<void>()
        const started = performance.now()
        const input = { stop: async () => {
          proc.stdin.end("stop\n")
          await ended
          if (stage === "reachability") kill9(descendant)
        }, eof, exited,
          remaining: async () => {
            if (stage === "OS-zero") {
              await Bun.sleep(2500)
              kill9(descendant)
            }
            const left = members(fixture.nonce).members.length
            if (stage === "OS-zero") checked.resolve()
            return left
          }, processes: async () => {
            try {
              if (stage === "reachability") await Bun.sleep(2500)
              return table().filter((row) => matches(row, descendant) && !row.state.startsWith("Z"))
            } finally { checked.resolve() }
          } }
        const observed = await (mutation ? mutant.closeWithinDeadline : closeWithinDeadline)(started, 2000, input).then(
          (result) => ({ gatePass: true, result, error: "" }), (error: unknown) => ({ gatePass: false, result: undefined, error: String(error) }))
        expect(observed.gatePass).toBe(mutation)
        console.log("CLOSE_DEADLINE_MUTATION_PROOF " + JSON.stringify({ stage, mutation, ...observed }))
        await checked.promise
      } finally {
        proc.kill("SIGKILL")
        await cleanup(scratch.home, [fixture.nonce])
      }
    }
  }
}, 120_000)

if (win) test("real stalled executable before query work is bounded; owned helper exit is confirmed", async () => {
  // Warm the watchdog outside this operation, as production capture setup does outside KPI timing.
  expect(table().some((row) => row.pid === process.pid)).toBe(true)
  const nonce = `stalled-helper-${crypto.randomUUID()}`
  const started = performance.now()
  const result = (() => {
    try { WindowsInventory.run("node", ["-e", "setInterval(()=>{},1000)", nonce], 500); return { error: "", pid: 0 } }
    catch (error) { return { error: String(error), pid: (error as Error & { helperPID: number }).helperPID } }
  })()
  expect(result.error).toContain("Windows helper deadline expired")
  expect(Number.isSafeInteger(result.pid) && result.pid > 0).toBe(true)
  expect(performance.now() - started).toBeLessThan(3000)
  expect(table().some((row) => row.pid === result.pid && hasNonce(row.args, nonce))).toBe(false)
  await WindowsInventory.stop()
  console.log("STALLED_HELPER_PROOF " + JSON.stringify({ red: !!result.error, pid: result.pid, exitConfirmed: true }))
}, 30_000)

function replace(source: string, before: string, after: string) {
  if (!source.includes(before)) throw new Error(`mutation boundary missing: ${before}`)
  return source.replace(before, after)
}

async function instrumentCopy(home: string, lib = (source: string) => source, windows = (source: string) => source) {
  await Bun.write(path.join(home, "lib.ts"), lib((await Bun.file(path.join(ROOT, "packages/omni/campaign/lib.ts")).text())
    .replaceAll('"../../core/test/fixture/process-tree.ts"', JSON.stringify(path.join(ROOT, "packages/core/test/fixture/process-tree.ts")))))
  await Bun.write(path.join(home, "windows-inventory.ts"), windows(await Bun.file(path.join(ROOT, "packages/omni/campaign/windows-inventory.ts")).text()))
  await Bun.write(path.join(home, "delivery-fixtures.ts"), await Bun.file(path.join(ROOT, "packages/omni/campaign/delivery-fixtures.ts")).text())
}

async function controller(script: string, env: Record<string, string>) {
  const proc = spawn(BUN, ["-e", script], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] })
  const output = { stdout: "", stderr: "" }
  proc.stdout.on("data", (chunk) => (output.stdout += chunk))
  proc.stderr.on("data", (chunk) => (output.stderr += chunk))
  try {
    await until(45_000, "fault controller close", () => proc.exitCode !== null || proc.signalCode !== null ? true : undefined)
    return { ...output, code: proc.exitCode }
  } finally { proc.kill("SIGKILL") }
}
