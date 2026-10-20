import { Schema } from "effect"

// D38 and D40 wire shapes (an absent value is `null`, never omitted). This file imports nothing from atlas-screen.ts; the
// unions that need `AtlasEmpty` live there.

export const AtlasIndexOk = Schema.Struct({
  state: Schema.Literal("ok"),
  ran: Schema.Boolean,
  tool: Schema.NullOr(Schema.String),
  exitCode: Schema.NullOr(Schema.Finite),
  documents: Schema.NullOr(Schema.Finite),
  message: Schema.NullOr(Schema.String),
}).annotate({ identifier: "AtlasIndex" })

export const AtlasMineInput = Schema.Struct({
  providerID: Schema.String,
  modelID: Schema.String,
  ceiling: Schema.Finite,
})

export const AtlasMineOk = Schema.Struct({
  state: Schema.Literal("ok"),
  sites: Schema.Finite,
  facts: Schema.Finite,
  complete: Schema.Boolean,
  why: Schema.NullOr(Schema.String),
  refusal: Schema.NullOr(Schema.Literals(["contended", "unreadable", "untrusted"])),
}).annotate({ identifier: "AtlasMine" })
