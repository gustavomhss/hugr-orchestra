import { sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const ActivityApplyTable = sqliteTable("activity_apply", {
  preview_id: text().primaryKey(),
  approval_id: text().notNull(),
  target_id: text().notNull(),
  generation: text().notNull(),
  source: text().notNull(),
  destination: text().notNull(),
  identity: text(),
  outcome: text({ enum: ["Out", "Refused", "Unknown"] }).notNull(),
}, (table) => [uniqueIndex("activity_apply_target_generation_idx").on(table.target_id, table.generation)])
