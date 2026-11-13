export * as ReviewLocalCheckResult from "./local-check-result"

import type { ResearchProcess } from "../research-toolkit/process"
import type { ReviewLocalTools } from "./local-tools"

export type Settlement = { readonly status: "pass" | "fail" | "not-run" | "acquisition-error"; readonly reason: string }
export const CARGO_CLEAN = "cargo-machete didn't find any unused dependencies in this directory. Good job!\n"
export const CARGO_ROUTINE = "Analyzing dependencies of crates in ....\nDone!\n"

/** Settle pinned native checks, never normalized findings or a new-only regression claim. */
export function settle(tool: ReviewLocalTools.Tool, outcome: ResearchProcess.Outcome): Settlement {
  if (outcome.failure !== undefined) return { status: "acquisition-error", reason: "local-check-process-failed" }
  if (outcome.overflow || outcome.stdout.truncated || outcome.stderr.truncated) return { status: "acquisition-error", reason: "local-check-output-incomplete" }
  if (outcome.memoryExceeded || outcome.timedOut) return { status: "not-run", reason: outcome.memoryExceeded ? "local-check-memory-limit" : "local-check-time-limit" }
  if (![outcome.stdout, outcome.stderr].every((stream) => Number.isSafeInteger(stream.bytes) && stream.bytes === stream.data.length && stream.bytes <= 256 * 1024))
    return { status: "acquisition-error", reason: "local-check-output-invalid" }
  const stdout = outcome.stdout.data.toString("utf8")
  const stderr = outcome.stderr.data.toString("utf8")
  if (!Buffer.from(stdout).equals(outcome.stdout.data) || !Buffer.from(stderr).equals(outcome.stderr.data)) return { status: "acquisition-error", reason: "local-check-output-encoding" }
  if (tool === "shfmt") {
    if (outcome.exitCode === 0 && stdout === "" && stderr === "") return { status: "pass", reason: "native-clean" }
    if (outcome.exitCode === 1 && stderr === "" && /^diff [^\r\n]+\n--- [^\r\n]+\n\+\+\+ [^\r\n]+\n@@ /.test(stdout)) return { status: "fail", reason: "native-format-difference" }
    return { status: "acquisition-error", reason: "local-check-native-error" }
  }
  if (tool === "cargo-machete" && stderr === CARGO_ROUTINE) {
    if (outcome.exitCode === 0 && stdout === CARGO_CLEAN) return { status: "pass", reason: "native-clean" }
    if (outcome.exitCode === 1 && stdout.startsWith("cargo-machete found the following unused dependencies in this directory:\n") && /\n[^\r\n]+ -- \.\/[^\r\n]*Cargo\.toml:\n\t[^\r\n]+\n/.test(stdout))
      return { status: "fail", reason: "native-unused-dependencies" }
  }
  return { status: "acquisition-error", reason: "local-check-native-error" }
}
