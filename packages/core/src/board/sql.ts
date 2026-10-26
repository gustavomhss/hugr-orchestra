import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"
import type { Board } from "@orchestra/schema/board"
import type { Credential } from "../credential"
import { CredentialTable } from "../credential/sql"
import { Timestamps } from "../database/schema.sql"
import { ProjectTable } from "../project/sql"
import type { ProjectSchema } from "../project/schema"

export const BoardProjectTable = sqliteTable("board_project", {
  id: text().$type<Board.ProjectID>().primaryKey(),
  key: text().notNull().unique(),
  name: text().notNull(),
  goal: text().notNull(),
  target_date: integer(),
  budget_usd: real(),
  repo_project_id: text()
    .$type<ProjectSchema.ID>()
    .references(() => ProjectTable.id, { onDelete: "set null" }),
  github_repo: text(),
  status: text().$type<Board.ProjectStatus>().notNull(),
  paused_reason: text(),
  auto_accept_intake: integer({ mode: "boolean" }).notNull().default(false),
  github_state: text().$type<Board.GithubState>().notNull(),
  github_error: text(),
  github_issues_etag: text(),
  github_comments_etag: text(),
  github_since: integer(),
  github_synced_at: integer(),
  next_issue_number: integer().notNull(),
  next_epic_number: integer().notNull(),
  // Consecutive forecast evaluations with P50 past target_date; health turns at_risk at 2.
  forecast_late_streak: integer().notNull().default(0),
  ...Timestamps,
})

export const BoardEpicTable = sqliteTable(
  "board_epic",
  {
    id: text().$type<Board.EpicID>().primaryKey(),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    number: integer().notNull(),
    title: text().notNull(),
    goal: text().notNull(),
    position: real().notNull(),
    status: text().$type<Board.EpicStatus>().notNull(),
    github_milestone: integer(),
    ...Timestamps,
  },
  (table) => [uniqueIndex("board_epic_number_idx").on(table.project_id, table.number)],
)

export const BoardIssueTable = sqliteTable(
  "board_issue",
  {
    id: text().$type<Board.IssueID>().primaryKey(),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    epic_id: text()
      .$type<Board.EpicID>()
      .references(() => BoardEpicTable.id, { onDelete: "set null" }),
    number: integer().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    type: text().$type<Board.IssueType>().notNull(),
    stage: text().$type<Board.Stage>().notNull(),
    position: real().notNull(),
    estimate: text().$type<Board.Estimate>(),
    seat: text(),
    session_id: text(),
    branch: text(),
    pr_number: integer(),
    hold_before_merge: integer({ mode: "boolean" }).notNull().default(false),
    paused: integer({ mode: "boolean" }).notNull().default(false),
    stage_entered_at: integer().notNull(),
    github_number: integer(),
    github_node_id: text(),
    // Mirrored fields changed since the last push to GitHub (slice B2 flushes these).
    github_dirty: integer({ mode: "boolean" }).notNull().default(false),
    ...Timestamps,
  },
  (table) => [
    uniqueIndex("board_issue_number_idx").on(table.project_id, table.number),
    index("board_issue_stage_idx").on(table.project_id, table.stage, table.position),
  ],
)

export const BoardDependencyTable = sqliteTable(
  "board_dependency",
  {
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    depends_on_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    ...Timestamps,
  },
  (table) => [primaryKey({ columns: [table.issue_id, table.depends_on_id] })],
)

export const BoardStepTable = sqliteTable(
  "board_step",
  {
    id: text().$type<Board.StepID>().primaryKey(),
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    position: integer().notNull(),
    title: text().notNull(),
    status: text().$type<Board.StepStatus>().notNull(),
    now: text(),
    ...Timestamps,
  },
  (table) => [index("board_step_issue_idx").on(table.issue_id, table.position)],
)

export const BoardQuestionTable = sqliteTable(
  "board_question",
  {
    id: text().$type<Board.QuestionID>().primaryKey(),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    issue_id: text()
      .$type<Board.IssueID>()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    epic_id: text()
      .$type<Board.EpicID>()
      .references(() => BoardEpicTable.id, { onDelete: "cascade" }),
    text: text().notNull(),
    options: text({ mode: "json" }).$type<ReadonlyArray<Board.Option>>().notNull(),
    recommended: text().notNull(),
    cost_of_waiting: text(),
    blocking: integer({ mode: "boolean" }).notNull(),
    status: text().$type<Board.QuestionStatus>().notNull(),
    answer_option: text(),
    answer_text: text(),
    answered_at: integer(),
    ...Timestamps,
  },
  (table) => [index("board_question_project_idx").on(table.project_id, table.status)],
)

export const BoardNoteTable = sqliteTable(
  "board_note",
  {
    id: text().$type<Board.NoteID>().primaryKey(),
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    author: text().notNull(),
    body: text().notNull(),
    github_comment_id: integer(),
    ...Timestamps,
  },
  (table) => [index("board_note_issue_idx").on(table.issue_id)],
)

// Exactly one of `path` (a copy under the app data dir) and `credential_id` (a secret) is set.
export const BoardAttachmentTable = sqliteTable(
  "board_attachment",
  {
    id: text().$type<Board.AttachmentID>().primaryKey(),
    issue_id: text()
      .$type<Board.IssueID>()
      .notNull()
      .references(() => BoardIssueTable.id, { onDelete: "cascade" }),
    kind: text().$type<Board.AttachmentKind>().notNull(),
    name: text().notNull(),
    mime: text(),
    size: integer(),
    path: text(),
    credential_id: text()
      .$type<Credential.ID>()
      .references(() => CredentialTable.id, { onDelete: "cascade" }),
    ...Timestamps,
  },
  (table) => [index("board_attachment_issue_idx").on(table.issue_id)],
)

export const BoardActivityTable = sqliteTable(
  "board_activity",
  {
    id: text().$type<Board.ActivityID>().primaryKey(),
    project_id: text()
      .$type<Board.ProjectID>()
      .notNull()
      .references(() => BoardProjectTable.id, { onDelete: "cascade" }),
    issue_id: text().$type<Board.IssueID>(),
    actor: text().$type<Board.Actor>().notNull(),
    action: text().$type<Board.Action>().notNull(),
    reason: text(),
    before: text({ mode: "json" }).$type<Record<string, unknown>>(),
    after: text({ mode: "json" }).$type<Record<string, unknown>>(),
    undoes: text().$type<Board.ActivityID>(),
    undone_by: text().$type<Board.ActivityID>(),
    ...Timestamps,
  },
  (table) => [index("board_activity_project_idx").on(table.project_id, table.id)],
)
