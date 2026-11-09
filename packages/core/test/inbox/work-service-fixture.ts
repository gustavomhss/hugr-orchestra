import { expect } from "bun:test"
import { Context, Effect, Layer, type Scope } from "effect"
import { AppNodeBuilder } from "../../src/effect/app-node-builder"
import { LayerNode } from "../../src/effect/layer-node"
import { Database } from "../../src/database/database"
import { Credential } from "../../src/credential"
import { Location } from "../../src/location"
import { ProjectV2 } from "../../src/project"
import { AbsolutePath } from "../../src/schema"
import { Inbox } from "../../src/inbox/service"
import { SlackAuth } from "../../src/inbox/slack-auth"
import { testEffect } from "../lib/effect"

export const directory = AbsolutePath.make("/work-fixture")
export const location = { directory, project: { id: ProjectV2.ID.global, directory } }
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, Credential.node, SlackAuth.node]), [
    [Location.node, Layer.succeed(Location.Service, location)],
  ]),
)

export function fixture(
  name: string,
  run: (input: {
    inbox: Inbox.Interface
    db: Database.Interface["db"]
    calls: URL[]
    provider: {
      failPage: boolean
      rate: boolean
      linearError: boolean
      update: number
      priority: number
      teamsModified: number
      teamsText: string
    }
  }) => Effect.Effect<void, unknown, Scope.Scope>,
) {
  it.effect(name, () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const credentials = yield* Credential.Service
      const slack = yield* SlackAuth.Service
      const calls: URL[] = []
      const provider = {
        failPage: false,
        rate: false,
        linearError: false,
        update: 0,
        priority: 2,
        teamsModified: 0,
        teamsText: "Chosen message",
      }
      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            fetch(req) {
              const url = new URL(req.url)
              calls.push(url)
              if (url.pathname === "/calendar/v3/calendars/primary") return Response.json({ id: "ada@example.com" })
              if (url.pathname === "/calendar/v3/users/me/calendarList")
                return Response.json({
                  items: [{ id: "ada@example.com", summary: "Personal", primary: true, accessRole: "owner" }],
                })
              if (url.pathname === "/calendar/v3/calendars/primary/events") {
                if (provider.failPage) return Response.json({}, { status: 500 })
                if (provider.rate) return Response.json({}, { status: 429, headers: { "Retry-After": "90" } })
                return Response.json({
                  kind: "calendar#events",
                  accessRole: "owner",
                  items: [
                    {
                      id: "ordinary",
                      status: "confirmed",
                      summary: provider.update ? "Changed planning" : "Planning",
                      start: { dateTime: "2026-11-06T10:00:00Z" },
                      end: { dateTime: "2026-11-06T11:00:00Z" },
                    },
                    {
                      id: "invite",
                      status: "confirmed",
                      summary: "Invitation",
                      start: { dateTime: "2026-11-06T10:00:00Z" },
                      end: { dateTime: "2026-11-06T11:00:00Z" },
                      attendees: [{ email: "ada@example.com", responseStatus: "needsAction" }],
                    },
                  ],
                })
              }
              if (url.pathname === "/rss") {
                if (provider.rate) return new Response("", { status: 429, headers: { "Retry-After": "90" } })
                if (provider.failPage) return new Response("<rss><channel>")
                if (req.headers.get("if-none-match") === `"${provider.update}"`)
                  return new Response(null, { status: 304 })
                return new Response(
                  `<rss version="2.0"><channel><item><guid>baseline</guid><title>Already published</title></item>${provider.update ? `<item><guid>new</guid><title>${provider.update === 1 ? "New entry" : "Edited title"}</title><link>https://example.com/new</link></item>` : ""}</channel></rss>`,
                  { headers: { ETag: `"${provider.update}"`, "Content-Type": "application/rss+xml" } },
                )
              }
              if (url.pathname === "/users/me") {
                expect(req.headers.get("authorization")).toBe("Token token=fixture-pagerduty")
                expect(req.headers.get("accept")).toBe("application/vnd.pagerduty+json;version=2")
                return Response.json({ user: { id: "U1" } })
              }
              if (url.pathname === "/incidents") {
                if (provider.rate) return Response.json({}, { status: 429, headers: { "Retry-After": "90" } })
                if (provider.failPage && url.searchParams.get("offset") === "100")
                  return Response.json({}, { status: 500 })
                return Response.json({
                  incidents: [
                    {
                      id: `P${url.searchParams.get("offset")}`,
                      title: "Service down",
                      status: "triggered",
                      urgency: "high",
                      service: { id: "S1" },
                      assignments: [{ assignee: { id: "U1" } }],
                      html_url: "https://example.pagerduty.com/incidents/P1",
                    },
                  ],
                  offset: Number(url.searchParams.get("offset")),
                  limit: 100,
                  more: url.searchParams.get("offset") === "0",
                })
              }
              if (url.pathname === "/api/0/organizations/org/issues/") {
                expect(req.headers.get("authorization")).toBe("Bearer fixture-sentry")
                if (provider.failPage && url.searchParams.has("cursor")) return Response.json({}, { status: 500 })
                return Response.json(
                  url.searchParams.has("cursor")
                    ? [
                        {
                          id: "i1",
                          title: "TypeError",
                          status: "unresolved",
                          substatus: "regressed",
                          level: "error",
                          project: { id: "20", slug: "api" },
                          permalink: "https://sentry.io/organizations/org/issues/1/",
                        },
                      ]
                    : [],
                  !url.searchParams.has("cursor")
                    ? {
                        headers: {
                          Link: '<https://sentry.io/api/0/organizations/org/issues/?cursor=next>; rel="next"; results="true"; cursor="next"',
                        },
                      }
                    : undefined,
                )
              }
              if (url.pathname === "/1/members/me/notifications") {
                expect(req.headers.get("authorization")).toBe("Bearer fixture-trello")
                if (provider.failPage) return Response.json({}, { status: 500 })
                return Response.json([
                  {
                    id: "aaaaaaaaaaaaaaaaaaaaaaaa",
                    unread: true,
                    type: "cardDueSoon",
                    date: "2026-11-05T00:00:00Z",
                    data: null,
                    board: { id: "board-1", name: "Work" },
                    card: { name: "Review release", shortLink: "Abcd1234" },
                    idMemberCreator: null,
                  },
                ])
              }
              if (url.pathname === "/api/v4/user") {
                expect(req.headers.get("authorization")).toBe("Bearer fixture-gitlab")
                return Response.json({ id: 99 })
              }
              if (url.pathname === "/api/v4/todos") {
                if (provider.rate) return Response.json({}, { status: 429, headers: { "Retry-After": "90" } })
                if (provider.failPage && url.searchParams.get("page") === "2") return Response.json({}, { status: 500 })
                return Response.json(
                  [
                    {
                      id: Number(url.searchParams.get("page")),
                      state: "pending",
                      action_name: "review_requested",
                      body: "Please review",
                      updated_at: "2026-11-05T00:00:00Z",
                      author: { username: "ada" },
                      project: { id: 20 },
                      target_url: "https://gitlab.example.com/team/project/-/merge_requests/1",
                    },
                  ],
                  url.searchParams.get("page") === "1"
                    ? {
                        headers: {
                          Link: '<https://gitlab.example.com/api/v4/todos?state=pending&per_page=100&page=2>; rel="next"',
                        },
                      }
                    : undefined,
                )
              }
              if (url.pathname.startsWith("/api/v10/")) {
                expect(req.headers.get("authorization")).toBe("Bot fixture-discord")
                if (url.pathname.endsWith("/users/@me")) return Response.json({ id: "99", bot: true })
                if (url.pathname.includes("applications"))
                  return Response.json({ flags: provider.linearError ? 0 : 1 << 19 })
                if (url.pathname.endsWith("/guilds")) return Response.json([{ id: "10", name: "Server" }])
                if (url.pathname.endsWith("/roles")) return Response.json([{ id: "10", permissions: "66560" }])
                if (url.pathname.includes("/members/")) return Response.json({ roles: [] })
                if (url.pathname.endsWith("/channels"))
                  return Response.json([
                    { id: "20", guild_id: "10", name: "chosen", type: 0, permission_overwrites: [] },
                  ])
                if (provider.rate) return Response.json({}, { status: 429, headers: { "Retry-After": "90" } })
                return Response.json([
                  {
                    id: "200",
                    channel_id: "20",
                    author: { id: "99" },
                    type: 0,
                    content: "Discord preview",
                    timestamp: new Date().toISOString(),
                    edited_timestamp: null,
                  },
                ])
              }
              if (url.pathname === "/gmail/v1/users/me/labels")
                return Response.json({
                  labels: [
                    { id: "INBOX", name: "Inbox" },
                    { id: "Label_a", name: "Work" },
                  ],
                })
              if (url.pathname === "/gmail/v1/users/me/messages") {
                if (provider.rate) return Response.json({}, { status: 429, headers: { "Retry-After": "90" } })
                if (provider.failPage && url.searchParams.has("pageToken")) return Response.json({}, { status: 500 })
                return Response.json({
                  messages: [{ id: url.searchParams.has("pageToken") ? "mail-2" : "mail-1" }],
                  ...(!url.searchParams.has("pageToken") ? { nextPageToken: "next" } : {}),
                })
              }
              if (url.pathname.startsWith("/gmail/v1/users/me/messages/"))
                return Response.json({
                  id: url.pathname.split("/").at(-1),
                  threadId: "thread-1",
                  labelIds: ["INBOX"],
                  snippet: "Mail preview",
                  payload: { headers: [{ name: "From", value: "ada@example.com" }] },
                })
              if (url.pathname === "/v1.0/me/chats")
                return Response.json({
                  value: [
                    { id: "chat-1", topic: "Chosen chat", chatType: "group" },
                    { id: "chat-2", topic: "Not chosen", chatType: "meeting" },
                  ],
                })
              if (url.pathname === "/v1.0/chats/chat-1/messages") {
                if (provider.rate) return Response.json({}, { status: 429, headers: { "Retry-After": "90" } })
                if (provider.failPage && url.searchParams.has("$skiptoken")) return Response.json({}, { status: 500 })
                return Response.json({
                  value: [
                    {
                      id: url.searchParams.has("$skiptoken") ? "second" : "first",
                      messageType: "message",
                      lastModifiedDateTime: new Date(Date.now() + provider.teamsModified * 1000).toISOString(),
                      body: { contentType: "text", content: provider.teamsText },
                      from: { user: { id: "ada" } },
                    },
                  ],
                  ...(!url.searchParams.has("$skiptoken")
                    ? { "@odata.nextLink": "https://graph.microsoft.com/v1.0/chats/chat-1/messages?$skiptoken=next" }
                    : {}),
                })
              }
              if (url.pathname === "/user") {
                expect(req.headers.get("authorization")).toBe("Bearer fixture-github")
                return Response.json({ login: "ada" })
              }
              if (url.pathname === "/notifications") {
                if (provider.rate) return new Response("{}", { status: 429, headers: { "Retry-After": "90" } })
                if (provider.failPage && url.searchParams.get("page") === "2")
                  return Response.json({ error: "fixture secret detail" }, { status: 500 })
                return Response.json(
                  [
                    {
                      id: `note-${url.searchParams.get("page")}`,
                      reason: "mention",
                      updated_at: `2026-11-05T00:00:0${provider.update}Z`,
                      subject: {
                        title: "Mention",
                        type: "Issue",
                        url: "https://api.github.com/repos/owner/repo/issues/1",
                      },
                      repository: { full_name: "owner/repo" },
                    },
                  ],
                  url.searchParams.get("page") === "1"
                    ? {
                        headers: { Link: '<https://api.github.com/notifications?page=2&per_page=100>; rel="next"' },
                      }
                    : undefined,
                )
              }
              if (url.pathname === "/graphql") {
                expect(req.headers.get("authorization")).toBe("fixture-linear")
                if (provider.linearError) return Response.json({ errors: [{ message: "fixture secret detail" }] })
                return Response.json({
                  data: {
                    viewer: { id: "linear-me" },
                    issues: {
                      nodes: [
                        {
                          id: "issue-1",
                          identifier: "ORCH-1",
                          title: "Assigned",
                          url: "https://linear.app/work/issue/ORCH-1",
                          updatedAt: `2026-11-05T00:00:0${provider.update}Z`,
                          state: { id: "state-1", name: "In Progress" },
                          priority: provider.priority,
                          dueDate: null,
                        },
                      ],
                      pageInfo: { hasNextPage: false, endCursor: null },
                    },
                  },
                })
              }
              return new Response(null, { status: 500 })
            },
          }),
        ),
        (server) => Effect.promise(() => server.stop(true)),
      )
      const inbox = yield* Layer.build(
        Inbox.layer({
          workTransport: { fixtureOrigin: server.url.origin },
          feedTransport: { fixtureOrigin: server.url.origin },
        }).pipe(
          Layer.provide(
            Layer.mergeAll(
              Layer.succeed(Database.Service, database),
              Layer.succeed(Credential.Service, credentials),
              Layer.succeed(SlackAuth.Service, slack),
              Layer.succeed(Location.Service, location),
            ),
          ),
        ),
      ).pipe(Effect.map((context) => Context.get(context, Inbox.Service)))
      yield* run({ inbox, db: database.db, calls, provider })
    }),
  )
}
