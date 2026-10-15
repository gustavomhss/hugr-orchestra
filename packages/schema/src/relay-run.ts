export * as RelayRun from "./relay-run"

import { Schema } from "effect"
import { define, inventory } from "./event"
import { NonNegativeInt, optional } from "./schema"
import { Permission } from "./permission"
import { Prompt } from "./prompt"
import { SessionID } from "./session-id"
import { SessionMessage } from "./session-message"
import { RelayArm } from "./relay-arm"
import { RelayLedger } from "./relay-ledger"
import { Hex64, Sprint } from "./relay-sprint"

// Durable workflow-run events, aggregated by run. The supervisor writes them; the arm ledger stays Relay's.
const durable = { version: 1, aggregate: "runID" } as const

/**
 * A run was admitted against a published document version. `token` is the arm (`run-<runID>`); `params` are the
 * values exposed to checks as environment variables (`base_ref`, `repo_root`, `wp_dir`, …); `actor` is the principal
 * that started it.
 */
export const Admitted = define({
  type: "relay.run.admitted",
  durable,
  schema: {
    runID: Schema.String,
    token: RelayArm.Token,
    documentID: Schema.String,
    version: Schema.String,
    sha256: Hex64,
    sprint: Sprint,
    workdir: Schema.String,
    baseRef: Schema.String,
    agent: Schema.String,
    actor: Schema.String,
    params: Schema.Record(Schema.String, Schema.String),
  },
})
export type Admitted = typeof Admitted.Type

// A WP attempt reserved its Session and prompt before either exists, so a crash never dispatches twice.
export const Reserved = define({
  type: "relay.wp.reserved",
  durable,
  schema: {
    runID: Schema.String,
    wp: Schema.String,
    index: NonNegativeInt,
    sessionID: SessionID,
    promptID: SessionMessage.ID,
    prompt: Prompt,
    permissions: Permission.Ruleset,
  },
})
export type Reserved = typeof Reserved.Type

export const Dispatched = define({
  type: "relay.wp.dispatched",
  durable,
  schema: { runID: Schema.String, wp: Schema.String, sessionID: SessionID },
})
export type Dispatched = typeof Dispatched.Type

export const GateStarted = define({
  type: "relay.gate.started",
  durable,
  schema: {
    runID: Schema.String,
    wp: Schema.String,
    assistantMessageID: SessionMessage.ID,
    ledgerSeqBefore: Schema.Int,
  },
})
export type GateStarted = typeof GateStarted.Type

// `feedback` is the block text admitted to the WP Session as a queued prompt.
export const GateDecided = define({
  type: "relay.gate.decided",
  durable,
  schema: {
    runID: Schema.String,
    wp: Schema.String,
    outcome: RelayArm.Outcome,
    failing: Schema.Array(Schema.String),
    feedback: optional(Schema.String),
    ledgerSeq: Schema.Int,
  },
})
export type GateDecided = typeof GateDecided.Type

// Lifecycle transitions. `principal` is who acted (release and cancel); `audit` is the `relay verify` result that
// `completed` requires to be PASS.
const lifecycle = {
  runID: Schema.String,
  principal: optional(Schema.String),
  reason: optional(Schema.String),
  audit: optional(RelayLedger.AuditResult),
}

export const Parked = define({ type: "relay.run.parked", durable, schema: lifecycle })
export type Parked = typeof Parked.Type
export const Released = define({ type: "relay.run.released", durable, schema: lifecycle })
export type Released = typeof Released.Type
export const CancelRequested = define({ type: "relay.run.cancel-requested", durable, schema: lifecycle })
export type CancelRequested = typeof CancelRequested.Type
export const Cancelled = define({ type: "relay.run.cancelled", durable, schema: lifecycle })
export type Cancelled = typeof Cancelled.Type
export const Completed = define({ type: "relay.run.completed", durable, schema: lifecycle })
export type Completed = typeof Completed.Type

export const Definitions = inventory(
  Admitted,
  Reserved,
  Dispatched,
  GateStarted,
  GateDecided,
  Parked,
  Released,
  CancelRequested,
  Cancelled,
  Completed,
)
