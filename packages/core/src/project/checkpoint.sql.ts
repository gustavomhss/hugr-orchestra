import { sql } from "drizzle-orm"
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
import { directoryColumn } from "../database/path"
import { SessionSchema } from "../session/schema"
import { ProjectSchema } from "./schema"
import { ProjectTable } from "./sql"

export const ProjectCheckpointTable = sqliteTable(
  "project_checkpoint",
  {
    id: text().primaryKey(),
    project_id: text()
      .$type<ProjectSchema.ID>()
      .notNull()
      .references(() => ProjectTable.id, { onDelete: "cascade" }),
    // The source Session may be deleted while its project retains the checkpoint.
    session_id: text().$type<SessionSchema.ID>().notNull(),
    fork_id: text().notNull(),
    boundary: text().notNull(),
    attempt: integer().$type<0 | 1>().notNull(),
    directory: directoryColumn().notNull(),
    time_created: integer().notNull(),
    digest: text().notNull(),
    payload: text().notNull(),
  },
  (table) => [
    index("project_checkpoint_project_time_id_idx").on(table.project_id, table.time_created, table.id),
    check("project_checkpoint_attempt_check", sql`${table.attempt} in (0, 1)`),
  ],
)
