export * as Meeting from "./meeting"

import { Schema } from "effect"
import { descending } from "./identifier"
import { statics } from "./schema"
import { SessionID } from "./session-id"

// Meeting: the durable record of one live-seat meeting and its final transcript segments.
// Audio and partial captions never reach this record; only final segments do.
export const ID = Schema.String.check(Schema.isStartsWith("mtg_")).pipe(
  Schema.brand("Meeting.ID"),
  statics((schema) => ({ create: () => schema.make("mtg_" + descending()) })),
)
export type ID = typeof ID.Type

// The track is the only speaker attribution: the owner's microphone or the call's system audio.
export const Track = Schema.Literals(["me", "them"]).annotate({ identifier: "Meeting.Track" })
export type Track = typeof Track.Type

export const Segment = Schema.Struct({
  // Chosen by the desktop client so a retried append is idempotent.
  id: Schema.String.check(Schema.isNonEmpty()),
  track: Track,
  text: Schema.String,
  // Milliseconds from the meeting start.
  startMs: Schema.Number,
  endMs: Schema.Number,
}).annotate({ identifier: "Meeting.Segment" })
export interface Segment extends Schema.Schema.Type<typeof Segment> {}

export const Info = Schema.Struct({
  id: ID,
  sessionID: SessionID,
  title: Schema.String,
  timeStarted: Schema.Number,
  timeEnded: Schema.NullOr(Schema.Number),
}).annotate({ identifier: "Meeting.Info" })
export interface Info extends Schema.Schema.Type<typeof Info> {}

// kept stores segments and claims; ephemeral keeps segments only during the call and the card after stop.
export const Retention = Schema.Literals(["kept", "ephemeral"]).annotate({ identifier: "Meeting.Retention" })
export type Retention = typeof Retention.Type

// Asked at every start: whether the other participants were told the meeting is captured.
export const Consent = Schema.Literals(["announced", "not-needed", "unknown"]).annotate({
  identifier: "Meeting.Consent",
})
export type Consent = typeof Consent.Type

const Person = Schema.Struct({ id: Schema.String, name: Schema.String }).annotate({ identifier: "Meeting.Person" })

export const Summary = Schema.Struct({
  id: ID,
  title: Schema.String,
  startedAt: Schema.Number,
  endedAt: Schema.optional(Schema.Number),
  people: Schema.Array(Person),
  retention: Retention,
  consent: Consent,
  counts: Schema.Struct({
    decisions: Schema.Number,
    commitments: Schema.Number,
    openCommitments: Schema.Number,
    answers: Schema.Number,
  }),
}).annotate({ identifier: "Meeting.Summary" })
export interface Summary extends Schema.Schema.Type<typeof Summary> {}

// "me" is the owner; { unknown: 2 } is an unidentified speaker, shown as "Speaker 2".
const Asserter = Schema.Union([Person, Schema.Literal("me"), Schema.Struct({ unknown: Schema.Number })])

export const CardItem = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  asserter: Asserter,
  // A short verbatim span; empty for ephemeral meetings.
  quote: Schema.String,
  // Absent for ephemeral meetings: there is no transcript to jump to.
  startMs: Schema.optional(Schema.Number),
  status: Schema.Literals(["claimed", "confirmed", "disputed"]),
  sentToMaestro: Schema.Boolean,
}).annotate({ identifier: "Meeting.CardItem" })
export interface CardItem extends Schema.Schema.Type<typeof CardItem> {}

export const CommitmentState = Schema.Literals(["proposed", "accepted", "done", "overdue", "dropped"]).annotate({
  identifier: "Meeting.CommitmentState",
})
export type CommitmentState = typeof CommitmentState.Type

export const Commitment = Schema.Struct({
  ...CardItem.fields,
  owner: Schema.Union([Person, Schema.Literal("me")]),
  counterparty: Schema.optional(Schema.Union([Person, Schema.Literal("me")])),
  // An ISO date, only when someone said one.
  due: Schema.optional(Schema.String),
  state: CommitmentState,
}).annotate({ identifier: "Meeting.Commitment" })
export interface Commitment extends Schema.Schema.Type<typeof Commitment> {}

// Consolidation runs after stop: poll the meeting until the card is not pending. Suggestions are never written to
// Atlas; the owner or Maestro decides what to do with them.
export const Card = Schema.Struct({
  status: Schema.Literals(["pending", "ready", "failed"]),
  error: Schema.optional(Schema.String),
  summary: Schema.String,
  decisions: Schema.Array(CardItem),
  commitments: Schema.Array(Commitment),
  questions: Schema.Array(CardItem),
  suggestions: Schema.Array(
    Schema.Struct({ ...CardItem.fields, for: Schema.Literals(["owner", "maestro"]) }).annotate({
      identifier: "Meeting.Suggestion",
    }),
  ),
  newPeople: Schema.Array(
    Schema.Struct({ proposalID: Schema.String, name: Schema.String, mergeWith: Schema.optional(Person) }).annotate({
      identifier: "Meeting.NewPerson",
    }),
  ),
}).annotate({ identifier: "Meeting.Card" })
export interface Card extends Schema.Schema.Type<typeof Card> {}

