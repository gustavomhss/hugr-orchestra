export * as RelayWorkflowEvaluator from "./relay-workflow-evaluator"

import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { Effect, Option, Redacted, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { ArmEvaluate } from "@orchestra/relay/arm/evaluate"
import { ArmLoad } from "@orchestra/relay/arm/load"
import { ArmState } from "@orchestra/relay/arm/state"
import { LedgerChain } from "@orchestra/relay/ledger/chain"
import { LedgerRead } from "@orchestra/relay/ledger/read"
import { LedgerVerify } from "@orchestra/relay/ledger/verify"
import { RelayWorkflowBinding } from "./relay-workflow-binding"
import { RelayWorkflowCurrentStep } from "./relay-workflow-currentstep"
import type { RelayWorkflowTransition } from "./relay-workflow-transition"

const Receipt = Schema.Struct({
  event: Schema.Literal("workflow-disposition"), arm: RelayArm.Token,
  checkpoint: RelayArm.WorkflowCheckpoint, evaluation: RelayArm.Evaluation,
  writes: Schema.Array(ArmEvaluate.Write), sourceSeq: Schema.Int, seq: Schema.Int,
})
const events = new Map<RelayArm.Outcome, string>([
  ["advance", "advance-reveal"], ["complete", "sprint-complete"], ["gate-fail", "gate-fail"],
  ["regression-fail", "gate-fail"], ["escalate", "escalate"],
])

// Host's armed/ports scope provides existing engine requirements. Reconciliation is deliberately NOT another lock:
// Transition.before calls it while ArmEvaluate already owns .run.lock.
export const native = {
  evaluate: (input: RelayArm.EvaluateInput & {
    readonly binding?: RelayArm.WorkflowBinding
    readonly settlement?: RelayArm.WorkflowSettlement
  }, boundary: RelayWorkflowTransition.Boundary) => Effect.gen(function* () {
    if (!input.binding || !input.settlement) return yield* hold("WORKFLOW_SETTLEMENT_IDENTITY_MISSING")
    if (input.mode === "all-gates") return yield* hold("WORKFLOW_SETTLEMENT_MODE_INVALID")
    const identity = { binding: input.binding, settlement: input.settlement, phase: "pending" as const }
    const arm = yield* ArmState.dir(input.token)
    const store = yield* ArmState.Store
    const key = yield* requireKey(store.ledgerKey)
    const ledger = path.join(arm, RelayArm.Files.ledger)
    const result = yield* ArmEvaluate.evaluate(input, {
      before: () => Effect.gen(function* () {
        const loaded = yield* ArmLoad.arm(arm)
        if (!isDeepStrictEqual(loaded.meta.workflow, identity.binding) ||
          loaded.meta.project_id !== identity.binding.definition.publication.projectID ||
          loaded.meta.session_id !== identity.binding.executionSessionID ||
          RelayWorkflowBinding.digest(loaded.sprintBytes) !== identity.binding.definition.materialization.digest ||
          loaded.sprintBytes.length !== identity.binding.definition.materialization.byteLength)
          return yield* hold("WORKFLOW_MATERIALIZATION_DRIFT")
        yield* signed(ledger, key, true)
        const saved = yield* boundary.before()
        if (saved !== undefined) {
          const receipts = yield* LedgerRead.entries(ledger)
          const authenticated = receipts.some((entry) => {
            const receipt = Schema.decodeUnknownOption(Receipt)(entry)
            return Option.isSome(receipt) && sameIdentity(receipt.value.checkpoint, identity) &&
              isDeepStrictEqual(receipt.value.evaluation, saved)
          })
          if (!authenticated) return yield* hold("WORKFLOW_SETTLEMENT_EVIDENCE_MISSING")
          return saved
        }
        const fence = yield* pending(arm)
        const receipt = yield* pending(arm,
          `workflow_${RelayWorkflowBinding.digest(Buffer.from(identity.settlement.assistantMessageID))}.json`)
        if (!sameIdentity(fence, identity) || !sameIdentity(receipt, identity))
          return yield* hold("WORKFLOW_SETTLEMENT_IDENTITY_MISMATCH")
        const view = yield* RelayWorkflowCurrentStep.read(input.token, identity.binding)
        if (view.state !== "active" || !isDeepStrictEqual({ position: view.position, attempt: view.attempt,
          ledgerSeq: view.ledgerSeq }, identity.settlement.expected))
          return yield* hold("WORKFLOW_SETTLEMENT_POSITION_MISMATCH")
      }),
      disposition: (evaluation, writes) => Effect.gen(function* () {
        const checkpoint = yield* pending(arm)
        if (!sameIdentity(checkpoint, identity))
          return yield* hold("WORKFLOW_SETTLEMENT_IDENTITY_MISMATCH")
        const loaded = yield* ArmLoad.arm(arm)
        yield* signed(ledger, key)
        const entries = yield* LedgerRead.entries(ledger)
        const source = entries.at(-1)
        if (!source || source.seq !== evaluation.ledgerSeq || evaluation.ledgerSeq <= checkpoint.settlement.expected.ledgerSeq)
          return yield* hold("WORKFLOW_SETTLEMENT_EVIDENCE_MISSING")
        if (!events.has(evaluation.outcome)) return yield* hold("WORKFLOW_SETTLEMENT_DISPOSITION_UNKNOWN")
        const seq = evaluation.ledgerSeq + 1
        const appended = yield* LedgerChain.append({ ledger, key, gen: loaded.sprint.gen ?? 0, body: JSON.stringify({
          event: "workflow-disposition", arm: input.token, checkpoint,
          evaluation: { ...evaluation, ledgerSeq: seq }, writes, sourceSeq: evaluation.ledgerSeq,
        }) })
        if (appended.seq !== seq) return yield* hold("WORKFLOW_SETTLEMENT_LEDGER_CHANGED")
      }),
      after: (evaluation) => Effect.gen(function* () {
        const checkpoint = yield* pending(arm)
        if (!sameIdentity(checkpoint, identity)) return yield* hold("WORKFLOW_SETTLEMENT_IDENTITY_MISMATCH")
        // The receipt covers every disposition write; after runs only once those writes completed.
        const receipt = yield* evidence(arm, input.token, checkpoint, key)
        if (!isDeepStrictEqual(receipt.evaluation, evaluation))
          return yield* hold("WORKFLOW_SETTLEMENT_DISPOSITION_UNKNOWN")
        yield* boundary.after(evaluation)
      }),
    })
    if (["busy", "defect", "refused", "noop", "parked", "revision-drift"].includes(result.outcome))
      return yield* hold("WORKFLOW_EVALUATION_ACQUISITION")
    return result
  }).pipe(Effect.mapError(held), Effect.catchDefect(() => hold("WORKFLOW_EVALUATION_ACQUISITION"))),

  reconcile: (input: RelayWorkflowTransition.Input, checkpoint: RelayArm.WorkflowCheckpoint) => Effect.gen(function* () {
    const arm = yield* ArmState.dir(input.token)
    if (!ArmState.held(arm)) return yield* hold("WORKFLOW_SETTLEMENT_LOCK_REQUIRED")
    yield* input.revalidate()
    if (checkpoint.phase !== "pending" || !isDeepStrictEqual(checkpoint.binding, input.binding) ||
      !isDeepStrictEqual(checkpoint.settlement, input.settlement))
      return yield* hold("WORKFLOW_SETTLEMENT_IDENTITY_MISMATCH")
    const fence = yield* pending(arm)
    if (!isDeepStrictEqual(fence, checkpoint)) return yield* hold("WORKFLOW_SETTLEMENT_IDENTITY_MISMATCH")
    const loaded = yield* ArmLoad.arm(arm)
    if (!isDeepStrictEqual(loaded.meta.workflow, input.binding) ||
      loaded.meta.project_id !== input.binding.definition.publication.projectID ||
      loaded.meta.session_id !== input.binding.executionSessionID ||
      RelayWorkflowBinding.digest(loaded.sprintBytes) !== input.binding.definition.materialization.digest ||
      loaded.sprintBytes.length !== input.binding.definition.materialization.byteLength)
      return yield* hold("WORKFLOW_MATERIALIZATION_DRIFT")
    const store = yield* ArmState.Store
    const receipt = yield* evidence(arm, input.token, checkpoint, yield* requireKey(store.ledgerKey))
    yield* ArmEvaluate.repair(arm, receipt.writes)
    return receipt.evaluation
  }).pipe(Effect.mapError(held), Effect.catchDefect(() => hold("WORKFLOW_SETTLEMENT_ACQUISITION"))),
}

const pending = (arm: string, name = "workflow_pending.json") => Effect.gen(function* () {
  const file = path.join(arm, name)
  return yield* ArmLoad.decode(file, yield* ArmLoad.bytes(file), RelayArm.WorkflowCheckpoint)
})

// A whole signed repair receipt, not an ordinary old PASS or unsigned checkpoint JSON. Its source disposition and
// cursor/attempt identity are anchored after expected ledger seq. An interrupted earlier stage holds permanently.
const evidence = (arm: string, token: RelayArm.Token, checkpoint: RelayArm.WorkflowCheckpoint, key: Redacted.Redacted<string>) =>
  Effect.gen(function* () {
    if (!ArmState.held(arm)) return yield* hold("WORKFLOW_SETTLEMENT_LOCK_REQUIRED")
    const ledger = path.join(arm, RelayArm.Files.ledger)
    yield* signed(ledger, key, true)
    const entries = yield* LedgerRead.entries(ledger).pipe(
      Effect.catchTag("LedgerRead.Missing", () => hold("WORKFLOW_SETTLEMENT_EVIDENCE_MISSING")),
    )
    const receipt = Schema.decodeUnknownOption(Receipt)(entries.at(-1))
    if (Option.isNone(receipt)) return yield* hold("WORKFLOW_SETTLEMENT_EVIDENCE_MISSING")
    const value = receipt.value
    if (value.arm !== token || !isDeepStrictEqual(value.checkpoint, checkpoint) ||
      value.seq !== value.evaluation.ledgerSeq || value.sourceSeq !== value.seq - 1 ||
      value.sourceSeq <= checkpoint.settlement.expected.ledgerSeq)
      return yield* hold("WORKFLOW_SETTLEMENT_IDENTITY_MISMATCH")
    const loaded = yield* ArmLoad.arm(arm)
    const index = ArmState.resolve(loaded.sprint, checkpoint.settlement.expected.position)
    if (Option.isNone(index)) return yield* hold("WORKFLOW_SETTLEMENT_POSITION_MISMATCH")
    const wp = loaded.sprint.work_packages[index.value]
    const changed = entries.slice(checkpoint.settlement.expected.ledgerSeq + 1, value.seq)
    const dispositions = changed.filter((entry) => ["advance-reveal", "sprint-complete", "gate-fail", "gate-fail-repeat", "escalate"].includes(String(entry.event)))
    const source = dispositions[0]
    if (dispositions.length !== 1 || !source || source.wp !== wp.id || source.i !== index.value ||
      value.evaluation.wp !== wp.id || !events.has(value.evaluation.outcome) ||
      (source.event !== events.get(value.evaluation.outcome) &&
        !(["gate-fail", "regression-fail"].includes(value.evaluation.outcome) && source.event === "gate-fail-repeat")))
      return yield* hold("WORKFLOW_SETTLEMENT_DISPOSITION_UNKNOWN")
    const names = new Set([RelayArm.Files.counter, RelayArm.Files.position, RelayArm.Files.state, RelayArm.Files.regRetry,
      `retry_${ArmState.safe(wp.id)}`, `round_${ArmState.safe(wp.id)}`, `repeat_${ArmState.safe(wp.id)}`])
    const next = loaded.sprint.work_packages[index.value + 1]
    if (next) {
      names.add(`base_${ArmState.safe(next.id)}`)
      if (next.macro) names.add(`macro_${ArmState.safe(next.macro)}`)
    }
    const safe = ArmState.safe(wp.id)
    const required = value.evaluation.outcome === "advance" || value.evaluation.outcome === "complete"
      ? [`round_${safe}`, `repeat_${safe}`, RelayArm.Files.regRetry, RelayArm.Files.counter,
          value.evaluation.outcome === "advance" ? RelayArm.Files.position : RelayArm.Files.state,
          ...(value.evaluation.outcome === "advance" && next && source.base_ref ? [`base_${ArmState.safe(next.id)}`] : [])]
      : [`round_${safe}`, `repeat_${safe}`,
          ...(value.evaluation.outcome === "escalate" ? [RelayArm.Files.state, RelayArm.Files.counter]
            : [value.evaluation.outcome === "regression-fail" ? RelayArm.Files.regRetry : `retry_${safe}`])]
    if (!value.writes.length || value.writes.some((write) => !names.has(write.name)) ||
      new Set(value.writes.map((write) => write.name)).size !== value.writes.length ||
      required.some((name) => !value.writes.some((write) => write.name === name)) ||
      (value.evaluation.outcome === "advance" && (!next || value.evaluation.next !== next.id)))
      return yield* hold("WORKFLOW_SETTLEMENT_DISPOSITION_UNKNOWN")
    return value
  })

const signed = (ledger: string, key: Redacted.Redacted<string>, missing = false) => Effect.gen(function* () {
  const result = yield* LedgerVerify.verify(ledger, key)
  if (result.exit !== 0 && !(missing && result.exit === 2)) return yield* hold("WORKFLOW_LEDGER_INVALID")
})

function requireKey(key: Option.Option<Redacted.Redacted<string>>) {
  return Option.isSome(key) && Redacted.value(key.value) !== ""
    ? Effect.succeed(key.value) : hold("WORKFLOW_LEDGER_KEY_MISSING")
}

function hold(reason: string) {
  return Effect.fail(new RelayWorkflowBinding.Held({ reason }))
}

function held(error: unknown) {
  return error instanceof RelayWorkflowBinding.Held ? error
    : new RelayWorkflowBinding.Held({ reason: "WORKFLOW_SETTLEMENT_ACQUISITION" })
}

function sameIdentity(checkpoint: RelayArm.WorkflowCheckpoint, identity: RelayArm.WorkflowCheckpoint) {
  return checkpoint.phase === "pending" && checkpoint.evaluation === undefined &&
    isDeepStrictEqual(checkpoint.binding, identity.binding) && isDeepStrictEqual(checkpoint.settlement, identity.settlement)
}
