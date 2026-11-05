import { integer, sqliteTable, text, index } from "drizzle-orm/sqlite-core"
import type { FabricContext } from "@orchestra/schema/fabric-context"
import type { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import type { Project } from "@orchestra/schema/project"
import type { AbsolutePath } from "@orchestra/schema/schema"

export const FabricIdentityAttemptTable = sqliteTable(
  "fabric_identity_attempt",
  {
    id: text().$type<FabricIdentityAttempt.ID>().primaryKey(),
    revision: integer().notNull(),
    state: text().$type<"preparing" | "cancelled">().notNull(),
    storage_id: text().notNull(),
    principal: text().notNull(),
    context_id: text().$type<FabricContext.ID>().notNull(),
    context_generation: integer().notNull(),
    directory: text().$type<AbsolutePath>().notNull(),
    project_id: text().$type<Project.ID>().notNull(),
    project_directory: text().$type<AbsolutePath>().notNull(),
    profile_hash: text().notNull(),
    scopes: text().notNull(),
    time_created: integer().notNull(),
    expires_at: integer().notNull(),
  },
  (table) => [index("fabric_identity_attempt_context").on(table.storage_id, table.context_id)],
)
