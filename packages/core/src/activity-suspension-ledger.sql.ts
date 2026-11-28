import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import type { Attempt, Phase } from "./activity-suspension-ledger"

export const ActivitySuspensionLedgerTable = sqliteTable("activity_suspension_ledger", {
  tree_id: text().primaryKey(),
  generation: text().notNull(),
  mark_id: text().notNull(),
  phase: text().$type<Phase>().notNull(),
  suspended: text({ mode: "json" }).$type<string[]>().notNull(),
  pending: text({ mode: "json" }).$type<Attempt>(),
  owner_incarnation: text(),
})
