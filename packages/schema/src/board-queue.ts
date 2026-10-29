import { Schema } from "effect"
import { ascending } from "./identifier"
import { NonNegativeInt, optional, PositiveInt, statics } from "./schema"

export const BundleID = Schema.String.pipe(
  Schema.brand("Board.BundleID"),
  statics((schema) => ({ create: () => schema.make("bbu_" + ascending()) })),
)
export type BundleID = typeof BundleID.Type

export const RiskLevel = Schema.Literals(["low", "medium", "high"]).annotate({ identifier: "Board.RiskLevel" })
export type RiskLevel = typeof RiskLevel.Type

/**
 * The part of a card's PR record Maestro writes (docs/specs/maestro-lead/merge-queue.md section 4.5). The host adds
 * Evidence, Cost, Lineage and Integration when it renders the PR body. `follow_ups` are card keys such as `LCH-12`.
 */
export interface PrRecord extends Schema.Schema.Type<typeof PrRecord> {}
export const PrRecord = Schema.Struct({
  intent: Schema.String.pipe(optional),
  change: Schema.String.pipe(optional),
  decisions: Schema.String.pipe(optional),
  not_covered: Schema.String.pipe(optional),
  risk: Schema.Struct({
    level: RiskLevel.pipe(optional),
    breaks: Schema.String.pipe(optional),
    undo: Schema.String.pipe(optional),
  }).pipe(optional),
  follow_ups: Schema.Array(Schema.String).pipe(optional),
}).annotate({ identifier: "Board.PrRecord" })

// Derived from the queue and bundle rows, never stored.
export const QueueStatus = Schema.Literals(["waiting", "running", "green", "conflict", "held"]).annotate({
  identifier: "Board.QueueStatus",
})
export type QueueStatus = typeof QueueStatus.Type

export interface QueueState extends Schema.Schema.Type<typeof QueueState> {}
export const QueueState = Schema.Struct({
  status: QueueStatus,
  /** The bundle number, `B<n>`, once the card is cut into one. */
  bundle: Schema.NullOr(PositiveInt),
  urgent: Schema.Boolean,
  queuedAt: Schema.Finite,
}).annotate({ identifier: "Board.QueueState" })

// Section 12 of the merge-queue spec: the conveyor's numbers for the project's pool. Times are milliseconds; null means no data yet.
export interface Ledger extends Schema.Schema.Type<typeof Ledger> {}
export const Ledger = Schema.Struct({
  queueWait: Schema.NullOr(Schema.Finite),
  redRate: Schema.NullOr(Schema.Finite),
  reworkRate: Schema.NullOr(Schema.Finite),
  leadTime: Schema.NullOr(Schema.Finite),
}).annotate({ identifier: "Board.Ledger" })

/** Whether the card's work is on the remote: `local` until the worktree's tree equals the last pushed snapshot. */
export const PushState = Schema.NullOr(Schema.Literals(["local", "pushed"]))
export type PushState = typeof PushState.Type

export const CheckID = Schema.String.pipe(
  Schema.brand("Board.CheckID"),
  statics((schema) => ({ create: () => schema.make("bck_" + ascending()) })),
)
export type CheckID = typeof CheckID.Type

export const CheckKind = Schema.Literals(["scoped", "workflow", "full"])
export type CheckKind = typeof CheckKind.Type
export const CheckOutcome = Schema.Literals(["pass", "fail", "pending", "error"])
export type CheckOutcome = typeof CheckOutcome.Type
/** Derived from `board_check` on the card's current tree, never stored. Null: nothing required has a result there yet. */
export const ScopedState = Schema.NullOr(Schema.Literals(["scoped-green", "scoped-red"]))
export type ScopedState = typeof ScopedState.Type

/** How an attempt ended; null while it is open. Only a merge or a cut ends a card's last attempt. */
export const AttemptOutcome = Schema.Literals(["merged", "ejected", "failed", "superseded", "cut"])
export type AttemptOutcome = typeof AttemptOutcome.Type

/** One pass or fail fact, keyed by the tree it ran on. `board_ci_run` keeps the billing next to it. */
export const Check = Schema.Struct({
  id: CheckID,
  attempt: NonNegativeInt,
  kind: CheckKind,
  command: Schema.String,
  treeSha: Schema.String,
  commitSha: Schema.NullOr(Schema.String),
  outcome: CheckOutcome,
  url: Schema.NullOr(Schema.String),
  failing: Schema.Array(Schema.String),
  startedAt: Schema.Finite,
  endedAt: Schema.NullOr(Schema.Finite),
}).annotate({ identifier: "Board.Check" })
export type Check = typeof Check.Type

export const CiRunResult = Schema.Struct({
  tree: Schema.String,
  state: ScopedState,
  checks: Schema.Array(Check),
  /** What the contract left out or could not do, in plain words. */
  notes: Schema.Array(Schema.String),
}).annotate({ identifier: "Board.CiRunResult" })
export type CiRunResult = typeof CiRunResult.Type

export const QueueResult = Schema.Struct({
  /** The PR head the card queued at; the bundle merges exactly this commit. */
  head: Schema.String,
  tree: Schema.String,
  state: ScopedState,
}).annotate({ identifier: "Board.QueueResult" })
export type QueueResult = typeof QueueResult.Type

export const DequeueResult = Schema.Struct({
  /** The open bundle the card was in, dissolved with its PR closed; its other members stay queued. */
  dissolved: Schema.NullOr(PositiveInt),
}).annotate({ identifier: "Board.DequeueResult" })
export type DequeueResult = typeof DequeueResult.Type

export const BundleResult = Schema.Struct({
  /** The bundle's status after the verdict: `accepted` merges on the next tick, `dissolved` or `infra` lets the queue cut again. */
  status: Schema.Literals(["accepted", "dissolved", "infra", "released"]),
}).annotate({ identifier: "Board.BundleResult" })
export type BundleResult = typeof BundleResult.Type
