import { expect } from "bun:test"
import { Context, Effect, Layer, type Scope } from "effect"
import { sql } from "drizzle-orm"
import { AppNodeBuilder } from "../../src/effect/app-node-builder"
import { LayerNode } from "../../src/effect/layer-node"
import { Database } from "../../src/database/database"
import { Credential } from "../../src/credential"
import { Location } from "../../src/location"
import { ProjectV2 } from "../../src/project"
import { AbsolutePath } from "../../src/schema"
import { installOwner } from "../../src/inbox/install"
import { Inbox } from "../../src/inbox/service"
import { SlackAuth } from "../../src/inbox/slack-auth"
import { InboxRowTable, InboxSlackTable } from "../../src/inbox/sql"
import { testEffect } from "../lib/effect"

const directory = AbsolutePath.make("/slack-fixture")
const owner = installOwner
const it = testEffect(
  AppNodeBuilder.build(LayerNode.group([Database.node, Credential.node]), [
    [Location.node, Layer.succeed(Location.Service, { directory, project: { id: ProjectV2.ID.global, directory } })],
  ]),
)
type Page = {
  messages?: { ts: string; text: string; user: string; reply_count?: number; thread_ts?: string }[]
  channels?: { id: string; name: string }[]
  response_metadata?: { next_cursor: string }
  has_more?: boolean
  is_limited?: boolean
}

function fixture(
  name: string,
  run: (input: {
    inbox: Inbox.Interface
    reopen: Effect.Effect<Inbox.Interface, never, Scope.Scope>
    auth: ReturnType<typeof SlackAuth.make>
    db: Database.Interface["db"]
    calls: URL[]
    provider: { history: Page; replies: Page; channels: Page; rate: boolean; broken: boolean }
  }) => Effect.Effect<void, unknown, Scope.Scope>,
) {
  it.effect(name, () =>
    Effect.gen(function* () {
      const database = yield* Database.Service
      const credentials = yield* Credential.Service
      const calls: URL[] = []
      const provider = {
        channels: { channels: [{ id: "C123", name: "general" }], response_metadata: { next_cursor: "" } } as Page,
        history: {
          messages: [{ ts: "1700000000.000001", text: "root", user: "U123", reply_count: 1 }],
          has_more: false,
        } as Page,
        replies: {
          messages: [{ ts: "1700000000.000002", thread_ts: "1700000000.000001", text: "reply", user: "U456" }],
        } as Page,
        rate: false,
        broken: false,
      }
      const server = yield* Effect.acquireRelease(
        Effect.sync(() =>
          Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            fetch(req) {
              const url = new URL(req.url)
              calls.push(url)
              if (url.pathname === "/api/oauth.v2.access")
                return Response.json({
                  ok: true,
                  team: { id: "T123" },
                  authed_user: {
                    id: "U123",
                    token_type: "user",
                    access_token: "fixture-access",
                    refresh_token: "fixture-refresh",
                    expires_in: 43200,
                    scope: SlackAuth.scopes.join(","),
                  },
                })
              if (url.pathname === "/api/auth.test")
                return Response.json({ ok: true, team_id: "T123", user_id: "U123", team: "Fixture", user: "ada" })
              expect(req.headers.get("authorization")).toBe("Bearer fixture-access")
              if (provider.rate) return new Response("{}", { status: 429, headers: { "Retry-After": "120" } })
              if (provider.broken) return Response.json({ ok: false, error: "secret-provider-message" })
              if (url.pathname === "/api/users.conversations") return Response.json({ ok: true, ...provider.channels })
              if (url.pathname === "/api/conversations.history") return Response.json({ ok: true, ...provider.history })
              if (url.pathname === "/api/conversations.replies") return Response.json({ ok: true, ...provider.replies })
              return new Response(null, { status: 404 })
            },
          }),
        ),
        (server) => Effect.promise(() => server.stop(true)),
      )
      const auth = yield* Effect.acquireRelease(
        Effect.sync(() =>
          SlackAuth.make(credentials, {
            port: 0,
            fixtureOrigin: server.url.origin,
          }),
        ),
        (auth) => Effect.promise(() => auth.close()),
      )
      // Use the production Inbox commit path, with only provider HTTP redirected to this loopback fixture.
      const reopen = Layer.build(
        Layer.fresh(
          AppNodeBuilder.build(Inbox.node, [
            [Database.node, Layer.succeed(Database.Service, database)],
            [Credential.node, Layer.succeed(Credential.Service, credentials)],
            [SlackAuth.node, Layer.succeed(SlackAuth.Service, auth)],
            [
              Location.node,
              Layer.succeed(Location.Service, { directory, project: { id: ProjectV2.ID.global, directory } }),
            ],
          ]),
        ),
      ).pipe(
        Effect.map((context) => Context.get(context, Inbox.Service)),
        Effect.orDie,
      )
      const inbox = yield* reopen
      yield* run({ inbox, reopen, auth, db: database.db, calls, provider })
    }),
  )
}

