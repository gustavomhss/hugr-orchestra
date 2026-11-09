import { expect } from "bun:test"
import { Context, Effect, Layer, type Scope } from "effect"
import { eq, sql } from "drizzle-orm"
import { AppNodeBuilder } from "../../src/effect/app-node-builder"
import { LayerNode } from "../../src/effect/layer-node"
import { Database } from "../../src/database/database"
import { Credential } from "../../src/credential"
import { Location } from "../../src/location"
import { ProjectV2 } from "../../src/project"
import { AbsolutePath } from "../../src/schema"
import { Inbox } from "../../src/inbox/service"
import { SlackAuth } from "../../src/inbox/slack-auth"
import { InboxAccountTable, InboxFeedTable, InboxRowTable } from "../../src/inbox/sql"
import { Board } from "@orchestra/schema/board"
import { BoardProjectTable, BoardQuestionTable, BoardIssueTable } from "../../src/board/sql"
import { ProjectTable } from "../../src/project/sql"
import { testEffect } from "../lib/effect"

const directory = AbsolutePath.make("/work-fixture")
const location = { directory, project: { id: ProjectV2.ID.global, directory } }
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, Credential.node, SlackAuth.node]), [
    [Location.node, Layer.succeed(Location.Service, location)],
  ]),
)

fixture(
  "Board owner requests project locally, reconcile resolution and never hand an owner decision back to Maestro",
  ({ inbox, db, calls }) =>
    Effect.gen(function* () {
      yield* db
        .insert(ProjectTable)
        .values({ id: location.project.id, worktree: directory, sandboxes: [] })
        .onConflictDoNothing()
        .run()
      const project = Board.ProjectID.create()
      const foreign = Board.ProjectID.create()
      yield* db
        .insert(BoardProjectTable)
        .values([
          {
            id: project,
            key: "OWN",
            name: "Owned",
            goal: "Owner decisions",
            repo_project_id: location.project.id,
            status: "active",
            github_state: "off",
            next_issue_number: 3,
            next_epic_number: 1,
          },
          {
            id: foreign,
            key: "OTHER",
            name: "Other",
            goal: "Not this repo",
            status: "active",
            github_state: "off",
            next_issue_number: 1,
            next_epic_number: 1,
          },
        ])
        .run()
      const question = Board.QuestionID.create()
      yield* db
        .insert(BoardQuestionTable)
        .values([
          {
            id: question,
            project_id: project,
            text: "Choose a recovery strategy",
            options: [],
            recommended: "safe",
            blocking: true,
            status: "open",
          },
          {
            id: Board.QuestionID.create(),
            project_id: foreign,
            text: "Private elsewhere",
            options: [],
            recommended: "",
            blocking: true,
            status: "open",
          },
        ])
        .run()
      yield* db
        .insert(BoardIssueTable)
        .values([
          {
            id: Board.IssueID.create(),
            project_id: project,
            number: 1,
            title: "Accept intake",
            body: "",
            type: "feature",
            stage: "intake",
            position: 1,
            stage_entered_at: 1,
          },
          {
            id: Board.IssueID.create(),
            project_id: project,
            number: 2,
            title: "Release held delivery",
            body: "",
            type: "feature",
            stage: "review",
            hold_before_merge: true,
            position: 2,
            stage_entered_at: 1,
          },
        ])
        .run()
      const items = yield* inbox.list()
      expect(items).toHaveLength(3)
      expect(items.every((item) => item.source === "board" && !item.reply)).toBe(true)
      const item = items.find((item) => item.externalId === `question:${question}`)!
      expect((yield* inbox.require([item.id]).pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.handoff([item.id]).pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.send(item.id, "no automatic answer").pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.originDraft(item.id, "no delegated answer").pipe(Effect.flip)).reason).toBe("unavailable")
      yield* inbox.markRead(item.id)
      expect((yield* inbox.list()).find((entry) => entry.id === item.id)?.waiting).toBe(false)
      yield* db
        .update(BoardQuestionTable)
        .set({ recommended: "changed" })
        .where(eq(BoardQuestionTable.id, question))
        .run()
      expect((yield* inbox.list()).find((entry) => entry.id === item.id)?.waiting).toBe(true)
      yield* db.update(BoardQuestionTable).set({ status: "answered" }).where(eq(BoardQuestionTable.id, question)).run()
      expect((yield* inbox.list()).find((entry) => entry.id === item.id)?.waiting).toBe(false)
      yield* db.update(BoardProjectTable).set({ status: "archived" }).where(eq(BoardProjectTable.id, project)).run()
      expect((yield* inbox.list()).every((entry) => !entry.waiting)).toBe(true)
      expect(calls).toHaveLength(0)
    }),
)

