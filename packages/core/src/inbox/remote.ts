import { Effect, Option, Schema } from "effect"
import { createHash, randomUUID } from "node:crypto"
import { Inbox } from "@orchestra/schema/inbox"
import { IntegrationID } from "@orchestra/schema/integration-id"
import { decode, Failure, request, requestWithMetadata, type Options } from "../capability/channel/http"
import { Credential } from "../credential"
import { search } from "./jira"
import { GithubNote, notifications } from "./github"
import { assignedIssues } from "./linear"
import { communicationChoices, gmailSnapshot, outlookSnapshot, teamsSnapshot } from "./communication"
import { discordChoices, discordSnapshot } from "./discord"
import { gitlabTodos } from "./gitlab"
import { pagerdutyIncidents, sentryIssues, trelloNotifications } from "./notifications"
import { calendarChoices, calendarSnapshot } from "./calendar"
import type { Pulled, SourceKind } from "./types"

type AccountSource = Inbox.AccountSource

const transport = { timeoutMs: 10_000, maxResponseBytes: 256 * 1024 }
const integrationOf = {
  calendar: "inbox.calendar",
  mail: "inbox.mail",
  teams: "inbox.teams",
  linear: "inbox.linear",
  jira: "inbox.jira",
  github: "inbox.github",
  discord: "inbox.discord",
  gitlab: "inbox.gitlab",
  trello: "inbox.trello",
  sentry: "inbox.sentry",
  pagerduty: "inbox.pagerduty",
} as const

export const accountSources = [
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
] as const satisfies readonly AccountSource[]
export const githubDefaults: Inbox.GithubPreferences = {
  repositories: [],
  reviews: true,
  mentions: true,
  assignments: true,
  ownCi: true,
}

const noOwnCi = new Map<string, string>()

// ci_activity also fires for someone else's pull request. The map holds only ids already proved to be this login's PR.
export function githubItems(
  raw: unknown,
  login: string,
  ownCi: ReadonlyMap<string, string> = noOwnCi,
  preferences: Inbox.GithubPreferences = githubDefaults,
): Pulled[] {
  const page = Schema.decodeUnknownOption(Schema.Array(GithubNote))(raw)
  if (Option.isNone(page)) return []
  return page.value.flatMap((item) => {
    if (
      preferences.repositories.length &&
      !preferences.repositories.some(
        (repository) => repository.toLowerCase() === item.repository.full_name.toLowerCase(),
      )
    )
      return []
    if (
      (item.reason === "ci_activity" && !preferences.ownCi) ||
      (item.reason === "review_requested" && !preferences.reviews) ||
      (["mention", "team_mention"].includes(item.reason) && !preferences.mentions) ||
      (item.reason === "assign" && !preferences.assignments)
    )
      return []
    if (item.reason === "ci_activity") return ciItem(item, login, ownCi)
    if (!["review_requested", "mention", "team_mention", "assign"].includes(item.reason)) return []
    if (!item.subject.title) return []
    const path = apiPath(item.subject.url)
    const reply =
      !!path &&
      /^\/repos\/[^/]+\/[^/]+\/(issues|pulls)\/\d+$/.test(path) &&
      path.split("/").slice(2, 4).join("/").toLowerCase() === item.repository.full_name.toLowerCase()
    return [
      {
        source: "github" as const,
        externalId: item.id,
        actor: item.repository.full_name,
        ...(item.updated_at ? { revision: `${item.updated_at}:${item.reason}` } : {}),
        snippet: item.subject.title,
        threadId: reply ? `https://api.github.com${path}` : `github-notification:${item.id}`,
        reply,
        ...(reply
          ? { deepLink: `https://github.com${path!.slice("/repos".length)}`.replace("/pulls/", "/pull/") }
          : {}),
      },
    ]
  })
}

export function provenCi(raw: unknown, login: string, evidence: CiEvidence) {
  if (!login) return new Map()
  return new Map(
    ciCandidates(raw).flatMap((item) => {
      const url = ownedUrl(item, login, evidence)
      return url ? [[item.id, url] as const] : []
    }),
  )
}

