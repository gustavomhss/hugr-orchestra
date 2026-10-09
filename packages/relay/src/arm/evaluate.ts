export * as ArmEvaluate from "./evaluate"
export { Invalid, Write, repair } from "./settlement"
export type { Boundary } from "./settlement"

import path from "node:path"
import { createHash } from "node:crypto"
import { appendFileSync, copyFileSync, readFileSync, statSync } from "node:fs"
import { Clock, Effect, Exit, Option, Redacted, Result, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import type { RelayLedger } from "@orchestra/schema/relay-ledger"
import type { RelaySprint } from "@orchestra/schema/relay-sprint"
import { GateControl } from "../gate/control"
import { GateShell } from "../gate/shell"
import type { JudgeConfig } from "../judge/config"
import { RelayJson } from "../json"
import { LedgerChain } from "../ledger/chain"
import { LedgerRead } from "../ledger/read"
import { ArmCost } from "./cost"
import { ArmLoad } from "./load"
import { ArmRound } from "./round"
import { ArmSettlement, Invalid, type Boundary } from "./settlement"
import { ArmState } from "./state"

// One stop of `bin/relay-arm-hook.sh` (WP6), byte for byte in the arm files and the ledger. Dropped (§1): the
// transcript marker scan (the token is explicit), the corpus archive, and the environment cap preflight (`blockCap`).

type Requirements = ArmState.Store | GateShell.Service | GateShell.Git | JudgeConfig.Service

/**
 * One stop of the arm hook. Unbound calls never fail: busy, refused and defective arms are outcomes, and an evaluation
 * that cannot complete is a `defect`, never a pass. Bound calls propagate boundary and engine failures to their caller.
 *
 * `all-gates` repeats the step under the same run lock while it advances, so one call grades every remaining gate and
 * stops at the first that does not pass; each step charges cost, entry time and the blocked claim as one hook fire
 * does. With `revisionGuard`, HEAD is read before the first checks and compared after every step's checks; a change is
 * `revision-drift`, and that step records no round and no disposition. `observe` receives each step's host-check
 * capture after its checks and before its disposition is recorded.
 */
export function evaluate(input: RelayArm.EvaluateInput): Effect.Effect<RelayArm.Evaluation, never, Requirements>
export function evaluate<E>(input: RelayArm.EvaluateInput, boundary: Boundary<E>): Effect.Effect<RelayArm.Evaluation, unknown, Requirements>
export function evaluate<E>(input: RelayArm.EvaluateInput, boundary?: Boundary<E>) {
  return Effect.gen(function* () {
    if (!Schema.is(RelayArm.Token)(input.token)) return { outcome: "refused" as const, failing: [], ledgerSeq: -1 }
    const store = yield* ArmState.Store
    const arm = path.join(store.armsDir, input.token)
    const ledger = path.join(arm, RelayArm.Files.ledger)
    if (!isFile(path.join(arm, RelayArm.Files.sprint)))
      return { outcome: "defect" as const, defect: "arm-missing" as const, failing: [], ledgerSeq: ArmSettlement.lastSeq(ledger) }
    const failed = () => Effect.succeed<Step>({ outcome: "defect", failing: [] })
    return yield* ArmState.withRunLock(
      arm,
      boundary
        ? ArmSettlement.run(boundary, () => locked(input, arm, ledger, store.ledgerKey, boundary), ledger)
        : locked(input, arm, ledger, store.ledgerKey).pipe(
            Effect.catch(failed),
            Effect.catchDefect(failed),
            Effect.map((step): RelayArm.Evaluation => ({ ...step, ledgerSeq: ArmSettlement.lastSeq(ledger) })),
          ),
    ).pipe(
      Effect.catchIf((error) => error instanceof ArmState.Busy, () =>
        Effect.succeed<RelayArm.Evaluation>({ outcome: "busy", failing: [], ledgerSeq: ArmSettlement.lastSeq(ledger) }),
      ),
    )
  })
}

/**
 * Writes the `release` file of a parked arm under its run lock. The next evaluation records `human-release` before
 * consuming it, resets that gate's retry, round and claim state and grades the same WP again; a release never waives
 * a control. Only the owner's path may call this (Maestro condition 2): no evaluation releases an arm.
 */
export const release = (
  token: RelayArm.Token,
  reason: string,
): Effect.Effect<void, ArmState.StateError | ArmState.Busy, ArmState.Store> =>
  Effect.gen(function* () {
    const arm = yield* ArmState.dir(token)
    if (Option.isNone(ArmState.normalizeRelease(reason)))
      return yield* new ArmState.StateError({ path: arm, reason: "a release must say who and why" })
    if (!isDirectory(arm)) return yield* new ArmState.StateError({ path: arm, reason: "arm missing" })
    yield* ArmState.withRunLock(
      arm,
      Effect.gen(function* () {
        if (!isParked(yield* ArmState.state(arm)))
          return yield* new ArmState.StateError({ path: arm, reason: "arm is not parked" })
        yield* ArmState.write(arm, RelayArm.Files.release, reason)
      }),
    )
  })

export interface Parked {
  readonly wp: string
  // The failing controls and regressions of the escalation that parked the arm.
  readonly failing: ReadonlyArray<string>
}

/**
 * Whether the arm is parked awaiting its owner, read without the run lock and without charging cost, entry time or a
 * check (Maestro condition 3: a dispatch on a parked token holds at once and never spends a worker). An arm whose
 * owner already wrote a valid release is not parked: its next evaluation resumes the gate.
 */
export const parked = (
  token: RelayArm.Token,
): Effect.Effect<Option.Option<Parked>, ArmState.StateError, ArmState.Store> =>
  Effect.gen(function* () {
    const arm = yield* ArmState.dir(token)
    if (!isParked(yield* ArmState.state(arm))) return Option.none()
    if (Option.isSome(Option.flatMap(yield* ArmState.read(arm, RelayArm.Files.release), ArmState.normalizeRelease)))
      return Option.none()
    const position = Option.getOrElse(yield* ArmState.read(arm, RelayArm.Files.position), () => "")
    const loaded = yield* Effect.option(load(arm))
    const wp = Option.match(loaded, { onNone: () => position, onSome: (plan) => gateOf(plan.view, position) })
    return Option.some({ wp, failing: yield* escalated(path.join(arm, RelayArm.Files.ledger)) })
  })

/**
 * The completion HOLD code for an evaluation; undefined only for `complete`, the one outcome that passes. A spent
 * budget parks the arm (`escalate`, then `parked`), which is Maestro condition 1; failures still inside a gate's
 * budget keep `completion-checks-not-passing`.
 */
export const hold = (evaluation: Pick<RelayArm.Evaluation, "outcome">): RelayArm.CompletionHold | undefined => {
  if (evaluation.outcome === "complete") return undefined
  if (evaluation.outcome === "escalate" || evaluation.outcome === "parked") return "completion-parked-awaiting-owner"
  if (evaluation.outcome === "revision-drift") return "completion-revision-drift"
  if (["busy", "defect", "refused", "noop"].includes(evaluation.outcome)) return "completion-evaluation-acquisition"
  return "completion-checks-not-passing"
}

/**
 * The parked HOLD text after the `completion-parked-awaiting-owner` code (Maestro condition 1): the spent budget, the
 * failing checks and the instruction not to dispatch. The host prints it as `Tool safety HOLD: <code>. <text>`.
 */
export const parkedHold = (wp: string, failing: ReadonlyArray<string>): string =>
  `Gate '${wp}' is parked awaiting the owner because its retry budget is spent. ` +
  `Failing: ${failing.length ? failing.join(", ") : "(none recorded)"}. ` +
  "Do not dispatch again; tell the owner what failed and why. " +
  `Only the owner can release or cancel it, and a release resets the retry budget of gate '${wp}' only.`

// ---- The evaluation under the run lock ----

type Step = ArmSettlement.Step

interface Context {
  readonly input: RelayArm.EvaluateInput
  readonly arm: string
  readonly ledger: string
  readonly plan: Plan
  readonly round: ArmRound.Input
  readonly chain: Omit<LedgerChain.AppendInput, "ledger" | "body">
  // The cap-risk warning waiting for a block to ride out on.
  warning: string
  // HEAD before the first checks, when the revision guard is on.
  revision?: string
  // Every host check this evaluation met: their results, and whether each had a registered callback.
  readonly results: RelayArm.HostCheckResult[]
  hosted: boolean
  complete: boolean
  readonly boundary?: Boundary<unknown>
  injection?: RelayArm.Evaluation["inject"]
}

interface Envelope {
  readonly i: number
  readonly wp: string
  readonly cost: Option.Option<RelayLedger.Cost>
  readonly elapsed: number | undefined
  readonly macro: string
  readonly kind: string
  readonly fails: string
  readonly reg: string
  readonly retry?: number
  readonly round?: string
  readonly repeat?: number
  readonly base?: string
}

const locked = (
  input: RelayArm.EvaluateInput,
  arm: string,
  ledger: string,
  key: Option.Option<Redacted.Redacted<string>>,
  boundary?: Boundary<unknown>,
) =>
  Effect.gen(function* () {
    // An arm belongs to one agent: the first stop binds it, and another agent's stop is refused (A6).
    if (input.agentID) {
      const bound = substitution(Option.getOrElse(yield* ArmState.read(arm, RelayArm.Files.agentID), () => ""))
      if (bound !== "" && bound !== input.agentID)
        return { outcome: "defect" as const, defect: "agent-mismatch" as const, failing: [] }
      if (bound === "") yield* ArmState.write(arm, RelayArm.Files.agentID, input.agentID)
    }
    const plan = yield* load(arm)
    if (!isDirectory(plan.meta.workdir))
      return yield* new Invalid({ reason: `workdir is not a directory: ${plan.meta.workdir}` })
    const context: Context = {
      input,
      arm,
      ledger,
      plan,
      round: {
        token: input.token,
        workdir: plan.meta.workdir,
        params: input.params ?? {},
        hostChecks: input.hostChecks,
        meta: plan.meta,
      },
      chain: { gen: LedgerChain.generation(plan.node), key: Option.getOrUndefined(key) },
      warning: "",
      results: [],
      hosted: false,
      complete: true,
      boundary,
    }
    const evaluation = yield* steps(context, 0)
    return {
      ...evaluation,
      ...(evaluation.reason === undefined ? {} : { reason: context.warning + evaluation.reason }),
      ...(context.hosted ? { capture: { complete: context.complete, results: [...context.results] } } : {}),
    }
  })

// `all-gates` keeps stepping while the chain advances; the bound stops a plan whose IDs repeat from cycling forever.
const steps = (context: Context, taken: number): Effect.Effect<Step, unknown, Requirements> =>
  step(context).pipe(
    Effect.flatMap((evaluation) =>
      context.input.mode !== "all-gates" || evaluation.outcome !== "advance" || taken >= context.plan.wps.length
        ? Effect.succeed<Step>(evaluation)
        : steps(context, taken + 1),
    ),
  )

const step = (context: Context) =>
  Effect.gen(function* () {
    const { arm, input, plan } = context
    const transcript = input.transcript === undefined ? undefined : ArmCost.read(input.transcript)
    const cost = transcript === undefined ? Option.none<RelayLedger.Cost>() : yield* ArmCost.charge(arm, transcript)
    // The first state has no entry stamp, so its elapsed is absent rather than 0.
    const now = yield* seconds
    const entered = substitution(Option.getOrElse(yield* ArmState.read(arm, RelayArm.Files.enteredAt), () => ""))
    const elapsed = /^[0-9]+$/.test(entered) ? now - Number(entered) : undefined
    yield* ArmState.write(arm, RelayArm.Files.enteredAt, String(now))
    const count = plan.wps.length
    const budget = yield* retryBudget(plan.plan)
    yield* preflight(context, count)

    const position = yield* ArmState.position(arm, plan.view)
    const state = yield* ArmState.state(arm)
    // A parked arm resumes only through a release with a reason; nothing the agent does clears it.
    const release = isParked(state)
      ? Option.flatMap(yield* ArmState.read(arm, RelayArm.Files.release), ArmState.normalizeRelease)
      : Option.none<string>()
    if (isParked(state) && Option.isNone(release))
      return { outcome: "parked" as const, wp: gateOf(plan.view, position), failing: yield* escalated(context.ledger) }
    if (Option.contains(state, "complete")) return { outcome: "noop" as const, failing: [] }

    const at = { cost, elapsed, macro: "", kind: "", fails: "", reg: "" }
    const resolved = ArmState.resolve(plan.view, position)
    if (Option.isNone(resolved)) {
      log(context, `POSITION LOST — ${position} is not in gen ${context.chain.gen} of the plan`)
      yield* record(context, { ...at, i: -1, wp: position }, "position-lost")
      return { outcome: "defect" as const, defect: "position-lost" as const, wp: position, failing: [] }
    }
    const i = resolved.value
    const current = yield* identityOf(plan.view, i)
    const id = current.id
    const safe = ArmState.safe(id)
    if (Option.isSome(release)) {
      yield* note(context, { wp: id, event: "human-release", reason: release.value })
      yield* Effect.forEach(
        [RelayArm.Files.release, `retry_${safe}`, `retry_${i}`, `round_${safe}`, `repeat_${safe}`, `blocked_${safe}`],
        (name) => ArmSettlement.remove(arm, name),
      )
      yield* ArmSettlement.remove(arm, RelayArm.Files.regRetry)
      yield* ArmState.write(arm, RelayArm.Files.state, "active")
      yield* ArmState.write(arm, RelayArm.Files.counter, String(i))
      log(context, `RELEASED by human at ${id} — ${release.value}`)
    }
    const wp = plan.wps[i]
    // An unknown kind is refused rather than run as execute: the agent would be judged against rules never handed over.
    const declared = substitution(raw(field(wp, "kind")))
    const kind = declared === "execute" ? "" : declared
    if (!["", "gate", "review", "inject"].includes(kind)) {
      yield* note(context, { wp: id, event: "unknown-kind", kind: declared })
      log(context, `UNKNOWN KIND ${declared} at ${id}`)
      return { outcome: "defect" as const, defect: "unknown-kind" as const, wp: id, failing: [] }
    }
    yield* ArmState.write(arm, RelayArm.Files.position, ArmState.canonicalPosition(current))
    const base = Option.match(yield* ArmState.read(arm, `base_${safe}`), {
      onSome: substitution,
      onNone: () => substitution(plan.meta.base_ref ?? ""),
    })
    // A legacy index-keyed retry follows the WP once, as `retry_<id>`.
    if (!isFile(path.join(arm, `retry_${safe}`)) && isFile(path.join(arm, `retry_${i}`)))
      yield* io(arm, () => copyFileSync(path.join(arm, `retry_${i}`), path.join(arm, `retry_${safe}`)))
    const owner = { i, wp: id, macro: current.macro, kind }

    const injection = kind === "inject" ? yield* inject(context, owner) : undefined
    if (injection !== undefined && "missing" in injection)
      return { outcome: "defect" as const, defect: "inject-missing" as const, wp: id, failing: [] }
    const gate = { envelope: { ...at, ...owner }, wp, base, budget, injected: injection?.text ?? "", transcript }
    context.injection = injection === undefined ? undefined : { file: injection.file, sha: injection.sha }
    const settled = yield* settle(context, gate)
    return injection === undefined ? settled : { ...settled, inject: { file: injection.file, sha: injection.sha } }
  })

interface Gate {
  readonly envelope: Envelope
  // The WP as sprint.json holds it.
  readonly wp: unknown
  readonly base: string
  readonly budget: number
  // The injected text that precedes the advance reason.
  readonly injected: string
  readonly transcript: Uint8Array | undefined
}

// The current gate's checks and regressions, the blocked claim, then the disposition.
const settle = (context: Context, gate: Gate) =>
  Effect.gen(function* () {
    const { arm, input, plan } = context
    const { envelope, base, budget } = gate
    const { i, wp: id } = envelope
    const safe = ArmState.safe(id)
    const count = plan.wps.length
    const owner = { i, wp: id, macro: envelope.macro, kind: envelope.kind }
    const checklist = field(gate.wp, "checklist") ?? null
    if (checklist !== null && !Array.isArray(checklist))
      return yield* new Invalid({ reason: `work_packages[${i}].checklist must be an array or null` })
    if (input.revisionGuard && context.revision === undefined)
      context.revision = yield* ArmRound.revision(plan.meta.workdir)
    const round = { ...context.round, revision: context.revision }
    const graded = yield* ArmRound.grade(round, owner, base, checklist ?? [])
    // A host check this evaluation already ran at its revision is not re-run as a regression of a later gate.
    const ran = new Set([...context.results, ...graded.results].map((result) => result.name))
    const regressed =
      i > 0 && isFile(context.ledger)
        ? yield* ArmRound.regressions(round, owner, context.ledger, plan.wps.slice(0, i), ran)
        : { lines: [], failing: [], results: [], unbound: [] }
    const results = [...graded.results, ...regressed.results]
    const unbound = graded.unbound.length + regressed.unbound.length
    context.results.push(...results)
    context.hosted ||= results.length + unbound > 0
    context.complete &&= unbound === 0
    const failing = [...graded.failing, ...regressed.failing]
    if (context.revision !== undefined && (yield* ArmRound.revision(plan.meta.workdir)) !== context.revision)
      return { outcome: "revision-drift" as const, wp: id, failing }
    const fails = GateControl.fails(graded.failing)
    const reg = regressed.failing.map((rid) => `; ${rid}`).join("")
    const outcome: Envelope = { ...envelope, fails, reg }
    const claim = gate.transcript === undefined ? undefined : ArmCost.claim(gate.transcript)
    const repeated = claim === undefined ? false : yield* blocked(context, outcome, base, claim)

    if (input.observe) {
      const observed = yield* Effect.exit(input.observe({ complete: unbound === 0, results }))
      if (Exit.isFailure(observed)) return yield* new Invalid({ reason: "observe failed" })
    }
    const buffered = [...graded.lines, ...regressed.lines]
    const sha = ArmRound.shape(buffered, fails, reg)
    if (fails === "" && reg === "") return yield* advance(context, outcome, buffered, gate.injected)

    const roundFile = `round_${safe}`
    const repeatFile = `repeat_${safe}`
    // The same verdicts and the same failures as the last recorded round carry no new information.
    const collapsed = Option.contains(Option.map(yield* ArmState.read(arm, roundFile), substitution), sha)
    const repeat = collapsed ? counted(yield* ArmState.read(arm, repeatFile)) + 1 : 0
    const remember = Effect.all([ArmState.write(arm, roundFile, sha), ArmState.write(arm, repeatFile, String(repeat))])
    const disposition = { ...outcome, round: sha, repeat }
    const event = collapsed ? "gate-fail-repeat" : "gate-fail"
    const fail = (retry: number) =>
      Effect.gen(function* () {
        if (!collapsed) yield* ArmRound.flush(context.ledger, buffered, context.chain)
        yield* record(context, { ...disposition, retry }, event)
      })
    // Terminal evidence is recorded in full even mid-collapse, and the arm parks until a recorded release.
    const escalate = (which: string) =>
      Effect.gen(function* () {
        yield* ArmRound.flush(context.ledger, buffered, context.chain)
        yield* record(context, { ...disposition, retry: budget }, "escalate")
        log(context, `gate ${id} ESCALATE (${which} budget=${budget}) fails:${fails} reg:${reg}`)
        return yield* ArmSettlement.dispose(context, { outcome: "escalate", wp: id, failing }, [
          { name: roundFile, value: sha }, { name: repeatFile, value: String(repeat) },
          { name: RelayArm.Files.state, value: "awaiting-human" }, { name: RelayArm.Files.counter, value: String(count) },
        ], remember.pipe(Effect.andThen(ArmState.write(arm, RelayArm.Files.state, "awaiting-human")),
          Effect.andThen(ArmState.write(arm, RelayArm.Files.counter, String(count)))))
      })

    // The same wall twice is a person's problem: the budget is bypassed rather than spent.
    if (repeated) return yield* escalate("blocked-claim-repeat")
    // A regression-only failure has its own budget, so it ends without charging the gate the runner satisfied.
    if (fails === "") {
      const spent = counted(yield* ArmState.read(arm, RelayArm.Files.regRetry))
      if (spent >= budget) return yield* escalate("regression")
      yield* fail(spent + 1)
      log(context, `gate ${id} REGRESSION in earlier gate (retry ${spent + 1}) reg:${reg}`)
      const restore = reg.replace(/^; /, "")
      return yield* ArmSettlement.dispose(context, {
        outcome: "regression-fail" as const,
        wp: id,
        failing,
        reason: `Relay: an earlier gate regressed — restore these before finishing: ${restore}. (Current gate '${id}' is satisfied; this is a backslide in prior work.)`,
      }, [{ name: roundFile, value: sha }, { name: repeatFile, value: String(repeat) },
        { name: RelayArm.Files.regRetry, value: String(spent + 1) }],
        remember.pipe(Effect.andThen(ArmState.write(arm, RelayArm.Files.regRetry, String(spent + 1)))))
    }
    const spent = yield* retries(yield* ArmState.read(arm, `retry_${safe}`))
    if (spent >= budget) return yield* escalate("gate")
    const instructions = substitution(raw(field(gate.wp, "instructions")))
    yield* fail(spent + 1)
    log(context, `gate ${id} FAIL (retry ${spent + 1}) fails:${fails} reg:${reg}`)
    const regressions = reg ? ` ; regressions:${reg}` : ""
    // Later retries name only the failing IDs to curb context growth; the ledger keeps the full record.
    const reason =
      spent >= 1
        ? `Relay gate '${id}' still failing. Fix these: ${fails}${regressions}`
        : `Relay gate '${id}' is NOT satisfied. Still failing:${fails}${regressions}. Address these, then finish.` +
          (instructions ? ` Instructions: ${instructions}` : "")
    return yield* ArmSettlement.dispose(context, { outcome: "gate-fail", wp: id, failing, reason }, [
      { name: roundFile, value: sha }, { name: repeatFile, value: String(repeat) },
      { name: `retry_${safe}`, value: String(spent + 1) },
    ], remember.pipe(Effect.andThen(ArmState.write(arm, `retry_${safe}`, String(spent + 1)))))
  })

// The current gate passed: reveal the next one, or finish the chain.
const advance = (context: Context, envelope: Envelope, buffered: ReadonlyArray<string>, injected: string) =>
  Effect.gen(function* () {
    const { arm, plan } = context
    const ni = envelope.i + 1
    // The next identity is validated before any verdict or transition is published.
    const next = ni < plan.wps.length ? yield* identityOf(plan.view, ni) : undefined
    yield* ArmRound.flush(context.ledger, buffered, context.chain)
    const safe = ArmState.safe(envelope.wp)
    const clear = Effect.forEach([`round_${safe}`, `repeat_${safe}`, RelayArm.Files.regRetry], (name) =>
      ArmSettlement.remove(arm, name),
    )
    const cleared = [`round_${safe}`, `repeat_${safe}`, RelayArm.Files.regRetry].map((name) => ({ name, value: null }))
    if (next === undefined) {
      yield* record(context, envelope, "sprint-complete")
      log(context, `gate ${envelope.wp} OK -> CHAIN COMPLETE`)
      return yield* ArmSettlement.dispose(context, { outcome: "complete", wp: envelope.wp, failing: [] }, [
        ...cleared, { name: RelayArm.Files.counter, value: String(ni) }, { name: RelayArm.Files.state, value: "complete" },
      ], clear.pipe(Effect.andThen(ArmState.write(arm, RelayArm.Files.counter, String(ni))),
        Effect.andThen(ArmState.write(arm, RelayArm.Files.state, "complete"))))
    }
    // The next state's diff base is HEAD now, the only moment the engine runs before its work happens.
    const base = yield* head(plan.meta.workdir)
    const revealed = yield* reveal(context, ni, next)
    const checkpoint = ni >= (context.input.compactAfter ?? 6)
    const reason =
      `${injected}Relay gate '${envelope.wp}' passed. Next gate: ${next.id}. ${revealed.text}` +
      (checkpoint
        ? ` (checkpoint: ${ni} gates cleared — summarize progress and drop now-stale detail before continuing)`
        : "")
    yield* record(context, { ...envelope, base }, "advance-reveal")
    if (checkpoint) yield* record(context, { ...envelope, base }, "compaction-hint")
    log(context, `gate ${envelope.wp} OK -> reveal ${next.id}`)
    return yield* ArmSettlement.dispose(context, { outcome: "advance", wp: envelope.wp, next: next.id, failing: [], reason }, [
      ...cleared, { name: RelayArm.Files.counter, value: String(ni) },
      { name: RelayArm.Files.position, value: ArmState.canonicalPosition(next) },
      ...(base ? [{ name: `base_${ArmState.safe(next.id)}`, value: base }] : []),
      ...(revealed.marker ? [{ name: revealed.marker, value: "" }] : []),
    ], Effect.gen(function* () {
      yield* clear
      yield* ArmState.write(arm, RelayArm.Files.counter, String(ni))
      yield* ArmState.write(arm, RelayArm.Files.position, ArmState.canonicalPosition(next))
      if (base) yield* ArmState.write(arm, `base_${ArmState.safe(next.id)}`, base)
      if (revealed.marker) yield* ArmState.write(arm, revealed.marker, "")
    }))
  })

// The next state's instructions: its macro's protocol on first entry, its own text, the self-check asked in advance,
// and the review reminder.
const reveal = (context: Context, ni: number, next: { readonly id: string; readonly macro: string }) =>
  Effect.gen(function* () {
    const wp = context.plan.wps[ni]
    const own = substitution(raw(field(wp, "instructions")))
    const marker = next.macro ? `macro_${ArmState.safe(next.macro)}` : undefined
    const entering = marker !== undefined && !isFile(path.join(context.arm, marker))
    const protocol = entering ? macroInstructions(context.plan.plan, next.macro) : ""
    if (protocol === undefined) return yield* new Invalid({ reason: "macros must be an array of objects" })
    const self = selfCheck(field(wp, "self_check"))
    if (self === undefined) return yield* new Invalid({ reason: `work_packages[${ni}].self_check must be text` })
    const text = [
      protocol ? `${protocol}\n${own}` : own,
      self ? `\n\nBefore you finish this state, be ready to answer:\n${self}` : "",
      substitution(raw(field(wp, "kind"))) === "review" ? REVIEW : "",
    ].join("")
    return { text, marker: entering ? marker : undefined }
  })

const REVIEW =
  "\n\nThis is a REVIEW state: it must be worked from a cold read of the frozen artifacts. If you produced\n" +
  "what is under review in this context, you are disqualified from reviewing it — say so rather than\nproceeding."

// The block-cap preflight runs once per arm; its warning rides the next block out (C2). Junk reads as the default 8.
const preflight = (context: Context, count: number) =>
  Effect.gen(function* () {
    if (Option.isSome(yield* ArmState.read(context.arm, RelayArm.Files.preflight))) return
    yield* ArmState.write(context.arm, RelayArm.Files.preflight, "")
    const requested = context.input.blockCap ?? 0
    const cap = Number.isSafeInteger(requested) && requested >= 0 ? requested : 8
    if (cap === 0 || cap >= count + 1) return
    yield* note(context, { event: "cap-risk", cap, chain_min: count + 1, work_packages: count })
    log(context, `CAP RISK — block cap ${cap}, conservative warning estimate ${count + 1}`)
    context.warning =
      `Relay: this session's hook block cap is ${cap}, below the implemented conservative warning estimate of ` +
      `${count + 1} blocks for ${count} gates. The estimate is not a minimum or a proven prediction: retries can add ` +
      "blocks, and the chain may stop before completion depending on actual harness behavior. Set " +
      "CLAUDE_CODE_STOP_HOOK_BLOCK_CAP=0 to request an uncapped chain. "
  })

// A state with no work of its own delivers the actual bytes it names; a missing file is never advanced past.
const inject = (context: Context, owner: ArmRound.Owner) =>
  Effect.gen(function* () {
    const wp = context.plan.wps[owner.i]
    const file = substitution(raw(field(wp, "file")))
    const text = substitution(raw(field(wp, "text")))
    const target = `${context.plan.meta.workdir}/${file}`
    if (file === "" && text !== "") {
      const sha = sha256(text)
      yield* note(context, { wp: owner.wp, event: "inject", file: "(inline)", sha })
      return { file: "(inline)", sha, text: `${text}\n\n` }
    }
    if (file === "" || !isFile(target)) {
      yield* note(context, { wp: owner.wp, event: "inject-missing", file })
      log(context, `INJECT MISSING ${file} at ${owner.wp}`)
      return { missing: file }
    }
    const bytes = yield* io(target, () => readFileSync(target))
    const sha = sha256(bytes)
    yield* note(context, { wp: owner.wp, event: "inject", file, sha })
    return { file, sha, text: `--- ${file} ---\n${substitution(RelayJson.argText(bytes))}\n--- end ${file} ---\n\n` }
  })

/**
 * The agent's `RELAY-BLOCKED:` claim (V7b): recorded, cross-checked against the computed diff, honored only when the
 * gate also failed, and never silenced. Returns whether this gate's last honored claim was the same one.
 */
const blocked = (context: Context, envelope: Envelope, base: string, claim: Uint8Array) =>
  Effect.gen(function* () {
    const judged = yield* ArmCost.corroborate(claim, context.plan.meta.workdir, base)
    const honored = envelope.fails !== ""
    yield* note(context, {
      wp: envelope.wp,
      event: "blocked-claim",
      reason: judged.text,
      sha: judged.sha,
      honored,
      corroborated: judged.corroborated,
      graded_by: judged.graded_by,
    })
    log(
      context,
      `BLOCKED-CLAIM at ${envelope.wp} (honored=${honored} corroborated=${judged.corroborated}) ${judged.text}`,
    )
    if (!honored) return false
    const name = `blocked_${ArmState.safe(envelope.wp)}`
    const previous = Option.map(yield* ArmState.read(context.arm, name), substitution)
    yield* ArmState.write(context.arm, name, judged.sha)
    return Option.contains(previous, judged.sha)
  })

// ---- Records ----

// A disposition (`ledger()` in the hook): the envelope fields in the oracle's order, optional ones only when set.
const record = (context: Context, envelope: Envelope, event: RelayLedger.ArmEvent) =>
  Effect.gen(function* () {
    yield* append(context, {
      ts: yield* seconds,
      arm: context.input.token,
      wp: envelope.wp,
      i: envelope.i,
      event,
      retry: envelope.retry ?? 0,
      fails: envelope.fails,
      reg: envelope.reg,
      round: envelope.round ?? "",
      repeat: envelope.repeat ?? 0,
      ...(envelope.base ? { base_ref: envelope.base } : {}),
      ...(Option.isSome(envelope.cost) ? { cost: envelope.cost.value } : {}),
      ...(envelope.elapsed === undefined ? {} : { elapsed_s: envelope.elapsed }),
      ...(envelope.macro ? { macro: envelope.macro } : {}),
      ...(envelope.kind ? { kind: envelope.kind } : {}),
    })
  })

// Any other record: `ts` and `arm`, then the body. The hook made several of these best effort (`|| true`); here a
// failed append stops the evaluation like every other record (PARITY-EXCEPTIONS WP6-5).
const note = (context: Context, body: Readonly<Record<string, unknown>>) =>
  Effect.gen(function* () {
    yield* append(context, { ts: yield* seconds, arm: context.input.token, ...body })
  })

const append = (context: Context, body: Readonly<Record<string, unknown>>) =>
  RelayJson.compact(body).pipe(
    Effect.flatMap((line) => LedgerChain.append({ ...context.chain, ledger: context.ledger, body: line })),
  )

// Diagnostic only and never compared, so a log line that cannot be written is dropped.
function log(context: Context, text: string) {
  const line = `[${Math.floor(Date.now() / 1000)}] arm ${context.input.token}: ${text}\n`
  Result.try(() => appendFileSync(path.join(context.arm, RelayArm.Files.log), line))
}

// ---- Arm files ----

interface Plan {
  readonly wps: ReadonlyArray<unknown>
  readonly plan: Readonly<Record<string, unknown>>
  readonly node: RelayJson.Node
  readonly meta: RelayArm.Meta
  // The identities the position rule reads.
  readonly view: RelaySprint.Sprint
}

/**
 * sprint.json and meta.json through the strict loader (no symlink, at most 512 KB, stable while read). meta.json is
 * decoded with its schema; sprint.json only as strict JSON (UTF-8, no duplicate keys), because the hook names each
 * malformed field where it uses it (PARITY-EXCEPTIONS WP6-4).
 */
const load = (arm: string) =>
  Effect.gen(function* () {
    const sprintFile = path.join(arm, RelayArm.Files.sprint)
    const metaFile = path.join(arm, RelayArm.Files.meta)
    const meta = yield* ArmLoad.decode(metaFile, yield* ArmLoad.bytes(metaFile), RelayArm.Meta)
    const bytes = yield* ArmLoad.bytes(sprintFile)
    const decoded = Result.try(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes))
    if (Result.isFailure(decoded)) return yield* new Invalid({ reason: "sprint.json is not UTF-8" })
    const node = RelayJson.read(decoded.success)
    if (Result.isFailure(node)) return yield* new Invalid({ reason: `sprint.json: ${node.failure.reason}` })
    const plan = RelayJson.plain(node.success)
    if (!isObject(plan)) return yield* new Invalid({ reason: "sprint.json must be an object" })
    // `.work_packages | length`: absent or null is the empty plan.
    const wps = plan.work_packages ?? []
    if (!Array.isArray(wps)) return yield* new Invalid({ reason: "work_packages must be an array" })
    return { wps, plan, node: node.success, meta, view: identities(wps) } satisfies Plan
  })

