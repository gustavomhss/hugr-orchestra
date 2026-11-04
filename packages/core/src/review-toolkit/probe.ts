export * as ReviewProbe from "./probe"

import path from "path"
import { mkdir, mkdtemp, rm } from "fs/promises"
import { Duration, Effect, Option, Schema, Semaphore } from "effect"
import { PositiveInt, optional } from "@orchestra/schema/schema"
import { ToolSafetySandbox } from "../tool-safety-sandbox"
import { ResearchProcess } from "../research-toolkit/process"
import { denied } from "../research-toolkit/probe/assets"
import { ProbeRun } from "../research-toolkit/probe/run"
import { ProbeRunners } from "../research-toolkit/probe/runners"
import { Probe } from "../research-toolkit/probe/types"
import { ReviewScratch } from "./scratch-copy"
import { withSnapshotMutation, writeSnapshot } from "./snapshot-mutation"

// K6 probe half (E1): one catalog option, mapped by the host to a closed research runner, run confined in the review's
// scratch copy through ResearchProcess (omni). The model picks an option and a target; it never names a binary or flag.

/** The probe options this build runs; any other option id answers `not-run: not-built` (K6, phase 1). */
export const BUILT = ["probe:regress", "probe:test", "probe:typecheck", "probe:script"] as const

const EXCERPT_BYTES = 4096
const file = Schema.NonEmptyString.check(Schema.isMaxLength(8192))

export const Input = Schema.Struct({
  candidate: Schema.NonEmptyString.check(Schema.isMaxLength(256)),
  /** A catalog option id offered in the brief. */
  option: Schema.NonEmptyString.check(Schema.isMaxLength(128)),
  target: Schema.Struct({
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

/** Per-review record the host keeps for repeat and cap refusals. */
export type Ledger = { readonly runs: Set<string>; readonly attempts: Map<string, number> }

export const ledger = (): Ledger => ({ runs: new Set(), attempts: new Map() })

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
  readonly timeoutSeconds: number
  readonly queueSeconds?: number
}

type Step = {
  readonly label: "head" | "reverted" | "base"
  readonly status: Status
  readonly reason?: string
  readonly exitCode?: number
  readonly argv: ReadonlyArray<string>
  readonly stdout: string
  readonly stderr: string
}

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
  const steps = yield* execute(input, context)
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
  if (input.option === "probe:typecheck")
    return [yield* step("head", context.head, { kind: "typecheck", project: target.hunk?.path ?? target.test?.file ?? "." }, context)]
  if (input.option === "probe:script") {
    if (!target.script) return [notRun("target-missing: script")]
    const language = target.script.language
    if (language !== "ts" && language !== "js" && language !== "py") return [notRun(`script-language-unsupported: ${language}`)]
    return [yield* step("head", context.head, { kind: "script", language, source: target.script.text }, context)]
  }
  if (!target.test) return [notRun("target-missing: test")]
  const test = { kind: "test" as const, file: target.test.file, name: target.test.name }
  if (input.option === "probe:test") return [yield* step("head", context.head, test, context)]
  const hunk = target.hunk ? pick(context.hunks, target.hunk) : undefined
  if (target.hunk && !hunk) return [notRun(`hunk-unknown: ${target.hunk.path}:${target.hunk.startLine}-${target.hunk.endLine}`)]
  if (!hunk && !context.base) return [notRun("target-missing: regress needs a hunk or a base copy")]
  const head = yield* step("head", context.head, test, context)
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
    step("reverted", context.head, test, context),
  ).pipe(Effect.catchTag("Probe.Error", () => Effect.succeed(notRun(`hunk-not-in-copy: ${hunk.path}:${hunk.line}`, "reverted"))))
})

/** The head's test file run against the base copy, then the base copy's own file (or none) put back. */
const baseStep = Effect.fnUntraced(function* (base: ReviewScratch.Snapshot, test: Extract<Probe.ProbeInput["runner"], { kind: "test" }>, context: Context) {
  const files = yield* Effect.all([ReviewScratch.resolve(context.head, test.file), ReviewScratch.resolve(base, test.file)]).pipe(
    Effect.catchTag("Probe.Error", () => Effect.succeed(undefined)))
  if (!files) return notRun(`path-outside-copy: ${test.file}`, "base")
  const source = Bun.file(files[0])
  if (!(yield* Effect.promise(() => source.exists()))) return notRun(`test-file-missing: ${test.file}`, "base")
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
  }), step("base", base, test, context))
})

