import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core"
import type { SourceKind } from "./types"
import type { SlackSaved } from "./slack-sync"
import type { CalendarEvent } from "./calendar"

export const InboxCalendarTable = sqliteTable(
  "inbox_calendar",
  {
    owner: text().notNull(),
    generation: text().notNull(),
    calendar: text().notNull(),
    events: text({ mode: "json" }).$type<readonly CalendarEvent[]>().notNull(),
  },
  (table) => [primaryKey({ columns: [table.owner, table.generation, table.calendar] })],
)

// One row per source message. list_id groups messages that already belong to the same address-book person.
export const InboxRowTable = sqliteTable(
  "inbox_row",
  {
    owner: text().notNull().default(""),
    source: text().$type<SourceKind>().notNull(),
    external_id: text().notNull(),
    list_id: text().notNull(),
    actor: text().notNull(),
    snippet: text().notNull(),
    revision: text(),
    thread_id: text().notNull(),
    reply: integer({ mode: "boolean" }).notNull(),
    deep_link: text(),
    person_id: text(),
    commitment_id: text(),
    open: integer({ mode: "boolean" }).notNull(),
    reveal_at: integer(),
  },
  (table) => [primaryKey({ columns: [table.owner, table.source, table.external_id] })],
)

// A pane draft never leaves this table. origin drafts are unsent until the user sends them in the origin app.
export const InboxDraftTable = sqliteTable(
  "inbox_draft",
  {
    owner: text().notNull().default(""),
    list_id: text().notNull(),
    text: text().notNull(),
    sent: integer({ mode: "boolean" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.owner, table.list_id] })],
)

// The click's egress. The recipient is the stored thread, never text taken from the snippet.
export const InboxEgressTable = sqliteTable(
  "inbox_egress",
  {
    owner: text().notNull().default(""),
    id: text().notNull(),
    list_id: text().notNull(),
    text: text().notNull(),
    thread_id: text().notNull(),
  },
  (table) => [primaryKey({ columns: [table.owner, table.id] })],
)

export const InboxSlackTable = sqliteTable("inbox_slack", {
  owner: text().primaryKey(),
  value: text({ mode: "json" }).$type<SlackSaved>().notNull(),
})

export const InboxAccountTable = sqliteTable(
  "inbox_account",
  {
    owner: text().notNull(),
    source: text()
      .$type<
        | "github"
        | "linear"
        | "mail"
        | "teams"
        | "discord"
        | "gitlab"
        | "trello"
        | "sentry"
        | "pagerduty"
        | "calendar"
        | "jira"
      >()
      .notNull(),
    state: text().$type<"idle" | "synced" | "failed" | "rate_limited">().notNull(),
    checked_at: integer().notNull(),
    retry_at: integer(),
  },
  (table) => [primaryKey({ columns: [table.owner, table.source] })],
)

export const InboxFeedTable = sqliteTable(
  "inbox_feed",
  {
    owner: text().notNull(),
    id: text().notNull(),
    source: text().$type<"rss" | "youtube">().notNull(),
    url: text().notNull(),
    name: text().notNull(),
    initialized: integer({ mode: "boolean" }).notNull(),
    seen: text({ mode: "json" }).$type<readonly string[]>().notNull(),
    etag: text(),
    modified: text(),
    state: text().$type<"idle" | "synced" | "failed" | "rate_limited">().notNull(),
    checked_at: integer(),
    retry_at: integer(),
  },
  (table) => [primaryKey({ columns: [table.owner, table.id] })],
)