/**
 * The identities the position rule reads, with every value `read_wp_identity` refuses made invalid: a non-string ID
 * or macro becomes NUL, which is never a position because a position with NUL is refused.
 */
function identities(wps: ReadonlyArray<unknown>): RelaySprint.Sprint {
  return {
    work_packages: wps.map((wp) => {
      const id = field(wp, "id")
      const macro = field(wp, "macro")
      return {
        id: typeof id === "string" ? id : "\u0000",
        ...(macro === undefined || macro === null ? {} : { macro: typeof macro === "string" ? macro : "\u0000" }),
      }
    }),
  }
}

// `read_wp_identity`: a nonempty NUL-free ID and a NUL-free macro, or the hook exits 1.
function identityOf(view: RelaySprint.Sprint, index: number) {
  const wp = view.work_packages[index]!
  const macro = wp.macro ?? ""
  if (!wp.id || wp.id.includes("\u0000") || macro.includes("\u0000"))
    return Effect.fail(new Invalid({ reason: `work_packages[${index}] has an invalid id or macro` }))
  return Effect.succeed({ id: wp.id, macro })
}

// The gate a position names, or the raw position when it names none.
function gateOf(view: RelaySprint.Sprint, position: string) {
  return Option.match(ArmState.resolve(view, position), {
    onNone: () => position,
    onSome: (index) => view.work_packages[index]!.id,
  })
}

