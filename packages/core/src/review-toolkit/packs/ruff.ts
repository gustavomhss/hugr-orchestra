export * as ReviewPackRuff from "./ruff"

import { Effect } from "effect"
import pinned from "../../backend-toolkit/packs/ruff"
import { BackendToolkit } from "../../backend-toolkit"
import type { Pack } from "../../backend-toolkit/manifest"
import { Probe } from "../../research-toolkit/probe/types"
import { ResearchProcess } from "../../research-toolkit/process"
import type { Outcome } from "../../research-toolkit/process"
import { ReviewNativeFiles } from "../native-files"
import type { Parsed } from "../sarif"
import { parseReport, RULES } from "./ruff-report"

export { RULES }

export const templateId = "ruff-curated-json"
export const parserId = "ruff"

// Lucy's check over the pinned 0.17.3 artifact. A review never installs it. Windows API availability is unqualified,
// so locate and argv refuse that host before any toolkit lookup.
export const manifest = {
  ...pinned,
  fit: { role: "check", input: "Python files in the reviewed copy", skills: [] },
} as const satisfies Pack

export const locate = Effect.fn("ReviewPackRuff.locate")(function* () {
  if (process.platform === "win32") return { absent: "ruff unsupported: windows-api-unqualified" }
  const states = yield* BackendToolkit.status(manifest.id).pipe(
    Effect.provideService(BackendToolkit.Manifest, { [manifest.id]: manifest }),
  )
  const state = states[0]
  if (state?.status === "ready") return { executable: state.executable }
  if (state?.status === "unsupported") return { absent: `ruff unsupported: ${state.reason}` }
  return { absent: "ruff absent" }
})

// ResearchProcess.environment keeps RUFF_* and PYTHONPATH. This adapter removes them; it does not change the shared sanitizer.
export function environment(input: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return Object.fromEntries(Object.entries(ResearchProcess.environment(input)).filter(([key]) => {
    const upper = key.toUpperCase()
    return !upper.startsWith("RUFF_") && upper !== "PYTHONPATH"
  }))
}

export const argv = Effect.fn("ReviewPackRuff.argv")(function* (input: {
  executable: string
  root: string
  files: readonly string[]
  excluded?: readonly string[]
}) {
  if (process.platform === "win32") return { status: "unsupported" as const, reason: "windows-api-unqualified" }
  if (!input.executable || !input.executable.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(input.executable)) return stop("executable-missing")
  if (input.executable.includes("\0")) return stop("nul")
  const excluded = input.excluded ?? []
  const known = new Set<string>(RULES)
  if (excluded.some((id) => !known.has(id))) return stop("unknown-excluded")
  const codes = RULES.filter((id) => !excluded.includes(id))
  if (codes.length === 0) return stop("no-active-rules")
  const selected = yield* ReviewNativeFiles.select({ root: input.root, files: input.files, extensions: [".py", ".pyi"] })
  if (selected.status !== "ok") return selected
  const argv = [
    input.executable, "check",
    "--isolated", "--no-cache", "--no-fix", "--no-fix-only", "--no-preview", "--ignore-noqa",
    "--target-version", "py311", "--output-format", "json",
    "--select", codes.join(","),
    "--no-respect-gitignore", "--",
    ...selected.files,
  ]
  if (argv.reduce((sum, arg) => sum + Buffer.byteLength(arg) + 1, 0) > Probe.Limits.outputBytes) return stop("argv-bound")
  return { status: "ok" as const, argv }
})

export function settle(outcome: Outcome, root: string): Parsed | { status: "not-run"; reason: string } {
  if (outcome.failure) return { status: "acquisition-error", reason: "spawn-failure" }
  if (outcome.timedOut) return { status: "not-run", reason: "timeout" }
  if (outcome.memoryExceeded) return { status: "not-run", reason: "memory-exceeded" }
  if (outcome.overflow || outcome.stdout.truncated || outcome.stderr.truncated) return { status: "acquisition-error", reason: "truncated" }
  if (outcome.exitCode === null) return { status: "acquisition-error", reason: "missing-exit" }
  const stderr = decode(outcome.stderr.data)
  if (stderr === undefined) return { status: "acquisition-error", reason: "not-utf8" }
  if (stderr !== "") return { status: "acquisition-error", reason: "stderr" }
  const stdout = decode(outcome.stdout.data)
  if (stdout === undefined) return { status: "acquisition-error", reason: "not-utf8" }
  if (stdout.trim() === "") return { status: "acquisition-error", reason: "missing-report" }
  const parsed = parseReport(stdout, { root })
  if (parsed.status !== "ok") return parsed
  if (outcome.exitCode === 0 && parsed.results.length === 0) return parsed
  if (outcome.exitCode === 1 && parsed.results.length > 0) return parsed
  if (outcome.exitCode !== 0 && outcome.exitCode !== 1) return { status: "acquisition-error", reason: `exit-${outcome.exitCode}` }
  return { status: "acquisition-error", reason: "exit-mismatch" }
}

function stop(reason: string) {
  return { status: "not-run" as const, reason }
}

function decode(data: Uint8Array) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(data)
  } catch {
    return undefined
  }
}
