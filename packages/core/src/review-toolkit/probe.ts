export * as ReviewProbe from "./probe"

import path from "path"
import { mkdir, rm } from "fs/promises"
import { Duration, Effect, Option, Schema, Semaphore } from "effect"
import { Reference } from "effect/Context"
import { PositiveInt, optional } from "@orchestra/schema/schema"
import { denied } from "../research-toolkit/probe/assets"
import { Probe } from "../research-toolkit/probe/types"
import { ReviewScratch } from "./scratch-copy"
import { ReviewProbeRuntime } from "./probe-runtime"
import { ReviewProbeTargets } from "./probe-targets"
import { ReviewProbeProperty } from "./probe-property"
import { ReviewProbeInterleave } from "./probe-interleave"
import { ReviewProbeMutants } from "./probe-mutants"
import { withSnapshotMutation, writeSnapshot } from "./snapshot-mutation"

// K6 probe half (E1): one catalog option, mapped by the host to a closed research runner, run confined in the review's
// scratch copy through ResearchProcess (omni). The model picks an option and a target; it never names a binary or flag.

/** The probe options this build runs; any other option id answers `not-run: not-built` (K6, phase 1). */
export const ADVANCED = ["probe:mutants", "probe:interleave", "probe:property"] as const
export const BUILT = ["probe:regress", "probe:test", "probe:typecheck", "probe:script", "probe:race", ...ADVANCED] as const

/** Host observation of actual semaphore operations, used by the cancellation-order fixture. */
export const ObservePermit = Reference<(event: "waiting" | "acquired" | "released") => void>("@orchestra/ReviewProbe/ObservePermit", {
  defaultValue: () => () => {},
})

const EXCERPT_BYTES = 4096
const file = Schema.NonEmptyString.check(Schema.isMaxLength(8192))

export const Input = Schema.Struct({
  candidate: Schema.NonEmptyString.check(Schema.isMaxLength(256)),
  /** A catalog option id offered in the brief. */
  option: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
  target: Schema.Struct({
    property: optional(ReviewProbeTargets.Property),
    interleave: optional(ReviewProbeTargets.Interleave),
    mutants: optional(ReviewProbeTargets.Mutants),
    hunk: optional(Schema.Struct({ path: file, startLine: PositiveInt, endLine: PositiveInt })),
    test: optional(Schema.Struct({ file, name: optional(Schema.NonEmptyString.check(Schema.isMaxLength(1024))) })),
    script: optional(Schema.Struct({
      language: Schema.NonEmptyString.check(Schema.isMaxLength(16)),
      text: Schema.NonEmptyString.check(Schema.isMaxLength(Probe.Limits.scriptBytes)),
    })),
  }),
})
export type Input = typeof Input.Type

export type Status = "pass" | "fail" | "not-run"

export type Output = {
  readonly status: Status
  readonly reason?: string
  readonly exitCode?: number
  readonly durationMs: number
  readonly excerpt: string
  readonly uri: string
  /** The head copy's digest the probe ran against. */
  readonly tree: string
}

/** K1 probe evidence. */
export type Evidence = { readonly kind: "probe"; readonly option: string; readonly command: string; readonly result: string; readonly uri: string }

/** One settled probe attempt. The host records it; a model does not supply it. */
export type Observed = { readonly candidate: string; readonly option: string; readonly result: Output }

/** Per-review record the host keeps for repeat and cap refusals, plus each settled attempt. */
export type Ledger = { readonly runs: Set<string>; readonly attempts: Map<string, number>; readonly observed: Observed[] }

export const ledger = (): Ledger => ({ runs: new Set(), attempts: new Map(), observed: [] })