function fixture(
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

fixture(
  "work collection is explicit; complete GitHub/Linear snapshots and their verdicts persist together",
  ({ inbox, db, calls }) =>
    Effect.gen(function* () {
      yield* inbox.connect({ source: "github", token: "fixture-github" })
      yield* inbox.connect({ source: "linear", token: "fixture-linear" })
      expect(yield* inbox.list()).toEqual([])
      expect(calls).toHaveLength(0)
      expect((yield* inbox.syncWork("github")).state).toBe("synced")
      expect((yield* inbox.syncWork("linear")).state).toBe("synced")
      expect(yield* inbox.list()).toHaveLength(3)
      expect((yield* inbox.accounts()).filter((account) => account.state === "synced")).toHaveLength(2)
      const before = calls.length
      yield* inbox.githubPreferences({
        generation: (yield* inbox.githubPreferences()).generation,
        repositories: ["different/repo"],
        reviews: true,
        mentions: true,
        assignments: true,
        ownCi: false,
      })
      expect(calls).toHaveLength(before)
      expect((yield* inbox.syncWork("github")).state).toBe("synced")
      expect(yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)).toHaveLength(3)
      yield* inbox.disconnectAccount("github")
      expect((yield* inbox.syncWork("github").pipe(Effect.flip)).reason).toBe("unavailable")
      expect(yield* inbox.list()).toHaveLength(3)
    }),
)

fixture(
  "failed final pages and GraphQL errors import no partial snapshot and leave a durable sanitized failure",
  ({ inbox, db, provider }) =>
    Effect.gen(function* () {
      yield* inbox.connect({ source: "github", token: "fixture-github" })
      yield* inbox.connect({ source: "linear", token: "fixture-linear" })
      provider.failPage = true
      expect((yield* inbox.syncWork("github")).state).toBe("failed")
      provider.linearError = true
      expect((yield* inbox.syncWork("linear")).state).toBe("failed")
      expect(yield* inbox.list()).toEqual([])
      const states = yield* db.select().from(InboxAccountTable).all().pipe(Effect.orDie)
      expect(states).toHaveLength(2)
      expect(JSON.stringify(states)).not.toContain("secret")
      provider.failPage = false
      expect((yield* inbox.syncWork("github")).state).toBe("synced")
      expect(yield* inbox.list()).toHaveLength(2)
    }),
)

fixture(
  "work rate limits survive settings edits, without another network request before retry time",
  ({ inbox, calls, provider }) =>
    Effect.gen(function* () {
      yield* inbox.connect({ source: "github", token: "fixture-github" })
      provider.rate = true
      const result = yield* inbox.syncWork("github")
      expect(result.state).toBe("rate_limited")
      expect(result.retryAt! - Date.now()).toBeGreaterThan(80_000)
      const count = calls.length
      yield* inbox.githubPreferences({
        generation: (yield* inbox.githubPreferences()).generation,
        repositories: [],
        reviews: false,
        mentions: true,
        assignments: true,
        ownCi: false,
      })
      expect((yield* inbox.syncWork("github")).state).toBe("rate_limited")
      expect(calls).toHaveLength(count)
    }),
)

