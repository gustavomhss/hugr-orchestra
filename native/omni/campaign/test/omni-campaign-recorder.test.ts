import { expect, test } from "bun:test"
import { BUN, hasNonce, table, win } from "../lib.ts"
import { WindowsInventory } from "../windows-inventory.ts"

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
      expect((fault.capture ? [fault.error, "EPIPE: broken pipe, write"] : [fault.error]).some((error) => result.error.includes(error))).toBe(true)
      expect(recorder.snapshot()).toMatchObject({ pid: undefined, closed: true, pending: 0 })
      expect(table().some((row) => hasNonce(row.args, nonce))).toBe(false)
      console.log("RECORDER_FAULT_PROOF " + JSON.stringify({ name: fault.name, red: !!result.error, closed: recorder.snapshot().closed }))
    } finally { await recorder.stop(true) }
  }
}, 90_000)

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