export function mailItems(account: "gmail" | "outlook", raw: unknown): Pulled[] {
  if (account === "gmail") {
    const page = Schema.decodeUnknownOption(
      Schema.Struct({
        messages: Schema.optional(
          Schema.Array(
            Schema.Struct({
              id: Schema.String,
              threadId: Schema.String,
              snippet: Schema.optional(Schema.String),
              payload: Schema.optional(
                Schema.Struct({
                  headers: Schema.optional(Schema.Array(Schema.Struct({ name: Schema.String, value: Schema.String }))),
                }),
              ),
            }),
          ),
        ),
      }),
    )(raw)
    if (Option.isNone(page)) return []
    return (page.value.messages ?? []).flatMap((item) => {
      const from = item.payload?.headers?.find((header) => header.name.toLowerCase() === "from")?.value
      if (!from || !item.snippet) return []
      return [
        {
          source: "mail" as const,
          externalId: item.id,
          actor: from,
          snippet: item.snippet,
          threadId: item.threadId,
          reply: true,
        },
      ]
    })
  }
  const page = Schema.decodeUnknownOption(
    Schema.Struct({
      value: Schema.optional(
        Schema.Array(
          Schema.Struct({
            id: Schema.String,
            conversationId: Schema.optional(Schema.String),
            bodyPreview: Schema.optional(Schema.String),
            webLink: Schema.optional(Schema.String),
            from: Schema.optional(
              Schema.Struct({
                emailAddress: Schema.optional(Schema.Struct({ address: Schema.optional(Schema.String) })),
              }),
            ),
          }),
        ),
      ),
    }),
  )(raw)
  if (Option.isNone(page)) return []
  return (page.value.value ?? []).flatMap((item) => {
    const actor = item.from?.emailAddress?.address
    if (!actor || !item.bodyPreview) return []
    return [
      {
        source: "mail" as const,
        externalId: item.id,
        actor,
        snippet: item.bodyPreview,
        threadId: item.conversationId ?? item.id,
        reply: true,
        ...(item.webLink ? { deepLink: item.webLink } : {}),
      },
    ]
  })
}

export function teamsItems(raw: unknown): Pulled[] {
  const page = Schema.decodeUnknownOption(
    Schema.Struct({
      value: Schema.optional(
        Schema.Array(
          Schema.Struct({
            id: Schema.String,
            messageType: Schema.optional(Schema.String),
            chatId: Schema.optional(Schema.String),
            body: Schema.optional(Schema.Struct({ content: Schema.optional(Schema.String) })),
            from: Schema.optional(
              Schema.Struct({ user: Schema.optional(Schema.Struct({ id: Schema.optional(Schema.String) })) }),
            ),
          }),
        ),
      ),
    }),
  )(raw)
  if (Option.isNone(page)) return []
  return (page.value.value ?? []).flatMap((item) => {
    if (item.messageType && item.messageType !== "message") return []
    const actor = item.from?.user?.id
    const text = item.body?.content
    if (!actor || !text || !item.chatId) return []
    return [{ source: "teams" as const, externalId: item.id, actor, snippet: text, threadId: item.chatId, reply: true }]
  })
}

export function workItems(source: "linear" | "jira", raw: unknown): Pulled[] {
  if (source === "linear") {
    const page = Schema.decodeUnknownOption(
      Schema.Struct({
        data: Schema.optional(
          Schema.Struct({
            issues: Schema.optional(
              Schema.Struct({
                nodes: Schema.optional(
                  Schema.Array(
                    Schema.Struct({
                      id: Schema.String,
                      identifier: Schema.String,
                      title: Schema.String,
                      url: Schema.optional(Schema.String),
                      revision: Schema.optional(Schema.String),
                      state: Schema.optional(Schema.Struct({ name: Schema.String })),
                    }),
                  ),
                ),
              }),
            ),
          }),
        ),
      }),
    )(raw)
    if (Option.isNone(page)) return []
    return (page.value.data?.issues?.nodes ?? []).map((item) => ({
      source: "linear" as const,
      externalId: item.id,
      actor: item.identifier,
      snippet: item.state ? `${item.title}\n${item.state.name}` : item.title,
      ...(item.revision ? { revision: item.revision } : {}),
      threadId: item.id,
      reply: true,
      ...(item.url ? { deepLink: item.url } : {}),
    }))
  }
  const page = Schema.decodeUnknownOption(
    Schema.Struct({
      issues: Schema.optional(
        Schema.Array(
          Schema.Struct({
            id: Schema.String,
            key: Schema.String,
            fields: Schema.optional(Schema.Struct({ summary: Schema.optional(Schema.String) })),
          }),
        ),
      ),
    }),
  )(raw)
  if (Option.isNone(page)) return []
  return (page.value.issues ?? []).flatMap((item) => {
    if (!item.fields?.summary) return []
    return [
      {
        source: "jira" as const,
        externalId: item.id,
        actor: item.key,
        snippet: item.fields.summary,
        threadId: item.key,
        reply: true,
      },
    ]
  })
}

export const pull = Effect.fn("InboxRemote.pull")(function* (credentials: Credential.Interface, owner: string) {
  // Work snapshots have their own explicit sync with a durable success/failure receipt.
  const saved = yield* Effect.forEach(
    accountSources.filter((source) => source === "jira"),
    (source) => credential(credentials, source, owner),
  )
  const pages = yield* Effect.forEach(
    saved.flatMap((item) => (item ? [item] : [])),
    (item) => read(item).pipe(Effect.catch(() => Effect.succeed([] as Pulled[]))),
  )
  return pages.flat()
})

