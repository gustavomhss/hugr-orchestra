// Explicit synthetic data for an isolated full-app QA backend; never run against an installed server.
import { Orchestra } from "@orchestra/client"
import os from "node:os"
import path from "node:path"
import fs from "node:fs/promises"

const server = process.env.INBOX_QA_SERVER
const directory = process.env.INBOX_QA_DIRECTORY
const password = process.env.INBOX_QA_PASSWORD
if (
  server !== "http://127.0.0.1:4102" ||
  !directory ||
  !password ||
  !(await fs.realpath(directory)).startsWith(path.join(await fs.realpath(os.tmpdir()), "opencode", "inbox-full-app-"))
)
  throw new Error("Use only the task-owned loopback backend and its disposable QA directory")

const api = Orchestra.make({ baseUrl: server, headers: { authorization: `Basic ${btoa(`orchestra:${password}`)}` } })[
  "server.inbox"
]
const entries = [
  {
    source: "mail",
    externalId: "scoped:gmail:qa:release",
    actor: "Casey · QA",
    snippet: "Could you review the release notes before Thursday?",
    threadId: "qa-mail",
    reply: false,
    deepLink: "https://example.com/qa/mail",
  },
  {
    source: "slack",
    externalId: "oauth:qa:channel:message",
    actor: "Morgan · QA",
    snippet: "The accessibility review is ready for your final pass.",
    threadId: "qa-slack",
    reply: false,
    deepLink: "https://example.com/qa/slack",
  },
  {
    source: "gitlab",
    externalId: "scoped:gitlab:qa:review",
    actor: "release-engineering",
    snippet: "Review the calendar baseline change",
    threadId: "qa-review",
    reply: false,
    deepLink: "https://example.com/qa/review",
  },
  {
    source: "pagerduty",
    externalId: "scoped:pagerduty:qa:incident",
    actor: "Checkout · QA",
    snippet: "Elevated checkout latency · assigned to you",
    threadId: "qa-incident",
    reply: false,
    deepLink: "https://example.com/qa/incident",
  },
  {
    source: "calendar",
    externalId: "scoped:calendar:qa:primary:invite",
    actor: "Calendar",
    snippet: "Release readiness\nInvitation\nTeam room",
    threadId: "qa-invite",
    reply: false,
    deepLink: "https://example.com/qa/invitation",
  },
  {
    source: "rss",
    externalId: "feed:qa:entry",
    actor: "Engineering updates",
    snippet: "A quieter release workflow\nNew guidance for the next rollout.",
    threadId: "qa-feed",
    reply: false,
    deepLink: "https://example.com/qa/article",
  },
] as const

for (const item of entries) await api.upsert({ location: { directory }, ...item })
const saved = (await api.list({ location: { directory } })).data
if (
  saved.length !== entries.length ||
  entries.some((entry) => !saved.some((item) => item.source === entry.source && item.externalId === entry.externalId))
)
  throw new Error("The isolated Inbox did not retain the exact synthetic catalog")
console.log(
  JSON.stringify({
    server,
    items: saved.length,
    note: "Synthetic local data only; no connections, acquisition or sending.",
  }),
)
