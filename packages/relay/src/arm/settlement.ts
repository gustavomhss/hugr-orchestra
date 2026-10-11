export * as ArmSettlement from "./settlement"

import path from "node:path"
import { readFileSync, rmSync } from "node:fs"
import { Effect, Result, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { RelayJson } from "../json"
import { ArmState } from "./state"

// An arm defect where the hook exits 1. Records already made stay recorded; the outcome is `defect`, never a pass.
export class Invalid extends Schema.TaggedErrorClass<Invalid>()("ArmEvaluate.Invalid", { reason: Schema.String }) {}

// Relay owns the lock and disposition ordering; callers own identity and durable receipts. No Core dependency.
export const Write = Schema.Struct({ name: Schema.String, value: Schema.Union([Schema.String, Schema.Null]) })
export interface Write extends Schema.Schema.Type<typeof Write> {}
export interface Boundary<E> {
  readonly before: () => Effect.Effect<RelayArm.Evaluation | undefined, E>
  readonly after: (evaluation: RelayArm.Evaluation) => Effect.Effect<void, E>
  readonly disposition?: (evaluation: RelayArm.Evaluation, writes: ReadonlyArray<Write>) => Effect.Effect<void, E>
}

export type Step = Omit<RelayArm.Evaluation, "ledgerSeq">

// The caller already owns .run.lock. A saved evaluation skips even construction of the engine's grading effect.
export const run = <E, E2, R>(boundary: Boundary<E>, evaluate: () => Effect.Effect<Step, E2, R>, ledger: string) =>
  Effect.gen(function* () {
    const saved = yield* boundary.before()
    if (saved !== undefined) return saved
    const step = yield* evaluate()
    const evaluation = { ...step, ledgerSeq: lastSeq(ledger) }
    yield* boundary.after(evaluation)
    return evaluation
  })

export interface Disposition<E> {
  readonly ledger: string
  readonly warning: string
  readonly hosted: boolean
  readonly complete: boolean
  readonly results: ReadonlyArray<RelayArm.HostCheckResult>
  readonly boundary?: Boundary<E>
  readonly injection?: RelayArm.Evaluation["inject"]
}

// Receipt precedes state writes, follows the engine's ordinary signed disposition. Legacy ledger is untouched.
export const dispose = <E, E2, R>(
  context: Disposition<E>,
  evaluation: Step,
  writes: ReadonlyArray<Write>,
  apply: Effect.Effect<unknown, E2, R>,
) =>
  Effect.gen(function* () {
    if (context.boundary?.disposition) yield* context.boundary.disposition({
      ...evaluation, ledgerSeq: lastSeq(context.ledger),
      ...(evaluation.reason === undefined ? {} : { reason: context.warning + evaluation.reason }),
      ...(context.hosted ? { capture: { complete: context.complete, results: [...context.results] } } : {}),
      ...(context.injection === undefined ? {} : { inject: context.injection }),
    }, writes)
    yield* apply
    return evaluation
  })

// Called only by the lock owner, including interrupted-disposition reconciliation. Null means the existing removal.
export const repair = (arm: string, writes: ReadonlyArray<Write>) => Effect.gen(function* () {
  if (!ArmState.held(arm)) return yield* new Invalid({ reason: "disposition repair requires the run lock" })
  if (writes.some((write) => !/^[A-Za-z0-9._-]+$/.test(write.name) || write.name === "." || write.name === ".."))
    return yield* new Invalid({ reason: "invalid disposition repair file" })
  yield* Effect.forEach(writes, (write) => write.value === null
    ? remove(arm, write.name) : ArmState.write(arm, write.name, write.value))
})

// The seq of the ledger's last nonblank line; -1 for an empty, missing or unreadable ledger.
export function lastSeq(ledger: string) {
  const bytes = Result.try(() => readFileSync(ledger))
  if (Result.isFailure(bytes)) return -1
  const last = RelayJson.argText(bytes.success)
    .split("\n")
    .findLast((line) => line.trim() !== "")
  const node = last === undefined ? undefined : RelayJson.read(last, { flavor: "jq" })
  if (node === undefined || Result.isFailure(node) || !(node.success instanceof RelayJson.Members)) return -1
  const seq = node.success.get("seq")
  return seq instanceof RelayJson.Int && Number.isSafeInteger(Number(seq.digits)) ? Number(seq.digits) : -1
}

export function remove(arm: string, name: string) {
  return Effect.try({
    try: () => rmSync(path.join(arm, name), { force: true }),
    catch: (error) =>
      new ArmState.StateError({ path: arm, reason: (error as NodeJS.ErrnoException).code ?? String(error) }),
  })
}
