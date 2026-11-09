import { Effect, Schema } from "effect"
import { createHash } from "node:crypto"
import { decode, Failure, type Request } from "../capability/channel/http"
import type { Pulled } from "./types"

type RPC = (input: Request) => Effect.Effect<{ body: Schema.Json; link?: string }, Failure>
const pagerdutyHeaders = { accept: "application/vnd.pagerduty+json;version=2" }

export const pagerdutyIncidents = Effect.fn("InboxPagerduty.incidents")(function* (
  rpc: RPC,
  services: readonly string[],
) {
  const identity = yield* decode(
    Schema.Struct({ user: Schema.Struct({ id: Schema.NonEmptyString }) }),
    yield* rpc({ method: "GET", path: "/users/me", headers: pagerdutyHeaders }).pipe(
      Effect.map((response) => response.body),
    ),
  )
  const found = new Map<string, Pulled>()
  for (const offset of Array.from({ length: 100 }, (_, index) => index * 100)) {
    const response = yield* rpc({
      method: "GET",
      path: "/incidents?statuses[]=triggered&statuses[]=acknowledged",
      headers: pagerdutyHeaders,
      query: { limit: 100, offset, date_range: "all", "user_ids[]": identity.user.id },
    })
    const page = yield* decode(
      Schema.Struct({
        offset: Schema.Int,
        limit: Schema.Int,
        more: Schema.Boolean,
        incidents: Schema.Array(
          Schema.Struct({
            id: Schema.NonEmptyString,
            title: Schema.String,
            status: Schema.String,
            urgency: Schema.String,
            html_url: Schema.String,
            service: Schema.Struct({ id: Schema.NonEmptyString }),
            assignments: Schema.Array(Schema.Struct({ assignee: Schema.Struct({ id: Schema.NonEmptyString }) })),
            priority: Schema.optionalKey(Schema.NullOr(Schema.Struct({ id: Schema.NonEmptyString }))),
          }),
        ),
      }),
      response.body,
    )
    if (page.offset !== offset || page.limit !== 100 || page.incidents.length > 100)
      return yield* new Failure({ reason: "invalid_response" })
    page.incidents
      .filter(
        (incident) =>
          ["triggered", "acknowledged"].includes(incident.status) &&
          incident.assignments.some((assignment) => assignment.assignee.id === identity.user.id) &&
          (!services.length || services.includes(incident.service.id)),
      )
      .forEach((incident) => {
        found.set(incident.id, {
          source: "pagerduty",
          externalId: incident.id,
          actor: incident.service.id,
          snippet: incident.title,
          threadId: incident.id,
          reply: false,
          revision: createHash("sha256")
            .update(JSON.stringify([incident.title, incident.status, incident.urgency, incident.priority?.id]))
            .digest("hex"),
          ...(providerLink(incident.html_url, ".pagerduty.com") ? { deepLink: incident.html_url } : {}),
        })
      })
    if (!page.more) return [...found.values()]
  }
  return yield* new Failure({ reason: "response_limit" })
})

