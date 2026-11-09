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
import { InboxAccountTable, InboxCalendarTable, InboxFeedTable, InboxRowTable } from "../../src/inbox/sql"
import { testEffect } from "../lib/effect"

const directory = AbsolutePath.make("/qa-mock-1")
const location = { directory, project: { id: ProjectV2.ID.global, directory } }
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, Credential.node, SlackAuth.node]), [
    [Location.node, Layer.succeed(Location.Service, location)],
  ]),
)

type QaProvider = {
  githubStatus: number | null
  githubPageFail: boolean
  linearExtra: boolean
  jiraStatus: number | null
  calendarUpdate: boolean
  feedGuids: string[]
}

function qaFixture(
  name: string,
  run: (input: {
    inbox: Inbox.Interface
    credentials: Credential.Interface
    origin: string
    db: Database.Interface["db"]
    calls: URL[]
    auths: (string | null)[]
    statuses: number[]
    provider: QaProvider
  }) => Effect.Effect<void, unknown, Scope.Scope>,
) {
  it.effect(name, () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const credentials = yield* Credential.Service
      const slack = yield* SlackAuth.Service
      const calls: URL[] = []
      const auths: (string | null)[] = []
      const statuses: number[] = []
      const provider: QaProvider = {
        githubStatus: null,
        githubPageFail: false,
        linearExtra: false,
        jiraStatus: null,
        calendarUpdate: false,
        feedGuids: ["baseline"],
      }
      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            fetch(req) {
              const url = new URL(req.url)
              calls.push(url)
              auths.push(req.headers.get("authorization"))
              if (url.pathname === "/calendar/v3/calendars/primary") {
                statuses.push(200)
                return Response.json({ id: "ada@example.com" })
              }
              if (url.pathname === "/calendar/v3/users/me/calendarList") {
                statuses.push(200)
                return Response.json({
                  items: [{ id: "ada@example.com", summary: "Personal", primary: true, accessRole: "owner" }],
                })
              }
              if (url.pathname === "/calendar/v3/calendars/primary/events") {
                statuses.push(200)
                return Response.json({
                  kind: "calendar#events",
                  accessRole: "owner",
                  items: [
                    {
                      id: "ordinary",
                      status: "confirmed",
                      summary: provider.calendarUpdate ? "Changed planning" : "Planning",
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
                statuses.push(200)
                const items = provider.feedGuids
                  .map(
                    (guid) =>
                      `<item><guid>${guid}</guid><title>Entry ${guid}</title><link>https://example.com/${guid}</link></item>`,
                  )
                  .join("")
                return new Response(`<rss version="2.0"><channel>${items}</channel></rss>`, {
                  headers: { ETag: `"${provider.feedGuids.join(",")}"`, "Content-Type": "application/rss+xml" },
                })
              }
              if (url.pathname === "/user") {
                const status = provider.githubStatus ?? 200
                statuses.push(status)
                if (status !== 200) return Response.json({}, { status })
                return Response.json({ login: "ada" })
              }
              if (url.pathname === "/notifications") {
                if (provider.githubStatus !== null) {
                  statuses.push(provider.githubStatus)
                  return Response.json({}, { status: provider.githubStatus })
                }
                const page = url.searchParams.get("page") ?? "1"
                if (provider.githubPageFail && page === "2") {
                  statuses.push(500)
                  return Response.json({}, { status: 500 })
                }
                statuses.push(200)
                return Response.json(
                  [
                    {
                      id: `note-${page}`,
                      reason: "mention",
                      updated_at: `2026-11-05T00:00:0${page}Z`,
                      subject: {
                        title: "Mention",
                        type: "Issue",
                        url: "https://api.github.com/repos/owner/repo/issues/1",
                      },
                      repository: { full_name: "owner/repo" },
                    },
                  ],
                  page === "1"
                    ? {
                        headers: { Link: '<https://api.github.com/notifications?page=2&per_page=100>; rel="next"' },
                      }
                    : undefined,
                )
              }
              if (url.pathname === "/graphql") {
                statuses.push(200)
                const nodes = [
                  {
                    id: "issue-1",
                    identifier: "ORCH-1",
                    title: "Assigned",
                    url: "https://linear.app/work/issue/ORCH-1",
                    updatedAt: "2026-11-05T00:00:01Z",
                    state: { id: "state-1", name: "In Progress" },
                    priority: 2,
                    dueDate: null,
                  },
                  ...(provider.linearExtra
                    ? [
                        {
                          id: "issue-2",
                          identifier: "ORCH-2",
                          title: "Second assigned",
                          url: "https://linear.app/work/issue/ORCH-2",
                          updatedAt: "2026-11-05T00:00:02Z",
                          state: { id: "state-1", name: "In Progress" },
                          priority: 2,
                          dueDate: null,
                        },
                      ]
                    : []),
                ]
                return Response.json({
                  data: {
                    viewer: { id: "linear-me" },
                    issues: { nodes, pageInfo: { hasNextPage: false, endCursor: null } },
                  },
                })
              }
              if (url.pathname === "/rest/api/3/search/jql") {
                const status = provider.jiraStatus ?? 200
                statuses.push(status)
                if (status !== 200) return Response.json({}, { status })
                return Response.json({
                  issues: [{ id: "10001", key: "ORCH-1", fields: { summary: "Assigned work" } }],
                  isLast: true,
                })
              }
              statuses.push(500)
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
      yield* run({
        inbox,
        credentials,
        origin: server.url.origin,
        db: database.db,
        calls,
        auths,
        statuses,
        provider,
      })
    }),
  )
}

qaFixture(
  "QA-35 401 after history preserves rows and never refreshes manual token",
  ({ inbox, credentials, db, calls, statuses, provider }) =>
    Effect.gen(function* () {
      const marker = "qa35-manual-marker"
      yield* inbox.connect({ source: "github", token: marker })
      expect((yield* inbox.syncWork("github")).state).toBe("synced")
      const history = yield* inbox.list()
      expect(history).toHaveLength(2)
      expect(history.every((item) => item.source === "github" && item.waiting)).toBe(true)
      const generationBefore = (yield* inbox.accounts()).find((account) => account.source === "github")?.generation
      expect(generationBefore).toBeDefined()
      const readId = history[0]!.id
      yield* inbox.markRead(readId)
      const beforeFailure = yield* inbox.list()
      expect(beforeFailure.find((item) => item.id === readId)?.waiting).toBe(false)
      expect(beforeFailure.filter((item) => item.waiting)).toHaveLength(1)
      const rowsBefore = yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)
      expect(rowsBefore).toHaveLength(2)
      const callsBefore = calls.length
      provider.githubStatus = 401
      const failed = yield* inbox.syncWork("github")
      expect(failed.state).toBe("failed")
      expect(failed.retryAt).toBeUndefined()
      expect(calls.length).toBeGreaterThan(callsBefore)
      expect(calls.slice(callsBefore).some((url) => /oauth|refresh|token/i.test(url.pathname))).toBe(false)
      expect(statuses.slice(callsBefore)).toContain(401)
      expect(statuses.slice(callsBefore)).not.toContain(200)
      const generationAfter = (yield* inbox.accounts()).find((account) => account.source === "github")?.generation
      expect(generationAfter).toBe(generationBefore)
      const stored = yield* credentials.all()
      expect(stored.filter((item) => item.value.type === "key" && item.value.key === marker)).toHaveLength(1)
      const rowsAfter = yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)
      expect(rowsAfter).toHaveLength(2)
      expect(rowsAfter.map((row) => row.external_id).sort()).toEqual(rowsBefore.map((row) => row.external_id).sort())
      const after = yield* inbox.list()
      expect(after).toHaveLength(2)
      expect(after.find((item) => item.id === readId)?.waiting).toBe(false)
      expect(after.filter((item) => item.waiting).map((item) => item.id)).toEqual(
        beforeFailure.filter((item) => item.waiting).map((item) => item.id),
      )
      const states = yield* db.select().from(InboxAccountTable).all().pipe(Effect.orDie)
      const githubState = states.find((row) => row.source === "github")
      expect(githubState?.state).toBe("failed")
      expect(githubState?.retry_at).toBeNull()
    }),
)

qaFixture(
  "QA-37 401 vs 403-no-rate-limit stay failed-not-rate_limited with HTTP/state proof",
  ({ inbox, db, calls, statuses, provider }) =>
    Effect.gen(function* () {
      yield* inbox.connect({ source: "github", token: "qa37-github-marker" })
      const before401 = calls.length
      provider.githubStatus = 401
      const unauthenticated = yield* inbox.syncWork("github")
      expect(unauthenticated.state).toBe("failed")
      expect(unauthenticated.retryAt).toBeUndefined()
      expect(calls.length).toBeGreaterThan(before401)
      expect(statuses.slice(before401)).toContain(401)
      let states = yield* db.select().from(InboxAccountTable).all().pipe(Effect.orDie)
      expect(states.find((row) => row.source === "github")?.state).toBe("failed")
      expect(states.find((row) => row.source === "github")?.retry_at).toBeNull()
      const before403 = calls.length
      provider.githubStatus = 403
      const forbidden = yield* inbox.syncWork("github")
      expect(forbidden.state).toBe("failed")
      expect(forbidden.retryAt).toBeUndefined()
      expect(calls.length).toBeGreaterThan(before403)
      expect(statuses.slice(before403)).toContain(403)
      expect(statuses.slice(before403)).not.toContain(429)
      states = yield* db.select().from(InboxAccountTable).all().pipe(Effect.orDie)
      expect(states.find((row) => row.source === "github")?.state).toBe("failed")
      expect(states.find((row) => row.source === "github")?.retry_at).toBeNull()
      expect(yield* inbox.list()).toEqual([])
      expect(yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)).toEqual([])
    }),
)

