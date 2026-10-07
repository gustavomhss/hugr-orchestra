import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { ScheduledTask } from "@opencode-ai/schema/scheduled-task"
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
    cadence: text().$type<ScheduledTask.Cadence>().notNull(),
    timezone: text().notNull(),
    minute: integer().notNull(),
    next: integer().notNull(),
    enabled: integer({ mode: "boolean" }).notNull(),
    runs: integer().notNull(),
    missed: integer(),
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
    state: text().$type<"running" | "started" | "failed">().notNull(),
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
    uniqueIndex("scheduled_task_run_slot_idx").on(table.task_id, table.slot),
    index("scheduled_task_run_state_idx").on(table.state, table.time_claimed),
  ],
)
