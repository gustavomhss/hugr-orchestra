import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core"
import type { FabricConnection } from "@orchestra/schema/fabric-connection"
import type { FabricContext } from "@orchestra/schema/fabric-context"
import type { Credential } from "@orchestra/schema/credential"
import type { Project } from "@orchestra/schema/project"
import type { AbsolutePath } from "@orchestra/schema/schema"

export const FabricConnectionTable = sqliteTable(
  "fabric_connection",
  {
    id: text().$type<FabricConnection.ID>().primaryKey(),
    generation: integer().notNull(),
    storage_id: text().notNull(),
    principal: text().notNull(),
    context_id: text().$type<FabricContext.ID>().notNull(),
    context_generation: integer().notNull(),
    directory: text().$type<AbsolutePath>().notNull(),
    project_id: text().$type<Project.ID>().notNull(),
    project_directory: text().$type<AbsolutePath>().notNull(),
    profile_hash: text().notNull(),
    credential_id: text().$type<Credential.ID>().notNull(),
    sealed: text().notNull(),
    bytes: integer().notNull(),
    time_created: integer().notNull(),
  },
  (table) => [index("fabric_connection_context").on(table.storage_id, table.context_id)],
)