function isParked(state: Option.Option<RelayArm.State>) {
  return Option.contains(state, "awaiting-human") || Option.contains(state, "escalated")
}

// The failing controls and regressions of the last escalation on the ledger, split as `relay-gate check` splits them;
// none when the ledger cannot be read.
const escalated = (ledger: string) =>
  LedgerRead.entries(ledger).pipe(
    Effect.map((entries) => {
      const last = entries.findLast((entry) => entry.event === "escalate")
      return [last?.fails, last?.reg].flatMap((text) =>
        typeof text === "string" && text !== "" ? text.replace(/^; /, "").split("; ") : [],
      )
    }),
    Effect.orElseSucceed((): ReadonlyArray<string> => []),
  )

// `retry_budget // 3`; only an integer ever reached bash `-ge`.
function retryBudget(plan: Readonly<Record<string, unknown>>) {
  const value = plan.retry_budget
  if (value === undefined || value === null || value === false) return Effect.succeed(3)
  if (Number.isSafeInteger(value)) return Effect.succeed(value as number)
  return Effect.fail(new Invalid({ reason: "retry_budget must be an integer" }))
}

// `(.macros // []) | map(select(.id == $m)) | .[0].instructions // ""`; undefined where jq would have errored.
function macroInstructions(plan: Readonly<Record<string, unknown>>, macro: string) {
  const macros = plan.macros ?? false
  if (macros === false) return ""
  if (!Array.isArray(macros) || macros.some((entry) => entry !== null && !isObject(entry))) return undefined
  return substitution(
    raw(
      field(
        macros.find((entry) => field(entry, "id") === macro),
        "instructions",
      ),
    ),
  )
}

