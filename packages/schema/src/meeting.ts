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

export const Detail = Schema.Struct({
  meeting: Info,
  segments: Schema.Array(Segment),
}).annotate({ identifier: "Meeting.Detail" })
export interface Detail extends Schema.Schema.Type<typeof Detail> {}

export const StartInput = Schema.Struct({
  sessionID: SessionID,
  title: Schema.String,
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

// missing_session: start names a Session that does not exist. active: that Session already has a running meeting.
// missing_meeting: the meeting id is unknown. ended: append or stop on a meeting that already stopped.
export const ErrorReason = Schema.Literals(["missing_session", "active", "missing_meeting", "ended"]).annotate({
  identifier: "Meeting.ErrorReason",
})
export type ErrorReason = typeof ErrorReason.Type
