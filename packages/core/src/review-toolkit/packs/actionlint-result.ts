export * as ReviewActionlintResult from "./actionlint-result"

import type { ResearchProcess } from "../../research-toolkit/process"
import { ReviewActionlintReport } from "./actionlint-report"

export function settle(outcome: ResearchProcess.Outcome, options: { root: string; paths: readonly { file: string; path: string }[] }) {
  if (outcome.failure) return fail("spawn-failure")
  if (outcome.timedOut) return { status: "not-run" as const, reason: "timeout" }
  if (outcome.memoryExceeded) return { status: "not-run" as const, reason: "memory-exceeded" }
  if (outcome.overflow || outcome.stdout.truncated || outcome.stderr.truncated) return fail("truncated")
  if (outcome.exitCode === null) return fail("missing-exit")
  const stderr = decode(outcome.stderr.data)
  if (stderr === undefined) return fail("not-utf8")
  if (stderr !== "") return fail("stderr")
  const stdout = decode(outcome.stdout.data)
  if (stdout === undefined) return fail("not-utf8")
  if (!stdout.trim()) return fail("missing-report")
  const parsed = ReviewActionlintReport.parseReport(stdout, options)
  if (parsed.status !== "ok") return parsed
  if ((outcome.exitCode === 0 && parsed.results.length === 0) || (outcome.exitCode === 1 && parsed.results.length > 0)) return parsed
  if (outcome.exitCode !== 0 && outcome.exitCode !== 1) return fail(`exit-${outcome.exitCode}`)
  return fail("exit-mismatch")
}

function decode(data: Uint8Array) { try { return new TextDecoder("utf-8", { fatal: true }).decode(data) } catch { return undefined } }
function fail(reason: string) { return { status: "acquisition-error" as const, reason } }