export const collectWork = Effect.fn("InboxRemote.collectWork")(function* (
  credentials: Credential.Interface,
  owner: string,
  source: Inbox.WorkSource,
  options: Options = transport,
) {
  const saved = yield* credential(credentials, source, owner)
  if (!saved) return yield* Effect.fail("unavailable" as const)
  if (source === "calendar") return yield* Effect.fail("unavailable" as const)
  if (source === "trello" || source === "sentry" || source === "pagerduty") {
    const configuration = yield* notificationConfiguration(credentials, owner, source)
    if (source !== "pagerduty" && !configuration.selected.length) return []
    if (source === "sentry" && !configuration.organization) return yield* Effect.fail("unavailable" as const)
    const budget = { count: 0 }
    const rpc = (input: Parameters<typeof request>[2]) => {
      budget.count++
      if (budget.count > 2000) return Effect.fail(new Failure({ reason: "response_limit" }))
      return requestWithMetadata(
        source === "trello"
          ? "https://api.trello.com"
          : source === "sentry"
            ? "https://sentry.io"
            : "https://api.pagerduty.com",
        source === "pagerduty" ? `Token token=${saved.token}` : `Bearer ${saved.token}`,
        input,
        options,
      )
    }
    const items =
      source === "trello"
        ? yield* trelloNotifications(rpc, configuration.selected)
        : source === "sentry"
          ? yield* sentryIssues(
              rpc,
              configuration.organization!,
              configuration.selected,
              configuration.relevance ?? "review",
              configuration.environment,
            )
          : yield* pagerdutyIncidents(rpc, configuration.selected)
    return items.map((item) => ({
      ...item,
      externalId: `scoped:${source}:${configuration.generation}:${item.externalId}`,
    }))
  }
  if (source === "gitlab") {
    const configuration = yield* gitlabConfiguration(credentials, owner)
    const origin = saved.site || "https://gitlab.com"
    if (!URL.canParse(origin)) return yield* new Failure({ reason: "invalid_response" })
    const url = new URL(origin)
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/")
      return yield* new Failure({ reason: "invalid_response" })
    const items = yield* gitlabTodos(
      (input) => requestWithMetadata(url.origin, `Bearer ${saved.token}`, input, options),
      url.origin,
      configuration.projects,
    )
    return items.map((item) => ({
      ...item,
      externalId: `scoped:gitlab:${configuration.generation}:${item.externalId}`,
    }))
  }
  if (source === "mail" || source === "teams" || source === "discord") {
    const configuration = yield* communicationConfiguration(credentials, owner, source)
    if (!configuration.selected.length) return []
    const budget = { count: 0 }
    const rpc = (input: Parameters<typeof request>[2]) => {
      budget.count++
      if (budget.count > 2000) return Effect.fail(new Failure({ reason: "response_limit" }))
      return request(
        source === "discord"
          ? "https://discord.com"
          : source === "mail" && saved.account === "gmail"
            ? "https://gmail.googleapis.com"
            : "https://graph.microsoft.com",
        `${source === "discord" ? "Bot" : "Bearer"} ${saved.token}`,
        input,
        options,
      )
    }
    const choices =
      source === "discord"
        ? yield* discordChoices(rpc)
        : yield* communicationChoices(rpc, source === "teams" ? "teams" : saved.account)
    if (configuration.selected.some((id) => !choices.some((choice) => choice.id === id)))
      return yield* Effect.fail("unavailable" as const)
    const items =
      source === "discord"
        ? yield* discordSnapshot(rpc, configuration.selected, Date.now() - 7 * 86_400_000)
        : source === "teams"
          ? yield* teamsSnapshot(rpc, configuration.selected, new Date(Date.now() - 7 * 86_400_000).toISOString())
          : saved.account === "gmail"
            ? mailItems("gmail", {
                messages: yield* gmailSnapshot(rpc, configuration.selected, configuration.unreadOnly),
              })
            : mailItems("outlook", {
                value: yield* outlookSnapshot(rpc, configuration.selected, configuration.unreadOnly),
              })
    // Explicit read-only imports cannot fall through to the legacy send/draft endpoints.
    return items.map((item) => ({
      ...item,
      externalId: `scoped:${source === "mail" ? saved.account : source}:${configuration.generation}:${item.externalId}`,
      reply: false,
    }))
  }
  return yield* read(saved, options)
})

