export * as Inbox from "./inbox"

import { Schema } from "effect"
import { NonNegativeInt, optional } from "./schema"

export const SourceKind = Schema.Literals([
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
]).annotate({
  identifier: "Inbox.SourceKind",
})
export type SourceKind = typeof SourceKind.Type

export const Item = Schema.Struct({
  id: Schema.String,
  source: SourceKind,
  externalId: Schema.String,
  actor: Schema.String,
  snippet: Schema.String,
  threadId: Schema.String,
  reply: Schema.Boolean,
  deepLink: optional(Schema.String),
  personId: optional(Schema.String),
  commitmentId: optional(Schema.String),
  waiting: Schema.Boolean,
}).annotate({ identifier: "Inbox.Item" })
export interface Item extends Schema.Schema.Type<typeof Item> {}

export const Pulled = Schema.Struct({
  revision: optional(Schema.String),
  source: SourceKind,
  externalId: Schema.String,
  actor: Schema.String,
  snippet: Schema.String,
  threadId: Schema.String,
  reply: Schema.Boolean,
  deepLink: optional(Schema.String),
}).annotate({ identifier: "Inbox.Pulled" })
export interface Pulled extends Schema.Schema.Type<typeof Pulled> {}

export const DoorFrom = Schema.Literals(["meeting", "contact", "commitment", "none"]).annotate({
  identifier: "Inbox.DoorFrom",
})
export type DoorFrom = typeof DoorFrom.Type

export const DoorInput = Schema.Struct({
  number: optional(Schema.String),
  from: DoorFrom,
}).annotate({ identifier: "Inbox.DoorInput" })
export interface DoorInput extends Schema.Schema.Type<typeof DoorInput> {}

export const Door = Schema.Union([
  Schema.Struct({ href: Schema.String }),
  Schema.Struct({ openApp: Schema.Literal(true) }),
]).annotate({ identifier: "Inbox.Door" })
export type Door = typeof Door.Type

// missing: the id is not in the list. unavailable: the handoff could not be delivered.
export const ErrorReason = Schema.Literals(["missing", "unavailable"]).annotate({ identifier: "Inbox.ErrorReason" })
export type ErrorReason = typeof ErrorReason.Type

export const IdInput = Schema.Struct({ id: Schema.String }).annotate({ identifier: "Inbox.IdInput" })
export interface IdInput extends Schema.Schema.Type<typeof IdInput> {}

export const DraftInput = Schema.Struct({ id: Schema.String, text: Schema.String }).annotate({
  identifier: "Inbox.DraftInput",
})
export interface DraftInput extends Schema.Schema.Type<typeof DraftInput> {}

// The click is the only send. A request without it does not decode.
export const SendInput = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  click: Schema.Literal(true),
}).annotate({ identifier: "Inbox.SendInput" })
export interface SendInput extends Schema.Schema.Type<typeof SendInput> {}

export const HandoffInput = Schema.Struct({ ids: Schema.Array(Schema.String) }).annotate({
  identifier: "Inbox.HandoffInput",
})
export interface HandoffInput extends Schema.Schema.Type<typeof HandoffInput> {}

export const HandoffResult = Schema.Struct({ ids: Schema.Array(Schema.String) }).annotate({
  identifier: "Inbox.HandoffResult",
})
export interface HandoffResult extends Schema.Schema.Type<typeof HandoffResult> {}

export const Sent = Schema.Struct({ sent: Schema.Literal(true) }).annotate({ identifier: "Inbox.Sent" })
export interface Sent extends Schema.Schema.Type<typeof Sent> {}

export const Drafted = Schema.Struct({ drafted: Schema.Literal(true) }).annotate({ identifier: "Inbox.Drafted" })
export interface Drafted extends Schema.Schema.Type<typeof Drafted> {}

export const AccountSource = Schema.Literals([
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
]).annotate({
  identifier: "Inbox.AccountSource",
})
export type AccountSource = typeof AccountSource.Type

