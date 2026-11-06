import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core"
import type { FabricContext } from "@orchestra/schema/fabric-context"
import type { FabricRecord } from "@orchestra/schema/fabric-record"

export const FabricRecordTable = sqliteTable(
  "fabric_record",
  {
    id: text().$type<FabricRecord.ID>().primaryKey(),
    storage_id: text().notNull(),
    principal: text().notNull(),
    context_id: text().$type<FabricContext.ID>().notNull(),
    context_generation: integer().notNull(),
    kind: text().$type<FabricRecord.Kind>().notNull(),
    revision: integer().notNull(),
    sealed: text(),
    bytes: integer().notNull(),
    deleted: integer({ mode: "boolean" }).notNull().default(false),
    time_created: integer().notNull(),
    time_updated: integer().notNull(),
  },
  (table) => [index("fabric_record_context").on(table.storage_id, table.context_id)],
)