export const calendarConfiguration = Effect.fn("InboxRemote.calendarConfiguration")(function* (
  credentials: Credential.Interface,
  owner: string,
  input?: Inbox.CalendarConfiguration,
) {
  const row = (yield* credentials.list(id("calendar", owner))).at(-1)
  if (
    !row ||
    row.value.type !== "key" ||
    row.value.metadata?.owner !== owner ||
    (yield* credentials.inheritedFrom(row.id))
  )
    return yield* Effect.fail("unavailable" as const)
  const generation = typeof row.value.metadata.generation === "string" ? row.value.metadata.generation : row.id
  if (input && input.generation !== generation) return yield* Effect.fail("unavailable" as const)
  const configuration = yield* decode(
    Inbox.CalendarConfiguration,
    input ?? row.value.metadata.calendar ?? { generation, selected: [] },
  )
  if (configuration.generation !== generation) return yield* Effect.fail("unavailable" as const)
  if (input)
    yield* credentials.update(row.id, {
      value: { ...row.value, metadata: { ...row.value.metadata, calendar: configuration } },
    })
  return configuration
})

export const discoverCalendars = Effect.fn("InboxRemote.discoverCalendars")(function* (
  credentials: Credential.Interface,
  owner: string,
  generation: string,
  options: Options = transport,
) {
  const saved = yield* credential(credentials, "calendar", owner)
  if (!saved || saved.generation !== generation) return yield* Effect.fail("unavailable" as const)
  return yield* calendarChoices(
    (input) =>
      request(
        saved.account === "gmail" ? "https://www.googleapis.com" : "https://graph.microsoft.com",
        `Bearer ${saved.token}`,
        input,
        options,
      ),
    saved.account,
  )
})

export const collectCalendar = Effect.fn("InboxRemote.collectCalendar")(function* (
  credentials: Credential.Interface,
  owner: string,
  options: Options = transport,
) {
  const saved = yield* credential(credentials, "calendar", owner)
  if (!saved) return yield* Effect.fail("unavailable" as const)
  const configuration = yield* calendarConfiguration(credentials, owner)
  if (!configuration.selected.length) return []
  const budget = { count: 0 }
  const rpc = (input: Parameters<typeof request>[2]) => {
    if (++budget.count > 2000) return Effect.fail(new Failure({ reason: "response_limit" }))
    return request(
      saved.account === "gmail" ? "https://www.googleapis.com" : "https://graph.microsoft.com",
      `Bearer ${saved.token}`,
      input,
      options,
    )
  }
  const identity =
    saved.account === "gmail"
      ? (yield* decode(
          Schema.Struct({ id: Schema.NonEmptyString }),
          yield* rpc({ method: "GET", path: "/calendar/v3/calendars/primary" }),
        )).id
      : "me"
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  const horizon = {
    start: new Date(start.getTime() - 7 * 86400000).toISOString(),
    end: new Date(start.getTime() + 90 * 86400000).toISOString(),
  }
  return yield* Effect.forEach([...new Set(configuration.selected)], (calendar) =>
    calendarSnapshot(rpc, saved.account, calendar, identity, horizon).pipe(
      Effect.map((events) => ({ calendar, generation: saved.generation, events })),
    ),
  )
})

export const notificationConfiguration = Effect.fn("InboxRemote.notificationConfiguration")(function* (
  credentials: Credential.Interface,
  owner: string,
  source: Inbox.NotificationSource,
  input?: Inbox.NotificationConfiguration,
) {
  const row = (yield* credentials.list(id(source, owner))).at(-1)
  if (
    !row ||
    row.value.type !== "key" ||
    row.value.metadata?.owner !== owner ||
    (yield* credentials.inheritedFrom(row.id))
  )
    return yield* Effect.fail("unavailable" as const)
  const generation = typeof row.value.metadata.generation === "string" ? row.value.metadata.generation : row.id
  if (
    input &&
    (input.generation !== generation ||
      input.source !== source ||
      (source !== "sentry" &&
        (input.organization !== undefined || input.environment !== undefined || input.relevance !== undefined)))
  )
    return yield* Effect.fail("unavailable" as const)
  const configuration = yield* decode(
    Inbox.NotificationConfiguration,
    input ??
      row.value.metadata.notification ?? {
        source,
        generation,
        selected: [],
        ...(source === "sentry" ? { relevance: "review" } : {}),
      },
  )
  if (source === "sentry" && configuration.selected.some((project) => !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(project)))
    return yield* Effect.fail("unavailable" as const)
  if (configuration.generation !== generation || configuration.source !== source)
    return yield* Effect.fail("unavailable" as const)
  if (input)
    yield* credentials.update(row.id, {
      value: { ...row.value, metadata: { ...row.value.metadata, notification: configuration } },
    })
  return configuration
})