fixture(
  "unchanged work snapshots stay read; only material Linear changes or new GitHub activity reopen attention",
  ({ inbox, provider }) =>
    Effect.gen(function* () {
      yield* inbox.connect({ source: "linear", token: "fixture-linear" })
      yield* inbox.syncWork("linear")
      const item = (yield* inbox.list())[0]!
      yield* inbox.markRead(item.id)
      provider.update = 1
      yield* inbox.syncWork("linear")
      expect((yield* inbox.list()).find((entry) => entry.id === item.id)?.waiting).toBe(false)
      provider.priority = 1
      yield* inbox.syncWork("linear")
      expect((yield* inbox.list()).find((entry) => entry.id === item.id)?.waiting).toBe(true)
      yield* inbox.markRead(item.id)
      yield* inbox.syncWork("linear")
      expect((yield* inbox.list()).find((entry) => entry.id === item.id)?.waiting).toBe(false)
      yield* inbox.connect({ source: "github", token: "fixture-github" })
      yield* inbox.syncWork("github")
      const notification = (yield* inbox.list()).find((entry) => entry.source === "github")!
      yield* inbox.markRead(notification.id)
      yield* inbox.syncWork("github")
      expect((yield* inbox.list()).find((entry) => entry.id === notification.id)?.waiting).toBe(false)
      provider.update = 2
      yield* inbox.syncWork("github")
      expect((yield* inbox.list()).find((entry) => entry.id === notification.id)?.waiting).toBe(true)
      expect(yield* inbox.list()).toHaveLength(3)
    }),
)

fixture("reconnecting invalidates stale work settings, sync and disconnect requests", ({ inbox, calls }) =>
  Effect.gen(function* () {
    yield* inbox.connect({ source: "github", token: "fixture-github" })
    const previous = yield* inbox.githubPreferences()
    yield* inbox.connect({ source: "github", token: "fixture-github" })
    const current = yield* inbox.githubPreferences()
    expect(current.generation).not.toBe(previous.generation)
    expect((yield* inbox.githubPreferences(previous).pipe(Effect.flip)).reason).toBe("unavailable")
    expect((yield* inbox.syncWork("github", previous.generation).pipe(Effect.flip)).reason).toBe("unavailable")
    expect((yield* inbox.disconnectAccount("github", previous.generation).pipe(Effect.flip)).reason).toBe("unavailable")
    expect((yield* inbox.accounts()).find((account) => account.source === "github")?.connected).toBe(true)
    expect(calls).toHaveLength(0)
  }),
)

fixture("the first revision on a legacy work item is a baseline, not a fabricated new event", ({ inbox, calls }) =>
  Effect.gen(function* () {
    const pulled = {
      source: "linear" as const,
      externalId: "legacy-issue",
      actor: "ORCH-1",
      snippet: "Known work",
      threadId: "legacy-issue",
      reply: false,
    }
    const item = yield* inbox.upsert(pulled)
    yield* inbox.markRead(item.id)
    yield* inbox.upsert({ ...pulled, revision: "baseline" })
    expect((yield* inbox.list())[0]?.waiting).toBe(false)
    yield* inbox.upsert({ ...pulled, revision: "material-change" })
    expect((yield* inbox.list())[0]?.waiting).toBe(true)
    expect(calls).toHaveLength(0)
  }),
)

fixture(
  "GitLab explicit personal feed is atomic, read-only, filtered and generation-bound",
  ({ inbox, calls, provider }) =>
    Effect.gen(function* () {
      yield* inbox.connect({ source: "gitlab", site: "https://gitlab.example.com", token: "fixture-gitlab" })
      const configuration = yield* inbox.gitlabConfiguration()
      expect(configuration.projects).toEqual([])
      expect(yield* inbox.list()).toEqual([])
      expect(calls).toHaveLength(0)
      provider.failPage = true
      expect((yield* inbox.syncWork("gitlab", configuration.generation)).state).toBe("failed")
      expect(yield* inbox.list()).toEqual([])
      provider.failPage = false
      expect((yield* inbox.syncWork("gitlab", configuration.generation)).state).toBe("synced")
      const item = (yield* inbox.list())[0]!
      expect(yield* inbox.list()).toHaveLength(2)
      expect(item.reply).toBe(false)
      expect((yield* inbox.send(item.id, "not permitted").pipe(Effect.flip)).reason).toBe("unavailable")
      yield* inbox.gitlabConfiguration({ ...configuration, projects: ["21"] })
      expect((yield* inbox.syncWork("gitlab")).state).toBe("synced")
      expect(yield* inbox.list()).toHaveLength(2)
      provider.rate = true
      expect((yield* inbox.syncWork("gitlab")).state).toBe("rate_limited")
      const count = calls.length
      yield* inbox.gitlabConfiguration({ ...configuration, projects: [] })
      expect((yield* inbox.syncWork("gitlab")).state).toBe("rate_limited")
      expect(calls).toHaveLength(count)
      yield* inbox.connect({ source: "gitlab", site: "https://gitlab.example.com", token: "fixture-gitlab" })
      expect((yield* inbox.gitlabConfiguration(configuration).pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.syncWork("gitlab", configuration.generation).pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.disconnectAccount("gitlab", configuration.generation).pipe(Effect.flip)).reason).toBe(
        "unavailable",
      )
    }),
)

