import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import type { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"

export const FabricIdentitySecretTable = sqliteTable("fabric_identity_secret", {
  id: text().$type<FabricIdentityAttempt.ID>().primaryKey(),
  revision: integer().notNull(),
  sealed: text().notNull(),
  bytes: integer().notNull(),
})