export const gitlabConfiguration = Effect.fn("InboxRemote.gitlabConfiguration")(function* (
  credentials: Credential.Interface,
  owner: string,
  input?: Inbox.GitlabConfiguration,
) {
  const row = (yield* credentials.list(id("gitlab", owner))).at(-1)
  if (
    !row ||
    row.value.type !== "key" ||
    row.value.metadata?.owner !== owner ||
    (yield* credentials.inheritedFrom(row.id))
  )
    return yield* Effect.fail("unavailable" as const)
  const generation = typeof row.value.metadata.generation === "string" ? row.value.metadata.generation : row.id
  if (input && input.generation !== generation) return yield* Effect.fail("unavailable" as const)
  const configuration = yield* decode(
    Inbox.GitlabConfiguration,
    input ?? row.value.metadata.gitlab ?? { generation, projects: [] },
  )
  if (configuration.generation !== generation) return yield* Effect.fail("unavailable" as const)
  if (input)
    yield* credentials.update(row.id, {
      value: { ...row.value, metadata: { ...row.value.metadata, gitlab: configuration } },
    })
  return configuration
})

export const communicationConfiguration = Effect.fn("InboxRemote.communicationConfiguration")(function* (
  credentials: Credential.Interface,
  owner: string,
  source: Inbox.CommunicationSource,
  input?: Inbox.CommunicationConfiguration,
) {
  const row = (yield* credentials.list(id(source, owner))).at(-1)
  if (
    !row ||
    row.value.type !== "key" ||
    row.value.metadata?.owner !== owner ||
    (yield* credentials.inheritedFrom(row.id))
  )
    return yield* Effect.fail("unavailable" as const)
  const generation = typeof row.value.metadata.generation === "string" ? row.value.metadata.generation : row.id
  if (input && (input.generation !== generation || input.source !== source || (source !== "mail" && input.unreadOnly)))
    return yield* Effect.fail("unavailable" as const)
  const configuration = yield* decode(
    Inbox.CommunicationConfiguration,
    input ??
      row.value.metadata.communication ?? {
        source,
        generation,
        selected: source !== "mail" ? [] : [row.value.metadata.account === "outlook" ? "inbox" : "INBOX"],
        unreadOnly: false,
      },
  )
  if (configuration.generation !== generation || configuration.source !== source)
    return yield* Effect.fail("unavailable" as const)
  if (input)
    yield* credentials.update(row.id, {
      value: { ...row.value, metadata: { ...row.value.metadata, communication: configuration } },
    })
  return configuration
})

export const discoverCommunication = Effect.fn("InboxRemote.discoverCommunication")(function* (
  credentials: Credential.Interface,
  owner: string,
  source: Inbox.CommunicationSource,
  generation: string,
  options: Options = transport,
) {
  const saved = yield* credential(credentials, source, owner)
  if (!saved || saved.generation !== generation) return yield* Effect.fail("unavailable" as const)
  const budget = { count: 0 }
  const rpc = (input: Parameters<typeof request>[2]) => {
    budget.count++
    if (budget.count > 2000) return Effect.fail(new Failure({ reason: "response_limit" }))
    return request(
      source === "discord"
        ? "https://discord.com"
        : source === "mail" && saved.account === "gmail"
          ? "https://gmail.googleapis.com"
          : "https://graph.microsoft.com",
      `${source === "discord" ? "Bot" : "Bearer"} ${saved.token}`,
      input,
      options,
    )
  }
  const choices =
    source === "discord"
      ? yield* discordChoices(rpc)
      : yield* communicationChoices(rpc, source === "teams" ? "teams" : saved.account)
  return { generation, choices }
})

export const githubPreferences = Effect.fn("InboxRemote.githubPreferences")(function* (
  credentials: Credential.Interface,
  owner: string,
  input?: Inbox.GithubConfiguration,
) {
  const row = (yield* credentials.list(id("github", owner))).at(-1)
  if (
    !row ||
    row.value.type !== "key" ||
    row.value.metadata?.owner !== owner ||
    (yield* credentials.inheritedFrom(row.id))
  )
    return yield* Effect.fail("unavailable" as const)
  const generation = typeof row.value.metadata.generation === "string" ? row.value.metadata.generation : row.id
  if (input && input.generation !== generation) return yield* Effect.fail("unavailable" as const)
  const preferences = yield* decode(Inbox.GithubPreferences, input ?? row.value.metadata?.github ?? githubDefaults)
  if (input)
    yield* credentials.update(row.id, {
      value: { ...row.value, metadata: { ...row.value.metadata, github: preferences } },
    })
  return { ...preferences, generation }
})

export const release = Effect.fn("InboxRemote.release")(function* (
  credentials: Credential.Interface,
  owner: string,
  source: SourceKind,
  threadId: string,
  actor: string,
  text: string,
) {
  if (!accountSources.includes(source as AccountSource)) return yield* Effect.fail("unavailable" as const)
  const saved = yield* credential(credentials, source as AccountSource, owner)
  if (!saved) return yield* Effect.fail("unavailable" as const)
  yield* send(saved, threadId, actor, text)
})