qaFixture(
  "QA-37 Jira Basic control vs no-email silent-empty with zero calls",
  ({ inbox, origin, calls, auths }) =>
    Effect.gen(function* () {
      // Control: Site + email + token issues a Basic-authenticated search and delivers the issue via pull().
      yield* inbox.connect({
        source: "jira",
        token: "qa37-jira-secret",
        site: origin,
        email: "ada@example.com",
      } as Parameters<Inbox.Interface["connect"]>[0] & { email?: string })
      const control = yield* inbox.list()
      expect(control).toHaveLength(1)
      expect(control[0]?.source).toBe("jira")
      expect(calls.filter((url) => url.pathname === "/rest/api/3/search/jql")).toHaveLength(1)
      expect(auths[calls.findIndex((url) => url.pathname === "/rest/api/3/search/jql")]).toMatch(/^Basic /)
    }),
)

qaFixture(
  "QA-37 Jira without email makes no call and returns empty as if genuinely empty (codified masking gap)",
  ({ inbox, origin, calls, db }) =>
    Effect.gen(function* () {
      // Production fact (remote.ts read/pull): read() returns [] without email, and pull() masks any error
      // via catch -> []. With no email no HTTP is attempted, yet list() succeeds with [] indistinguishable from
      // a genuinely empty result. No failure receipt is exposed. Asserted here as the codified expectation until
      // the product surfaces this as a durable failure; a future fix should make this test FAIL.
      yield* inbox.connect({ source: "jira", token: "qa37-jira-secret", site: origin })
      expect(yield* inbox.list()).toEqual([])
      expect(calls).toHaveLength(0)
      expect(yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)).toEqual([])
    }),
)

