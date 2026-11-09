import type { ServerInboxListOutput } from "@orchestra/client"

export function connectionInput(input: {
  source: (typeof accounts)[number]
  token: string
  email: string
  site: string
  account: "gmail" | "outlook"
}) {
  return {
    source: input.source,
    token: input.token,
    ...(input.source === "jira" && input.email.trim() ? { email: input.email.trim() } : {}),
    ...(input.source === "jira" || input.source === "gitlab" ? { site: input.site } : {}),
    ...(input.source === "mail" || input.source === "calendar" ? { account: input.account } : {}),
  }
}

type StoredItem = ServerInboxListOutput["data"][number]
export type Source =
  | StoredItem["source"]
  | "whatsapp"
  | "board"
  | "gitlab"
  | "calendar"
  | "sentry"
  | "pagerduty"
  | "reddit"
  | "trello"
  | "youtube"
  | "rss"
export type Notice =
  | "message"
  | "mention"
  | "review"
  | "assigned"
  | "ci"
  | "issue"
  | "comment"
  | "notification"
  | "door"
  | "decision"
  | "approval"
  | "incident"
  | "update"
  | "release"
  | "invitation"
// Presentation metadata can describe a notice without changing the provider/storage contract.
// WhatsApp exists only as a dev-preview contact door: no ingested message or reply capability.
export type Item = Omit<StoredItem, "source"> & {
  source: Source
  title?: string
  context?: string
  notice?: Notice
  kind?: "message" | "notification" | "contact"
}
export type Action = "handoff" | "remind" | "read" | "archive"
export type Preference = "auto" | "reply" | "open" | "handoff"
export type View = "waiting" | "all"
export type Kind = "all" | "message" | "notification"

export type InboxStore = {
  items: readonly Item[]
  loading: boolean
  failed: boolean
  busy: boolean
  feedback: "saved" | "sent" | "triaged" | "refused" | "previewAction" | undefined
  view: View
  kind: Kind
  source: Source | "all"
  query: string
  selected: string | undefined
  composing: string | undefined
  drafts: Record<string, string>
  confirmation: { id: string; text: string; thread: string } | undefined
  revision: number
}

export const sources = [
  "board",
  "slack",
  "mail",
  "teams",
  "discord",
  "github",
  "gitlab",
  "linear",
  "jira",
  "calendar",
  "sentry",
  "pagerduty",
  "reddit",
  "trello",
  "youtube",
  "rss",
  "whatsapp",
] as const
export const liveSources = [
  "calendar",
  "slack",
  "mail",
  "teams",
  "discord",
  "github",
  "linear",
  "jira",
  "board",
  "gitlab",
  "trello",
  "sentry",
  "pagerduty",
  "rss",
  "youtube",
] as const
export const sourceGroups = [
  { title: "orchestra.inbox.messageSources", sources: ["slack", "mail", "teams", "discord", "reddit"] },
  {
    title: "orchestra.inbox.notificationSources",
    sources: ["board", "github", "gitlab", "linear", "jira", "trello", "sentry", "pagerduty"],
  },
  { title: "orchestra.inbox.updateSources", sources: ["calendar", "youtube", "rss"] },
  { title: "orchestra.inbox.externalSources", sources: ["whatsapp"] },
] as const
export const sourceKinds = {
  slack: "message",
  mail: "message",
  teams: "message",
  discord: "message",
  board: "notification",
  github: "notification",
  gitlab: "notification",
  linear: "notification",
  jira: "notification",
  calendar: "notification",
  sentry: "notification",
  pagerduty: "notification",
  whatsapp: "contact",
  reddit: "notification",
  trello: "notification",
  youtube: "notification",
  rss: "notification",
} as const
export const accounts = [
  "calendar",
  "mail",
  "teams",
  "linear",
  "jira",
  "github",
  "discord",
  "gitlab",
  "trello",
  "sentry",
  "pagerduty",
] as const
export const actions = ["handoff", "remind", "read", "archive"] as const
export const defaults = {
  compact: false,
  preview: true,
  primary: "auto" as Preference,
  quick: { handoff: true, remind: true, read: false, archive: false },
}

export function shown(items: readonly Item[], view: View, source: Source | "all", query: string, kind: Kind = "all") {
  const needle = query.trim().toLowerCase()
  return items.filter(
    (item) =>
      (view === "all" || item.waiting) &&
      (kind === "all" || itemKind(item) === kind) &&
      (source === "all" || item.source === source) &&
      (!needle ||
        `${item.actor} ${item.title ?? ""} ${item.context ?? ""} ${item.snippet} ${item.threadId}`
          .toLowerCase()
          .includes(needle)),
  )
}

export function primaryAction(item: Item, preference: Preference) {
  if (!itemActions(item).includes("handoff")) return "open"
  if (preference === "handoff" || (preference === "auto" && item.commitmentId)) return "handoff"
  if (preference === "auto" && itemKind(item) === "notification" && openHref(item)) return "open"
  if (preference === "open" && safeLink(item.deepLink)) return "open"
  if (item.reply) return "reply"
  if (safeLink(item.deepLink)) return "open"
  return "handoff"
}

export function itemKind(item: Item) {
  return item.kind ?? sourceKinds[item.source]
}

export function itemActions(item: Item): readonly Action[] {
  if (item.source === "whatsapp") return []
  if (item.source === "board" || item.source === "youtube" || item.source === "rss" || item.source === "calendar")
    return ["remind", "read", "archive"]
  return actions
}

export function openLabel(item: Item) {
  if (item.source === "youtube") return "orchestra.inbox.watchVideo"
  if (item.source === "trello") return "orchestra.inbox.openCard"
  if (item.source === "reddit") return "orchestra.inbox.openReddit"
  if (item.source === "rss") return "orchestra.inbox.readUpdate"
  if (item.source === "whatsapp") return "orchestra.inbox.openWhatsApp"
  if (item.source === "board")
    return item.notice === "approval" || item.externalId.startsWith("approval:")
      ? "orchestra.inbox.openApproval"
      : "orchestra.inbox.openDecision"
  if (item.source === "gitlab" && item.notice === "review") return "orchestra.inbox.reviewMerge"
  if (item.source === "gitlab" && item.notice === "ci") return "orchestra.inbox.viewPipeline"
  if (item.notice === "incident") return "orchestra.inbox.openIncident"
  if (item.notice === "review") return "orchestra.inbox.reviewPull"
  if (item.notice === "ci") return "orchestra.inbox.viewChecks"
  if (item.notice === "issue" || item.notice === "assigned") return "orchestra.inbox.openIssue"
  if (item.notice === "comment") return "orchestra.inbox.openComment"
  if (item.notice === "release") return "orchestra.inbox.viewRelease"
  if (item.notice === "invitation") return "orchestra.inbox.openCalendar"
  if (item.notice === "notification") return "orchestra.inbox.viewNotification"
  return "orchestra.inbox.open"
}

export function openHref(item: Item) {
  if (item.source === "board") return "/orchestra/board"
  return safeLink(item.deepLink)
}

export function replyKind(source: Source) {
  if (source === "reddit") return "reply"
  return sourceKinds[source] === "notification" ? "comment" : "reply"
}

export function safeLink(value: string | undefined) {
  if (!value || !URL.canParse(value)) return
  const url = new URL(value)
  if (url.protocol !== "https:" && url.protocol !== "http:") return
  if (url.username || url.password) return
  return url.href
}

export function initials(actor: string) {
  return actor
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
}
