import { index, integer, primaryKey, sqliteTable, text, type AnySQLiteColumn } from "drizzle-orm/sqlite-core"
import { Meeting } from "@orchestra/schema/meeting"
import { MeetingTable } from "./meeting.sql"

// People are the user's own address book. A merge sets merged_into and is the merge log; clearing it undoes the merge.
export const MeetingPersonTable = sqliteTable("meeting_person", {
  id: text().primaryKey(),
  name: text().notNull(),
  aliases: text({ mode: "json" }).$type<string[]>().notNull().default([]),
  merged_into: text().references((): AnySQLiteColumn => MeetingPersonTable.id, { onDelete: "set null" }),
})

// One row per card entry revision. A verdict or state change inserts the next revision of the same id, and reads take
// each id's latest revision.
export const MeetingItemTable = sqliteTable(
  "meeting_item",
  {
    id: text().notNull(),
    revision: integer().notNull(),
    meeting_id: text()
      .$type<Meeting.ID>()
      .notNull()
      .references(() => MeetingTable.id, { onDelete: "cascade" }),
    kind: text().$type<"decision" | "commitment" | "question" | "suggestion">().notNull(),
    text: text().notNull(),
    quote: text().notNull().default(""),
    // "me", a person id, or "unknown:N" for an unidentified speaker.
    asserter: text().notNull(),
    start_ms: integer(),
    status: text().$type<"claimed" | "confirmed" | "disputed" | "dismissed">().notNull().default("claimed"),
    sent_to_maestro: integer({ mode: "boolean" }).notNull().default(false),
    // Commitments only; owner and counterparty are "me" or a person id.
    owner: text(),
    counterparty: text(),
    due: text(),
    state: text().$type<Meeting.CommitmentState>(),
    // Suggestions only.
    for: text().$type<"owner" | "maestro">(),
    created_at: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id, table.revision] }),
    index("meeting_item_meeting_idx").on(table.meeting_id),
  ],
)

// A person the consolidation proposes; the owner answers it through confirm, which sets the verdict.
export const MeetingProposalTable = sqliteTable(
  "meeting_proposal",
  {
    id: text().primaryKey(),
    meeting_id: text()
      .$type<Meeting.ID>()
      .notNull()
      .references(() => MeetingTable.id, { onDelete: "cascade" }),
    name: text().notNull(),
    merge_with: text().references(() => MeetingPersonTable.id, { onDelete: "set null" }),
    verdict: text().$type<"new" | "merge" | "dismissed">(),
  },
  (table) => [index("meeting_proposal_meeting_idx").on(table.meeting_id)],
)
