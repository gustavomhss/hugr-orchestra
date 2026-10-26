import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { Meeting } from "@orchestra/schema/meeting"
import { SessionSchema } from "./schema"
import { SessionTable } from "./sql"

export const MeetingTable = sqliteTable(
  "meeting",
  {
    id: text().$type<Meeting.ID>().primaryKey(),
    session_id: text()
      .$type<SessionSchema.ID>()
      .notNull()
      .references(() => SessionTable.id, { onDelete: "cascade" }),
    title: text().notNull(),
    time_started: integer().notNull(),
    time_ended: integer(),
  },
  (table) => [index("meeting_session_idx").on(table.session_id)],
)

export const MeetingSegmentTable = sqliteTable(
  "meeting_segment",
  {
    id: text().notNull(),
    meeting_id: text()
      .$type<Meeting.ID>()
      .notNull()
      .references(() => MeetingTable.id, { onDelete: "cascade" }),
    track: text().$type<Meeting.Track>().notNull(),
    text: text().notNull(),
    start_ms: integer().notNull(),
    end_ms: integer().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.meeting_id, table.id] }),
    index("meeting_segment_meeting_start_idx").on(table.meeting_id, table.start_ms),
  ],
)