export const Detail = Schema.Struct({
  meeting: Info,
  segments: Schema.Array(Segment),
  summary: Summary,
  card: Card,
}).annotate({ identifier: "Meeting.Detail" })
export interface Detail extends Schema.Schema.Type<typeof Detail> {}

export const StartInput = Schema.Struct({
  sessionID: SessionID,
  title: Schema.String,
  // Defaults to kept.
  retention: Schema.optional(Retention),
  consent: Consent,
}).annotate({ identifier: "Meeting.StartInput" })
export interface StartInput extends Schema.Schema.Type<typeof StartInput> {}

export const AppendInput = Schema.Struct({
  meetingID: ID,
  segments: Schema.Array(Segment),
}).annotate({ identifier: "Meeting.AppendInput" })
export interface AppendInput extends Schema.Schema.Type<typeof AppendInput> {}

export const StopInput = Schema.Struct({ meetingID: ID }).annotate({ identifier: "Meeting.StopInput" })
export interface StopInput extends Schema.Schema.Type<typeof StopInput> {}

export const ReadQuery = Schema.Struct({ meetingID: ID }).annotate({ identifier: "Meeting.ReadQuery" })
export interface ReadQuery extends Schema.Schema.Type<typeof ReadQuery> {}

export const ListQuery = Schema.Struct({
  // Full-text search over titles and card text.
  query: Schema.optional(Schema.String),
  person: Schema.optional(Schema.String),
  limit: Schema.optional(Schema.NumberFromString),
  // The cursor from a previous page; clients treat it as opaque.
  before: Schema.optional(ID),
}).annotate({ identifier: "Meeting.ListQuery" })
export interface ListQuery extends Schema.Schema.Type<typeof ListQuery> {}

// Newest first.
export const ListResult = Schema.Struct({
  items: Schema.Array(Summary),
  next: Schema.optional(ID),
}).annotate({ identifier: "Meeting.ListResult" })
export interface ListResult extends Schema.Schema.Type<typeof ListResult> {}

export const RenameInput = Schema.Struct({ meetingID: ID, title: Schema.String }).annotate({
  identifier: "Meeting.RenameInput",
})
export interface RenameInput extends Schema.Schema.Type<typeof RenameInput> {}

export const DeleteReceipt = Schema.Struct({
  segments: Schema.Number,
  claims: Schema.Number,
  commitments: Schema.Number,
  people: Schema.Number,
}).annotate({ identifier: "Meeting.DeleteReceipt" })
export interface DeleteReceipt extends Schema.Schema.Type<typeof DeleteReceipt> {}

// dismissed hides an item from the card but keeps it in memory as not confirmed. Deleting the meeting is the only
// real erase.
export const ConfirmInput = Schema.Struct({
  meetingID: ID,
  items: Schema.optional(
    Schema.Array(Schema.Struct({ id: Schema.String, verdict: Schema.Literals(["confirmed", "disputed", "dismissed"]) })),
  ),
  people: Schema.optional(
    Schema.Array(Schema.Struct({ proposalID: Schema.String, verdict: Schema.Literals(["new", "merge", "dismissed"]) })),
  ),
}).annotate({ identifier: "Meeting.ConfirmInput" })
export interface ConfirmInput extends Schema.Schema.Type<typeof ConfirmInput> {}

export const CommitmentInput = Schema.Struct({
  id: Schema.String,
  state: Schema.Literals(["accepted", "done", "dropped"]),
}).annotate({ identifier: "Meeting.CommitmentInput" })
export interface CommitmentInput extends Schema.Schema.Type<typeof CommitmentInput> {}

// Sends items to Maestro through team_message with their source and no transcript.
export const HandoffInput = Schema.Struct({ meetingID: ID, itemIDs: Schema.Array(Schema.String) }).annotate({
  identifier: "Meeting.HandoffInput",
})
export interface HandoffInput extends Schema.Schema.Type<typeof HandoffInput> {}

export const HandoffResult = Schema.Struct({ sent: Schema.Array(Schema.String) }).annotate({
  identifier: "Meeting.HandoffResult",
})
export interface HandoffResult extends Schema.Schema.Type<typeof HandoffResult> {}

// missing_session: start names a Session that does not exist. active: that Session already has a running meeting.
// missing_meeting: the meeting id is unknown. ended: append or stop on a meeting that already stopped.
// running: delete on a meeting that is still running. missing_item: confirm, commitment or handoff names an unknown
// item. unavailable: the memory side is not built yet.
export const ErrorReason = Schema.Literals([
  "missing_session",
  "active",
  "missing_meeting",
  "ended",
  "running",
  "missing_item",
  "unavailable",
]).annotate({
  identifier: "Meeting.ErrorReason",
})
export type ErrorReason = typeof ErrorReason.Type
