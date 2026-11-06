import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import type { FabricContext } from "@orchestra/schema/fabric-context"
import type { Project } from "@orchestra/schema/project"
import type { AbsolutePath } from "@orchestra/schema/schema"

// Routing/admission controls only. Titles, compositions and Fabric payloads require the separate protected record store.
export const FabricContextTable = sqliteTable("fabric_context", {
  id: text().$type<FabricContext.ID>().primaryKey(),
  storage_id: text().notNull(),
  principal: text().notNull(),
  root: text().$type<AbsolutePath>().notNull(),
  directory: text().$type<AbsolutePath>().notNull(),
  project_id: text().$type<Project.ID>(),
  project_directory: text().$type<AbsolutePath>(),
  generation: integer().notNull().default(1),
  state: text().$type<"preparing" | "active" | "deleted">().notNull(),
  preparation_nonce: text().notNull(),
  time_created: integer().notNull(),
  time_updated: integer().notNull(),
})
