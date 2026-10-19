import { Schema } from "effect"

// The wire shapes of the Atlas review routes (DECISIONS.md D31, D35), transcribing
// modules/atlas/packages/adapter-io/src/surface/types-review.ts. An absent value is `null` on the wire, never omitted.
// The `AtlasEmpty` unions and the write verdict are composed in groups/atlas.ts, which owns `AtlasEmpty`; this file
// imports nothing from it, so the two modules never import each other.

const Tier = Schema.Literals(["T1", "T0"])

export const AtlasReviewProposal = Schema.Struct({
  id: Schema.String,
  nodeKey: Schema.String,
  toTier: Tier,
  reason: Schema.String,
  by: Schema.String,
  at: Schema.String,
}).annotate({ identifier: "AtlasReviewProposal" })

export const AtlasMemoryProposal = Schema.Struct({
  id: Schema.String,
  member: Schema.String,
  rule: Schema.String,
  scope: Schema.String,
  by: Schema.String,
  at: Schema.String,
}).annotate({ identifier: "AtlasMemoryProposal" })

export const AtlasInterviewDraft = Schema.Struct({
  answer: Schema.String,
  model: Schema.String,
  why: Schema.String,
  by: Schema.String,
  at: Schema.String,
}).annotate({ identifier: "AtlasInterviewDraft" })

export const AtlasInterviewQuestion = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals(["owner", "tier", "contested", "intent"]),
  subject: Schema.String,
  ask: Schema.String,
  rank: Schema.Finite,
  site: Schema.String,
  options: Schema.NullOr(Schema.Array(Schema.String)),
  nodeKey: Schema.NullOr(Schema.String),
  draft: Schema.NullOr(AtlasInterviewDraft),
}).annotate({ identifier: "AtlasInterviewQuestion" })

export const AtlasReview = Schema.Struct({
  state: Schema.Literal("ok"),
  unreadable: Schema.Boolean,
  held: Schema.Array(Schema.String),
  proposals: Schema.Array(AtlasReviewProposal),
  memoryProposals: Schema.Array(AtlasMemoryProposal),
  interview: Schema.Struct({ batch: Schema.Array(AtlasInterviewQuestion), deferred: Schema.Finite }),
}).annotate({ identifier: "AtlasReview" })

export const AtlasHoldInput = Schema.Struct({ nodeKey: Schema.String })
export const AtlasReleaseInput = Schema.Struct({ nodeKey: Schema.String })
export const AtlasProposeInput = Schema.Struct({ nodeKey: Schema.String, toTier: Tier, reason: Schema.String })
export const AtlasDecideInput = Schema.Struct({
  proposalId: Schema.String,
  verdict: Schema.Literals(["ratified", "rejected"]),
  reason: Schema.String,
  token: Schema.optional(Schema.String),
})
export const AtlasAnswerInput = Schema.Struct({
  questionId: Schema.String,
  answer: Schema.String,
  drafted: Schema.optional(Schema.Struct({ model: Schema.String, why: Schema.String })),
})
export const AtlasMemoryDecideInput = Schema.Struct({
  proposalId: Schema.String,
  verdict: Schema.Literals(["indexed", "discarded"]),
  rule: Schema.optional(Schema.String),
  scope: Schema.optional(Schema.String),
})
export const AtlasTerritoryInput = Schema.Struct({
  name: Schema.String,
  owner: Schema.String,
  tier: Schema.Literals(["T0", "T1", "T2"]),
  globs: Schema.Array(Schema.String),
  token: Schema.optional(Schema.String),
})
