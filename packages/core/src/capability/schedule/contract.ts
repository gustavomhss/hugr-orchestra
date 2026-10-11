export * as CapabilityScheduleContract from "./contract"

import { Schema } from "effect"
import { ScheduledTask } from "@orchestra/schema/scheduled-task"
import { NonNegativeInt } from "@orchestra/schema/schema"
import { SessionID } from "@orchestra/schema/session-id"

const Name = Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(200))
const Prompt = Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(32_768))
// Local wall-clock time in the schedule's IANA time zone.
const Clock = Schema.String.check(Schema.isPattern(/^([01][0-9]|2[0-3]):[0-5][0-9](?![\s\S])/))
export const Cadence = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("once"), at: Schema.Finite }),
  Schema.Struct({ kind: Schema.Literal("interval"), minutes: Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 525_600 })) }),
  Schema.Struct({ kind: Schema.Literal("daily"), time: Clock }),
  Schema.Struct({ kind: Schema.Literal("weekly"), day: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 })), time: Clock }),
  // Five fields: minute hour day-of-month month day-of-week; lists, ranges, steps and `*`; day fields use Vixie OR.
  Schema.Struct({ kind: Schema.Literal("cron"), expression: Schema.String.check(Schema.isMaxLength(256)) }),
])
export type Cadence = typeof Cadence.Type

const Definition = {
  name: Name,
  prompt: Prompt,
  cadence: Cadence,
  /** IANA zone; defaults to the host zone at creation and is then fixed. */
  timezone: Schema.optional(Schema.String.check(Schema.isMaxLength(64))),
  /** latest: run only the most recent overdue slot and count the rest as skipped. skip: never catch up. */
  catchUp: Schema.optional(Schema.Literals(["latest", "skip"])),
  /** Admitted slot runs before the schedule disables itself; manual runs never count. */
  repeat: Schema.optional(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10_000 }))),
}
const Ref = { id: ScheduledTask.ID }
const strict = { parseOptions: { onExcessProperty: "error" as const } }
export const Input = Schema.Union([
  Schema.Struct({ action: Schema.Literal("create"), ...Definition, enabled: Schema.optional(Schema.Boolean) }).annotate(strict),
  Schema.Struct({ action: Schema.Literal("list") }).annotate(strict),
  Schema.Struct({ action: Schema.Literal("get"), ...Ref }).annotate(strict),
  // Any definition change creates a new revision and revokes unstarted occurrences of the old one.
  Schema.Struct({ action: Schema.Literal("update"), ...Ref, name: Schema.optional(Name), prompt: Schema.optional(Prompt),
    cadence: Schema.optional(Cadence), timezone: Definition.timezone, catchUp: Definition.catchUp,
    repeat: Schema.optional(Schema.NullOr(Definition.repeat)) }).annotate(strict),
  Schema.Struct({ action: Schema.Literals(["pause", "resume", "delete"]), ...Ref }).annotate(strict),
  // Manual run: deduped by the calling tool invocation, never consumes or moves the next slot.
  Schema.Struct({ action: Schema.Literal("run"), ...Ref }).annotate(strict),
])
export type Input = typeof Input.Type

export const Schedule = Schema.Struct({
  id: ScheduledTask.ID,
  revision: NonNegativeInt,
  name: Schema.String,
  prompt: Schema.String,
  cadence: Cadence,
  timezone: Schema.String,
  catchUp: Schema.Literals(["latest", "skip"]),
  repeat: Schema.optional(Schema.Int),
  enabled: Schema.Boolean,
  disabledReason: Schema.optional(Schema.Literals(["exhausted", "owner-missing"])),
  /** Epoch ms of the next slot; absent when disabled or a once schedule has run. */
  next: Schema.optional(Schema.Finite),
  runs: NonNegativeInt,
  skipped: NonNegativeInt,
  last: Schema.optional(ScheduledTask.Run),
})
export interface Schedule extends Schema.Schema.Type<typeof Schedule> {}
export const Output = Schema.Union([
  Schema.Struct({ action: Schema.Literals(["create", "get", "update", "pause", "resume"]), schedule: Schedule }),
  Schema.Struct({ action: Schema.Literal("list"), items: Schema.Array(Schedule) }),
  Schema.Struct({ action: Schema.Literal("delete"), id: ScheduledTask.ID }),
  Schema.Struct({ action: Schema.Literal("run"), id: ScheduledTask.ID, sessionID: SessionID, reused: Schema.Boolean }),
])
export type Output = typeof Output.Type
