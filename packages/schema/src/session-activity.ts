export * as SessionActivity from "./session-activity"

// Recorded activity of a project's Sessions over a period, as the home dashboard reads it.

import { Schema } from "effect"

export const Period = Schema.Literals(["7d", "30d", "90d", "all"])
export type Period = Schema.Schema.Type<typeof Period>

export const Fact = Schema.Struct({
  bucket: Schema.Finite,
  sessionID: Schema.String,
  providerID: Schema.NullOr(Schema.String),
  modelID: Schema.NullOr(Schema.String),
  user: Schema.Finite,
  assistant: Schema.Finite,
  failed: Schema.Finite,
  tokens: Schema.Finite,
}).annotate({ identifier: "SessionActivityFact" })
export type Fact = Schema.Schema.Type<typeof Fact>

export const ActivitySession = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  parentID: Schema.NullOr(Schema.String),
  created: Schema.Finite,
  updated: Schema.Finite,
  additions: Schema.NullOr(Schema.Finite),
  deletions: Schema.NullOr(Schema.Finite),
  files: Schema.NullOr(Schema.Finite),
}).annotate({ identifier: "SessionActivitySession" })

export const Activity = Schema.Struct({
  period: Period,
  edges: Schema.Array(Schema.Finite).annotate({
    description: "Ascending bucket boundaries at server-local midnights; bucket i is [edges[i], edges[i + 1])",
  }),
  days: Schema.Array(Schema.String).annotate({ description: "Server-local YYYY-MM-DD of each edge" }),
  previous: Schema.Boolean.annotate({ description: "True when bucket 0 is the equal window before the period" }),
  activeMs: Schema.Array(Schema.Finite).annotate({
    description: "Per bucket, wall clock during which any root-session assistant turn was running",
  }),
  sessions: Schema.Array(ActivitySession),
  facts: Schema.Array(Fact),
  truncated: Schema.Boolean.annotate({ description: "True when more than 200000 messages were in range" }),
}).annotate({ identifier: "SessionActivity" })
export type Activity = Schema.Schema.Type<typeof Activity>