fixture("empty connection scope never collects, and reconnect invalidates an operation generation", ({ auth, calls }) =>
  Effect.gen(function* () {
    const challenge = yield* auth.start(owner)
    const authorize = new URL(challenge.url)
    const callback = new URL(authorize.searchParams.get("redirect_uri")!)
    callback.searchParams.set("state", authorize.searchParams.get("state")!)
    callback.searchParams.set("code", "fixture-code")
    expect((yield* Effect.promise(() => fetch(callback))).status).toBe(200)
    const first = yield* auth.withConnection(owner, undefined, (connection) => Effect.succeed(connection.generation))
    const next = yield* auth.start(owner)
    const nextUrl = new URL(next.url)
    const nextCallback = new URL(nextUrl.searchParams.get("redirect_uri")!)
    nextCallback.searchParams.set("state", nextUrl.searchParams.get("state")!)
    nextCallback.searchParams.set("code", "fixture-code")
    expect((yield* Effect.promise(() => fetch(nextCallback))).status).toBe(200)
    expect((yield* auth.withConnection(owner, first, () => Effect.succeed("wrong")).pipe(Effect.flip)).reason).toBe(
      "unavailable",
    )
    expect(calls.map((url) => url.pathname)).toEqual([
      "/api/oauth.v2.access",
      "/api/auth.test",
      "/api/oauth.v2.access",
      "/api/auth.test",
    ])
  }),
)

const login = Effect.fn(function* (auth: ReturnType<typeof SlackAuth.make>) {
  const challenge = yield* auth.start(owner)
  const url = new URL(challenge.url)
  const callback = new URL(url.searchParams.get("redirect_uri")!)
  callback.searchParams.set("state", url.searchParams.get("state")!)
  callback.searchParams.set("code", "fixture-code")
  expect((yield* Effect.promise(() => fetch(callback))).status).toBe(200)
})

fixture("a new login clears the saved selection and rejects stale discovery and sync", ({ inbox, auth, calls }) =>
  Effect.gen(function* () {
    yield* login(auth)
    const previous = yield* inbox.slackScope()
    yield* inbox.slackDiscover(previous.generation)
    yield* inbox.slackSelect(previous.generation, ["C123"])
    yield* login(auth)
    const current = yield* inbox.slackScope()
    expect(current.generation).not.toBe(previous.generation)
    expect(current.selected).toEqual([])
    const count = calls.length
    expect((yield* inbox.slackDiscover(previous.generation).pipe(Effect.flip)).reason).toBe("unavailable")
    expect((yield* inbox.slackSync(previous.generation).pipe(Effect.flip)).reason).toBe("unavailable")
    yield* inbox.slackSync(current.generation)
    expect(calls).toHaveLength(count)
  }),
)

fixture("failure writing the checkpoint rolls back already inserted messages", ({ inbox, auth, db }) =>
  Effect.gen(function* () {
    yield* login(auth)
    const scope = yield* inbox.slackScope()
    yield* inbox.slackDiscover(scope.generation)
    yield* inbox.slackSelect(scope.generation, ["C123"])
    yield* db.run(
      sql.raw(
        "CREATE TRIGGER reject_checkpoint BEFORE UPDATE ON inbox_slack BEGIN SELECT RAISE(ABORT, 'checkpoint probe'); END",
      ),
    )
    yield* inbox.slackSync(scope.generation).pipe(Effect.exit)
    expect(yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)).toEqual([])
    const checkpoint = (yield* db.select().from(InboxSlackTable).get().pipe(Effect.orDie))!.value
    expect(checkpoint.state).toBe("idle")
    expect(checkpoint.jobs).toEqual([])
    yield* db.run(sql.raw("DROP TRIGGER reject_checkpoint"))
    expect((yield* inbox.slackSync(scope.generation)).state).toBe("pending")
    expect(yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)).toHaveLength(1)
  }),
)

