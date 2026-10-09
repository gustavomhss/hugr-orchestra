export * as RelayWorkflowTransition from "./relay-workflow-transition"

import path from "node:path"
import { renameSync, rmSync, writeFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import { isDeepStrictEqual } from "node:util"
import { Context, Effect, Option, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { ArmLoad } from "@orchestra/relay/arm/load"
import { ArmState } from "@orchestra/relay/arm/state"
import { GateShell } from "@orchestra/relay/gate/shell"
import { JudgeConfig } from "@orchestra/relay/judge/config"
import { RelayWorkflowBinding } from "./relay-workflow-binding"
import { RelayWorkflowCurrentStep } from "./relay-workflow-currentstep"

export interface Input extends RelayArm.EvaluateInput {
  readonly binding: RelayArm.WorkflowBinding
  readonly settlement: RelayArm.WorkflowSettlement
  // Reacquire live publication, skills, lineage, current revision and approved scope before evaluating.
  readonly revalidate: () => Effect.Effect<void, RelayWorkflowBinding.Held>
}

export interface Boundary {
  // Runs only inside the existing evaluator's .run.lock, before entry/cost/check/retry mutation. A replay returns
  // the saved result; the evaluator must skip ALL evaluation work when it receives that result.
  readonly before: () => Effect.Effect<RelayArm.Evaluation | undefined, RelayWorkflowBinding.Held>
  // Runs under that same lock, after durable disposition/cursor writes and before releasing ownership.
  readonly after: (evaluation: RelayArm.Evaluation) => Effect.Effect<void, RelayWorkflowBinding.Held>
}

export interface Evaluator {
  readonly evaluate: (input: Input, boundary: Boundary) =>
    Effect.Effect<RelayArm.Evaluation, RelayWorkflowBinding.Held, ArmState.Store | GateShell.Service | GateShell.Git | JudgeConfig.Service>
  // Reconcile an interrupted pending checkpoint from the signed ledger and repair cursor/retry/base/macro writes
  // under the existing run lock. Never grade controls again. No complete disposition => named HOLD.
  readonly reconcile: (input: Input, checkpoint: RelayArm.WorkflowCheckpoint) =>
    Effect.Effect<RelayArm.Evaluation, RelayWorkflowBinding.Held, ArmState.Store>
}

// Relay supplies the native same-lock adapter within armed()/ports(). Direct callers without that scope refuse.
export const NativeEvaluator = Context.Reference<Evaluator | undefined>("@orchestra/RelayWorkflow/Evaluator", {
  defaultValue: () => undefined,
})

export const transition = Effect.fn("RelayWorkflowTransition.transition")(function* (input: Input) {
  const evaluator = yield* NativeEvaluator
  if (!evaluator) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_SETTLEMENT_UNBOUND" })
  const arm = yield* ArmState.dir(input.token)
  const store = yield* ArmState.Store
  const file = `workflow_${RelayWorkflowBinding.digest(Buffer.from(input.settlement.assistantMessageID))}.json`
  const before = Effect.fn("RelayWorkflowTransition.before")(function* () {
    yield* input.revalidate()
    const checkpoint = yield* read(arm, file)
    if (checkpoint) {
      if (!isDeepStrictEqual(checkpoint.binding, input.binding) ||
        !isDeepStrictEqual(checkpoint.settlement, input.settlement))
        return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_SETTLEMENT_IDENTITY_MISMATCH" })
      if (checkpoint.phase === "settled" && checkpoint.evaluation) {
        yield* clearPending(arm, checkpoint)
        return checkpoint.evaluation
      }
      const evaluation = yield* evaluator.reconcile(input, checkpoint)
      yield* write(arm, file, { ...checkpoint, phase: "settled", evaluation })
      yield* clearPending(arm, checkpoint)
      return evaluation
    }
    // Any pending settlement of this arm blocks a different assistant. It cannot evaluate a partially settled cursor.
    const pending = yield* read(arm, "workflow_pending.json")
    if (pending) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_SETTLEMENT_PENDING" })
    const view = yield* RelayWorkflowCurrentStep.read(input.token, input.binding).pipe(Effect.mapError(held))
    if (view.state !== "active")
      return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_ARM_NOT_ACTIVE" })
    if (!isDeepStrictEqual({ position: view.position, attempt: view.attempt, ledgerSeq: view.ledgerSeq }, input.settlement.expected))
      return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_SETTLEMENT_POSITION_MISMATCH" })
    const next = { binding: input.binding, settlement: input.settlement, phase: "pending" as const }
    // Fence first. If writing the identity receipt fails, a new assistant still cannot grade this arm.
    yield* write(arm, "workflow_pending.json", next)
    yield* write(arm, file, next)
  }, Effect.provideService(ArmState.Store, store))
  const after = Effect.fn("RelayWorkflowTransition.after")(function* (evaluation: RelayArm.Evaluation) {
    yield* write(arm, file, { binding: input.binding, settlement: input.settlement, phase: "settled", evaluation })
    yield* clearPending(arm, { binding: input.binding, settlement: input.settlement, phase: "settled", evaluation })
  })
  return yield* evaluator.evaluate({
    ...input,
    revisionGuard: true, blockCap: 0, mode: "step", params: input.binding.definition.parameters,
  }, { before, after })
})

// Checkpoint writes are atomic replacements. A receipt's assistant ID is the existing durable message identity, not
// a new run/drain identity. Disk durability has the same filesystem guarantees as the existing arm state writes.
const write = (arm: string, file: string, checkpoint: RelayArm.WorkflowCheckpoint) => Effect.gen(function* () {
  const encoded = yield* Schema.encodeEffect(Schema.fromJsonString(RelayArm.WorkflowCheckpoint))(checkpoint).pipe(
    Effect.mapError(held),
  )
  const temp = path.join(arm, `.workflow-${randomUUID()}`)
  yield* Effect.try({ try: () => {
    writeFileSync(temp, encoded, { flag: "wx", mode: 0o600 })
    renameSync(temp, path.join(arm, file))
  }, catch: () => new RelayWorkflowBinding.Held({ reason: "WORKFLOW_CHECKPOINT_ACQUISITION" }) }).pipe(
    Effect.ensuring(Effect.sync(() => rmSync(temp, { force: true }))),
  )
})

const read = (arm: string, file: string) => ArmLoad.bytes(path.join(arm, file)).pipe(
  Effect.flatMap((bytes) => ArmLoad.decode(path.join(arm, file), bytes, RelayArm.WorkflowCheckpoint)),
  Effect.map(Option.some),
  Effect.catchIf((error) => error.reason === "missing", () => Effect.succeed(Option.none<RelayArm.WorkflowCheckpoint>())),
  Effect.map(Option.getOrUndefined),
  Effect.mapError(held),
)

function held(error: unknown) {
  return error instanceof RelayWorkflowBinding.Held ? error
    : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_CHECKPOINT_ACQUISITION" })
}

const clearPending = (arm: string, checkpoint: RelayArm.WorkflowCheckpoint) => Effect.gen(function* () {
  const pending = yield* read(arm, "workflow_pending.json")
  if (!pending) return
  if (!isDeepStrictEqual(pending.binding, checkpoint.binding) || !isDeepStrictEqual(pending.settlement, checkpoint.settlement))
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_SETTLEMENT_IDENTITY_MISMATCH" })
  yield* Effect.try({ try: () => rmSync(path.join(arm, "workflow_pending.json")),
    catch: () => new RelayWorkflowBinding.Held({ reason: "WORKFLOW_CHECKPOINT_ACQUISITION" }) })
})
