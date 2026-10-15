export * as ScheduledTask from "./scheduled-task"

import { Schema } from "effect"
import { ascending } from "./identifier"
import { NonNegativeInt, optional, statics } from "./schema"
import { SessionID } from "./session-id"

// Tasks saved on a device before the server owned schedules carry UUIDs, so any short non-empty ID is accepted.
export const ID = Schema.String.check(Schema.isNonEmpty(), Schema.isMaxLength(128)).pipe(
  Schema.brand("ScheduledTask.ID"),
  statics((schema) => ({ create: () => schema.make("tsk_" + ascending()) })),
)
export type ID = typeof ID.Type

export const Cadence = Schema.Literals(["once", "hourly", "daily", "weekly"]).annotate({
  identifier: "ScheduledTask.Cadence",
})
export type Cadence = typeof Cadence.Type

const Text = Schema.Trim.check(Schema.isNonEmpty())
// Intended local time of day in minutes after midnight in the task's time zone.
const Minute = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1439 }))

export interface StartedRun extends Schema.Schema.Type<typeof StartedRun> {}
export const StartedRun = Schema.Struct({
  outcome: Schema.Literal("started"),
  time: Schema.Finite,
  slot: Schema.Finite.pipe(optional),
  sessionID: SessionID,
}).annotate({ identifier: "ScheduledTask.StartedRun" })

export interface FailedRun extends Schema.Schema.Type<typeof FailedRun> {}
export const FailedRun = Schema.Struct({
  outcome: Schema.Literal("failed"),
  time: Schema.Finite,
  slot: Schema.Finite.pipe(optional),
  error: Schema.String,
}).annotate({ identifier: "ScheduledTask.FailedRun" })

// What the latest settled run actually did: its prompt was admitted into a Session, or it failed before that.
export type Run = StartedRun | FailedRun
export const Run = Schema.Union([StartedRun, FailedRun]).annotate({ identifier: "ScheduledTask.Run" })

export interface Info extends Schema.Schema.Type<typeof Info> {}
export const Info = Schema.Struct({
  id: ID,
  name: Schema.String,
  prompt: Schema.String,
  cadence: Cadence,
  /** IANA time zone that anchors daily and weekly slots. */
  timezone: Schema.String,
  minute: Minute,
  /** Epoch milliseconds of the next slot. */
  next: Schema.Finite,
  enabled: Schema.Boolean,
  runs: NonNegativeInt,
  /** Most recent slot that was skipped instead of run. */
  missed: Schema.Finite.pipe(optional),
  last: Run.pipe(optional),
}).annotate({ identifier: "ScheduledTask.Info" })

export interface History extends Schema.Schema.Type<typeof History> {}
export const History = Schema.Struct({
  runs: NonNegativeInt,
  missed: Schema.Finite.pipe(optional),
  last: Schema.Struct({ time: Schema.Finite, sessionID: SessionID }).pipe(optional),
}).annotate({ identifier: "ScheduledTask.History" })

export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}
export const CreateInput = Schema.Struct({
  /** Creating with an ID the Location already has returns that task unchanged, so retries and imports are safe. */
  id: ID.pipe(optional),
  name: Text,
  prompt: Text,
  cadence: Cadence,
  next: Schema.Finite,
  timezone: Schema.String,
  /** Defaults to the local time of day of `next`. */
  minute: Minute.pipe(optional),
  enabled: Schema.Boolean.pipe(optional),
  /** Run history of a task imported from device storage. */
  history: History.pipe(optional),
}).annotate({ identifier: "ScheduledTask.CreateInput" })

export interface UpdateInput extends Schema.Schema.Type<typeof UpdateInput> {}
export const UpdateInput = Schema.Struct({
  name: Text.pipe(optional),
  prompt: Text.pipe(optional),
  cadence: Cadence.pipe(optional),
  /** A new time re-anchors the task's time of day and clears its missed slot. */
  next: Schema.Finite.pipe(optional),
  timezone: Schema.String.pipe(optional),
  /** Enabling a recurring task rolls it to its next future slot; a one-off task needs a future `next`. */
  enabled: Schema.Boolean.pipe(optional),
}).annotate({ identifier: "ScheduledTask.UpdateInput" })

export interface RunResult extends Schema.Schema.Type<typeof RunResult> {}
export const RunResult = Schema.Struct({
  /** Session the run's prompt was admitted into. */
  sessionID: SessionID,
}).annotate({ identifier: "ScheduledTask.RunResult" })
