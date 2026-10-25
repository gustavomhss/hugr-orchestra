import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { Capability } from "@orchestra/schema/capability"
import type { ScheduledTask } from "@orchestra/schema/scheduled-task"
import { absoluteColumn } from "../database/path"
import { Timestamps } from "../database/schema.sql"
import type { SessionMessage } from "../session/message"
import type { SessionSchema } from "../session/schema"

export const ScheduledTaskTable = sqliteTable(
  "scheduled_task",
  {
    id: text().$type<ScheduledTask.ID>().primaryKey(),
    directory: absoluteColumn().notNull(),
    name: text().notNull(),
    prompt: text().notNull(),
    // Capability rows add interval and cron. Weekly capability rows encode `day * 1440 + minute of day` in `minute`.
    cadence: text().$type<ScheduledTask.Cadence | "interval" | "cron">().notNull(),
    timezone: text().notNull(),
    minute: integer().notNull(),
    next: integer().notNull(),
    enabled: integer({ mode: "boolean" }).notNull(),
    runs: integer().notNull(),
    missed: integer(),
    // Capability schedules (schedule_manage) carry an owner and a revision; legacy-browser tasks keep the
    // imported device semantics and stay invisible to the capability leaf.
    policy: text().$type<"legacy-browser" | "capability">().notNull().default("legacy-browser"),
    revision: integer().notNull().default(0),
    owner: text({ mode: "json" }).$type<Capability.Owner>(),
    interval_minutes: integer(),
    cron: text(),
    catch_up: text().$type<"latest" | "skip">(),
    repeat_limit: integer(),
    // Slots never run because a later slot overtook them or the catch-up policy skipped them.
    skipped: integer().notNull().default(0),
    disabled_reason: text().$type<"exhausted" | "owner-missing">(),
    ...Timestamps,
  },
  (table) => [
    index("scheduled_task_directory_idx").on(table.directory),
    index("scheduled_task_due_idx").on(table.enabled, table.next),
  ],
)

// One row per run. A slot run is unique per task and slot, which is what keeps a slot to one run across
// ticks, Run now, processes sharing the database and restarts. Extra runs (Run now) have no slot.
export const ScheduledTaskRunTable = sqliteTable(
  "scheduled_task_run",
  {
    id: text().primaryKey(),
    task_id: text()
      .$type<ScheduledTask.ID>()
      .notNull()
      .references(() => ScheduledTaskTable.id, { onDelete: "cascade" }),
    slot: integer(),
    // Slot runs are unique per task, revision and slot; an edit starts a new revision.
    revision: integer().notNull().default(0),
    // Manual runs of capability schedules dedupe on the caller's key; they never consume a slot.
    manual_key: text(),
    state: text().$type<"running" | "started" | "failed" | "revoked">().notNull(),
    session_id: text().$type<SessionSchema.ID>().notNull(),
    // What a running claim dispatches, so a claim taken over after a crash retries the exact prompt.
    // Runs imported from device storage do not know them.
    message_id: text().$type<SessionMessage.ID>(),
    prompt: text(),
    error: text(),
    // Process that holds a running claim; a claim older than its lease may be taken over.
    owner: text(),
    time_claimed: integer().notNull(),
    time_settled: integer(),
  },
  (table) => [
    uniqueIndex("scheduled_task_run_slot_idx").on(table.task_id, table.revision, table.slot),
    uniqueIndex("scheduled_task_run_manual_idx").on(table.task_id, table.manual_key),
    index("scheduled_task_run_state_idx").on(table.state, table.time_claimed),
  ],
)