export type Context = {
  readonly reviewID: string
  readonly head: ReviewScratch.Snapshot
  /** The base copy; with it `probe:regress` adds the base-versus-head differential. */
  readonly base?: ReviewScratch.Snapshot
  /** Host-owned candidate IDs and the options offered for each candidate's class and language. */
  readonly offered: Readonly<Record<string, ReadonlyArray<string>>>
  /** Probe attempts allowed per candidate at the review's tier (§8.4). */
  readonly cap: number
  /** The reviewed diff's hunks, host-computed; a regress target picks one by path and line range. */
  readonly hunks: ReadonlyArray<ReviewScratch.Hunk>
  readonly ledger: Ledger
  /** Called with only this attempt, after the ledger append. Absent is not a second copy of `ledger.observed`. */
  readonly observe?: (items: ReadonlyArray<Observed>) => void
  readonly timeoutSeconds: number
  readonly queueSeconds?: number
}

type Step = ReviewProbeRuntime.Step

/**
 * Runs one probe. `result` is the K6 output; `artifact` is the raw output the caller retains under `result.uri`;
 * `evidence` is present whenever the probe ran to pass or fail, for the verifier to cite.
 */
export const run = Effect.fn("ReviewProbe.run")(function* (input: Input, context: Context) {
  const started = Date.now()
  const uri = `review-probe:${context.reviewID}/${Bun.randomUUIDv7()}`
  const key = `${input.candidate}\0${input.option}\0${context.head.digest}`
  const refusal = refuse(input, context, key)
  if (refusal) return settle(input, context, { uri, started, steps: [], status: "not-run", reason: refusal })
  // Checked and recorded with no yield between, so two concurrent calls cannot both pass the repeat check.
  context.ledger.runs.add(key)
  context.ledger.attempts.set(input.candidate, (context.ledger.attempts.get(input.candidate) ?? 0) + 1)
  if (!(yield* permit(context.queueSeconds ?? Probe.Limits.queueSeconds))) {
    context.ledger.runs.delete(key)
    context.ledger.attempts.set(input.candidate, (context.ledger.attempts.get(input.candidate) ?? 1) - 1)
    return settle(input, context, { uri, started, steps: [], status: "not-run", reason: "busy" })
  }
  const executed = yield* execute(input, context)
  if ("status" in executed) return settle(input, context, { uri, started, ...executed })
  const steps = executed
  const stopped = steps.find((step) => step.status === "not-run")
  if (stopped) return settle(input, context, { uri, started, steps, status: "not-run", reason: stopped.reason })
  // Regress holds when the test passes on head and fails wherever the change is taken away.
  const status = steps[0]?.status === "pass" && steps.slice(1).every((step) => step.status === "fail") ? "pass" : "fail"
  return settle(input, context, { uri, started, steps, status })
}, Effect.scoped)

function refuse(input: Input, context: Context, key: string) {
  if (!Object.hasOwn(context.offered, input.candidate)) return `refused: candidate-unknown: ${input.candidate}`
  if (!context.offered[input.candidate].includes(input.option)) return `refused: option-not-offered: ${input.option}`
  if (!BUILT.some((option) => option === input.option)) return "not-built"
  if (context.ledger.runs.has(key)) return `refused: repeat: ${input.option} already ran on ${input.candidate} at this tree`
  if ((context.ledger.attempts.get(input.candidate) ?? 0) >= context.cap) return `refused: attempt-cap: ${context.cap}`
  return undefined
}

