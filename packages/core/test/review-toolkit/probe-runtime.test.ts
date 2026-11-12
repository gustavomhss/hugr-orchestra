import { expect, test } from "bun:test"
import { ReviewProbeRuntime } from "../../src/review-toolkit/probe-runtime"
import { ProbeRun } from "../../src/research-toolkit/probe/run"
import type { ResearchProcess } from "../../src/research-toolkit/process"

const outcome = {
  exitCode: 0, durationMs: 1, timedOut: false, overflow: false, memoryExceeded: false,
  stdout: { data: Buffer.alloc(0), bytes: 0, truncated: false },
  stderr: { data: Buffer.alloc(0), bytes: 0, truncated: false },
} satisfies ResearchProcess.Outcome

test("probe process caps and repository guard are unavailable evidence even with a zero exit", () => {
  expect(ReviewProbeRuntime.verdict({ ...outcome, timedOut: true }, "")).toEqual({ status: "not-run", reason: "timeout" })
  expect(ReviewProbeRuntime.verdict({ ...outcome, memoryExceeded: true }, "")).toEqual({ status: "not-run", reason: "memory-exceeded" })
  expect(ReviewProbeRuntime.verdict({ ...outcome, overflow: true }, "")).toEqual({ status: "not-run", reason: "output-cap" })
  expect(ReviewProbeRuntime.verdict({ ...outcome, failure: "supervision unavailable" }, "")).toEqual({ status: "not-run", reason: "process-failed: supervision unavailable" })
  expect(ReviewProbeRuntime.verdict(outcome, ProbeRun.GUARD)).toEqual({ status: "not-run", reason: `repo-guard: ${ProbeRun.GUARD}` })
  expect(ReviewProbeRuntime.verdict(outcome, "")).toEqual({ status: "pass" })
  expect(ReviewProbeRuntime.verdict({ ...outcome, exitCode: 1 }, "")).toEqual({ status: "fail" })
})
