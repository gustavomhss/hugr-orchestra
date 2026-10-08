export * as RelayArm from "./relay-arm"

import { Effect, Schema } from "effect"
import { NonNegativeInt } from "./schema"
import { Hex64, Id } from "./relay-sprint"

// One arm: `arms/<token>/`, the directory binding one runner to a sprint, metadata, persisted state and a ledger.

// `[A-Za-z0-9_.-]+`, never "." and never containing "..", so a token cannot escape the arms directory.
export const Token = Schema.String.check(Schema.isPattern(/^(?!\.$)(?!.*\.\.)[A-Za-z0-9_.-]+$/))
export type Token = typeof Token.Type

// `escalated` is legacy and reads as parked, like `awaiting-human`.
export const State = Schema.Literals(["active", "complete", "awaiting-human", "escalated"])
export type State = typeof State.Type

/**
 * Arm directory layout. `counter`, `retry_*` and `reg_retry` end with LF; every other state file has no trailing LF.
 * Per-WP files are suffixed with `safe(wpID)`: every UTF-8 byte outside `[A-Za-z0-9._-]` becomes `_`.
 * `retry_<index>` is a legacy file that is read once for migration and never written.
 */
export const Files = {
  sprint: "sprint.json",
  meta: "meta.json",
  agentID: "agent_id",
  position: "position",
  state: "state",
  counter: "counter",
  regRetry: "reg_retry",
  trCursor: "tr_cursor",
  enteredAt: "entered_at",
  preflight: "preflight",
  release: "release",
  log: "relay.log",
  ledger: "ledger.jsonl",
  runLock: ".run.lock",
  chainLock: ".chain.lock",
} as const

export const WpFilePrefix = {
  retry: "retry_",
  round: "round_",
  repeat: "repeat_",
  blocked: "blocked_",
  base: "base_",
  macro: "macro_",
} as const

/**
 * meta.json. The arm hook reads `workdir` (command cwd) and `base_ref` (the first state's diff base). The other keys
 * are written by Orchestra: the run or Arsenal binding, and the contract fingerprint checked for drift (§6).
 */
export const Meta = Schema.Struct({
  workdir: Schema.String,
  base_ref: Schema.optionalKey(Schema.String),
  token: Schema.optionalKey(Schema.String),
  label: Schema.optionalKey(Schema.String),
  project_id: Schema.optionalKey(Schema.String),
  session_id: Schema.optionalKey(Schema.String),
  contract_sha256: Schema.optionalKey(Hex64),
  run_id: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelayArm.Meta", parseOptions: { onExcessProperty: "preserve" } })
export interface Meta extends Schema.Schema.Type<typeof Meta> {}

// ---- Host checks: Arsenal completion checks graded by registered host callbacks (§6). ----

export const Provenance = Schema.Struct({
  source: Schema.Literals(["session-event", "host-check"]),
  projectID: Schema.String,
  sessionID: Schema.String,
  eventID: Schema.String,
  revision: Schema.optionalKey(Schema.String),
  revisionKind: Schema.optionalKey(Schema.Literals(["git", "source", "event"])),
  revisionUnavailable: Schema.optionalKey(Schema.Literals(["not-captured", "not-applicable"])),
}).annotate({ identifier: "RelayArm.Provenance" })
export interface Provenance extends Schema.Schema.Type<typeof Provenance> {}

export const HostCheckResult = Schema.Struct({
  name: Schema.String,
  status: Schema.Literals(["pass", "fail", "skip", "missing", "acquisition-error"]),
  exitCode: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 }))),
  provenance: Provenance,
}).annotate({ identifier: "RelayArm.HostCheckResult" })
export interface HostCheckResult extends Schema.Schema.Type<typeof HostCheckResult> {}

export const HostCapture = Schema.Struct({
  complete: Schema.Boolean,
  results: Schema.Array(HostCheckResult),
}).annotate({ identifier: "RelayArm.HostCapture" })
export interface HostCapture extends Schema.Schema.Type<typeof HostCapture> {}

export interface HostCheckInput {
  readonly token: Token
  readonly sessionID?: string
  readonly gateID: string
  readonly check: { readonly id: string; readonly hostCheck: Id }
  // HEAD as the revision guard read it before the checks, for the result's provenance (WP18, additive).
  readonly revision?: string
}

// A failed or defective callback is an `acquisition-error` result, never a pass. Checks run one at a time, 60 s each.
export type HostCheck = (input: HostCheckInput) => Effect.Effect<HostCheckResult>

// ---- Evaluation ----

/**
 * One stop evaluation of an arm. The token is always explicit: there is no transcript marker scan.
 * - `transcript`: JSONL path read for usage (cost) and the last `RELAY-BLOCKED:` claim.
 * - `mode`: `step` evaluates the current WP once (the hook); `all-gates` advances through every WP under one lock.
 * - `hostChecks`: required for every `host_check` control, checked again here (fail closed).
 * - `observe`: runs with the host capture before the disposition is recorded.
 * - `revisionGuard`: read HEAD before and after the checks; a change yields `revision-drift`.
 * - `blockCap`: the hook block cap for the cap-risk preflight; 0 (Orchestra) skips it.
 * - `compactAfter`: the gate index from which advancing adds a compaction hint (default 6).
 * - `params`: the run's `${name}` values for context and scope paths and the check environment (WP6, additive).
 */
export interface EvaluateInput {
  readonly token: Token
  readonly agentID?: string
  readonly transcript?: string
  readonly mode?: "step" | "all-gates"
  readonly hostChecks?: ReadonlyMap<Id, HostCheck>
  readonly observe?: (capture: HostCapture) => Effect.Effect<void>
  readonly revisionGuard?: boolean
  readonly blockCap?: number
  readonly compactAfter?: number
  readonly params?: Readonly<Record<string, string>>
}

