export * as ReviewZizmorResult from "./zizmor-result"

import type { ResearchProcess } from "../../research-toolkit/process"
import type { ReviewSarif } from "../sarif"
import { ReviewNativeSarif } from "../native-sarif"
import zizmor from "../../backend-toolkit/packs/zizmor"

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
  if (outcome.exitCode !== 0) return fail(`exit-${outcome.exitCode}`)
  if (stderr.trim().split("\n").some((line) => line.trim() !== "" && !line.trimStart().startsWith("INFO "))) return fail("stderr")
  const parsed = ReviewNativeSarif.parse(stdout, { ...options, pack: zizmor.id, version: zizmor.version })
  if (parsed.status !== "ok") return parsed
  return { status: "ok", results: parsed.results, excluded: parsed.excluded }
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
