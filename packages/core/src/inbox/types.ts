export type SourceKind =
  | "calendar"
  | "slack"
  | "discord"
  | "mail"
  | "teams"
  | "linear"
  | "jira"
  | "github"
  | "board"
  | "gitlab"
  | "trello"
  | "sentry"
  | "pagerduty"
  | "rss"
  | "youtube"

export type Item = {
  readonly id: string
  readonly source: SourceKind
  readonly externalId: string
  readonly actor: string
  readonly snippet: string
  readonly threadId: string
  readonly reply: boolean
  readonly deepLink?: string
  readonly personId?: string
  readonly commitmentId?: string
  readonly waiting: boolean
}

export type Pulled = {
  readonly revision?: string
  readonly source: SourceKind
  readonly externalId: string
  readonly actor: string
  readonly snippet: string
  readonly threadId: string
  readonly reply: boolean
  readonly deepLink?: string
}

export type Person = {
  readonly id: string
  readonly emails: readonly string[]
  readonly handles: readonly string[]
  readonly openCommitmentId?: string
}

export type DoorInput = {
  readonly number?: string
  readonly from: "meeting" | "contact" | "commitment" | "none"
}

export const sourceKinds = [
  "calendar",
  "slack",
  "discord",
  "mail",
  "teams",
  "linear",
  "jira",
  "github",
  "board",
  "gitlab",
  "trello",
  "sentry",
  "pagerduty",
  "rss",
  "youtube",
] as const
