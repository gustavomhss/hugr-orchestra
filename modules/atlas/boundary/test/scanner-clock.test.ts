import { expect, test } from "bun:test"
import path from "node:path"

type Verdict = "clean" | "hit" | "could-not-run"
type Spec = { name: "gitleaks"; command: string; args: string[]; cleanExitCodes: number[]; hitExitCodes: number[] }

// The canonical scanner the native-memory bundle inlines. The bundle runs detection right before every scan, which
// refreshes Bun's synchronous-spawn clock, so a stale clock cannot show through it; this drives the scan directly.
const scanner: { runScanner(spec: Spec, record: unknown, timeoutMs: number): Verdict } = await import(
  path.resolve(import.meta.dir, "../../packages/adapter-io/src/scanner.ts")
)

const sleeper = (ms: number): Spec => ({
  name: "gitleaks",
  command: process.execPath,
  args: ["-e", `setTimeout(() => {}, ${ms})`],
  cleanExitCodes: [0],
  hitExitCodes: [1],
})

const timed = (spec: Spec, timeoutMs: number) => {
  const started = performance.now()
  return { verdict: scanner.runScanner(spec, { kind: "probe" }, timeoutMs), elapsed: performance.now() - started }
}

// oven-sh/bun#33932: Bun 1.3.14 on Windows armed this timeout against the previous synchronous spawn's clock, so after
// an idle stretch longer than the budget the scanner was killed within milliseconds and every write read could-not-run.
test("a scan after an idle stretch keeps its whole timeout budget, and a real timeout still fails closed", async () => {
  expect(timed(sleeper(200), 3_000).verdict).toBe("clean")
  await Bun.sleep(4_000)
  const afterIdle = timed(sleeper(1_000), 3_000)
  expect(afterIdle).toMatchObject({ verdict: "clean" })
  expect(afterIdle.elapsed).toBeGreaterThanOrEqual(900)
  await Bun.sleep(4_000)
  // Early kill and rerun must not turn a scanner that outlives its budget into a pass or into an unbounded wait.
  const overrun = timed(sleeper(30_000), 2_000)
  expect(overrun.verdict).toBe("could-not-run")
  expect(overrun.elapsed).toBeGreaterThanOrEqual(1_900)
  expect(overrun.elapsed).toBeLessThan(10_000)
}, 30_000)