export const AccountInput = Schema.Struct({
  source: AccountSource,
  token: Schema.String.check(Schema.isNonEmpty()),
  email: optional(Schema.String),
  site: optional(Schema.String),
  account: optional(Schema.Literals(["gmail", "outlook"])),
}).annotate({ identifier: "Inbox.AccountInput" })
export interface AccountInput extends Schema.Schema.Type<typeof AccountInput> {}

export const Account = Schema.Struct({
  source: AccountSource,
  connected: Schema.Boolean,
  generation: optional(Schema.String),
  state: optional(Schema.Literals(["idle", "synced", "failed", "rate_limited"])),
  checkedAt: optional(NonNegativeInt),
  retryAt: optional(NonNegativeInt),
}).annotate({ identifier: "Inbox.Account" })
export interface Account extends Schema.Schema.Type<typeof Account> {}

export const WorkSource = Schema.Literals([
  "calendar",
  "github",
  "linear",
  "mail",
  "teams",
  "discord",
  "gitlab",
  "trello",
  "sentry",
  "pagerduty",
])
export type WorkSource = typeof WorkSource.Type
export const CommunicationSource = Schema.Literals(["mail", "teams", "discord"])
export type CommunicationSource = typeof CommunicationSource.Type
export const CommunicationConfiguration = Schema.Struct({
  source: CommunicationSource,
  generation: Schema.NonEmptyString,
  selected: Schema.Array(Schema.NonEmptyString.check(Schema.isMaxLength(1024))).check(Schema.isMaxLength(200)),
  unreadOnly: Schema.Boolean,
}).annotate({ identifier: "Inbox.CommunicationConfiguration" })
export interface CommunicationConfiguration extends Schema.Schema.Type<typeof CommunicationConfiguration> {}
export const CommunicationChoices = Schema.Struct({
  generation: Schema.NonEmptyString,
  choices: Schema.Array(Schema.Struct({ id: Schema.NonEmptyString, name: Schema.String })),
}).annotate({ identifier: "Inbox.CommunicationChoices" })
export interface CommunicationChoices extends Schema.Schema.Type<typeof CommunicationChoices> {}
export const WorkSyncInput = Schema.Struct({ source: WorkSource, generation: Schema.NonEmptyString }).annotate({
  identifier: "Inbox.WorkSyncInput",
})
export const GithubPreferences = Schema.Struct({
  repositories: Schema.Array(Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/))).check(
    Schema.isMaxLength(200),
  ),
  reviews: Schema.Boolean,
  mentions: Schema.Boolean,
  assignments: Schema.Boolean,
  ownCi: Schema.Boolean,
}).annotate({ identifier: "Inbox.GithubPreferences" })
export interface GithubPreferences extends Schema.Schema.Type<typeof GithubPreferences> {}
export const GithubConfiguration = Schema.Struct({
  ...GithubPreferences.fields,
  generation: Schema.NonEmptyString,
}).annotate({ identifier: "Inbox.GithubConfiguration" })
export interface GithubConfiguration extends Schema.Schema.Type<typeof GithubConfiguration> {}
export const GitlabConfiguration = Schema.Struct({
  generation: Schema.NonEmptyString,
  projects: Schema.Array(Schema.String.check(Schema.isPattern(/^[1-9][0-9]{0,15}$/))).check(Schema.isMaxLength(200)),
}).annotate({ identifier: "Inbox.GitlabConfiguration" })
export interface GitlabConfiguration extends Schema.Schema.Type<typeof GitlabConfiguration> {}
export const CalendarConfiguration = Schema.Struct({
  generation: Schema.NonEmptyString,
  selected: Schema.Array(Schema.NonEmptyString.check(Schema.isMaxLength(2048))).check(Schema.isMaxLength(50)),
}).annotate({ identifier: "Inbox.CalendarConfiguration" })
export interface CalendarConfiguration extends Schema.Schema.Type<typeof CalendarConfiguration> {}
export const CalendarChoice = Schema.Struct({ id: Schema.NonEmptyString, name: Schema.String })
export const NotificationSource = Schema.Literals(["trello", "sentry", "pagerduty"])
export type NotificationSource = typeof NotificationSource.Type
export const NotificationConfiguration = Schema.Struct({
  source: NotificationSource,
  generation: Schema.NonEmptyString,
  selected: Schema.Array(Schema.NonEmptyString.check(Schema.isMaxLength(200))).check(Schema.isMaxLength(200)),
  organization: optional(Schema.NonEmptyString.check(Schema.isPattern(/^[A-Za-z0-9_-]+$/))),
  environment: optional(Schema.NonEmptyString.check(Schema.isMaxLength(200))),
  relevance: optional(Schema.Literals(["review", "assigned"])),
}).annotate({ identifier: "Inbox.NotificationConfiguration" })
export interface NotificationConfiguration extends Schema.Schema.Type<typeof NotificationConfiguration> {}
export const FeedSource = Schema.Literals(["rss", "youtube"])
export type FeedSource = typeof FeedSource.Type
export const FeedInput = Schema.Struct({
  source: FeedSource,
  url: Schema.NonEmptyString.check(Schema.isMaxLength(2048)),
  name: optional(Schema.NonEmptyString.check(Schema.isMaxLength(200))),
}).annotate({ identifier: "Inbox.FeedInput" })
export interface FeedInput extends Schema.Schema.Type<typeof FeedInput> {}
export const Feed = Schema.Struct({
  id: Schema.NonEmptyString,
  source: FeedSource,
  url: Schema.String,
  name: Schema.String,
  initialized: Schema.Boolean,
  state: Schema.Literals(["idle", "synced", "failed", "rate_limited"]),
  checkedAt: optional(NonNegativeInt),
  retryAt: optional(NonNegativeInt),
}).annotate({ identifier: "Inbox.Feed" })
export interface Feed extends Schema.Schema.Type<typeof Feed> {}