// `.self_check // [] | map("  - " + .) | join("\n")`; undefined when an item is not text.
function selfCheck(value: unknown) {
  if (value === undefined || value === null || value === false) return ""
  if (!Array.isArray(value) || value.some((item) => item !== null && typeof item !== "string")) return undefined
  return substitution(value.map((item) => `  - ${item ?? ""}`).join("\n"))
}

// HEAD as `$(git rev-parse HEAD 2>/dev/null || true)` captured it: stdout whatever the status, empty without git.
const head = (workdir: string) =>
  Effect.gen(function* () {
    const git = yield* GateShell.Git
    const result = yield* Effect.result(git.run(workdir, ["rev-parse", "HEAD"]))
    return Result.isSuccess(result) ? substitution(new TextDecoder().decode(result.success.stdout)) : ""
  })

// A stored counter: its digits, else 0.
// `repeat_*` and `reg_retry` as the hook's `case` read them: digits, else 0.
function counted(value: Option.Option<string>) {
  const text = substitution(Option.getOrElse(value, () => ""))
  return /^[0-9]+$/.test(text) ? Number(text) : 0
}

// `retry_<id>` as bash `-ge` and `$((r+1))` read it: digits with blanks around them, or nothing at all (0); anything
// else killed the hook under nounset (PARITY-EXCEPTIONS WP6-8).
function retries(value: Option.Option<string>) {
  const text = substitution(Option.getOrElse(value, () => "0")).trim()
  if (text === "" || /^[0-9]+$/.test(text)) return Effect.succeed(Number(text))
  return Effect.fail(new Invalid({ reason: `retry counter is not a number: ${JSON.stringify(text)}` }))
}