fixture(
  "Sentry/Trello/PagerDuty keep explicit scope, atomic failure, read-only imports and stale-generation refusal",
  ({ inbox, calls, provider }) =>
    Effect.gen(function* () {
      for (const source of ["sentry", "trello", "pagerduty"] as const)
        yield* inbox.connect({ source, token: `fixture-${source}` })
      expect(yield* inbox.list()).toEqual([])
      expect(calls).toHaveLength(0)
      expect((yield* inbox.syncWork("sentry")).state).toBe("synced")
      expect((yield* inbox.syncWork("trello")).state).toBe("synced")
      expect(calls).toHaveLength(0)
      const sentry = yield* inbox.notificationConfiguration("sentry")
      const trello = yield* inbox.notificationConfiguration("trello")
      const pagerduty = yield* inbox.notificationConfiguration("pagerduty")
      expect(
        (yield* inbox.notificationConfiguration("sentry", { ...sentry, selected: ["-1"] }).pipe(Effect.flip)).reason,
      ).toBe("unavailable")
      yield* inbox.notificationConfiguration("sentry", { ...sentry, organization: "org", selected: ["20"] })
      yield* inbox.notificationConfiguration("trello", { ...trello, selected: ["board-1"] })
      provider.failPage = true
      for (const source of ["sentry", "trello", "pagerduty"] as const)
        expect((yield* inbox.syncWork(source)).state).toBe("failed")
      expect(yield* inbox.list()).toEqual([])
      provider.failPage = false
      for (const source of ["sentry", "trello", "pagerduty"] as const)
        expect((yield* inbox.syncWork(source)).state).toBe("synced")
      const items = yield* inbox.list()
      expect(items).toHaveLength(4)
      for (const item of items) {
        expect(item.reply).toBe(false)
        expect((yield* inbox.send(item.id, "no write").pipe(Effect.flip)).reason).toBe("unavailable")
        expect((yield* inbox.originDraft(item.id, "no write").pipe(Effect.flip)).reason).toBe("unavailable")
      }
      expect(
        (yield* inbox.notificationConfiguration("pagerduty", { ...pagerduty, relevance: "review" }).pipe(Effect.flip))
          .reason,
      ).toBe("unavailable")
      yield* inbox.connect({ source: "sentry", token: "fixture-sentry" })
      expect((yield* inbox.notificationConfiguration("sentry", sentry).pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.syncWork("sentry", sentry.generation).pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.disconnectAccount("sentry", sentry.generation).pipe(Effect.flip)).reason).toBe("unavailable")
    }),
)

fixture(
  "feeds baseline silently, atomically admit later entries, update titles in place and retain history on removal",
  ({ inbox, db, calls, provider }) =>
    Effect.gen(function* () {
      const feed = yield* inbox.addFeed({ source: "rss", url: "https://feeds.example/rss", name: "Updates" })
      expect((yield* inbox.addFeed({ source: "rss", url: "https://feeds.example/rss" })).id).toBe(feed.id)
      expect(yield* inbox.feeds()).toHaveLength(1)
      expect(yield* inbox.list()).toEqual([])
      expect(calls).toHaveLength(0)
      expect((yield* inbox.syncFeed(feed.id)).initialized).toBe(true)
      expect(yield* inbox.list()).toEqual([])
      expect((yield* inbox.syncFeed(feed.id)).state).toBe("synced")
      provider.update = 1
      yield* db.run(
        sql.raw(
          "CREATE TRIGGER reject_feed_checkpoint BEFORE UPDATE ON inbox_feed BEGIN SELECT RAISE(ABORT, 'feed checkpoint probe'); END",
        ),
      )
      expect((yield* inbox.syncFeed(feed.id).pipe(Effect.flip)).reason).toBe("unavailable")
      expect(yield* inbox.list()).toEqual([])
      yield* db.run(sql.raw("DROP TRIGGER reject_feed_checkpoint"))
      expect((yield* inbox.syncFeed(feed.id)).state).toBe("synced")
      const item = (yield* inbox.list())[0]!
      expect(item.snippet).toBe("New entry")
      expect(item.reply).toBe(false)
      expect((yield* inbox.send(item.id, "not a channel").pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.originDraft(item.id, "not mail").pipe(Effect.flip)).reason).toBe("unavailable")
      yield* inbox.markRead(item.id)
      provider.update = 2
      yield* inbox.syncFeed(feed.id)
      expect(yield* inbox.list()).toHaveLength(1)
      expect((yield* inbox.list())[0]).toMatchObject({ id: item.id, snippet: "Edited title", waiting: false })
      const saved = (yield* db.select().from(InboxFeedTable).all())[0]!
      yield* db
        .insert(InboxFeedTable)
        .values({ ...saved, id: "foreign-feed", owner: "other-location" })
        .run()
      expect(yield* inbox.feeds()).toHaveLength(1)
      const count = calls.length
      expect((yield* inbox.syncFeed("foreign-feed").pipe(Effect.flip)).reason).toBe("unavailable")
      yield* inbox.removeFeed(feed.id)
      expect(yield* inbox.feeds()).toEqual([])
      expect(yield* inbox.list()).toHaveLength(1)
      expect((yield* inbox.syncFeed(feed.id).pipe(Effect.flip)).reason).toBe("unavailable")
      expect(calls).toHaveLength(count)
    }),
)

