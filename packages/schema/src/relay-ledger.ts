export * as RelayLedger from "./relay-ledger"

import { Schema } from "effect"
import { NonNegativeInt } from "./schema"
import { Hex64 } from "./relay-sprint"

// One line of a Relay ledger (ledger.jsonl). Field names and key order are the Python writers', byte for byte:
// each body is written in the order its struct lists, optional fields only when set, and the chain suffix
// (`gen, prev, seq, mac, h`) is appended by `relay_chain_append`, with `h` as the final root member.
//
// These structs carry no excess-property annotation. Readers choose: `onExcessProperty: "error"` proves a line has
// exactly the known shape, `"preserve"` keeps lines from older writers readable. Integrity is never decided here:
// the verifier checks the original signed bytes and never reserializes a decoded line.

export const Mac = Schema.Literals(["sha256", "hmac-sha256"])
export type Mac = typeof Mac.Type

// Legacy lines may lack `gen` and `mac`; a missing `mac` verifies as plain sha256.
export const Chain = Schema.Struct({
  gen: Schema.optionalKey(NonNegativeInt),
  prev: Schema.Union([Schema.Literal("GENESIS"), Hex64]),
  seq: NonNegativeInt,
  mac: Schema.optionalKey(Mac),
  h: Hex64,
}).annotate({ identifier: "RelayLedger.Chain" })
export interface Chain extends Schema.Schema.Type<typeof Chain> {}

const Timestamp = NonNegativeInt

// Kinds recorded on envelopes and items. `execute` is the default and is never written.
export const RecordedKind = Schema.Literals(["gate", "review", "inject"])
export type RecordedKind = typeof RecordedKind.Type

export const Cost = Schema.Struct({
  in: NonNegativeInt,
  out: NonNegativeInt,
  cache_read: NonNegativeInt,
  cache_write: NonNegativeInt,
  turns: NonNegativeInt,
}).annotate({ identifier: "RelayLedger.Cost" })
export interface Cost extends Schema.Schema.Type<typeof Cost> {}

export const ArmEvent = Schema.Literals([
  "advance-reveal",
  "compaction-hint",
  "sprint-complete",
  "gate-fail",
  "gate-fail-repeat",
  "escalate",
  "position-lost",
])
export type ArmEvent = typeof ArmEvent.Type

/**
 * The arm hook's disposition record (`ledger()` in relay-arm-hook.sh). `i` is -1 on `position-lost`, where `wp` is the
 * raw lost position. `retry` is the retry budget on `escalate`. `round` is "" or the round sha.
 */
export const ArmEnvelope = Schema.Struct({
  ts: Timestamp,
  arm: Schema.String,
  wp: Schema.String,
  i: Schema.Int,
  event: ArmEvent,
  retry: Schema.Int,
  fails: Schema.String,
  reg: Schema.String,
  round: Schema.String,
  repeat: NonNegativeInt,
  base_ref: Schema.optionalKey(Schema.String),
  cost: Schema.optionalKey(Cost),
  elapsed_s: Schema.optionalKey(Schema.Int),
  macro: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(RecordedKind),
}).annotate({ identifier: "RelayLedger.ArmEnvelope" })
export interface ArmEnvelope extends Schema.Schema.Type<typeof ArmEnvelope> {}

/**
 * The disposition record of the CLI `eval` and benchmark drivers: no `arm`, `round` or `repeat`. Neither driver is
 * ported; verify and audit still read their ledgers.
 */
