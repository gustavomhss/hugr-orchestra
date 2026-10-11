import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import type { SessionID } from "@orchestra/schema/session-id"
import type { SessionV1 } from "./session"
import { SessionTable } from "../session/sql"

// Creation provenance survives ordinary message edits and removal; it is not an inbox.
export const PromptAdmissionTable = sqliteTable("session_v1_prompt_admission", {
  id: text().$type<SessionV1.MessageID>().primaryKey(),
  session_id: text()
    .$type<SessionID>()
    .notNull()
    .references(() => SessionTable.id, { onDelete: "cascade" }),
  identity_version: integer().$type<1>().notNull().default(1),
  identity: text().notNull(),
  snapshot: text({ mode: "json" }).$type<typeof SessionV1.WithParts.Encoded>().notNull(),
})
