import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { ActivityArm } from "@orchestra/schema/activity-arm"
import type { ActivityActionLedger } from "./activity-action-ledger"

export const ActivityArmTable = sqliteTable("activity_arm", {
  approval_id: text().notNull(),
  target_id: text().notNull(),
  generation: text().notNull(),
  approved_at: integer().notNull(),
  receipt: text({ mode: "json" }).$type<ActivityArm.Receipt>().notNull(),
  snapshot: text({ mode: "json" }).$type<ActivityActionLedger.Target>().notNull(),
}, (table) => [uniqueIndex("activity_arm_target_generation_idx").on(table.target_id, table.generation)])