export const SlackAuthorization = Schema.Struct({
  id: Schema.String,
  url: Schema.String,
  expiresAt: NonNegativeInt,
}).annotate({ identifier: "Inbox.SlackAuthorization" })
export interface SlackAuthorization extends Schema.Schema.Type<typeof SlackAuthorization> {}

export const SlackStatus = Schema.Struct({
  connected: Schema.Boolean,
  team: optional(Schema.String),
  user: optional(Schema.String),
  state: Schema.Literals(["idle", "pending", "connected", "failed", "cancelled", "expired"]),
}).annotate({ identifier: "Inbox.SlackStatus" })
export interface SlackStatus extends Schema.Schema.Type<typeof SlackStatus> {}

export const SlackConversation = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
  kind: Schema.Literals(["channel", "private", "direct", "group"]),
}).annotate({ identifier: "Inbox.SlackConversation" })
export interface SlackConversation extends Schema.Schema.Type<typeof SlackConversation> {}

export const SlackScope = Schema.Struct({
  generation: Schema.NonEmptyString,
  conversations: Schema.Array(SlackConversation),
  selected: Schema.Array(Schema.String),
  cursor: optional(Schema.String),
  state: Schema.Literals(["idle", "pending", "synced", "failed", "limited", "rate_limited"]),
  retryAt: optional(NonNegativeInt),
  syncedAt: optional(NonNegativeInt),
}).annotate({ identifier: "Inbox.SlackScope" })
export interface SlackScope extends Schema.Schema.Type<typeof SlackScope> {}

export const SlackSelectionInput = Schema.Struct({
  generation: Schema.NonEmptyString,
  selected: Schema.Array(Schema.NonEmptyString).check(Schema.isMaxLength(200)),
}).annotate({ identifier: "Inbox.SlackSelectionInput" })

export const SlackSyncInput = Schema.Struct({ generation: Schema.NonEmptyString }).annotate({
  identifier: "Inbox.SlackSyncInput",
})
