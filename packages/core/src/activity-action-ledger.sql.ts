import { sqliteTable, text } from "drizzle-orm/sqlite-core"
import type { Observation } from "./activity-action-ledger"

export const ActivityActionLedgerTable = sqliteTable("activity_action_ledger", {
  target_id: text().primaryKey(),
  generation: text().notNull(),
  observation: text({ mode: "json" }).$type<Observation>().notNull(),
})