export const originDraft = Effect.fn("InboxRemote.originDraft")(function* (
  credentials: Credential.Interface,
  owner: string,
  source: SourceKind,
  threadId: string,
  actor: string,
  text: string,
) {
  if (source !== "mail") return
  const saved = yield* credential(credentials, "mail", owner)
  if (!saved) return
  if (saved.account === "outlook") {
    yield* post("https://graph.microsoft.com", "/v1.0/me/messages", saved.token, {
      subject: "",
      body: { content: text },
      toRecipients: [{ emailAddress: { address: address(actor) } }],
    }).pipe(Effect.catch(() => Effect.succeed(undefined)))
    return
  }
  yield* post("https://gmail.googleapis.com", "/gmail/v1/users/me/drafts", saved.token, {
    message: { threadId, raw: rawMessage(actor, text) },
  }).pipe(Effect.catch(() => Effect.succeed(undefined)))
})

export const connect = Effect.fn("InboxRemote.connect")(function* (
  credentials: Credential.Interface,
  owner: string,
  input: { source: AccountSource; token: string; site?: string; account?: "gmail" | "outlook" },
) {
  const integrationID = id(input.source, owner)
  const existing = yield* credentials.list(integrationID)
  const value = {
    type: "key" as const,
    key: input.token,
    metadata: {
      owner,
      generation: randomUUID(),
      ...(input.site ? { site: input.site } : {}),
      ...(input.account ? { account: input.account } : {}),
    },
  }
  const current = existing.at(-1)
  if (current && !(yield* credentials.inheritedFrom(current.id)))
    return yield* credentials.update(current.id, { value }).pipe(Effect.orDie)
  yield* credentials.create({ integrationID, value, label: input.source })
})

export const accounts = Effect.fn("InboxRemote.accounts")(function* (credentials: Credential.Interface, owner: string) {
  return yield* Effect.forEach(accountSources, (source) =>
    Effect.gen(function* () {
      const saved = yield* credential(credentials, source, owner)
      return { source, connected: saved !== undefined, ...(saved ? { generation: saved.generation } : {}) }
    }),
  )
})

export const disconnectAccount = Effect.fn("InboxRemote.disconnectAccount")(function* (
  credentials: Credential.Interface,
  owner: string,
  source: AccountSource,
  generation?: string,
) {
  const row = (yield* credentials.list(id(source, owner))).at(-1)
  const current = typeof row?.value.metadata?.generation === "string" ? row.value.metadata.generation : row?.id
  if (generation !== undefined && row && generation !== current) return yield* Effect.fail("unavailable" as const)
  if (row && row.value.metadata?.owner === owner && !(yield* credentials.inheritedFrom(row.id)))
    yield* credentials.remove(row.id)
})

function id(source: AccountSource, owner: string) {
  const parsed = Schema.decodeUnknownOption(IntegrationID)(
    `${integrationOf[source]}.${createHash("sha256").update(owner).digest("hex")}`,
  )
  if (Option.isNone(parsed)) throw new Error("missing")
  return parsed.value
}

function credential(credentials: Credential.Interface, source: AccountSource, owner: string) {
  return Effect.gen(function* () {
    const rows = yield* credentials.list(id(source, owner))
    const row = rows.at(-1)
    if (
      !row ||
      row.value.type !== "key" ||
      !row.value.key ||
      row.value.metadata?.owner !== owner ||
      (yield* credentials.inheritedFrom(row.id))
    )
      return
    const metadata = row.value.metadata
    const site = typeof metadata?.site === "string" ? metadata.site : undefined
    const account = metadata?.account === "outlook" ? ("outlook" as const) : ("gmail" as const)
    const github = source === "github" ? metadata?.github : undefined
    return {
      source,
      token: row.value.key,
      site,
      account,
      github,
      generation: typeof metadata?.generation === "string" ? metadata.generation : row.id,
    }
  })
}

function read(
  saved: { source: AccountSource; token: string; site?: string; account: "gmail" | "outlook"; github?: unknown },
  options: Options = transport,
) {
  return Effect.gen(function* () {
    if (saved.source === "github") {
      const preferences = yield* decode(Inbox.GithubPreferences, saved.github ?? githubDefaults)
      return yield* readGithub(saved.token, preferences, options)
    }
    if (saved.source === "linear") {
      return workItems(
        "linear",
        yield* assignedIssues((input) => request("https://api.linear.app", saved.token, input, options)),
      )
    }
    const site = saved.site
    if (!site) return []
    return workItems("jira", yield* search((input) => request(site, `Bearer ${saved.token}`, input, transport)))
  })
}

function send(
  saved: { source: AccountSource; token: string; site?: string; account: "gmail" | "outlook" },
  threadId: string,
  actor: string,
  text: string,
) {
  return postFor(saved, threadId, actor, text).pipe(
    Effect.asVoid,
    Effect.mapError(() => "unavailable" as const),
  )
}

function address(actor: string) {
  return actor.match(/<([^>]+)>/)?.[1] ?? actor
}