/** One closed runner in a copy, confined: no network, writes only to the confine's own scratch. */
const step = Effect.fnUntraced(function* (label: Step["label"], copy: ReviewScratch.Snapshot, runner: Probe.ProbeInput["runner"], context: Context) {
  // A fresh directory per run for the runner's script and version checks; the copy itself stays as taken.
  const scratch = yield* Effect.promise(() => mkdtemp(path.join(copy.scratch, "probe-")))
  const env = ResearchProcess.environment()
  return yield* Effect.gen(function* () {
    const plan = yield* ProbeRunners.plan({ runner, snapshot: copy, scratch, heapMiB: Probe.Limits.heapMiB, env })
    const launch = yield* ToolSafetySandbox.confine({ command: plan.argv[0], args: plan.argv.slice(1), cwd: plan.cwd, env: { ...env, ...plan.env }, write: [] })
      .pipe(Effect.mapError((error) => denied(`sandbox-unavailable: ${error.reason}`)))
    const outcome = yield* ResearchProcess.run({
      command: launch.command, args: launch.args, cwd: plan.cwd,
      env: Object.fromEntries(Object.entries(launch.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      timeoutMs: context.timeoutSeconds * 1000, maxBytes: Probe.Limits.outputBytes, maxRssBytes: Probe.Limits.rssBytes,
    })
    const stdout = outcome.stdout.data.toString("utf8")
    const stderr = outcome.stderr.data.toString("utf8")
    const argv = plan.argv.map((arg) => arg.split(copy.scratch).join("<scratch>"))
    const settled = verdict(outcome, `${stdout}\n${stderr}`)
    return { label, ...settled, exitCode: outcome.exitCode ?? undefined, argv, stdout, stderr } satisfies Step
  }).pipe(
    // A missing toolchain or runner, a path outside the copy, or no jail: the probe could not run.
    Effect.catchTag("Probe.Error", (error) => Effect.succeed(notRun(error.reason, label))),
    Effect.ensuring(Effect.promise(() => rm(scratch, { recursive: true, force: true }))),
  )
})

function verdict(outcome: ResearchProcess.Outcome, text: string): { status: Status; reason?: string } {
  if (outcome.timedOut) return { status: "not-run", reason: "timeout" }
  if (outcome.memoryExceeded) return { status: "not-run", reason: "memory-exceeded" }
  if (outcome.overflow) return { status: "not-run", reason: "output-cap" }
  if (outcome.failure !== undefined) return { status: "not-run", reason: `process-failed: ${outcome.failure}` }
  // R2: a repository that refuses local tests leaves fail-before/pass-after unavailable, never a failure.
  if (text.includes(ProbeRun.GUARD)) return { status: "not-run", reason: `repo-guard: ${ProbeRun.GUARD}` }
  return { status: outcome.exitCode === 0 ? "pass" : "fail" }
}

function notRun(reason: string, label: Step["label"] = "head"): Step {
  return { label, status: "not-run", reason, argv: [], stdout: "", stderr: "" }
}

/** The diff hunk on the target's path whose current lines overlap the target's range. */
function pick(hunks: ReadonlyArray<ReviewScratch.Hunk>, target: { path: string; startLine: number; endLine: number }) {
  const wanted = path.normalize(target.path)
  return hunks.find((hunk) => path.normalize(hunk.path) === wanted &&
    hunk.line <= target.endLine && hunk.line + Math.max(hunk.current.length, 1) - 1 >= target.startLine)
}

function settle(input: Input, context: Context, outcome: { uri: string; started: number; steps: ReadonlyArray<Step>; status: Status; reason?: string }) {
  const steps = outcome.steps
  const share = Math.floor(EXCERPT_BYTES / Math.max(steps.length, 1))
  const excerpt = steps.map((step) => {
    const header = `[${step.label}] ${step.reason ?? `${step.status} (exit ${step.exitCode ?? "none"})`}`
    return `${header}\n${tail(`${step.stdout}\n${step.stderr}`, share - Buffer.byteLength(header) - 1)}`.trim()
  }).join("\n")
  const result = {
    status: outcome.status,
    reason: outcome.reason,
    exitCode: steps[0]?.exitCode,
    durationMs: Date.now() - outcome.started,
    excerpt: excerpt || (outcome.reason ?? ""),
    uri: outcome.uri,
    tree: context.head.digest,
  } satisfies Output
  const text = [
    `option: ${input.option}`, `candidate: ${input.candidate}`, `tree: ${context.head.digest}`, `status: ${outcome.status}${outcome.reason ? ` (${outcome.reason})` : ""}`,
    ...steps.flatMap((step) => [`--- ${step.label}: ${step.reason ?? step.status}`, `$ ${step.argv.join(" ")}`, `exit: ${step.exitCode ?? "none"}`,
      "stdout:", step.stdout, "stderr:", step.stderr]),
  ].join("\n")
  const evidence = outcome.status === "not-run" ? undefined : {
    kind: "probe", option: input.option, command: steps[0]?.argv.join(" ") ?? input.option,
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
  const got = yield* HOST.take(1).pipe(Effect.timeoutOption(Duration.seconds(seconds)))
  if (Option.isNone(got)) return false
  yield* Effect.addFinalizer(() => HOST.release(1))
  return true
})