fixture(
  "feed parse/network failures preserve the previous checkpoint and cooldown without a partial baseline",
  ({ inbox, calls, provider }) =>
    Effect.gen(function* () {
      const feed = yield* inbox.addFeed({ source: "rss", url: "https://feeds.example/rss" })
      provider.failPage = true
      expect((yield* inbox.syncFeed(feed.id)).state).toBe("failed")
      expect((yield* inbox.feeds())[0]?.initialized).toBe(false)
      provider.failPage = false
      expect((yield* inbox.syncFeed(feed.id)).initialized).toBe(true)
      provider.rate = true
      expect((yield* inbox.syncFeed(feed.id)).state).toBe("rate_limited")
      const count = calls.length
      expect((yield* inbox.syncFeed(feed.id)).state).toBe("rate_limited")
      expect(calls).toHaveLength(count)
      expect(yield* inbox.list()).toEqual([])
    }),
)

fixture(
  "Calendar explicitly discovers/selects, baselines silently and commits material changes atomically",
  ({ inbox, db, calls, provider }) =>
    Effect.gen(function* () {
      yield* inbox.connect({ source: "calendar", token: "calendar-fixture", account: "gmail" })
      const configuration = yield* inbox.calendarConfiguration()
      expect(configuration.selected).toEqual([])
      expect(yield* inbox.list()).toEqual([])
      expect(calls).toHaveLength(0)
      expect(yield* inbox.discoverCalendars(configuration.generation)).toEqual([{ id: "primary", name: "Personal" }])
      yield* inbox.calendarConfiguration({ ...configuration, selected: ["primary"] })
      provider.failPage = true
      expect((yield* inbox.syncWork("calendar")).state).toBe("failed")
      provider.failPage = false
      expect((yield* inbox.syncWork("calendar")).state).toBe("synced")
      expect(yield* inbox.list()).toHaveLength(1)
      const invitation = (yield* inbox.list())[0]!
      expect(invitation.externalId).toContain(":invite")
      yield* inbox.markRead(invitation.id)
      yield* inbox.syncWork("calendar")
      expect((yield* inbox.list())[0]?.waiting).toBe(false)
      provider.update = 1
      yield* db.run(
        sql.raw(
          "CREATE TRIGGER reject_calendar_checkpoint BEFORE UPDATE ON inbox_calendar BEGIN SELECT RAISE(ABORT, 'calendar checkpoint probe'); END",
        ),
      )
      yield* inbox.syncWork("calendar").pipe(Effect.exit)
      expect(yield* inbox.list()).toHaveLength(1)
      yield* db.run(sql.raw("DROP TRIGGER reject_calendar_checkpoint"))
      yield* inbox.syncWork("calendar")
      const items = yield* inbox.list()
      expect(items).toHaveLength(2)
      const changed = items.find((item) => item.externalId.endsWith(":ordinary"))!
      expect(changed.snippet).toContain("Changed planning")
      expect((yield* inbox.send(changed.id, "no RSVP").pipe(Effect.flip)).reason).toBe("unavailable")
      yield* inbox.connect({ source: "calendar", token: "replacement" })
      expect((yield* inbox.calendarConfiguration(configuration).pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.discoverCalendars(configuration.generation).pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.syncWork("calendar", configuration.generation).pipe(Effect.flip)).reason).toBe("unavailable")
    }),
)

