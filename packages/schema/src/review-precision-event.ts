export * as ReviewPrecisionEvent from "./review-precision-event"

import { Schema } from "effect"
import { Event } from "./event"

// Private host evidence, not a model tool input or a merge receipt. One aggregate
// supplies an admission order across Sessions and projects in this database.
export const Aggregate = "review-precision-v1"
export interface Read extends Schema.Schema.Type<typeof Read> {}
export const Read = Schema.Struct({
  pack: Schema.NonEmptyString,
  rule: Schema.NonEmptyString,
  generation: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
  fingerprint: Schema.NonEmptyString,
  outcome: Schema.Literals(["confirmed", "refuted", "not-pursued"]),
})

export const Observed = Event.define({
  type: "review.precision.observed",
  durable: { version: 1, aggregate: "ledgerID" },
  schema: {
    ledgerID: Schema.Literal(Aggregate),
    review: Schema.NonEmptyString,
    project: Schema.NonEmptyString,
    reads: Schema.Array(Read),
  },
})

export const Definitions = Event.inventory(Observed)