qaFixture(
  "QA-39 per-source failure isolates github while linear delivers new item",
  ({ inbox, db, provider }) =>
    Effect.gen(function* () {
      yield* inbox.connect({ source: "github", token: "qa39-github" })
      yield* inbox.connect({ source: "linear", token: "qa39-linear" })
      expect((yield* inbox.syncWork("github")).state).toBe("synced")
      expect((yield* inbox.syncWork("linear")).state).toBe("synced")
      const history = yield* inbox.list()
      expect(history).toHaveLength(3)
      expect(history.filter((item) => item.source === "github")).toHaveLength(2)
      expect(history.filter((item) => item.source === "linear")).toHaveLength(1)
      const rowsBefore = yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)
      expect(rowsBefore).toHaveLength(3)
      provider.githubPageFail = true
      provider.linearExtra = true
      expect((yield* inbox.syncWork("github")).state).toBe("failed")
      const rowsAfterGithubFailure = yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)
      expect(rowsAfterGithubFailure).toHaveLength(3)
      expect(rowsAfterGithubFailure.map((row) => row.external_id).sort()).toEqual(
        rowsBefore.map((row) => row.external_id).sort(),
      )
      expect(rowsAfterGithubFailure.filter((row) => row.source === "github")).toHaveLength(2)
      expect((yield* inbox.syncWork("linear")).state).toBe("synced")
      const after = yield* inbox.list()
      expect(after).toHaveLength(4)
      expect(after.filter((item) => item.source === "linear")).toHaveLength(2)
      const delivered = after.find((item) => item.externalId === "issue-2")
      expect(delivered).toBeDefined()
      expect(delivered?.waiting).toBe(true)
      expect(after.filter((item) => item.source === "github").map((item) => item.externalId).sort()).toEqual([
        "note-1",
        "note-2",
      ])
    }),
)

