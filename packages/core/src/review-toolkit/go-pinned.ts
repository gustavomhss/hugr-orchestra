export * as ReviewGoPinned from "./go-pinned"

import path from "path"
import { mkdir } from "fs/promises"
import { Effect } from "effect"
import { BackendToolkit } from "../backend-toolkit"
import gosec from "../backend-toolkit/packs/gosec"
import staticcheck from "../backend-toolkit/packs/staticcheck"
import { Probe } from "../research-toolkit/probe/types"
import { ResearchProcess } from "../research-toolkit/process"
import { ReviewSarif } from "./sarif"
import { ReviewGoVet } from "./govet"
import { ReviewTypeAware } from "./type-aware"
import type { ReviewAnalyze } from "./analyze"

// Design §7.4 first pass. staticcheck gets no flag. gosec gets only `-fmt sarif` and `-out`.
// Neither is searched on PATH. Linux x64 is the only qualified runtime.

const TIMEOUT_MS = 10 * 60_000
const OUTPUT_BYTES = 16 * 1024 * 1024

type Confine = ReviewAnalyze.Confine

export function staticcheckArgv(bin: string, pkgs: readonly string[]) {
  return [bin, ...pkgs]
}

/** Closed gosec argv. `-ai-api` is never included. */
export function gosecArgv(bin: string, out: string, pkgs: readonly string[]) {
  return [bin, "-fmt", "sarif", "-out", out, ...pkgs]
}

export const run = Effect.fn("ReviewGoPinned.run")(function* (
  pack: ReviewAnalyze.Pack,
  context: ReviewAnalyze.RunContext,
  confine: Confine,
) {
  if (context.input.lane !== "build") return finished(pack, "not-run", false, `lane: build is above ${context.input.lane}`)
  if (!context.input.trusted) return finished(pack, "not-run", false, "build lane off (D6)")
  if (pack.status === "dropped") return finished(pack, "not-run", false, "dropped")
  const pkgs = ReviewGoVet.packages(Object.keys(context.input.changed))
  if (pkgs.length === 0) return finished(pack, "not-run", false, "target-missing: go")
  const head = yield* context.head
  if ("failed" in head) return finished(pack, "not-run", false, head.failed)
  const located = yield* locate(pack.template)
  if (!located.ok) return finished(pack, "not-run", false, located.reason)
  const root = head.snapshot.root
  const cache = path.join(root, ".review-go-cache")
  yield* Effect.promise(() => Promise.all([
    mkdir(path.join(cache, "build"), { recursive: true }),
    mkdir(path.join(cache, "mod"), { recursive: true }),
  ]))
  const out = path.join(cache, "gosec.sarif")
  const command = pack.template === "gosec-sarif" ? gosecArgv(located.executable, out, pkgs) : staticcheckArgv(located.executable, pkgs)
  const env = ResearchProcess.environment()
  const ran = yield* confine({
    argv: command,
    cwd: root,
    write: [root],
    env: {
      ...env,
      GOTOOLCHAIN: "local",
      GOPROXY: "off",
      GOFLAGS: "-mod=readonly",
      GOCACHE: path.join(cache, "build"),
      GOMODCACHE: path.join(cache, "mod"),
    },
    timeoutMs: TIMEOUT_MS,
    maxBytes: OUTPUT_BYTES,
    tailBytes: Probe.Limits.outputBytes,
  })
  if ("denied" in ran) return finished(pack, "not-run", false, ran.denied)
  const stdout = ran.outcome.stdout.data.toString("utf8")
  const stderr = ran.outcome.stderr.data.toString("utf8")
  const text = [`$ ${command.map((arg) => arg.split(cache).join("<scratch>")).join(" ")}`, "stdout:", stdout, "stderr:", stderr].join("\n")
  const uri = yield* context.write(`raw/${pack.id}.log`, text)
  const unsettled = settle(ran.outcome)
  if (unsettled) return finished(pack, unsettled.status, true, unsettled.reason, uri)
  if (ran.outcome.exitCode === 127) return finished(pack, "not-run", true, `${pack.id} absent`, uri)
  if (pack.template === "gosec-sarif") return yield* gosecResult(pack, out, root, ran.outcome.exitCode ?? 1, uri)
  if (ran.outcome.exitCode === 0) return finished(pack, "pass", true, undefined, uri)
  return finished(pack, "fail", true, `exit ${ran.outcome.exitCode}`, uri)
})

const locate = Effect.fnUntraced(function* (template: string) {
  if (process.platform !== "linux" || process.arch !== "x64") return { ok: false as const, reason: ReviewTypeAware.UNQUALIFIED }
  const target = yield* BackendToolkit.Target
  if ("target" in target && target.target !== "linux-x64") return { ok: false as const, reason: ReviewTypeAware.UNQUALIFIED }
  const manifest = template === "gosec-sarif" ? gosec : staticcheck
  const ready = yield* BackendToolkit.ensure<string>(manifest.id).pipe(
    Effect.provideService(BackendToolkit.Manifest, { [manifest.id]: manifest }),
    Effect.map((installed) => installed.executable),
    Effect.catch((error) => Effect.succeed(error)),
  )
  if (typeof ready !== "string") return { ok: false as const, reason: `${manifest.id} absent: ${cause(ready)}` }
  return { ok: true as const, executable: ready }
})

const gosecResult = Effect.fnUntraced(function* (
  pack: ReviewAnalyze.Pack,
  out: string,
  root: string,
  exitCode: number,
  uri: string,
) {
  const text = yield* Effect.promise(() => Bun.file(out).text().catch(() => ""))
  if (!text) return finished(pack, exitCode === 0 ? "pass" : "fail", true, exitCode === 0 ? undefined : `exit ${exitCode}`, uri)
  const parsed = ReviewSarif.parseSarif(text, { pack: pack.id, root })
  if (parsed.status !== "ok") return finished(pack, "acquisition-error", true, parsed.reason, uri)
  if (parsed.results.length > 0) return finished(pack, "fail", true, `${parsed.results.length} findings`, uri)
  return finished(pack, "pass", true, undefined, uri)
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
