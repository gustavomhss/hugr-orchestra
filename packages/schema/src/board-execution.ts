export * as BoardExecution from "./board-execution"

import { Schema } from "effect"
import { Model } from "./model"
import { NonNegativeInt, optional, PositiveInt } from "./schema"

/** Host invocation identity, never a user-supplied tool or HTTP field. */
export const Writer = Schema.Struct({
  kind: Schema.Literals(["owner", "seat", "github"]),
  seat: Schema.NullOr(Schema.String),
  sessionID: Schema.NullOr(Schema.String),
  messageID: Schema.NullOr(Schema.String),
  callID: Schema.NullOr(Schema.String),
  model: Schema.NullOr(Model.Ref),
}).annotate({ identifier: "Board.Writer" })
export interface Writer extends Schema.Schema.Type<typeof Writer> {}

export const Authorship = Schema.Struct({
  writer: Writer,
  at: Schema.Finite,
}).annotate({ identifier: "Board.Authorship" })
export interface Authorship extends Schema.Schema.Type<typeof Authorship> {}

export const Usage = Schema.Struct({
  input: NonNegativeInt,
  output: NonNegativeInt,
  reasoning: NonNegativeInt,
  cacheRead: NonNegativeInt,
  cacheWrite: NonNegativeInt,
}).annotate({ identifier: "Board.Usage" })
export interface Usage extends Schema.Schema.Type<typeof Usage> {}

/** Null is unmeasured, not free or instantaneous. Counter categories are not added into an ambiguous total. */
export const Metrics = Schema.Struct({
  tokens: Schema.NullOr(Usage),
  modelUsd: Schema.NullOr(Schema.Finite),
  ciUsd: Schema.NullOr(Schema.Finite),
  ciMs: Schema.NullOr(Schema.Finite),
  ciRuns: NonNegativeInt,
  providerMs: Schema.NullOr(Schema.Finite),
  toolUses: Schema.NullOr(NonNegativeInt),
  partial: Schema.Boolean,
}).annotate({ identifier: "Board.Metrics" })
export interface Metrics extends Schema.Schema.Type<typeof Metrics> {}

export const ExecutionModel = Schema.Struct({
  model: Model.Ref,
  tokens: Schema.NullOr(Usage),
  usd: Schema.NullOr(Schema.Finite),
  billing: Schema.Literals(["reported", "subscription", "unavailable"]),
}).annotate({ identifier: "Board.ExecutionModel" })
export interface ExecutionModel extends Schema.Schema.Type<typeof ExecutionModel> {}

export const ExecutionParticipant = Schema.Struct({
  sessionID: Schema.String,
  seats: Schema.Array(Schema.String),
  role: Schema.Literals(["execution", "review"]),
  models: Schema.Array(ExecutionModel),
}).annotate({ identifier: "Board.ExecutionParticipant" })
export interface ExecutionParticipant extends Schema.Schema.Type<typeof ExecutionParticipant> {}

export const ExecutionAttempt = Schema.Struct({
  n: PositiveInt,
  seat: Schema.NullOr(Schema.String),
  sessionID: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  prNumber: Schema.NullOr(Schema.Int),
  startedAt: Schema.Finite,
  endedAt: Schema.NullOr(Schema.Finite),
  outcome: Schema.NullOr(Schema.Literals(["merged", "ejected", "failed", "superseded", "cut"])),
  cause: Schema.NullOr(Schema.String),
  models: Schema.Array(ExecutionModel),
  participants: Schema.Array(ExecutionParticipant),
  metrics: Metrics,
}).annotate({ identifier: "Board.ExecutionAttempt" })
export interface ExecutionAttempt extends Schema.Schema.Type<typeof ExecutionAttempt> {}

export const Receipt = Schema.Struct({
  closedAt: Schema.Finite,
  stage: Schema.Literals(["shipped", "cut"]),
  leadTimeMs: Schema.Finite,
  attempts: NonNegativeInt,
  metrics: Metrics,
}).annotate({ identifier: "Board.Receipt" })
export interface Receipt extends Schema.Schema.Type<typeof Receipt> {}

export const ExecutionReport = Schema.Struct({
  ref: Schema.String,
  asOf: Schema.Finite,
  creator: Schema.NullOr(Authorship),
  models: Schema.Array(ExecutionModel),
  attempts: Schema.Array(ExecutionAttempt),
  participants: Schema.Array(ExecutionParticipant),
  metrics: Metrics,
  leadTimeMs: Schema.Finite,
  receipts: Schema.Array(Receipt),
  /** Sessions with conflicting card ownership are excluded, not counted twice. */
  unattributedSessions: Schema.Array(Schema.String),
  /** Counted once in the card total, but no exclusive recorded attempt can receive their usage. */
  unassignedSessions: Schema.Array(Schema.String),
}).annotate({ identifier: "Board.ExecutionReport" })
export interface ExecutionReport extends Schema.Schema.Type<typeof ExecutionReport> {}

export const CreateIssueInput = Schema.Struct({
  title: Schema.Trim.check(Schema.isNonEmpty()),
  body: Schema.String.pipe(optional),
  type: Schema.Literals(["feature", "bug", "chore"]).pipe(optional),
  epic: Schema.NullOr(PositiveInt).pipe(optional),
  estimate: Schema.NullOr(Schema.Literals(["s", "m", "l"])).pipe(optional),
}).annotate({ identifier: "Board.CreateIssueInput" })
export interface CreateIssueInput extends Schema.Schema.Type<typeof CreateIssueInput> {}
