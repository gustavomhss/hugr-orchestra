export * as ReviewOxlintResult from "./oxlint-result"

import type { ResearchProcess } from "../../research-toolkit/process"
import type { ReviewSarif } from "../sarif"
import { ReviewNativeSarif } from "../native-sarif"
import oxlint from "../../backend-toolkit/packs/oxlint"

export type Options = Omit<ReviewNativeSarif.Options, "pack" | "version">

export function settle(outcome: ResearchProcess.Outcome, options: Options): ReviewSarif.Parsed | { status: "not-run"; reason: string } {
  if (outcome.failure !== undefined) return { status: "not-run", reason: "spawn-failure" }
  if (outcome.timedOut) return { status: "not-run", reason: "timeout" }
  if (outcome.memoryExceeded) return { status: "not-run", reason: "memory-exceeded" }
  if (outcome.overflow || outcome.stdout.truncated || outcome.stderr.truncated) return fail("truncated")
  if (outcome.exitCode === null) return fail("missing-exit")
  const stdout = decode(outcome.stdout.data)
  const stderr = decode(outcome.stderr.data)
  if (stdout === undefined || stderr === undefined) return fail("not-utf8")
  if (stderr.trim() !== "") return fail("stderr")
  const parsed = ReviewNativeSarif.parse(stdout, { ...options, pack: oxlint.id, version: oxlint.version })
  if (parsed.status !== "ok") return parsed
  if ((outcome.exitCode === 0 && parsed.nativeErrors === 0) || (outcome.exitCode === 1 && parsed.nativeErrors > 0)) {
    return { status: "ok", results: parsed.results, excluded: parsed.excluded }
  }
  return fail(outcome.exitCode === 0 || outcome.exitCode === 1 ? "exit-mismatch" : `exit-${outcome.exitCode}`)
}

function decode(data: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data)
  } catch {
    return undefined
  }
}

function fail(reason: string) {
  return { status: "acquisition-error" as const, reason }
}
