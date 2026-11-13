export * as ReviewGolangci from "./golangci"

import path from "path"
import { mkdir } from "fs/promises"
import { Effect } from "effect"
import { Probe } from "../research-toolkit/probe/types"
import { ResearchProcess } from "../research-toolkit/process"
import type { ReviewAnalyze } from "./analyze"

// Design §7.4: `golangci-lint run --new-from-merge-base=<base>`, SARIF via `--output.sarif.path`.
// GPL: the host uses the installed binary and does not fetch one. A missing binary does not block.

export const ABSENT = "golangci-lint absent"
const TEMPLATE = "golangci-lint"
const TIMEOUT_MS = 10 * 60_000
const OUTPUT_BYTES = 16 * 1024 * 1024

type Confine = ReviewAnalyze.Confine

/** Closed argv. The only flags are the merge-base and the SARIF path. */
export function argv(bin: string, base: string, out: string) {
  return [bin, "run", `--new-from-merge-base=${base}`, `--output.sarif.path=${out}`]
}

export const run = Effect.fn("ReviewGolangci.run")(function* (
  pack: ReviewAnalyze.Pack,
  context: ReviewAnalyze.RunContext,
  confine: Confine,
) {
  if (context.input.lane !== "build") return finished(pack, "not-run", false, `lane: build is above ${context.input.lane}`)
  if (!context.input.trusted) return finished(pack, "not-run", false, "build lane off (D6)")
  if (pack.template !== TEMPLATE) return finished(pack, "not-run", false, "not-built")
  if (pack.status === "dropped") return finished(pack, "not-run", false, "dropped")
  if (!safeRevision(context.input.base)) return finished(pack, "not-run", false, "target-missing: base")
  const head = yield* context.head
  if ("failed" in head) return finished(pack, "not-run", false, head.failed)
  const env = ResearchProcess.environment()
  const bin = Bun.which("golangci-lint", { PATH: env.PATH ?? "" })
  if (!bin) return finished(pack, "not-run", false, ABSENT)
  const root = head.snapshot.root
  const cache = path.join(root, ".review-golangci")
  const out = path.join(cache, "out.sarif")
  yield* Effect.promise(() => mkdir(cache, { recursive: true }))
  const gitDir = (yield* ResearchProcess.git(head.snapshot.origin, ["rev-parse", "--git-dir"])).toString("utf8").trim()
  const command = argv(bin, context.input.base, out)
  const ran = yield* confine({
    argv: command,
    cwd: root,
    write: [root],
    env: {
      ...env,
      GIT_DIR: path.resolve(head.snapshot.origin, gitDir),
      GOLANGCI_LINT_CACHE: cache,
      GOTOOLCHAIN: "local",
      GOPROXY: "off",
      GOFLAGS: "-mod=readonly",
    },
    timeoutMs: TIMEOUT_MS,
    maxBytes: OUTPUT_BYTES,
    tailBytes: Probe.Limits.outputBytes,
  })
  if ("denied" in ran) return finished(pack, "not-run", false, ran.denied)
  const stdout = ran.outcome.stdout.data.toString("utf8")
  const stderr = ran.outcome.stderr.data.toString("utf8")
  const text = [`$ ${command.map((arg) => arg.split(cache).join("<scratch>")).join(" ")}`, "stdout:", stdout, "stderr:", stderr].join("\n")
  const uri = yield* context.write("raw/golangci-lint.log", text)
  const unsettled = settle(ran.outcome)
  if (unsettled) return finished(pack, unsettled.status, true, unsettled.reason, uri)
  if (ran.outcome.exitCode === 127) return finished(pack, "not-run", true, ABSENT, uri)
  if (ran.outcome.exitCode === 0) return finished(pack, "pass", true, undefined, uri)
  return finished(pack, "fail", true, `exit ${ran.outcome.exitCode}`, uri)
})

function safeRevision(value: string) {
  return value.length > 0 && !value.startsWith("-") && !/[\s\0]/.test(value)
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
