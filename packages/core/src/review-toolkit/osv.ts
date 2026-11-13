export * as ReviewOsv from "./osv"

import { Effect } from "effect"
import { BackendToolkit } from "../backend-toolkit"
import pinned from "../backend-toolkit/packs/osv-scanner"
import { Probe } from "../research-toolkit/probe/types"
import { ResearchProcess } from "../research-toolkit/process"
import { ReviewOsvFacts } from "./osv-facts"
import { ReviewTypeAware } from "./type-aware"
import type { ReviewAnalyze } from "./analyze"

// Design §7.3 and D7. The closed review argv is the documented offline scan at tag v2.7.1:
// `osv-scanner scan source -r <copy> --offline`. `fix` is never passed. The review does not download
// the database. v2.7.1's download command is a host refresh outside the review, not this argv.

export const DATABASE_ABSENT = ReviewOsvFacts.DATABASE_ABSENT
export const DATABASE_AGE = ReviewOsvFacts.DATABASE_AGE
const TEMPLATE = "osv-offline"
const TIMEOUT_MS = 10 * 60_000
const OUTPUT_BYTES = 16 * 1024 * 1024

type Confine = ReviewAnalyze.Confine

export const argv = ReviewOsvFacts.argv
export const lockfiles = ReviewOsvFacts.lockfiles
export const databaseDir = ReviewOsvFacts.databaseDir

export const run = Effect.fn("ReviewOsv.run")(function* (
  pack: ReviewAnalyze.Pack,
  context: ReviewAnalyze.RunContext,
  confine: Confine,
) {
  if (pack.template !== TEMPLATE) return finished(pack, "not-run", false, "not-built")
  if (pack.status === "dropped") return finished(pack, "not-run", false, "dropped")
  const changed = lockfiles(Object.keys(context.input.changed))
  if (changed.length === 0) return finished(pack, "not-run", false, "target-missing: lockfile")
  const needed = ReviewOsvFacts.ecosystems(changed)
  const dir = databaseDir()
  if (!(yield* ReviewOsvFacts.databaseReady(dir, needed))) return finished(pack, "not-run", false, DATABASE_ABSENT)
  const age = yield* ReviewOsvFacts.databaseAge(dir, needed)
  const stated = (reason?: string) => ReviewOsvFacts.cardReason(reason, age)
  const located = yield* binary()
  if (!located.ok) return finished(pack, "not-run", false, stated(located.reason))
  const head = yield* context.head
  if ("failed" in head) return finished(pack, "not-run", false, stated(head.failed))
  const command = argv(located.executable, head.snapshot.root)
  const ran = yield* confine({
    argv: command,
    cwd: head.snapshot.root,
    write: [],
    env: { ...ResearchProcess.environment(), OSV_SCANNER_LOCAL_DB_CACHE_DIRECTORY: dir },
    timeoutMs: TIMEOUT_MS,
    maxBytes: OUTPUT_BYTES,
    tailBytes: Probe.Limits.outputBytes,
  })
  if ("denied" in ran) return finished(pack, "not-run", false, stated(ran.denied))
  const stdout = ran.outcome.stdout.data.toString("utf8")
  const stderr = ran.outcome.stderr.data.toString("utf8")
  const text = [`$ ${command.join(" ")}`, "stdout:", stdout, "stderr:", stderr].join("\n")
  const uri = yield* context.write("raw/osv-scanner.log", text)
  const unsettled = settle(ran.outcome)
  if (unsettled) return finished(pack, unsettled.status, true, stated(unsettled.reason), uri)
  if (ran.outcome.exitCode === 0) return finished(pack, "pass", true, stated(undefined), uri)
  if (ran.outcome.exitCode === 1) return finished(pack, "fail", true, stated("findings"), uri)
  if (ran.outcome.exitCode === 128) return finished(pack, "not-run", true, stated("no packages found"), uri)
  return finished(pack, "acquisition-error", true, stated(`exit ${ran.outcome.exitCode}`), uri)
})

export const binary = Effect.fnUntraced(function* () {
  if (process.platform !== "linux" || process.arch !== "x64") return { ok: false as const, reason: ReviewTypeAware.UNQUALIFIED }
  const target = yield* BackendToolkit.Target
  if ("target" in target && target.target !== "linux-x64") return { ok: false as const, reason: ReviewTypeAware.UNQUALIFIED }
  const ready = yield* BackendToolkit.ensure<string>(pinned.id).pipe(
    Effect.provideService(BackendToolkit.Manifest, { [pinned.id]: pinned }),
    Effect.map((installed) => installed.executable),
    Effect.catch((error) => Effect.succeed(error)),
  )
  if (typeof ready !== "string") return { ok: false as const, reason: `${pinned.id} absent: ${cause(ready)}` }
  return { ok: true as const, executable: ready }
})

function cause(error: unknown) {
  if (error && typeof error === "object" && "reason" in error && typeof error.reason === "string") return error.reason
  return "fetch-failed"
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