fixture("failure saving the work receipt rolls back inserted messages", ({ inbox, db }) =>
  Effect.gen(function* () {
    yield* inbox.connect({ source: "github", token: "fixture-github" })
    yield* db.run(
      sql.raw(
        "CREATE TRIGGER reject_work_receipt BEFORE INSERT ON inbox_account BEGIN SELECT RAISE(ABORT, 'work receipt probe'); END",
      ),
    )
    yield* inbox.syncWork("github").pipe(Effect.exit)
    expect(yield* inbox.list()).toEqual([])
    yield* db.run(sql.raw("DROP TRIGGER reject_work_receipt"))
    expect((yield* inbox.syncWork("github")).state).toBe("synced")
    expect(yield* inbox.list()).toHaveLength(2)
  }),
)

fixture(
  "Discord requires an explicit bot connection/channel and missing broad content is a durable failure, never an empty success",
  ({ inbox, calls, provider }) =>
    Effect.gen(function* () {
      yield* inbox.connect({ source: "discord", token: "fixture-discord" })
      const configuration = yield* inbox.communicationConfiguration("discord")
      expect(configuration.selected).toEqual([])
      expect((yield* inbox.syncWork("discord")).state).toBe("synced")
      expect(yield* inbox.list()).toEqual([])
      expect(calls).toHaveLength(0)
      expect((yield* inbox.discoverCommunication("discord", configuration.generation)).choices).toEqual([
        { id: "20", name: "Server · #chosen" },
      ])
      yield* inbox.communicationConfiguration("discord", { ...configuration, selected: ["20"] })
      provider.linearError = true
      expect((yield* inbox.syncWork("discord")).state).toBe("failed")
      expect(yield* inbox.list()).toEqual([])
      provider.linearError = false
      expect((yield* inbox.syncWork("discord")).state).toBe("synced")
      const item = (yield* inbox.list())[0]!
      expect(item.source).toBe("discord")
      expect(item.reply).toBe(false)
      const count = calls.length
      expect((yield* inbox.send(item.id, "not allowed").pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.originDraft(item.id, "not allowed").pipe(Effect.flip)).reason).toBe("unavailable")
      expect(calls).toHaveLength(count)
      yield* inbox.communicationConfiguration("discord", { ...configuration, selected: ["21"] })
      expect((yield* inbox.syncWork("discord")).state).toBe("failed")
      expect(yield* inbox.list()).toHaveLength(1)
      yield* inbox.disconnectAccount("discord", configuration.generation)
      expect((yield* inbox.syncWork("discord").pipe(Effect.flip)).reason).toBe("unavailable")
      expect(yield* inbox.list()).toHaveLength(1)
    }),
)

fixture(
  "Teams reactions preserve read attention while edited message text reopens the same items",
  ({ inbox, provider }) =>
    Effect.gen(function* () {
      yield* inbox.connect({ source: "teams", token: "fixture-teams" })
      const configuration = yield* inbox.communicationConfiguration("teams")
      yield* inbox.communicationConfiguration("teams", { ...configuration, selected: ["chat-1"] })
      expect((yield* inbox.syncWork("teams", configuration.generation)).state).toBe("synced")
      const before = yield* inbox.list()
      expect(before).toHaveLength(2)
      yield* Effect.forEach(before, (item) => inbox.markRead(item.id))
      provider.teamsModified = 1
      expect((yield* inbox.syncWork("teams", configuration.generation)).state).toBe("synced")
      expect((yield* inbox.list()).every((item) => !item.waiting)).toBe(true)
      provider.teamsText = "Edited chosen message"
      provider.teamsModified = 2
      expect((yield* inbox.syncWork("teams", configuration.generation)).state).toBe("synced")
      const edited = yield* inbox.list()
      expect(edited.map((item) => item.id).toSorted()).toEqual(before.map((item) => item.id).toSorted())
      expect(edited.every((item) => item.waiting && item.snippet === "Edited chosen message" && !item.reply)).toBe(true)
    }),
)