const seconds = Effect.map(Clock.currentTimeMillis, (millis) => Math.floor(millis / 1000))

function io<A>(file: string, run: () => A) {
  return Effect.try({
    try: run,
    catch: (error) =>
      new ArmState.StateError({ path: file, reason: (error as NodeJS.ErrnoException).code ?? String(error) }),
  })
}

function isFile(file: string) {
  const info = Result.try(() => statSync(file, { throwIfNoEntry: false }))
  return Result.isSuccess(info) && info.success?.isFile() === true
}

function isDirectory(file: string) {
  const info = Result.try(() => statSync(file, { throwIfNoEntry: false }))
  return Result.isSuccess(info) && info.success?.isDirectory() === true
}

function field(value: unknown, key: string): unknown {
  if (!isObject(value)) return undefined
  return Object.hasOwn(value, key) ? value[key] : undefined
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// `jq -r '<path> // ""'`: null, false and absent print nothing; text prints as is; anything else prints as JSON.
function raw(value: unknown) {
  if (value === undefined || value === null || value === false) return ""
  return printed(value)
}

function printed(value: unknown) {
  return typeof value === "string" ? value : JSON.stringify(value)
}

// What `$(...)` keeps: NUL dropped and trailing LF stripped.
function substitution(value: string) {
  return value.replaceAll("\u0000", "").replace(/\n+$/, "")
}

function sha256(value: string | Uint8Array) {
  return createHash("sha256").update(value).digest("hex")
}
