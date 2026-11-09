import { expect } from "bun:test"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { InboxAccountTable, InboxFeedTable, InboxRowTable } from "../../src/inbox/sql"
import { fixture } from "./work-service-fixture"

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
  "unchanged work snapshots stay read; edits and priority/revision bumps no longer reopen attention",
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
      expect((yield* inbox.list()).find((entry) => entry.id === item.id)?.waiting).toBe(false)
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
      expect((yield* inbox.list()).find((entry) => entry.id === notification.id)?.waiting).toBe(false)
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
    expect((yield* inbox.list())[0]?.waiting).toBe(false)
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
  "Teams reactions preserve read attention and edited message text updates the same items",
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
      expect(edited.every((item) => !item.waiting && item.snippet === "Edited chosen message" && !item.reply)).toBe(true)
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