const execute = Effect.fnUntraced(function* (input: Input, context: Context) {
  const target = input.target
  if (input.option === "probe:property")
    return target.property ? yield* ReviewProbeProperty.run(target.property, context) : { status: "not-run", reason: "target-missing: property", steps: [] } satisfies ReviewProbeRuntime.Result
  if (input.option === "probe:interleave")
    return target.interleave ? yield* ReviewProbeInterleave.run(target.interleave, context) : { status: "not-run", reason: "target-missing: interleave", steps: [] } satisfies ReviewProbeRuntime.Result
  if (input.option === "probe:mutants")
    return target.mutants ? yield* ReviewProbeMutants.run(target.mutants, context) : { status: "not-run", reason: "target-missing: mutants", steps: [] } satisfies ReviewProbeRuntime.Result
  if (input.option === "probe:typecheck")
    return [yield* ReviewProbeRuntime.step("head", context.head, { kind: "typecheck", project: target.hunk?.path ?? target.test?.file ?? "." }, context)]
  if (input.option === "probe:script") {
    if (!target.script) return [ReviewProbeRuntime.notRun("target-missing: script")]
    const language = target.script.language
    if (language !== "ts" && language !== "js" && language !== "py") return [ReviewProbeRuntime.notRun(`script-language-unsupported: ${language}`)]
    return [yield* ReviewProbeRuntime.step("head", context.head, { kind: "script", language, source: target.script.text }, context)]
  }
  if (!target.test) return [ReviewProbeRuntime.notRun("target-missing: test")]
  const test = { kind: "test" as const, file: target.test.file, name: target.test.name }
  if (input.option === "probe:test") return [yield* ReviewProbeRuntime.step("head", context.head, test, context)]
  // Go is the only catalogued race detector. Other languages are not run, and nothing is installed.
  if (input.option === "probe:race") {
    if (!target.test.file.endsWith(".go")) return [ReviewProbeRuntime.notRun("race-detector-absent")]
    return [yield* ReviewProbeRuntime.step("head", context.head, test, context, true)]
  }
  const hunk = target.hunk ? pick(context.hunks, target.hunk) : undefined
  if (target.hunk && !hunk) return [ReviewProbeRuntime.notRun(`hunk-unknown: ${target.hunk.path}:${target.hunk.startLine}-${target.hunk.endLine}`)]
  if (!hunk && !context.base) return [ReviewProbeRuntime.notRun("target-missing: regress needs a hunk or a base copy")]
  const head = yield* ReviewProbeRuntime.step("head", context.head, test, context)
  if (head.status === "not-run") return [head]
  const reverted = hunk ? yield* revertedStep(hunk, test, context) : undefined
  const base = context.base ? yield* baseStep(context.base, test, context) : undefined
  return [head, ...(reverted ? [reverted] : []), ...(base ? [base] : [])]
})

/** The test with one hunk reverted in the head copy only; the copy is restored before the next probe. */
const revertedStep = Effect.fnUntraced(function* (hunk: ReviewScratch.Hunk, test: Probe.ProbeInput["runner"], context: Context) {
  return yield* withSnapshotMutation(
    ReviewScratch.revert(context.head, hunk),
    ReviewScratch.revert(context.head, { path: hunk.path, line: hunk.line, current: hunk.original, original: hunk.current }).pipe(Effect.orDie),
    ReviewProbeRuntime.step("reverted", context.head, test, context),
  ).pipe(Effect.catchTag("Probe.Error", () => Effect.succeed(ReviewProbeRuntime.notRun(`hunk-not-in-copy: ${hunk.path}:${hunk.line}`, "reverted"))))
})

/** The head's test file run against the base copy, then the base copy's own file (or none) put back. */
const baseStep = Effect.fnUntraced(function* (base: ReviewScratch.Snapshot, test: Extract<Probe.ProbeInput["runner"], { kind: "test" }>, context: Context) {
  const files = yield* Effect.all([ReviewScratch.resolve(context.head, test.file), ReviewScratch.resolve(base, test.file)]).pipe(
    Effect.catchTag("Probe.Error", () => Effect.succeed(undefined)))
  if (!files) return ReviewProbeRuntime.notRun(`path-outside-copy: ${test.file}`, "base")
  const source = Bun.file(files[0])
  if (!(yield* Effect.promise(() => source.exists()))) return ReviewProbeRuntime.notRun(`test-file-missing: ${test.file}`, "base")
  const previous = yield* Effect.promise(() => Bun.file(files[1]).bytes().catch(() => undefined))
  return yield* withSnapshotMutation(Effect.gen(function* () {
    yield* Effect.promise(() => mkdir(path.dirname(files[1]), { recursive: true }))
    yield* writeSnapshot(files[1], yield* Effect.promise(() => source.bytes()))
  }), Effect.gen(function* () {
    if (previous === undefined) {
      yield* Effect.promise(() => rm(files[1], { force: true }))
      return
    }
    yield* writeSnapshot(files[1], previous)
  }), ReviewProbeRuntime.step("base", base, test, context))
})