export const Outcome = Schema.Literals([
  "advance",
  "complete",
  "gate-fail",
  "regression-fail",
  "escalate",
  "parked",
  "noop",
  "defect",
  "refused",
  "busy",
  "revision-drift",
])
export type Outcome = typeof Outcome.Type

export const Defect = Schema.Literals([
  "position-lost",
  "inject-missing",
  "unknown-kind",
  "arm-missing",
  "agent-mismatch",
])
export type Defect = typeof Defect.Type

/**
 * The disposition of one evaluation. `reason` is the exact block text the Python hook emits, including the cap-risk
 * warning prefix; it is absent when the hook would emit no block. `ledgerSeq` is the seq of the last ledger line after
 * the evaluation, -1 for an empty ledger.
 */
export const Evaluation = Schema.Struct({
  outcome: Outcome,
  wp: Schema.optionalKey(Schema.String),
  next: Schema.optionalKey(Schema.String),
  failing: Schema.Array(Schema.String),
  reason: Schema.optionalKey(Schema.String),
  defect: Schema.optionalKey(Defect),
  inject: Schema.optionalKey(Schema.Struct({ file: Schema.String, sha: Hex64 })),
  ledgerSeq: Schema.Int,
  capture: Schema.optionalKey(HostCapture),
}).annotate({ identifier: "RelayArm.Evaluation" })
export interface Evaluation extends Schema.Schema.Type<typeof Evaluation> {}

/**
 * `relay-gate check` output, with the Python key order. A check grades the selected WP's checklist only; it never
 * charges retries, advances or records verdicts. An unknown named position is the `error` form (exit 2).
 */
export const CheckOutcome = Schema.Union([
  Schema.Struct({
    outcome: Schema.Literal("check"),
    i: NonNegativeInt,
    wp: Schema.String,
    failing: Schema.Array(Schema.String),
    macro: Schema.optionalKey(Schema.String),
  }),
  Schema.Struct({ outcome: Schema.Literal("complete"), i: NonNegativeInt }),
  Schema.Struct({
    outcome: Schema.Literal("error"),
    error: Schema.Literal("unknown-position"),
    position: Schema.String,
  }),
]).annotate({ identifier: "RelayArm.CheckOutcome" })
export type CheckOutcome = typeof CheckOutcome.Type

// ---- Arsenal completion contract, verbatim from orchestra/src/maestro/arsenal-completion.ts (moves here in WP18). ----
// The ≤1000 total checks and unique gate/check IDs rule stays in the host, where it maps to
// `completion-callback-cap-or-duplicate` rather than to a decode failure.

const ContractID = Id
export const Contract = Schema.Struct({
  sessionID: ContractID,
  label: Schema.NonEmptyString.check(Schema.isMaxLength(4096)),
  retryBudget: Schema.optional(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(32))),
  chain: Schema.Array(
    Schema.Struct({
      id: ContractID,
      instructions: Schema.optional(Schema.NonEmptyString.check(Schema.isMaxLength(4096))),
      checks: Schema.Array(Schema.Struct({ id: ContractID, hostCheck: ContractID })).check(
        Schema.isMinLength(1),
        Schema.isMaxLength(64),
      ),
    }),
  ).check(Schema.isMinLength(1), Schema.isMaxLength(32)),
}).annotate({ identifier: "RelayArm.Contract" })
export type Contract = typeof Contract.Type

export const Stored = Schema.Struct({ schema: Schema.Literal(1), projectID: ContractID, contract: Contract }).annotate({
  identifier: "RelayArm.Stored",
})
export type Stored = typeof Stored.Type

/**
 * Every completion HOLD reason, verbatim. Identity codes stay in arsenal-bindings.ts and
 * `completion-worker-not-finished` in task.ts. `completion-parked-awaiting-owner` is new (Maestro condition 1): the
 * retry budget of a gate is spent and the arm is parked until the owner releases or cancels it.
 */
export const CompletionHold = Schema.Literals([
  "completion-approved-task-mismatch",
  "completion-arm-history-overflow",
  "completion-arm-placement-mismatch",
  "completion-authority-history-overflow",
  "completion-authorization-mismatch",
  "completion-callback-cap-or-duplicate",
  "completion-checks-not-passing",
  "completion-contract-drift",
  "completion-dispatch-binding-mismatch",
  "completion-evaluation-acquisition",
  "completion-evaluator-or-observer-unbound",
  "completion-git-acquisition",
  "completion-git-failed-or-overflow",
  "completion-host-check-unbound",
  "completion-native-call-message-missing",
  "completion-native-child-mismatch",
  "completion-native-child-missing",
  "completion-native-owner-missing",
  "completion-native-parent-missing",
  "completion-native-placement-mismatch",
  "completion-native-task-agent-mismatch",
  "completion-native-task-call-invalid",
  "completion-native-task-call-missing-or-ambiguous",
  "completion-plan-authority-missing",
  "completion-project-or-session-mismatch",
  "completion-receipt-unbound",
  "completion-revision-acquisition",
  "completion-revision-drift",
  "completion-state-acquisition",
  "completion-state-changed",
  "completion-state-identity-invalid",
  "completion-state-inside-project",
  "completion-state-overflow-or-type",
  "completion-state-symlink",
  "completion-worker-not-finished",
  "completion-parked-awaiting-owner",
])
export type CompletionHold = typeof CompletionHold.Type
