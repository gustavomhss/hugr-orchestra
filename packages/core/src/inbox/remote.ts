import { Effect, Option, Schema } from "effect"
import { createHash, randomUUID } from "node:crypto"
import { Inbox } from "@orchestra/schema/inbox"
import { IntegrationID } from "@orchestra/schema/integration-id"
import { decode, Failure, request, requestWithMetadata, type Options } from "../capability/channel/http"
import { Credential } from "../credential"
import { search } from "./jira"
import { GithubNote, apiPath, ciCandidates, ciItem, githubGet, githubHost, githubPost, loadCi, notifications, ownedUrl } from "./github"
import type { CiEvidence } from "./github"
import { mailItems, teamsItems, workItems } from "./items"
export { mailItems, teamsItems, workItems } from "./items"
export { ciCandidates, listedPulls, ownPull, suitePulls } from "./github"
import { assignedIssues } from "./linear"
import { communicationChoices, gmailSnapshot, outlookSnapshot, teamsSnapshot } from "./communication"
import { discordChoices, discordSnapshot } from "./discord"
import { gitlabTodos } from "./gitlab"
import { pagerdutyIncidents, sentryIssues, trelloNotifications } from "./notifications"
import { calendarChoices, calendarSnapshot } from "./calendar"
import type { Pulled, SourceKind } from "./types"

type AccountSource = Inbox.AccountSource

const transport = { timeoutMs: 10_000, maxResponseBytes: 256 * 1024 }

export function httpsOrigin(input: string) {
  if (!URL.canParse(input)) return
  const url = new URL(input)
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return
  return url
}
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


export const pull = Effect.fn("InboxRemote.pull")(function* (
  credentials: Credential.Interface,
  owner: string,
  options: Options = transport,
) {
  // Work snapshots have their own explicit sync with a durable success/failure receipt.
  const saved = yield* Effect.forEach(
    accountSources.filter((source) => source === "jira"),
    (source) => credential(credentials, source, owner),
  )
  const pages = yield* Effect.forEach(
    saved.flatMap((item) => (item ? [item] : [])),
    (item) => read(item, options),
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
    const url = httpsOrigin(origin)
    if (!url) return yield* new Failure({ reason: "invalid_response" })
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
  options: Options = transport,
) {
  if (!accountSources.includes(source as AccountSource)) return yield* Effect.fail("unavailable" as const)
  const saved = yield* credential(credentials, source as AccountSource, owner)
  if (!saved) return yield* Effect.fail("unavailable" as const)
  yield* send(saved, threadId, actor, text, options)
})

export const originDraft = Effect.fn("InboxRemote.originDraft")(function* (
  credentials: Credential.Interface,
  owner: string,
  source: SourceKind,
  threadId: string,
  actor: string,
  text: string,
  options?: Options,
) {
  if (source !== "mail") return
  const saved = yield* credential(credentials, "mail", owner)
  if (!saved) return yield* Effect.fail("unavailable" as const)
  const http = options ?? transport
  if (saved.account === "outlook") {
    yield* post(
      "https://graph.microsoft.com",
      "/v1.0/me/messages",
      saved.token,
      {
        subject: "",
        body: { content: text },
        toRecipients: [{ emailAddress: { address: address(actor) } }],
      },
      http,
    )
    return
  }
  yield* post(
    "https://gmail.googleapis.com",
    "/gmail/v1/users/me/drafts",
    saved.token,
    {
      message: { threadId, raw: rawMessage(actor, text) },
    },
    http,
  )
})

export const connect = Effect.fn("InboxRemote.connect")(function* (
  credentials: Credential.Interface,
  owner: string,
  input: { source: AccountSource; token: string; email?: string; site?: string; account?: "gmail" | "outlook" },
) {
  const integrationID = id(input.source, owner)
  const existing = yield* credentials.list(integrationID)
  const value = {
    type: "key" as const,
    key: input.token,
    metadata: {
      owner,
      generation: randomUUID(),
      ...(input.email ? { email: input.email } : {}),
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
    const email = typeof metadata?.email === "string" ? metadata.email : undefined
    const site = typeof metadata?.site === "string" ? metadata.site : undefined
    const account = metadata?.account === "outlook" ? ("outlook" as const) : ("gmail" as const)
    const github = source === "github" ? metadata?.github : undefined
    return {
      source,
      token: row.value.key,
      email,
      site,
      account,
      github,
      generation: typeof metadata?.generation === "string" ? metadata.generation : row.id,
    }
  })
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

function read(
  saved: { source: AccountSource; token: string; email?: string; site?: string; account: "gmail" | "outlook"; github?: unknown },
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
    // Missing site or email is a configuration failure, not an empty mailbox. Returning [] here is
    // indistinguishable from a genuine empty search and hides the acquisition from the account receipt.
    const site = httpsOrigin(saved.site ?? "")
    if (!site || !saved.email) return yield* new Failure({ reason: "invalid_response" })
    const basic = Buffer.from(`${saved.email}:${saved.token}`).toString("base64")
    return workItems("jira", yield* search((input) => request(site.origin, `Basic ${basic}`, input, options)))
  })
}

function send(
  saved: { source: AccountSource; token: string; email?: string; site?: string; account: "gmail" | "outlook" },
  threadId: string,
  actor: string,
  text: string,
  options: Options = transport,
) {
  return postFor(saved, threadId, actor, text, options).pipe(
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
  saved: { source: AccountSource; token: string; email?: string; site?: string; account: "gmail" | "outlook" },
  threadId: string,
  actor: string,
  text: string,
  options: Options = transport,
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
  const site = httpsOrigin(saved.site ?? "")
  if (!site || !saved.email) return Effect.fail(new Error("unavailable"))
  const basic = Buffer.from(`${saved.email}:${saved.token}`).toString("base64")
  return request(
    site.origin,
    `Basic ${basic}`,
    {
      method: "POST",
      path: `/rest/api/3/issue/${threadId}/comment`,
      body: { body: jiraDocument(text) },
    },
    options,
  )
}


function jiraDocument(text: string) {
  return {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text }] }],
  }
}

function get(endpoint: string, path: string, token: string) {
  return request(endpoint, `Bearer ${token}`, { method: "GET", path }, transport)
}

function post(endpoint: string, path: string, token: string, body: Schema.Json, options: Options = transport) {
  return request(endpoint, `Bearer ${token}`, { method: "POST", path, body }, options)
}
