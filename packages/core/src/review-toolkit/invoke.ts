export * as ReviewInvoke from "./invoke"

import path from "path"
import { Effect } from "effect"
import { Probe } from "../research-toolkit/probe/types"
import { ResearchProcess } from "../research-toolkit/process"
import type { ReviewAnalyze } from "./analyze"

// Design §7.1: GPL tools already on PATH. The host passes the changed files and no flag.
// A missing binary is recorded as `not run: <tool> absent` and does not block.

const TEMPLATE = "invoke"
const TIMEOUT_MS = 5 * 60_000
const OUTPUT_BYTES = 4 * 1024 * 1024

type Confine = ReviewAnalyze.Confine

export function absent(tool: string) {
  return `not run: ${tool} absent`
}

/** Closed argv: the binary and the host-chosen files. No flag. */
export function argv(bin: string, files: readonly string[]) {
  return [bin, ...files]
}

export function files(tool: string, changed: readonly string[]) {
  return changed.filter((file) => match(tool, file)).sort()
}

export const run = Effect.fn("ReviewInvoke.run")(function* (
  pack: ReviewAnalyze.Pack,
  context: ReviewAnalyze.RunContext,
  confine: Confine,
) {
  if (pack.template !== TEMPLATE) return finished(pack, "not-run", false, "not-built")
  if (pack.status === "dropped") return finished(pack, "not-run", false, "dropped")
  const picked = files(pack.id, Object.keys(context.input.changed))
  if (picked.length === 0) return finished(pack, "not-run", false, "target-missing: file")
  const head = yield* context.head
  if ("failed" in head) return finished(pack, "not-run", false, head.failed)
  const env = ResearchProcess.environment()
  const bin = Bun.which(pack.id, { PATH: env.PATH ?? "" })
  if (!bin) return finished(pack, "not-run", false, absent(pack.id))
  const command = argv(bin, picked)
  const ran = yield* confine({
    argv: command,
    cwd: head.snapshot.root,
    write: [],
    env,
    timeoutMs: TIMEOUT_MS,
    maxBytes: OUTPUT_BYTES,
    tailBytes: Probe.Limits.outputBytes,
  })
  if ("denied" in ran) return finished(pack, "not-run", false, ran.denied)
  const stdout = ran.outcome.stdout.data.toString("utf8")
  const stderr = ran.outcome.stderr.data.toString("utf8")
  const text = [`$ ${command.join(" ")}`, "stdout:", stdout, "stderr:", stderr].join("\n")
  const uri = yield* context.write(`raw/${pack.id}.log`, text)
  const unsettled = settle(ran.outcome)
  if (unsettled) return finished(pack, unsettled.status, true, unsettled.reason, uri)
  if (ran.outcome.exitCode === 127) return finished(pack, "not-run", true, absent(pack.id), uri)
  if (ran.outcome.exitCode === 0) return finished(pack, "pass", true, undefined, uri)
  return finished(pack, "fail", true, `exit ${ran.outcome.exitCode}`, uri)
})

function match(tool: string, file: string) {
  if (file.split("/").includes("..")) return false
  const base = path.posix.basename(file)
  if (tool === "hadolint") return base === "Dockerfile" || file.endsWith(".dockerfile")
  if (tool === "shellcheck") return file.endsWith(".sh") || file.endsWith(".bash")
  return false
}

function settle(outcome: ResearchProcess.Outcome) {
  if (outcome.timedOut) return { status: "not-run" as const, reason: "timeout" }
  if (outcome.memoryExceeded) return { status: "not-run" as const, reason: "memory cap" }
  if (outcome.overflow) return { status: "acquisition-error" as const, reason: "output cap" }
  if (outcome.failure !== undefined) return { status: "acquisition-error" as const, reason: outcome.failure }
  return undefined
}

function finished(
  pack: ReviewAnalyze.Pack,
  status: ReviewAnalyze.Status,
  workspaceExecuted: boolean,
  reason?: string,
  uri?: string,
): ReviewAnalyze.Outcome {
  return {
    checks: [{
      id: pack.id,
      pack: pack.id,
      version: pack.version,
      lane: pack.lane,
      status,
      ...(reason === undefined ? {} : { reason }),
      workspaceExecuted,
      ...(uri === undefined ? {} : { uri }),
    }],
    head: [],
    base: [],
  }
}