fixture(
  "explicit selection imports paged history and replies, persists progress and cannot send",
  ({ inbox, reopen, auth, db, calls, provider }) =>
    Effect.gen(function* () {
      yield* login(auth)
      const scope = yield* inbox.slackScope()
      expect(scope.selected).toEqual([])
      yield* inbox.slackSync(scope.generation)
      expect(calls).toHaveLength(2)
      provider.channels.response_metadata = { next_cursor: "channels-next" }
      expect((yield* inbox.slackDiscover(scope.generation)).cursor).toBe("channels-next")
      provider.channels = { channels: [{ id: "C456", name: "second" }] }
      const discovered = yield* inbox.slackDiscover(scope.generation, "channels-next")
      expect(discovered.conversations.map((channel) => channel.id)).toEqual(["C123", "C456"])
      expect((yield* inbox.slackSelect(scope.generation, ["C999"]).pipe(Effect.flip)).reason).toBe("unavailable")
      yield* inbox.slackSelect(scope.generation, ["C123"])
      provider.history.response_metadata = { next_cursor: "history-next" }
      provider.history.has_more = true
      expect((yield* inbox.slackSync(scope.generation)).state).toBe("pending")
      const checkpoint = (yield* db.select().from(InboxSlackTable).get().pipe(Effect.orDie))!.value
      expect(checkpoint.jobs[0]?.cursor).toBe("history-next")
      const resumed = yield* reopen
      provider.history = { messages: [], has_more: false }
      expect((yield* resumed.slackSync(scope.generation)).state).toBe("pending")
      provider.replies.response_metadata = { next_cursor: "replies-next" }
      expect((yield* resumed.slackSync(scope.generation)).state).toBe("pending")
      provider.replies.response_metadata = { next_cursor: "" }
      expect((yield* resumed.slackSync(scope.generation)).state).toBe("synced")
      const items = yield* inbox.list()
      expect(items.map((item) => item.snippet).sort()).toEqual(["reply", "root"])
      expect(items.every((item) => item.reply === false)).toBe(true)
      expect((yield* inbox.send(items[0]!.id, "must not send").pipe(Effect.flip)).reason).toBe("unavailable")
      expect(calls.every((url) => !url.pathname.includes("chat."))).toBe(true)
      expect(
        calls
          .filter((url) => url.pathname.endsWith("history"))
          .every((url) => url.searchParams.get("channel") === "C123"),
      ).toBe(true)
      const rows = yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)
      expect(rows).toHaveLength(2)
      const reply = items.find((item) => item.snippet === "reply")!
      yield* inbox.archive(reply.id)
      provider.history = { messages: [{ ts: "1700000000.000002", text: "edited reply", user: "U456" }] }
      expect((yield* inbox.slackSync(scope.generation)).state).toBe("synced")
      const edited = (yield* inbox.list()).find((item) => item.id === reply.id)
      expect(edited?.snippet).toBe("edited reply")
      expect(edited?.waiting).toBe(false)
      expect(yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)).toHaveLength(2)
    }),
)

fixture(
  "429 persists retry delay without advancing, and an empty selection stops collection",
  ({ inbox, auth, db, calls, provider }) =>
    Effect.gen(function* () {
      yield* login(auth)
      const scope = yield* inbox.slackScope()
      yield* inbox.slackDiscover(scope.generation)
      yield* inbox.slackSelect(scope.generation, ["C123"])
      provider.rate = true
      const failed = yield* inbox.slackSync(scope.generation)
      expect(failed.state).toBe("rate_limited")
      expect(failed.retryAt! - Date.now()).toBeGreaterThan(110_000)
      const count = calls.length
      yield* inbox.slackSync(scope.generation)
      expect(calls).toHaveLength(count)
      expect((yield* db.select().from(InboxSlackTable).get().pipe(Effect.orDie))?.value.jobs[0]?.cursor).toBe("")
      yield* inbox.slackSelect(scope.generation, [])
      yield* inbox.slackSync(scope.generation)
      expect(calls).toHaveLength(count)
      expect(yield* inbox.list()).toEqual([])
      yield* inbox.slackSelect(scope.generation, ["C123"])
      expect((yield* inbox.slackSync(scope.generation)).state).toBe("rate_limited")
      expect(calls).toHaveLength(count)
    }),
)

fixture(
  "provider failure, limited history and cursor cycles never claim completed acquisition",
  ({ inbox, auth, provider }) =>
    Effect.gen(function* () {
      yield* login(auth)
      const scope = yield* inbox.slackScope()
      yield* inbox.slackDiscover(scope.generation)
      yield* inbox.slackSelect(scope.generation, ["C123"])
      provider.broken = true
      expect((yield* inbox.slackSync(scope.generation)).state).toBe("failed")
      provider.broken = false
      provider.history.is_limited = true
      expect((yield* inbox.slackSync(scope.generation)).state).toBe("limited")
      provider.history.is_limited = false
      provider.history.response_metadata = { next_cursor: "cycle" }
      expect((yield* inbox.slackSync(scope.generation)).state).toBe("pending")
      expect((yield* inbox.slackSync(scope.generation)).state).toBe("failed")
      expect((yield* inbox.slackScope()).syncedAt).toBeUndefined()
    }),
)

fixture("SQLite import failure rolls back messages and checkpoint together", ({ inbox, auth, db }) =>
  Effect.gen(function* () {
    yield* login(auth)
    const scope = yield* inbox.slackScope()
    yield* inbox.slackDiscover(scope.generation)
    yield* inbox.slackSelect(scope.generation, ["C123"])
    yield* db.run(
      sql.raw(
        "CREATE TRIGGER reject_slack_items BEFORE INSERT ON inbox_row BEGIN SELECT RAISE(ABORT, 'atomicity probe'); END",
      ),
    )
    expect((yield* inbox.slackSync(scope.generation)).state).toBe("failed")
    expect(yield* db.select().from(InboxRowTable).all().pipe(Effect.orDie)).toEqual([])
    const checkpoint = (yield* db.select().from(InboxSlackTable).get().pipe(Effect.orDie))!.value
    expect(checkpoint.state).toBe("failed")
    expect(checkpoint.jobs[0]?.cursor).toBe("")
    yield* db.run(sql.raw("DROP TRIGGER reject_slack_items"))
    expect((yield* inbox.slackSync(scope.generation)).state).toBe("pending")
  }),
)