export const sentryIssues = Effect.fn("InboxSentry.issues")(function* (
  rpc: RPC,
  organization: string,
  projects: readonly string[],
  relevance: "review" | "assigned",
  environment?: string,
) {
  const found = new Map<string, Pulled>()
  yield* Effect.forEach([...new Set(projects)], (project) =>
    Effect.gen(function* () {
      const path = `/api/0/organizations/${encodeURIComponent(organization)}/issues/`
      const progress: { cursor?: string; seen: Set<string> } = { seen: new Set() }
      for (const _ of Array.from({ length: 100 })) {
        const query =
          relevance === "review"
            ? "is:for_review issue.category:error"
            : "assigned:me is:unresolved issue.category:error"
        const response = yield* rpc({
          method: "GET",
          path,
          query: { project, query, environment, limit: 100, cursor: progress.cursor },
        })
        const issues = yield* decode(
          Schema.Array(
            Schema.Struct({
              id: Schema.NonEmptyString,
              title: Schema.String,
              status: Schema.String,
              substatus: Schema.optionalKey(Schema.NullOr(Schema.String)),
              level: Schema.String,
              project: Schema.Struct({ id: Schema.NonEmptyString, slug: Schema.String }),
              permalink: Schema.String,
            }),
          ),
          response.body,
        )
        if (issues.some((issue) => issue.project.id !== project && issue.project.slug !== project))
          return yield* new Failure({ reason: "invalid_response" })
        issues.forEach((issue) =>
          found.set(issue.id, {
            source: "sentry",
            externalId: issue.id,
            actor: issue.project.slug,
            snippet: issue.title,
            threadId: issue.id,
            reply: false,
            revision: createHash("sha256")
              .update(JSON.stringify([issue.title, issue.status, issue.substatus, issue.level]))
              .digest("hex"),
            ...(providerLink(issue.permalink, "sentry.io") ? { deepLink: issue.permalink } : {}),
          }),
        )
        if (found.size > 10_000) return yield* new Failure({ reason: "response_limit" })
        if (!response.link) return
        const links = response.link
          .split(/,\s*(?=<)/)
          .map((part) => part.match(/^\s*<([^>]+)>((?:;\s*[a-z_]+="[^"]*")+)[\s]*$/))
        if (links.some((link) => !link)) return yield* new Failure({ reason: "invalid_response" })
        const next = links.filter((link) => /;\s*rel="next"(?:;|$)/.test(link![2]!))
        if (!next.length) return
        if (next.length !== 1 || !URL.canParse(next[0]![1]!)) return yield* new Failure({ reason: "invalid_response" })
        const fields = [...next[0]![2]!.matchAll(/;\s*([a-z_]+)="([^"]*)"/g)].map(
          (match) => [match[1]!, match[2]!] as const,
        )
        const params = new Map(fields)
        if (
          params.size !== fields.length ||
          [...params.keys()].some((key) => !["rel", "results", "cursor"].includes(key)) ||
          !["true", "false"].includes(params.get("results") ?? "")
        )
          return yield* new Failure({ reason: "invalid_response" })
        if (params.get("results") === "false") return
        const url = new URL(next[0]![1]!)
        const cursor = params.get("cursor")
        if (
          url.origin !== "https://sentry.io" ||
          url.pathname !== path ||
          url.username ||
          url.password ||
          url.hash ||
          !cursor ||
          url.searchParams.get("cursor") !== cursor ||
          progress.seen.has(cursor)
        )
          return yield* new Failure({ reason: "invalid_response" })
        // Never issue the supplied URL: only its validated cursor may change, preserving the selected scope.
        progress.seen.add(cursor)
        progress.cursor = cursor
      }
      return yield* new Failure({ reason: "response_limit" })
    }),
  )
  return [...found.values()]
})

const TrelloBoard = Schema.Struct({ id: Schema.NonEmptyString, name: Schema.String })
const TrelloCard = Schema.Struct({ name: Schema.String, shortLink: Schema.optionalKey(Schema.String) })

export const trelloNotifications = Effect.fn("InboxTrello.notifications")(function* (
  rpc: RPC,
  boards: readonly string[],
) {
  if (!boards.length) return []
  const found = new Map<string, Pulled>()
  const progress: { before?: string; seen: Set<string> } = { seen: new Set() }
  for (const _ of Array.from({ length: 100 })) {
    const response = yield* rpc({
      method: "GET",
      path: "/1/members/me/notifications",
      query: { read_filter: "unread", limit: 100, before: progress.before, memberCreator: true, entities: true },
    })
    const notes = yield* decode(
      Schema.Array(
        Schema.Struct({
          id: Schema.String.check(Schema.isPattern(/^[a-f0-9]{24}$/)),
          unread: Schema.Boolean,
          type: Schema.String,
          date: Schema.NonEmptyString,
          idMemberCreator: Schema.optionalKey(Schema.NullOr(Schema.String)),
          board: Schema.optionalKey(Schema.NullOr(TrelloBoard)),
          card: Schema.optionalKey(Schema.NullOr(TrelloCard)),
          data: Schema.optionalKey(
            Schema.NullOr(
              Schema.Struct({
                board: Schema.optionalKey(TrelloBoard),
                card: Schema.optionalKey(TrelloCard),
                text: Schema.optionalKey(Schema.String),
              }),
            ),
          ),
        }),
      ),
      response.body,
    )
    if (notes.length > 100) return yield* new Failure({ reason: "invalid_response" })
    // System reminders have no creator or legacy data; entities=true can supply board/card alongside data.
    if (notes.some((note) => note.data?.board && note.board && note.data.board.id !== note.board.id))
      return yield* new Failure({ reason: "invalid_response" })
    notes
      .map((note) => ({ ...note, board: note.data?.board ?? note.board, card: note.data?.card ?? note.card }))
      .filter((note) => note.unread && note.board && boards.includes(note.board.id))
      .forEach((note) => {
        const card = note.card?.shortLink
        found.set(note.id, {
          source: "trello",
          externalId: note.id,
          actor: note.idMemberCreator || "Trello",
          snippet: note.data?.text || note.card?.name || note.board!.name,
          threadId: note.id,
          reply: false,
          revision: note.date,
          ...(card && /^[A-Za-z0-9]{8}$/.test(card) ? { deepLink: `https://trello.com/c/${card}` } : {}),
        })
      })
    if (notes.length < 100) return [...found.values()]
    const next = notes.at(-1)!.id
    if (progress.seen.has(next)) return yield* new Failure({ reason: "invalid_response" })
    progress.seen.add(next)
    progress.before = next
  }
  return yield* new Failure({ reason: "response_limit" })
})

function providerLink(value: string, domain: string) {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return (
    url.protocol === "https:" &&
    !url.username &&
    !url.password &&
    (domain.startsWith(".") ? url.hostname.endsWith(domain) : url.hostname === domain)
  )
}
