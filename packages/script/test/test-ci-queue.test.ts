import { expect, test } from "bun:test"
import { shouldWaitForRunners } from "../src/test-ci-queue"

const now = Date.parse("2026-11-11T21:00:00Z")
const stamp = (age: number) => new Date(now - age * 60_000).toISOString()
const queued = (age: number) => ({ created_at: stamp(age), updated_at: stamp(age) })

test("an empty queue does not delay dispatch", () => {
  expect(shouldWaitForRunners({ total_count: 0, workflow_runs: [] }, now)).toBe(false)
})

test("queued runs beyond the existing thirty-minute bound do not restart that wait for each caller", () => {
  expect(
    shouldWaitForRunners({ total_count: 3, workflow_runs: [queued(30), queued(90), { created_at: stamp(60) }] }, now),
  ).toBe(false)
})

test("recent queue activity and a rerun of an older workflow still receive the normal wait", () => {
  for (const run of [
    queued(29.99),
    { created_at: stamp(90), updated_at: stamp(1) },
    { created_at: stamp(1), updated_at: stamp(90) },
  ]) {
    expect(shouldWaitForRunners({ total_count: 2, workflow_runs: [queued(90), run] }, now)).toBe(true)
  }
})

test("incomplete or uncertain queue observations preserve the wait", () => {
  for (const queue of [
    {},
    { total_count: -1, workflow_runs: [] },
    { total_count: 0.5, workflow_runs: [] },
    { total_count: 0, workflow_runs: [queued(1)] },
    { total_count: 1 },
    { total_count: 1, workflow_runs: {} },
    { total_count: 1, workflow_runs: [null] },
    { total_count: 2, workflow_runs: [queued(90)] },
    { total_count: 1, workflow_runs: [{}] },
    { total_count: 1, workflow_runs: [{ updated_at: "invalid" }] },
    { total_count: 1, workflow_runs: [{ created_at: stamp(90), updated_at: "invalid" }] },
    { total_count: 1, workflow_runs: [queued(-1)] },
  ]) {
    expect(shouldWaitForRunners(queue, now)).toBe(true)
  }
})
