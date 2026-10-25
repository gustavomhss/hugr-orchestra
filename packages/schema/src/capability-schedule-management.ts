export * as CapabilityScheduleManagement from "./capability-schedule-management"

import { Schema } from "effect"
import { Agent } from "./agent"
import { ScheduledTask } from "./scheduled-task"
import { NonNegativeInt } from "./schema"
import { SessionID } from "./session-id"

// Local wall-clock time in the schedule's IANA time zone.
const Clock = Schema.String.check(Schema.isPattern(/^([01][0-9]|2[0-3]):[0-5][0-9](?![\s\S])/))
// No identifier on Cadence or Schedule: schedule_manage embeds them in its tool schema, which stays inline.
export const Cadence = Schema.Union([
  Schema.Struct({ kind: Schema.Literal("once"), at: Schema.Finite }),
  Schema.Struct({ kind: Schema.Literal("interval"), minutes: Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 525_600 })) }),
  Schema.Struct({ kind: Schema.Literal("daily"), time: Clock }),
  Schema.Struct({ kind: Schema.Literal("weekly"), day: Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 6 })), time: Clock }),
  // Five fields: minute hour day-of-month month day-of-week; lists, ranges, steps and `*`; day fields use Vixie OR.
  Schema.Struct({ kind: Schema.Literal("cron"), expression: Schema.String.check(Schema.isMaxLength(256)) }),
])
export type Cadence = typeof Cadence.Type

export interface Schedule extends Schema.Schema.Type<typeof Schedule> {}
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

// Operator projection: the owning Session and agent seat, never the owner's host placement.
export interface Item extends Schema.Schema.Type<typeof Item> {}
export const Item = Schema.Struct({ schedule: Schedule, sessionID: SessionID, agentID: Agent.ID })
  .annotate({ identifier: "CapabilityScheduleManagement.Item" })
export interface Page extends Schema.Schema.Type<typeof Page> {}
export const Page = Schema.Struct({ items: Schema.Array(Item), coverage: Schema.Literal("live") })
  .annotate({ identifier: "CapabilityScheduleManagement.Page" })
export interface Removed extends Schema.Schema.Type<typeof Removed> {}
export const Removed = Schema.Struct({ id: ScheduledTask.ID, removed: Schema.Literal(true) })
  .annotate({ identifier: "CapabilityScheduleManagement.Removed" })
/** A manual run never moves `next` or counts; `reused` marks a retry of the same idempotency key. */
export interface Started extends Schema.Schema.Type<typeof Started> {}
export const Started = Schema.Struct({ id: ScheduledTask.ID, sessionID: SessionID, reused: Schema.Boolean })
  .annotate({ identifier: "CapabilityScheduleManagement.Started" })
