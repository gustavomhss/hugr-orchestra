import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import type { SessionID } from "@orchestra/schema/session-id"
import type { SessionLegacyTranscript } from "./legacy-transcript"
import { SessionTable } from "./sql"

// Nothing reads or writes this table any more. It stays declared because existing databases hold it and the Drizzle
// snapshot must keep matching them: dropping it would need a migration that deletes stored rows.
export const PromptAdmissionTable = sqliteTable("session_v1_prompt_admission", {
  id: text().$type<SessionLegacyTranscript.MessageID>().primaryKey(),
  session_id: text()
    .$type<SessionID>()
    .notNull()
    .references(() => SessionTable.id, { onDelete: "cascade" }),
  identity_version: integer().$type<1>().notNull().default(1),
  identity: text().notNull(),
  snapshot: text({ mode: "json" }).$type<unknown>().notNull(),
})
