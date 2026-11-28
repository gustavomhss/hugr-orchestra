import { sqliteTable, text } from "drizzle-orm/sqlite-core"

export const ActivityQuarantineCustodyTable = sqliteTable("activity_quarantine_custody", {
  target_id: text().primaryKey(),
  generation: text().notNull(),
  identity: text().notNull().unique(),
  label: text().notNull(),
  owner: text().notNull(),
  original_path: text().notNull(),
  quarantine_path: text().notNull().unique(),
  phase: text().$type<"moving" | "ready" | "emptying" | "finished" | "unknown">().notNull(),
  reservation_id: text(),
})