fixture(
  "mail and Teams discovery/settings do not collect; empty chats collect nothing and scoped snapshots are read-only",
  ({ inbox, calls }) =>
    Effect.gen(function* () {
      yield* inbox.connect({ source: "mail", account: "gmail", token: "fixture-mail" })
      yield* inbox.connect({ source: "teams", token: "fixture-teams" })
      const mail = yield* inbox.communicationConfiguration("mail")
      const teams = yield* inbox.communicationConfiguration("teams")
      expect(mail.selected).toEqual(["INBOX"])
      expect(teams.selected).toEqual([])
      expect(yield* inbox.list()).toEqual([])
      expect(calls).toHaveLength(0)
      expect((yield* inbox.syncWork("teams", teams.generation)).state).toBe("synced")
      expect(calls).toHaveLength(0)
      expect((yield* inbox.discoverCommunication("teams", teams.generation)).choices).toHaveLength(2)
      yield* inbox.communicationConfiguration("teams", { ...teams, selected: ["chat-1"] })
      expect(calls).toHaveLength(1)
      expect((yield* inbox.syncWork("teams", teams.generation)).state).toBe("synced")
      expect((yield* inbox.syncWork("mail", mail.generation)).state).toBe("synced")
      const items = yield* inbox.list()
      expect(items).toHaveLength(4)
      for (const item of items) {
        expect(item.reply).toBe(false)
        expect((yield* inbox.send(item.id, "must not send").pipe(Effect.flip)).reason).toBe("unavailable")
        expect((yield* inbox.originDraft(item.id, "must not draft").pipe(Effect.flip)).reason).toBe("unavailable")
      }
      expect(calls.some((url) => url.pathname.includes("chat-2/messages"))).toBe(false)
      const count = calls.length
      yield* inbox.connect({ source: "mail", account: "gmail", token: "replacement" })
      expect((yield* inbox.communicationConfiguration("mail", mail).pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.discoverCommunication("mail", mail.generation).pipe(Effect.flip)).reason).toBe("unavailable")
      expect((yield* inbox.syncWork("mail", mail.generation).pipe(Effect.flip)).reason).toBe("unavailable")
      expect(calls).toHaveLength(count)
      expect((yield* inbox.syncWork("mail")).state).toBe("synced")
      // A replacement mailbox may reuse provider-local message ids; it must not overwrite the old grant's items.
      expect(yield* inbox.list()).toHaveLength(6)
    }),
)

fixture(
  "mail and Teams failed later pages import nothing; cooldown survives scope edits and receipts roll back atomically",
  ({ inbox, db, calls, provider }) =>
    Effect.gen(function* () {
      yield* inbox.connect({ source: "mail", account: "gmail", token: "fixture-mail" })
      yield* inbox.connect({ source: "teams", token: "fixture-teams" })
      const teams = yield* inbox.communicationConfiguration("teams")
      yield* inbox.communicationConfiguration("teams", { ...teams, selected: ["chat-1"] })
      provider.failPage = true
      expect((yield* inbox.syncWork("mail")).state).toBe("failed")
      expect((yield* inbox.syncWork("teams")).state).toBe("failed")
      expect(yield* inbox.list()).toEqual([])
      provider.failPage = false
      provider.rate = true
      expect((yield* inbox.syncWork("teams")).state).toBe("rate_limited")
      const count = calls.length
      yield* inbox.communicationConfiguration("teams", { ...teams, selected: [] })
      expect((yield* inbox.syncWork("teams")).state).toBe("rate_limited")
      expect(calls).toHaveLength(count)
      provider.rate = false
      yield* db.run(
        sql.raw(
          "CREATE TRIGGER reject_mail_receipt BEFORE UPDATE ON inbox_account WHEN NEW.source = 'mail' BEGIN SELECT RAISE(ABORT, 'mail receipt probe'); END",
        ),
      )
      yield* inbox.syncWork("mail").pipe(Effect.exit)
      expect(yield* inbox.list()).toEqual([])
      yield* db.run(sql.raw("DROP TRIGGER reject_mail_receipt"))
      expect((yield* inbox.syncWork("mail")).state).toBe("synced")
      expect(yield* inbox.list()).toHaveLength(2)
    }),
)