function rawMessage(to: string, text: string) {
  return Buffer.from(`To: ${address(to)}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${text}`).toString(
    "base64url",
  )
}

function postFor(
  saved: { source: AccountSource; token: string; site?: string; account: "gmail" | "outlook" },
  threadId: string,
  actor: string,
  text: string,
) {
  if (saved.source === "github") {
    const match = threadId.match(/repos\/([^/]+)\/([^/]+)\/(?:issues|pulls)\/(\d+)/)
    if (!match) return Effect.fail(new Error("unavailable"))
    return githubPost(`/repos/${match[1]}/${match[2]}/issues/${match[3]}/comments`, saved.token, { body: text })
  }
  if (saved.source === "mail" && saved.account === "outlook") {
    return post("https://graph.microsoft.com", "/v1.0/me/sendMail", saved.token, {
      message: { subject: "", body: { content: text }, toRecipients: [{ emailAddress: { address: address(actor) } }] },
    })
  }
  if (saved.source === "mail") {
    return post("https://gmail.googleapis.com", "/gmail/v1/users/me/messages/send", saved.token, {
      threadId,
      raw: rawMessage(actor, text),
    })
  }
  if (saved.source === "teams")
    return post("https://graph.microsoft.com", `/v1.0/chats/${threadId}/messages`, saved.token, {
      body: { content: text },
    })
  if (saved.source === "linear") {
    return request(
      "https://api.linear.app",
      saved.token,
      {
        method: "POST",
        path: "/graphql",
        body: {
          query:
            "mutation($id: String!, $body: String!) { commentCreate(input: { issueId: $id, body: $body }) { success } }",
          variables: { id: threadId, body: text },
        },
      },
      transport,
    ).pipe(
      Effect.flatMap((raw) =>
        decode(
          Schema.Struct({
            data: Schema.Struct({
              commentCreate: Schema.Struct({ success: Schema.Literal(true) }),
            }),
          }),
          raw,
        ),
      ),
    )
  }
  if (!saved.site) return Effect.fail(new Error("unavailable"))
  return post(saved.site, `/rest/api/3/issue/${threadId}/comment`, saved.token, { body: text })
}

const githubHost = "https://api.github.com"
const githubAgent = { "user-agent": "orchestra" }
const pullPattern = /^\/repos\/[^/]+\/[^/]+\/pulls\/\d+$/
const suitePattern = /^\/repos\/[^/]+\/[^/]+\/check-suites\/\d+$/
const commitPattern = /^\/repos\/[^/]+\/[^/]+\/commits\/[0-9a-f]{7,64}$/i
type CiKind = "pull" | "suite" | "commit"
type CiTarget = { id: string; path: string; kind: CiKind }
type CiEvidence = {
  pulls: Readonly<Record<string, unknown>>
  suites: Readonly<Record<string, unknown>>
  commits: Readonly<Record<string, unknown>>
}

function ciItem(item: GithubNote, login: string, ownCi: ReadonlyMap<string, string>): Pulled[] {
  const thread = login ? pullApi(ownCi.get(item.id)) : undefined
  if (!thread || !item.subject.title) return []
  return [
    {
      source: "github",
      externalId: item.id,
      actor: item.repository.full_name,
      ...(item.updated_at ? { revision: `${item.updated_at}:${item.reason}` } : {}),
      snippet: item.subject.title,
      threadId: thread,
      reply: true,
      deepLink: thread.replace("api.github.com/repos", "github.com").replace("/pulls/", "/pull/"),
    },
  ]
}

export function ciCandidates(raw: unknown): CiTarget[] {
  const page = Schema.decodeUnknownOption(Schema.Array(GithubNote))(raw)
  if (Option.isNone(page)) return []
  return page.value.flatMap(ciTarget)
}

function ciTarget(item: GithubNote): CiTarget[] {
  if (item.reason !== "ci_activity") return []
  const path = apiPath(item.subject.url) ?? apiPath(item.subject.latest_comment_url)
  if (!path) return []
  if (pullPattern.test(path)) return [{ id: item.id, path, kind: "pull" }]
  if (suitePattern.test(path)) return [{ id: item.id, path, kind: "suite" }]
  if (commitPattern.test(path)) return [{ id: item.id, path, kind: "commit" }]
  return []
}

export function ownPull(raw: unknown, login: string) {
  if (!login) return
  const pull = Schema.decodeUnknownOption(
    Schema.Struct({
      url: Schema.optional(Schema.String),
      user: Schema.optional(Schema.Struct({ login: Schema.optional(Schema.String) })),
    }),
  )(raw)
  if (Option.isNone(pull) || pull.value.user?.login !== login) return
  return pullApi(pull.value.url)
}