/** The diff hunk on the target's path whose current lines overlap the target's range. */
function pick(hunks: ReadonlyArray<ReviewScratch.Hunk>, target: { path: string; startLine: number; endLine: number }) {
  const wanted = path.normalize(target.path)
  return hunks.find((hunk) => path.normalize(hunk.path) === wanted &&
    hunk.line <= target.endLine && hunk.line + Math.max(hunk.current.length, 1) - 1 >= target.startLine)
}

function settle(input: Input, context: Context, outcome: { uri: string; started: number; steps: ReadonlyArray<Step>; status: Status; reason?: string }) {
  const steps = outcome.steps
  const primary = input.option === "probe:mutants" ? steps.find((step) => step.label === "mutants") ?? steps[0] : steps[0]
  const share = Math.floor(EXCERPT_BYTES / Math.max(steps.length, 1))
  const excerpt = steps.map((step) => {
    const header = `[${step.label}] ${step.reason ?? `${step.status} (exit ${step.exitCode ?? "none"})`}`
    return `${header}\n${tail(`${step.stdout}\n${step.stderr}`, share - Buffer.byteLength(header) - 1)}`.trim()
  }).join("\n")
  const result = {
    status: outcome.status,
    reason: outcome.reason,
    exitCode: primary?.exitCode,
    durationMs: Date.now() - outcome.started,
    excerpt: excerpt || (outcome.reason ?? ""),
    uri: outcome.uri,
    tree: context.head.digest,
  } satisfies Output
  const item = { candidate: input.candidate, option: input.option, result }
  context.ledger.observed.push(item)
  context.observe?.([item])
  const text = [
    `option: ${input.option}`, `candidate: ${input.candidate}`, `tree: ${context.head.digest}`, `status: ${outcome.status}${outcome.reason ? ` (${outcome.reason})` : ""}`,
    ...steps.flatMap((step) => [`--- ${step.label}: ${step.reason ?? step.status}`, `$ ${step.argv.join(" ")}`, `exit: ${step.exitCode ?? "none"}`,
      "stdout:", step.stdout, "stderr:", step.stderr]),
  ].join("\n")
  const evidence = outcome.status === "not-run" ? undefined : {
    kind: "probe", option: input.option, command: primary?.argv.join(" ") ?? input.option,
    result: [outcome.status, ...steps.map((step) => `${step.label} ${step.status}`)].join("; "), uri: outcome.uri,
  } satisfies Evidence
  return { result, artifact: { uri: outcome.uri, text }, evidence }
}

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g

/** The last `bytes` of the output, without color codes. */
function tail(text: string, bytes: number) {
  const data = Buffer.from(text.replace(ANSI, "").trim())
  return data.subarray(Math.max(data.length - Math.max(bytes, 0), 0)).toString("utf8")
}

// R8: review probes share one low host cap. The research probe's semaphore is private to its module (see Corrections).
const HOST = Semaphore.makeUnsafe(1)

const permit = Effect.fnUntraced(function* (seconds: number) {
  const observe = yield* ObservePermit
  observe("waiting")
  const got = yield* Effect.acquireRelease(
    HOST.take(1).pipe(Effect.timeoutOption(Duration.seconds(seconds))),
    (got) => Option.isSome(got) ? HOST.release(1).pipe(Effect.tap(() => Effect.sync(() => observe("released")))) : Effect.void,
    { interruptible: true },
  )
  if (Option.isNone(got)) return false
  observe("acquired")
  return true
})
