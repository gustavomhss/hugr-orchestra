export * as LeanDashboard from "./lean-dashboard"

import { Schema } from "effect"
import { LeanCoverage } from "./lean-coverage"
import { NonNegativeInt } from "./schema"

export const Scope = Schema.Struct({
  profileID: Schema.String,
  projectID: Schema.String,
  directory: Schema.String,
}).annotate({ identifier: "LeanProfileScope" })
export type Scope = typeof Scope.Type

/** Exact safe integers or unavailable; tokens are always explicitly local estimates. */
export const Savings = Schema.Struct({
  bytesSaved: Schema.NullOr(Schema.Int),
  tokensSaved: Schema.NullOr(Schema.Int),
  calls: NonNegativeInt,
  tokenCalls: NonNegativeInt,
}).annotate({ identifier: "LeanProfileSavings" })
export type Savings = typeof Savings.Type

export const Item = Schema.Struct({
  id: LeanCoverage.ItemID,
  enabled: Schema.Boolean,
  savings: Savings,
}).annotate({ identifier: "LeanProfileItem" })
export type Item = typeof Item.Type

export const Info = Schema.Struct({
  scope: Scope,
  engine: Schema.String,
  enabled: Schema.Boolean,
  coverage: Schema.Literal("saved-profile-history"),
  complete: Schema.Boolean,
  savings: Savings,
  items: Schema.Array(Item),
}).annotate({ identifier: "LeanProfileDashboard" })
export type Info = typeof Info.Type

export const Update = Schema.Struct({
  itemID: Schema.optional(LeanCoverage.ItemID),
  enabled: Schema.Boolean,
}).annotate({ identifier: "LeanProfileUpdate" })
export type Update = typeof Update.Type

export const Execution = Schema.Struct({
  sessionID: Schema.String,
  messageID: Schema.String,
  partID: Schema.String,
  callID: Schema.String,
  itemID: LeanCoverage.ItemID,
  command: Schema.String,
  commandTruncated: Schema.Boolean,
  status: Schema.Literals(["completed", "error"]),
  exit: Schema.NullOr(Schema.Int),
  time: NonNegativeInt,
  bytesSaved: Schema.NullOr(Schema.Int),
  tokensSaved: Schema.NullOr(Schema.Int),
}).annotate({ identifier: "LeanProfileExecution" })
export type Execution = typeof Execution.Type

export const History = Schema.Struct({
  scope: Scope,
  itemID: LeanCoverage.ItemID,
  complete: Schema.Boolean,
  executions: Schema.Array(Execution),
}).annotate({ identifier: "LeanProfileHistory" })
export type History = typeof History.Type

/** UI transport seam; production adapters implement real HTTP, never browser-owned preferences. */
export interface Transport {
  readonly read: (signal?: AbortSignal) => Promise<Info>
  readonly update: (value: Update, signal?: AbortSignal) => Promise<Info>
  readonly history: (itemID: LeanCoverage.ItemID, signal?: AbortSignal) => Promise<History>
}