export function suitePulls(raw: unknown) {
  const suite = Schema.decodeUnknownOption(
    Schema.Struct({
      pull_requests: Schema.optional(Schema.Array(Schema.Struct({ url: Schema.optional(Schema.String) }))),
    }),
  )(raw)
  if (Option.isNone(suite)) return []
  return (suite.value.pull_requests ?? []).flatMap((item) => {
    const path = pullPath(item.url)
    return path ? [path] : []
  })
}

export function listedPulls(raw: unknown) {
  const page = Schema.decodeUnknownOption(Schema.Array(Schema.Struct({ url: Schema.optional(Schema.String) })))(raw)
  if (Option.isNone(page)) return []
  return page.value.flatMap((item) => {
    const path = pullPath(item.url)
    return path ? [path] : []
  })
}

function ownedUrl(item: CiTarget, login: string, evidence: CiEvidence) {
  return relatedPulls(item, evidence).flatMap((path) => {
    const url = ownPull(evidence.pulls[path], login)
    return url === `${githubHost}${path}` ? [url] : []
  })[0]
}

function relatedPulls(item: CiTarget, evidence: CiEvidence) {
  if (item.kind === "pull") return [item.path]
  if (item.kind === "suite") return suitePulls(evidence.suites[item.path])
  return listedPulls(evidence.commits[item.path])
}

function readGithub(
  token: string,
  preferences: Inbox.GithubPreferences = githubDefaults,
  options: Options = transport,
) {
  return Effect.gen(function* () {
    const user = yield* decode(
      Schema.Struct({ login: Schema.NonEmptyString }),
      yield* githubGet("/user", token, options),
    )
    const login = user.login
    const notes = yield* notifications((input) => requestWithMetadata(githubHost, `Bearer ${token}`, input, options))
    const targets = preferences.ownCi
      ? ciCandidates(notes).filter((item) => {
          const repository = item.path.split("/").slice(2, 4).join("/").toLowerCase()
          return (
            !preferences.repositories.length ||
            preferences.repositories.some((value) => value.toLowerCase() === repository)
          )
        })
      : []
    const evidence = yield* loadCi(targets, token, options)
    return githubItems(notes, login, provenCi(notes, login, evidence), preferences)
  })
}

function loadCi(targets: readonly CiTarget[], token: string, options: Options) {
  return Effect.gen(function* () {
    const pulls: Record<string, unknown> = {}
    const suites: Record<string, unknown> = {}
    const commits: Record<string, unknown> = {}
    yield* Effect.forEach(targets, (item) =>
      Effect.gen(function* () {
        if (item.kind === "pull") {
          const body = yield* githubGet(item.path, token, options).pipe(Effect.catch(() => Effect.succeed(undefined)))
          if (body) pulls[item.path] = body
          return
        }
        if (item.kind === "suite") {
          const body = yield* githubGet(item.path, token, options).pipe(Effect.catch(() => Effect.succeed(undefined)))
          if (body) suites[item.path] = body
          yield* rememberPulls(body ? suitePulls(body) : [], pulls, token, options)
          return
        }
        const body = yield* githubGet(`${item.path}/pulls`, token, options).pipe(
          Effect.catch(() => Effect.succeed(undefined)),
        )
        if (body) commits[item.path] = body
        yield* rememberPulls(body ? listedPulls(body) : [], pulls, token, options)
      }),
    )
    return { pulls, suites, commits }
  })
}

function rememberPulls(paths: readonly string[], pulls: Record<string, unknown>, token: string, options: Options) {
  return Effect.forEach(paths, (path) =>
    Effect.gen(function* () {
      if (pulls[path]) return
      const body = yield* githubGet(path, token, options).pipe(Effect.catch(() => Effect.succeed(undefined)))
      if (body) pulls[path] = body
    }),
  )
}

function apiPath(url: string | null | undefined) {
  if (!url || !URL.canParse(url)) return
  const parsed = new URL(url)
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "api.github.com" ||
    parsed.username ||
    parsed.password ||
    parsed.port
  )
    return
  if (!parsed.pathname.startsWith("/repos/")) return
  return parsed.pathname
}

function pullPath(url: string | null | undefined) {
  const path = apiPath(url)
  if (!path || !pullPattern.test(path)) return
  return path
}

function pullApi(url: string | null | undefined) {
  const path = pullPath(url)
  return path ? `${githubHost}${path}` : undefined
}

function githubGet(path: string, token: string, options: Options = transport) {
  return request(githubHost, `Bearer ${token}`, { method: "GET", path, headers: githubAgent }, options)
}

function githubPost(path: string, token: string, body: Schema.Json) {
  return request(githubHost, `Bearer ${token}`, { method: "POST", path, body, headers: githubAgent }, transport)
}

function get(endpoint: string, path: string, token: string) {
  return request(endpoint, `Bearer ${token}`, { method: "GET", path }, transport)
}

function post(endpoint: string, path: string, token: string, body: Schema.Json) {
  return request(endpoint, `Bearer ${token}`, { method: "POST", path, body }, transport)
}