qaFixture(
  "QA-44 feed remove and re-add same URL rebuilds baseline silently with history retained",
  ({ inbox, db, provider }) =>
    Effect.gen(function* () {
      const feed = yield* inbox.addFeed({ source: "rss", url: "https://feeds.example/rss", name: "Updates" })
      expect((yield* inbox.syncFeed(feed.id)).initialized).toBe(true)
      expect(yield* inbox.list()).toEqual([])
      provider.feedGuids = ["baseline", "novelty-1"]
      expect((yield* inbox.syncFeed(feed.id)).state).toBe("synced")
      const novelty = (yield* inbox.list())[0]!
      expect(novelty.snippet).toContain("Entry novelty-1")
      expect(novelty.waiting).toBe(true)
      yield* inbox.markRead(novelty.id)
      expect(yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)).toHaveLength(1)
      yield* inbox.removeFeed(feed.id)
      expect(yield* inbox.feeds()).toEqual([])
      expect(yield* inbox.list()).toHaveLength(1)
      const readded = yield* inbox.addFeed({ source: "rss", url: "https://feeds.example/rss", name: "Updates" })
      expect(readded.id).not.toBe(feed.id)
      expect(readded.initialized).toBe(false)
      expect((yield* inbox.syncFeed(readded.id)).initialized).toBe(true)
      const rebuilt = yield* inbox.list()
      expect(rebuilt).toHaveLength(1)
      expect(rebuilt[0]?.id).toBe(novelty.id)
      expect(rebuilt[0]?.waiting).toBe(false)
      expect(yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)).toHaveLength(1)
      provider.feedGuids = ["baseline", "novelty-1", "novelty-2"]
      expect((yield* inbox.syncFeed(readded.id)).state).toBe("synced")
      const withNovelty = yield* inbox.list()
      expect(withNovelty).toHaveLength(2)
      expect(withNovelty.filter((item) => item.snippet.includes("Entry novelty-2"))).toHaveLength(1)
      expect(withNovelty.find((item) => item.snippet.includes("Entry novelty-2"))?.waiting).toBe(true)
      expect((yield* inbox.syncFeed(readded.id)).state).toBe("synced")
      expect(yield* inbox.list()).toHaveLength(2)
      expect(yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)).toHaveLength(2)
    }),
)

qaFixture(
  "QA-44 calendar deselect and reselect silently rebuilds ordinary baseline",
  ({ inbox, db, provider }) =>
    Effect.gen(function* () {
      yield* inbox.connect({ source: "calendar", token: "qa44-calendar", account: "gmail" })
      const configuration = yield* inbox.calendarConfiguration()
      expect(configuration.selected).toEqual([])
      expect(yield* inbox.discoverCalendars(configuration.generation)).toEqual([{ id: "primary", name: "Personal" }])
      yield* inbox.calendarConfiguration({ ...configuration, selected: ["primary"] })
      expect((yield* inbox.syncWork("calendar")).state).toBe("synced")
      const invitation = (yield* inbox.list())[0]!
      expect(invitation.externalId).toContain(":invite")
      expect(yield* inbox.list()).toHaveLength(1)
      yield* inbox.markRead(invitation.id)
      const current = yield* inbox.calendarConfiguration()
      yield* inbox.calendarConfiguration({ generation: configuration.generation, selected: [] })
      expect((yield* inbox.syncWork("calendar")).state).toBe("synced")
      expect(yield* inbox.list()).toHaveLength(1)
      expect(yield* db.select().from(InboxCalendarTable).all().pipe(Effect.orDie)).toHaveLength(0)
      expect((yield* inbox.calendarConfiguration()).generation).toBe(current.generation)
      yield* inbox.calendarConfiguration({ generation: configuration.generation, selected: ["primary"] })
      expect((yield* inbox.syncWork("calendar")).state).toBe("synced")
      const rebuilt = yield* inbox.list()
      expect(rebuilt).toHaveLength(1)
      expect(rebuilt[0]?.id).toBe(invitation.id)
      expect(rebuilt[0]?.waiting).toBe(false)
      expect(rebuilt[0]?.externalId).not.toContain(":ordinary")
      provider.calendarUpdate = true
      expect((yield* inbox.syncWork("calendar")).state).toBe("synced")
      const changed = yield* inbox.list()
      expect(changed).toHaveLength(2)
      expect(changed.filter((item) => item.snippet.includes("Changed planning"))).toHaveLength(1)
      expect(changed.find((item) => item.snippet.includes("Changed planning"))?.waiting).toBe(true)
      expect((yield* inbox.syncWork("calendar")).state).toBe("synced")
      expect(yield* inbox.list()).toHaveLength(2)
    }),
)