export const GateEnvelope = Schema.Struct({
  ts: Timestamp,
  wp: Schema.String,
  i: Schema.Int,
  event: Schema.Literals(["advance-reveal", "sprint-complete", "gate-fail", "escalate"]),
  retry: Schema.Int,
  fails: Schema.String,
  reg: Schema.String,
  macro: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelayLedger.GateEnvelope" })
export interface GateEnvelope extends Schema.Schema.Type<typeof GateEnvelope> {}

/**
 * Who graded a control. Judge backends are open display tags (`judge:llm:<model>(votes:2/3)(truncated:a,b)…`), so any
 * `judge:` text is accepted; the gate core writes:
 * - `deterministic`, `unavailable(invalid-command)`;
 * - `judge:unavailable(invalid-criterion|invalid-scope|no-diff)`;
 * - `judge:<backend>(non-independent)`, `judge:unavailable(exit-N|invalid-response)(non-independent)`;
 * - `judge:unavailable` on an uncorroborated blocked claim.
 */
export const GradedBy = Schema.Union([
  Schema.Literals(["deterministic", "unavailable(invalid-command)"]),
  Schema.String.check(Schema.isStartsWith("judge:")),
])
export type GradedBy = typeof GradedBy.Type

// The oracle sha is "" when no oracle could be extracted (invalid command, criterion or scope).
export const Oracle = Schema.Union([Hex64, Schema.Literal("")])
export type Oracle = typeof Oracle.Type

/**
 * One control verdict. The arm buffers it without `ts` and prepends `ts` at flush; the round sha hashes the unstamped
 * line. `arm` is absent on CLI lines. `oracle` is absent only on legacy records (SPEC §6). `host_check`, `revision`
 * and `event_id` are TS-only and additive: an Arsenal host-check control (§6).
 */
export const ChecklistItem = Schema.Struct({
  ts: Timestamp,
  arm: Schema.optionalKey(Schema.String),
  wp: Schema.String,
  i: Schema.Int,
  event: Schema.Literal("checklist-item"),
  item: Schema.String,
  assert: Schema.String,
  verdict: Schema.Literals(["pass", "fail", "advisory"]),
  graded_by: GradedBy,
  oracle: Schema.optionalKey(Oracle),
  origin: Schema.String,
  scope: Schema.optionalKey(Schema.String),
  artifact: Schema.optionalKey(Hex64),
  macro: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(RecordedKind),
  host_check: Schema.optionalKey(Schema.String),
  revision: Schema.optionalKey(Schema.String),
  event_id: Schema.optionalKey(Schema.String),
}).annotate({ identifier: "RelayLedger.ChecklistItem" })
export interface ChecklistItem extends Schema.Schema.Type<typeof ChecklistItem> {}

// A keep-best re-run of an earlier accepted control. Always deterministic, always origin `regression`.
export const RegressionItem = Schema.Struct({
  ts: Timestamp,
  arm: Schema.optionalKey(Schema.String),
  wp: Schema.String,
  i: Schema.Int,
  event: Schema.Literal("regression-item"),
  item: Schema.String,
  verdict: Schema.Literals(["pass", "fail"]),
  graded_by: Schema.Literal("deterministic"),
  oracle: Schema.optionalKey(Oracle),
  origin: Schema.Literal("regression"),
  macro: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(RecordedKind),
}).annotate({ identifier: "RelayLedger.RegressionItem" })
export interface RegressionItem extends Schema.Schema.Type<typeof RegressionItem> {}

// `chain_min` keeps its legacy name; its value is the warning estimate `work_packages + 1`.
export const CapRisk = Schema.Struct({
  ts: Timestamp,
  arm: Schema.String,
  event: Schema.Literal("cap-risk"),
  cap: NonNegativeInt,
  chain_min: NonNegativeInt,
  work_packages: NonNegativeInt,
}).annotate({ identifier: "RelayLedger.CapRisk" })
export interface CapRisk extends Schema.Schema.Type<typeof CapRisk> {}

export const HumanRelease = Schema.Struct({
  ts: Timestamp,
  arm: Schema.String,
  wp: Schema.String,
  event: Schema.Literal("human-release"),
  reason: Schema.String,
}).annotate({ identifier: "RelayLedger.HumanRelease" })
export interface HumanRelease extends Schema.Schema.Type<typeof HumanRelease> {}

// `wp` is the raw position; `kind` is the unimplemented value as declared.
export const UnknownKind = Schema.Struct({
  ts: Timestamp,
  arm: Schema.String,
  wp: Schema.String,
  event: Schema.Literal("unknown-kind"),
  kind: Schema.String,
}).annotate({ identifier: "RelayLedger.UnknownKind" })
export interface UnknownKind extends Schema.Schema.Type<typeof UnknownKind> {}

// `file` is "(inline)" for inline text; `sha` covers the original file bytes, or the extracted inline text.
export const Inject = Schema.Struct({
  ts: Timestamp,
  arm: Schema.String,
  wp: Schema.String,
  event: Schema.Literal("inject"),
  file: Schema.String,
  sha: Hex64,
}).annotate({ identifier: "RelayLedger.Inject" })
export interface Inject extends Schema.Schema.Type<typeof Inject> {}

// `file` is "" when the state declares neither a file nor inline text.
export const InjectMissing = Schema.Struct({
  ts: Timestamp,
  arm: Schema.String,
  wp: Schema.String,
  event: Schema.Literal("inject-missing"),
  file: Schema.String,
}).annotate({ identifier: "RelayLedger.InjectMissing" })
export interface InjectMissing extends Schema.Schema.Type<typeof InjectMissing> {}

// `corroborated` is the corroborating judge's verdict, or `unavailable`.
export const BlockedClaim = Schema.Struct({
  ts: Timestamp,
  arm: Schema.String,
  wp: Schema.String,
  event: Schema.Literal("blocked-claim"),
  reason: Schema.String,
  sha: Hex64,
  honored: Schema.Boolean,
  corroborated: Schema.String,
  graded_by: GradedBy,
}).annotate({ identifier: "RelayLedger.BlockedClaim" })
export interface BlockedClaim extends Schema.Schema.Type<typeof BlockedClaim> {}

// ---- Orchestra notes: new and additive. The Python writers never produce them. ----

export const WpDispatched = Schema.Struct({
  ts: Timestamp,
  arm: Schema.String,
  wp: Schema.String,
  event: Schema.Literal("wp-dispatched"),
  session: Schema.String,
}).annotate({ identifier: "RelayLedger.WpDispatched" })
export interface WpDispatched extends Schema.Schema.Type<typeof WpDispatched> {}

export const RunCancelled = Schema.Struct({
  ts: Timestamp,
  arm: Schema.String,
  event: Schema.Literal("run-cancelled"),
  principal: Schema.String,
  reason: Schema.String,
}).annotate({ identifier: "RelayLedger.RunCancelled" })
export interface RunCancelled extends Schema.Schema.Type<typeof RunCancelled> {}

// Service recovery cleared a stale `.run.lock` it proved no live evaluation owns (R6).
export const GateRecovered = Schema.Struct({
  ts: Timestamp,
  arm: Schema.String,
  wp: Schema.String,
  event: Schema.Literal("gate-recovered"),
}).annotate({ identifier: "RelayLedger.GateRecovered" })
export interface GateRecovered extends Schema.Schema.Type<typeof GateRecovered> {}

export const HookAction = Schema.Literals(["remind", "block", "approve", "verify", "repair", "record", "allow"])
export type HookAction = typeof HookAction.Type

/**
 * What one matched hook action decided. Per action: block → `blocked`; approve → `approved|rejected|cancelled`;
 * verify → `passed|failed|unavailable`; repair → `repair-required`; remind → `reminded`; record → `recorded`;
 * allow → `allowed` (Allow grants nothing; it only records that no restrictive action fired on that path).
 */
export const HookOutcome = Schema.Literals([
  "blocked",
  "approved",
  "rejected",
  "cancelled",
  "passed",
  "failed",
  "unavailable",
  "repair-required",
  "reminded",
  "recorded",
  "allowed",
])
export type HookOutcome = typeof HookOutcome.Type

/**
 * A hook decision shipped from the durable `relay.hook.decided` event into `hooks/<installID>/ledger.jsonl`, idempotent
 * by `decision`, `deferred: true` when shipped late. `subject` is the path or the sha256 of the command, never the
 * command text. `tool` and `call` are null for session triggers, which have no tool call.
 */
export const HookDecision = Schema.Struct({
  ts: Timestamp,
  event: Schema.Literal("hook-decision"),
  decision: Schema.String,
  install: Schema.String,
  version: Schema.String,
  node: Schema.String,
  action: HookAction,
  trigger: Schema.String,
  tool: Schema.NullOr(Schema.String),
  session: Schema.String,
  call: Schema.NullOr(Schema.String),
  subject: Schema.String,
  outcome: HookOutcome,
  deferred: Schema.optionalKey(Schema.Literal(true)),
}).annotate({ identifier: "RelayLedger.HookDecision" })
export interface HookDecision extends Schema.Schema.Type<typeof HookDecision> {}

export const HookLifecycleEvent = Schema.Literals([
  "hook-installed",
  "hook-updated",
  "hook-enabled",
  "hook-disabled",
  "hook-uninstalled",
])
export type HookLifecycleEvent = typeof HookLifecycleEvent.Type

export const HookLifecycle = Schema.Struct({
  ts: Timestamp,
  event: HookLifecycleEvent,
  install: Schema.String,
  document: Schema.String,
  version: Schema.String,
  sha256: Hex64,
  principal: Schema.String,
}).annotate({ identifier: "RelayLedger.HookLifecycle" })
export interface HookLifecycle extends Schema.Schema.Type<typeof HookLifecycle> {}

// ---- Whole lines: a body plus its chain suffix. ----

const line = <const Fields extends Schema.Struct.Fields>(body: Schema.Struct<Fields>) =>
  Schema.Struct({ ...body.fields, ...Chain.fields })

export const ArmEnvelopeLine = line(ArmEnvelope)
export const GateEnvelopeLine = line(GateEnvelope)
export const ChecklistItemLine = line(ChecklistItem)
export const RegressionItemLine = line(RegressionItem)
export const CapRiskLine = line(CapRisk)
export const HumanReleaseLine = line(HumanRelease)
export const UnknownKindLine = line(UnknownKind)
export const InjectLine = line(Inject)
export const InjectMissingLine = line(InjectMissing)
export const BlockedClaimLine = line(BlockedClaim)
export const WpDispatchedLine = line(WpDispatched)
export const RunCancelledLine = line(RunCancelled)
export const GateRecoveredLine = line(GateRecovered)
export const HookDecisionLine = line(HookDecision)
export const HookLifecycleLine = line(HookLifecycle)

// Every line kind the TS engine writes or reads. The arm envelope precedes the CLI envelope: both share event names,
// and only the arm form carries `arm`, `round` and `repeat`. The daemon's ask notes are not ported and do not decode.
export const Entry = Schema.Union([
  ArmEnvelopeLine,
  GateEnvelopeLine,
  ChecklistItemLine,
  RegressionItemLine,
  CapRiskLine,
  HumanReleaseLine,
  UnknownKindLine,
  InjectLine,
  InjectMissingLine,
  BlockedClaimLine,
  WpDispatchedLine,
  RunCancelledLine,
  GateRecoveredLine,
  HookDecisionLine,
  HookLifecycleLine,
]).annotate({ identifier: "RelayLedger.Entry" })
export type Entry = typeof Entry.Type

// `relay verify --json` result codes.
export const AuditResult = Schema.Literals([
  "PASS",
  "TAMPERED",
  "RECORD-INVALID",
  "SPRINT-INVALID",
  "SPRINT-DIVERGED",
  "NO-CONTROLS",
  "CONTROL-FAIL",
  "ORACLE-CHANGED",
  "ORACLE-DRIFT",
  "ESCALATED",
  "ORACLE-UNVERIFIED",
  "TRUNCATED",
])
export type AuditResult = typeof AuditResult.Type
