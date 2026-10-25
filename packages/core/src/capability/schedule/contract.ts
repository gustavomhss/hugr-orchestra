export * as CapabilityScheduleContract from "./contract"

import { Schema } from "effect"
import { CapabilityScheduleManagement } from "@orchestra/schema/capability-schedule-management"
import { ScheduledTask } from "@orchestra/schema/scheduled-task"
import { SessionID } from "@orchestra/schema/session-id"

const Name = Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(200))
const Prompt = Schema.Trim.check(Schema.isNonEmpty(), Schema.isMaxLength(32_768))
export const Cadence = CapabilityScheduleManagement.Cadence
export type Cadence = CapabilityScheduleManagement.Cadence

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

export const Schedule = CapabilityScheduleManagement.Schedule
export type Schedule = CapabilityScheduleManagement.Schedule
export const Output = Schema.Union([
  Schema.Struct({ action: Schema.Literals(["create", "get", "update", "pause", "resume"]), schedule: Schedule }),
  Schema.Struct({ action: Schema.Literal("list"), items: Schema.Array(Schedule) }),
  Schema.Struct({ action: Schema.Literal("delete"), id: ScheduledTask.ID }),
  Schema.Struct({ action: Schema.Literal("run"), id: ScheduledTask.ID, sessionID: SessionID, reused: Schema.Boolean }),
])
export type Output = typeof Output.Type
