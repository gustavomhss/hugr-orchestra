export * as Inbox from "./service"

import { and, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { Clock, Context, Effect, Layer, Schema, Semaphore } from "effect"
import { Inbox as InboxSchema } from "@orchestra/schema/inbox"
import { pull as channelPull, release as channelRelease } from "./channel"
import {
  accounts,
  collectWork,
  communicationConfiguration,
  discoverCommunication,
  connect,
  disconnectAccount,
  githubPreferences,
  gitlabConfiguration,
  notificationConfiguration,
  calendarConfiguration,
  discoverCalendars,
  collectCalendar,
  originDraft as remoteOrigin,
  pull as remotePull,
  release as remoteRelease,
} from "./remote"
import { Credential } from "../credential"
import { Database } from "../database/database"
import { makeLocationNode } from "../effect/app-node"
import { Location } from "../location"
import { canonical } from "../session/meeting-memory"
import { MeetingItemTable, MeetingPersonTable } from "../session/meeting-memory.sql"
import { door } from "./door"
import { InboxAccountTable, InboxCalendarTable, InboxDraftTable, InboxEgressTable, InboxRowTable } from "./sql"
import { reconcileCalendar } from "./calendar"
import { Failure, type Options } from "../capability/channel/http"
import { open, type Saved } from "./store"
import { SlackAuth } from "./slack-auth"
import { makeSlackSync } from "./slack-sync"
import { boardItems } from "./board"
import { makeFeedSync } from "./feed-sync"
import type { DoorInput, Item, Person, Pulled } from "./types"

export class InboxError extends Schema.TaggedErrorClass<InboxError>()("Inbox.InboxError", {
  reason: InboxSchema.ErrorReason,
}) {
  override get message() {
    return `Inbox failed: ${this.reason}`
  }
}

export interface Interface {
  readonly calendarConfiguration: (
    input?: InboxSchema.CalendarConfiguration,
  ) => Effect.Effect<InboxSchema.CalendarConfiguration, InboxError>
  readonly discoverCalendars: (generation: string) => Effect.Effect<readonly { id: string; name: string }[], InboxError>
  readonly feeds: () => Effect.Effect<readonly InboxSchema.Feed[], InboxError>
  readonly addFeed: (input: InboxSchema.FeedInput) => Effect.Effect<InboxSchema.Feed, InboxError>
  readonly removeFeed: (id: string) => Effect.Effect<void, InboxError>
  readonly syncFeed: (id: string) => Effect.Effect<InboxSchema.Feed, InboxError>
  readonly notificationConfiguration: (
    source: InboxSchema.NotificationSource,
    input?: InboxSchema.NotificationConfiguration,
  ) => Effect.Effect<InboxSchema.NotificationConfiguration, InboxError>
  readonly gitlabConfiguration: (
    input?: InboxSchema.GitlabConfiguration,
  ) => Effect.Effect<InboxSchema.GitlabConfiguration, InboxError>
  readonly upsert: (pulled: Pulled) => Effect.Effect<Item>
  readonly list: () => Effect.Effect<readonly Item[]>
  readonly archive: (id: string) => Effect.Effect<Item, InboxError>
  readonly markRead: (id: string) => Effect.Effect<Item, InboxError>
  readonly remindTomorrow: (id: string) => Effect.Effect<Item, InboxError>
  readonly saveDraft: (id: string, text: string) => Effect.Effect<Item, InboxError>
  readonly originDraft: (id: string, text: string) => Effect.Effect<{ readonly drafted: true }, InboxError>
  readonly send: (id: string, text: string) => Effect.Effect<{ readonly sent: true }, InboxError>
  readonly handoff: (ids: readonly string[]) => Effect.Effect<{ readonly ids: readonly string[] }, InboxError>
  readonly require: (ids: readonly string[]) => Effect.Effect<void, InboxError>
  readonly door: (input: DoorInput) => { readonly href: string } | { readonly openApp: true }
  readonly connect: (input: {
    source: InboxSchema.AccountSource
    token: string
    site?: string
    account?: "gmail" | "outlook"
  }) => Effect.Effect<void>
  readonly accounts: () => Effect.Effect<readonly InboxSchema.Account[]>
  readonly disconnectAccount: (
    source: InboxSchema.AccountSource,
    generation?: string,
  ) => Effect.Effect<void, InboxError>
  readonly syncWork: (
    source: InboxSchema.WorkSource,
    generation?: string,
  ) => Effect.Effect<InboxSchema.Account, InboxError>
  readonly githubPreferences: (
    input?: InboxSchema.GithubConfiguration,
  ) => Effect.Effect<InboxSchema.GithubConfiguration, InboxError>
  readonly communicationConfiguration: (
    source: InboxSchema.CommunicationSource,
    input?: InboxSchema.CommunicationConfiguration,
  ) => Effect.Effect<InboxSchema.CommunicationConfiguration, InboxError>
  readonly discoverCommunication: (
    source: InboxSchema.CommunicationSource,
    generation: string,
  ) => Effect.Effect<InboxSchema.CommunicationChoices, InboxError>
  readonly slackStart: () => Effect.Effect<InboxSchema.SlackAuthorization, InboxError>
  readonly slackStatus: (id?: string) => Effect.Effect<InboxSchema.SlackStatus>
  readonly slackCancel: (id: string) => Effect.Effect<void>
  readonly slackDisconnect: () => Effect.Effect<void, InboxError>
  readonly slackScope: () => Effect.Effect<InboxSchema.SlackScope, InboxError>
  readonly slackDiscover: (generation: string, cursor?: string) => Effect.Effect<InboxSchema.SlackScope, InboxError>
  readonly slackSelect: (
    generation: string,
    selected: readonly string[],
  ) => Effect.Effect<InboxSchema.SlackScope, InboxError>
  readonly slackSync: (generation: string) => Effect.Effect<InboxSchema.SlackScope, InboxError>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/Inbox") {}

export interface HandoffInterface {
  // Delivers the item ids to Maestro and removes them from the open list. Never carries a snippet or a transcript.
  readonly handoff: (ids: readonly string[]) => Effect.Effect<{ readonly ids: readonly string[] }, InboxError>
}

export class HandoffService extends Context.Service<HandoffService, HandoffInterface>()("@orchestra/v2/InboxHandoff") {}

export const layer = (options: { workTransport?: Options; feedTransport?: Options } = {}) =>
  Layer.effect(
    Service,
    Effect.gen(function* () {
      const database = yield* Database.Service
      const location = yield* Location.Service
      const credentials = yield* Credential.Service
      const slack = yield* SlackAuth.Service
      const owner = JSON.stringify([location.project.id, location.directory, location.workspaceID ?? null])
      const lock = Semaphore.makeUnsafe(1)
      const sync = makeSlackSync({
        db: database.db,
        auth: slack,
        owner,
        commit: (tx, items) =>
          Effect.gen(function* () {
            const saved = yield* load(tx, owner)
            const people = yield* loadPeople(tx)
            const store = open(people, saved, () => `in_${randomUUID()}`)
            items.forEach((item) => store.upsert(item))
            yield* save(tx, owner, store.snapshot())
          }),
      })
      const slackOperation = <A, E>(operation: Effect.Effect<A, E>) =>
        lock.withPermit(operation).pipe(Effect.mapError(() => new InboxError({ reason: "unavailable" })))
      const feeds = makeFeedSync({
        db: database.db,
        owner,
        transport: options.feedTransport,
        publish: (tx, feed, entries) =>
          Effect.gen(function* () {
            if (!feed.initialized) return
            const saved = yield* load(tx, owner)
            const people = yield* loadPeople(tx)
            const store = open(people, saved, () => `in_${randomUUID()}`)
            const known = new Set(saved.rows.filter((row) => row.source === feed.source).map((row) => row.externalId))
            entries
              .filter((entry) => !feed.seen.includes(entry.id) || known.has(`feed:${feed.id}:${entry.id}`))
              .forEach((entry) =>
                store.upsert({
                  source: feed.source,
                  externalId: `feed:${feed.id}:${entry.id}`,
                  actor: feed.name,
                  snippet: [entry.title, entry.text].filter(Boolean).join("\n"),
                  threadId: `feed:${feed.id}:${entry.id}`,
                  reply: false,
                  ...(entry.href ? { deepLink: entry.href } : {}),
                }),
              )
            yield* save(tx, owner, store.snapshot())
          }),
      })

      const read = Effect.fn("Inbox.read")(function* () {
        const saved = yield* load(database.db, owner)
        const people = yield* loadPeople(database.db)
        const now = yield* Clock.currentTimeMillis
        return { saved, people, now }
      })

      const change = <A>(body: (store: ReturnType<typeof open>, now: number) => A | undefined) =>
        lock.withPermit(
          Effect.gen(function* () {
            return yield* database.db
              .transaction((tx) =>
                Effect.gen(function* () {
                  const saved = yield* load(tx, owner)
                  const people = yield* loadPeople(tx)
                  const now = yield* Clock.currentTimeMillis
                  const store = open(people, saved, () => `in_${randomUUID()}`)
                  const result = body(store, now)
                  if (result === undefined) return undefined
                  yield* save(tx, owner, store.snapshot())
                  return result
                }),
              )
              .pipe(Effect.orDie)
          }),
        )

      const withId = <A>(id: string, body: (store: ReturnType<typeof open>, now: number) => A) =>
        change((store, now) => {
          if (!known(store, id)) return undefined
          return body(store, now)
        }).pipe(
          Effect.flatMap((result) =>
            result === undefined ? Effect.fail(new InboxError({ reason: "missing" })) : Effect.succeed(result),
          ),
        )

      return Service.of({
        feeds: () => slackOperation(feeds.list()),
        addFeed: (input) => slackOperation(feeds.add(input)),
        removeFeed: (id) => slackOperation(feeds.remove(id)),
        syncFeed: (id) => slackOperation(feeds.sync(id)),
        upsert: (pulled) =>
          change((store) => store.upsert(pulled)).pipe(
            Effect.flatMap((result) => (result === undefined ? Effect.die("upsert") : Effect.succeed(result))),
          ),
        list: () =>
          lock.withPermit(
            Effect.gen(function* () {
              const channels = yield* channelPull(database.db, location, credentials).pipe(
                Effect.catch(() => Effect.succeed([])),
              )
              const remote = yield* remotePull(credentials, owner).pipe(Effect.catch(() => Effect.succeed([])))
              const board = yield* boardItems(database.db, location).pipe(Effect.orDie)
              const previousBoard = yield* database.db
                .select({ id: InboxRowTable.list_id })
                .from(InboxRowTable)
                .where(and(eq(InboxRowTable.owner, owner), eq(InboxRowTable.source, "board")))
                .limit(1)
                .all()
                .pipe(Effect.orDie)
              const pulled = [...channels, ...remote, ...board]
              if (pulled.length > 0 || previousBoard.length > 0)
                yield* database.db
                  .transaction((tx) =>
                    Effect.gen(function* () {
                      const saved = yield* load(tx, owner)
                      const people = yield* loadPeople(tx)
                      const store = open(people, saved, () => `in_${randomUUID()}`)
                      for (const item of pulled) store.upsert(item)
                      // Resolved/withdrawn owner requests leave attention; imported history is retained.
                      saved.rows
                        .filter(
                          (row) => row.source === "board" && !board.some((item) => item.externalId === row.externalId),
                        )
                        .forEach((row) => store.archive(row.listId))
                      yield* save(tx, owner, store.snapshot())
                    }),
                  )
                  .pipe(Effect.orDie)
              const current = yield* read()
              return open(current.people, current.saved).list(current.now)
            }),
          ),
        archive: (id) => withId(id, (store) => store.archive(id)),
        markRead: (id) => withId(id, (store) => store.markRead(id)),
        remindTomorrow: (id) => withId(id, (store, now) => store.remindTomorrow(id, now)),
        saveDraft: (id, text) => withId(id, (store) => store.saveDraft(id, text)),
        originDraft: (id, text) =>
          Effect.gen(function* () {
            const current = yield* read()
            const row = current.saved.rows.find((item) => item.listId === id)
            if (
              row &&
              (row.source === "board" ||
                row.externalId.startsWith("oauth:") ||
                row.externalId.startsWith("scoped:") ||
                row.externalId.startsWith("feed:"))
            )
              return yield* new InboxError({ reason: "unavailable" })
            const saved = yield* withId(id, (store) => store.originDraft(id, text))
            if (row)
              yield* remoteOrigin(credentials, owner, row.source, row.threadId, row.actor, text).pipe(
                Effect.catch(() => Effect.succeed(undefined)),
              )
            return saved
          }),
        send: (id, text) =>
          lock.withPermit(
            Effect.gen(function* () {
              const current = yield* read()
              const row = current.saved.rows.find((item) => item.listId === id)
              if (!row) return yield* new InboxError({ reason: "missing" })
              if (
                row.source === "board" ||
                row.externalId.startsWith("oauth:") ||
                row.externalId.startsWith("scoped:") ||
                row.externalId.startsWith("feed:")
              )
                return yield* new InboxError({ reason: "unavailable" })
              const released =
                row.source === "slack" || row.source === "discord"
                  ? yield* channelRelease(database.db, location, credentials, row.source, row.threadId, text).pipe(
                      Effect.as(true),
                      Effect.catch(() => Effect.succeed(false)),
                    )
                  : yield* remoteRelease(credentials, owner, row.source, row.threadId, row.actor, text).pipe(
                      Effect.as(true),
                      Effect.catch(() => Effect.succeed(false)),
                    )
              if (!released) return yield* new InboxError({ reason: "unavailable" })
              return yield* database.db
                .transaction((tx) =>
                  Effect.gen(function* () {
                    const saved = yield* load(tx, owner)
                    const people = yield* loadPeople(tx)
                    const store = open(people, saved)
                    if (!known(store, id)) return undefined
                    const sent = store.send(id, text, true)
                    yield* save(tx, owner, store.snapshot())
                    return sent
                  }),
                )
                .pipe(
                  Effect.orDie,
                  Effect.flatMap((result) =>
                    result === undefined ? Effect.fail(new InboxError({ reason: "missing" })) : Effect.succeed(result),
                  ),
                )
            }),
          ),
        handoff: (ids) =>
          change((store) => {
            if (ids.some((item) => !known(store, item))) return undefined
            if (store.snapshot().rows.some((row) => row.source === "board" && ids.includes(row.listId)))
              return "unavailable" as const
            return store.handoff(ids)
          }).pipe(
            Effect.flatMap((result) =>
              result === undefined
                ? Effect.fail(new InboxError({ reason: "missing" }))
                : result === "unavailable"
                  ? Effect.fail(new InboxError({ reason: "unavailable" }))
                  : Effect.succeed(result),
            ),
          ),
        require: (ids) =>
          lock.withPermit(
            Effect.gen(function* () {
              const current = yield* read()
              const knownIds = new Set(current.saved.rows.map((row) => row.listId))
              if (ids.some((id) => !knownIds.has(id))) return yield* new InboxError({ reason: "missing" })
              if (current.saved.rows.some((row) => row.source === "board" && ids.includes(row.listId)))
                return yield* new InboxError({ reason: "unavailable" })
            }),
          ),
        door,
        connect: (input) =>
          lock.withPermit(
            Effect.gen(function* () {
              yield* connect(credentials, owner, input)
              if (input.source === "calendar")
                yield* database.db
                  .delete(InboxCalendarTable)
                  .where(eq(InboxCalendarTable.owner, owner))
                  .run()
                  .pipe(Effect.orDie)
              if (input.source !== "jira")
                yield* database.db
                  .delete(InboxAccountTable)
                  .where(and(eq(InboxAccountTable.owner, owner), eq(InboxAccountTable.source, input.source)))
                  .run()
                  .pipe(Effect.orDie)
            }),
          ),
        accounts: () =>
          Effect.gen(function* () {
            const saved = yield* accounts(credentials, owner)
            const states = yield* database.db
              .select()
              .from(InboxAccountTable)
              .where(eq(InboxAccountTable.owner, owner))
              .all()
              .pipe(Effect.orDie)
            return saved.map((account) => {
              const state = account.connected ? states.find((state) => state.source === account.source) : undefined
              return {
                ...account,
                state: state?.state ?? ("idle" as const),
                ...(state
                  ? { checkedAt: state.checked_at, ...(state.retry_at === null ? {} : { retryAt: state.retry_at }) }
                  : {}),
              }
            })
          }),
        disconnectAccount: (source, generation) =>
          lock
            .withPermit(
              Effect.gen(function* () {
                yield* disconnectAccount(credentials, owner, source, generation)
                if (source === "calendar")
                  yield* database.db.delete(InboxCalendarTable).where(eq(InboxCalendarTable.owner, owner)).run()
                if (source !== "jira")
                  yield* database.db
                    .delete(InboxAccountTable)
                    .where(and(eq(InboxAccountTable.owner, owner), eq(InboxAccountTable.source, source)))
                    .run()
              }),
            )
            .pipe(Effect.mapError(() => new InboxError({ reason: "unavailable" }))),
        githubPreferences: (input) =>
          lock
            .withPermit(
              Effect.gen(function* () {
                const result = yield* githubPreferences(credentials, owner, input)
                if (input)
                  yield* database.db
                    .update(InboxAccountTable)
                    .set({ state: "idle" })
                    .where(and(eq(InboxAccountTable.owner, owner), eq(InboxAccountTable.source, "github")))
                    .run()
                return result
              }),
            )
            .pipe(Effect.mapError(() => new InboxError({ reason: "unavailable" }))),
        calendarConfiguration: (input) =>
          slackOperation(
            Effect.gen(function* () {
              const result = yield* calendarConfiguration(credentials, owner, input)
              if (input) {
                const previous = yield* database.db
                  .select()
                  .from(InboxCalendarTable)
                  .where(eq(InboxCalendarTable.owner, owner))
                  .all()
                yield* Effect.forEach(
                  previous.filter(
                    (row) => row.generation !== result.generation || !result.selected.includes(row.calendar),
                  ),
                  (row) =>
                    database.db
                      .delete(InboxCalendarTable)
                      .where(
                        and(
                          eq(InboxCalendarTable.owner, owner),
                          eq(InboxCalendarTable.generation, row.generation),
                          eq(InboxCalendarTable.calendar, row.calendar),
                        ),
                      )
                      .run(),
                )
              }
              if (input)
                yield* database.db
                  .update(InboxAccountTable)
                  .set({ state: "idle" })
                  .where(and(eq(InboxAccountTable.owner, owner), eq(InboxAccountTable.source, "calendar")))
                  .run()
              return result
            }),
          ),
        discoverCalendars: (generation) =>
          slackOperation(discoverCalendars(credentials, owner, generation, options.workTransport)),
        notificationConfiguration: (source, input) =>
          lock
            .withPermit(
              Effect.gen(function* () {
                const result = yield* notificationConfiguration(credentials, owner, source, input)
                if (input)
                  yield* database.db
                    .update(InboxAccountTable)
                    .set({ state: "idle" })
                    .where(and(eq(InboxAccountTable.owner, owner), eq(InboxAccountTable.source, source)))
                    .run()
                return result
              }),
            )
            .pipe(Effect.mapError(() => new InboxError({ reason: "unavailable" }))),
        gitlabConfiguration: (input) =>
          lock
            .withPermit(
              Effect.gen(function* () {
                const result = yield* gitlabConfiguration(credentials, owner, input)
                if (input)
                  yield* database.db
                    .update(InboxAccountTable)
                    .set({ state: "idle" })
                    .where(and(eq(InboxAccountTable.owner, owner), eq(InboxAccountTable.source, "gitlab")))
                    .run()
                return result
              }),
            )
            .pipe(Effect.mapError(() => new InboxError({ reason: "unavailable" }))),
        communicationConfiguration: (source, input) =>
          lock
            .withPermit(
              Effect.gen(function* () {
                const result = yield* communicationConfiguration(credentials, owner, source, input)
                if (input)
                  yield* database.db
                    .update(InboxAccountTable)
                    .set({ state: "idle" })
                    .where(and(eq(InboxAccountTable.owner, owner), eq(InboxAccountTable.source, source)))
                    .run()
                return result
              }),
            )
            .pipe(Effect.mapError(() => new InboxError({ reason: "unavailable" }))),
        discoverCommunication: (source, generation) =>
          lock
            .withPermit(discoverCommunication(credentials, owner, source, generation, options.workTransport))
            .pipe(Effect.mapError(() => new InboxError({ reason: "unavailable" }))),
        syncWork: (source, generation) =>
          lock.withPermit(
            Effect.gen(function* () {
              const account = (yield* accounts(credentials, owner)).find((account) => account.source === source)!
              if (!account.connected) return yield* new InboxError({ reason: "unavailable" })
              if (generation !== undefined && generation !== account.generation)
                return yield* new InboxError({ reason: "unavailable" })
              const previous = yield* database.db
                .select()
                .from(InboxAccountTable)
                .where(and(eq(InboxAccountTable.owner, owner), eq(InboxAccountTable.source, source)))
                .get()
                .pipe(Effect.orDie)
              if (previous?.retry_at && previous.retry_at > Date.now())
                return {
                  ...account,
                  state: "rate_limited" as const,
                  checkedAt: previous.checked_at,
                  retryAt: previous.retry_at,
                }
              const collection =
                source === "calendar"
                  ? collectCalendar(credentials, owner, options.workTransport).pipe(
                      Effect.map((calendars) => ({ items: [] as Pulled[], calendars })),
                    )
                  : collectWork(credentials, owner, source, options.workTransport).pipe(
                      Effect.map((items) => ({ items, calendars: [] })),
                    )
              const result = yield* collection.pipe(
                Effect.map((data) => ({ ...data, state: "synced" as const, retryAt: undefined as number | undefined })),
                Effect.catch((error) =>
                  Effect.succeed({
                    items: [] as Pulled[],
                    calendars: [],
                    state:
                      error instanceof Failure && (error.rateLimited || error.status === 429)
                        ? ("rate_limited" as const)
                        : ("failed" as const),
                    retryAt:
                      error instanceof Failure && (error.rateLimited || error.status === 429)
                        ? Date.now() + (error.retryAfterMs ?? 60_000)
                        : undefined,
                  }),
                ),
              )
              const checkedAt = Date.now()
              yield* database.db
                .transaction((tx) =>
                  Effect.gen(function* () {
                    if (result.state === "synced") {
                      const saved = yield* load(tx, owner)
                      const people = yield* loadPeople(tx)
                      const store = open(people, saved, () => `in_${randomUUID()}`)
                      for (const calendar of result.calendars) {
                        const condition = and(
                          eq(InboxCalendarTable.owner, owner),
                          eq(InboxCalendarTable.generation, calendar.generation),
                          eq(InboxCalendarTable.calendar, calendar.calendar),
                        )
                        const previous = yield* tx.select().from(InboxCalendarTable).where(condition).get()
                        const reconciled = yield* Effect.try({
                          try: () =>
                            reconcileCalendar(
                              previous?.events,
                              calendar.events,
                              `scoped:calendar:${calendar.generation}:${encodeURIComponent(calendar.calendar)}`,
                            ),
                          catch: () => new InboxError({ reason: "unavailable" }),
                        })
                        reconciled.items.forEach((item) => store.upsert(item))
                        const value = {
                          owner,
                          generation: calendar.generation,
                          calendar: calendar.calendar,
                          events: reconciled.events,
                        }
                        yield* tx
                          .insert(InboxCalendarTable)
                          .values(value)
                          .onConflictDoUpdate({
                            target: [
                              InboxCalendarTable.owner,
                              InboxCalendarTable.generation,
                              InboxCalendarTable.calendar,
                            ],
                            set: value,
                          })
                          .run()
                      }
                      result.items.forEach((item) => store.upsert(item))
                      yield* save(tx, owner, store.snapshot())
                    }
                    const value = {
                      owner,
                      source,
                      state: result.state,
                      checked_at: checkedAt,
                      retry_at: result.retryAt ?? null,
                    }
                    yield* tx
                      .insert(InboxAccountTable)
                      .values(value)
                      .onConflictDoUpdate({ target: [InboxAccountTable.owner, InboxAccountTable.source], set: value })
                      .run()
                  }),
                )
                .pipe(Effect.orDie)
              return {
                ...account,
                state: result.state,
                checkedAt,
                ...(result.retryAt === undefined ? {} : { retryAt: result.retryAt }),
              }
            }),
          ),
        slackStart: () => slack.start(owner).pipe(Effect.mapError(() => new InboxError({ reason: "unavailable" }))),
        slackStatus: (id) => slack.status(owner, id),
        slackCancel: (id) => slack.cancel(owner, id),
        slackDisconnect: () =>
          slack.disconnect(owner).pipe(Effect.mapError(() => new InboxError({ reason: "unavailable" }))),
        slackScope: () => slackOperation(sync.scope()),
        slackDiscover: (generation, cursor) => slackOperation(sync.discover(generation, cursor)),
        slackSelect: (generation, selected) => slackOperation(sync.select(generation, selected)),
        slackSync: (generation) => slackOperation(sync.sync(generation)),
      })
    }),
  )

export const node = makeLocationNode({
  service: Service,
  layer: layer(),
  deps: [Database.node, Location.node, Credential.node, SlackAuth.node],
})

type Db = Database.Interface["db"]
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

function known(store: ReturnType<typeof open>, id: string) {
  return store.snapshot().rows.some((row) => row.listId === id)
}

function load(db: Db | Tx, owner: string) {
  return Effect.gen(function* () {
    const rows = yield* db.select().from(InboxRowTable).where(eq(InboxRowTable.owner, owner)).all().pipe(Effect.orDie)
    const drafts = yield* db
      .select()
      .from(InboxDraftTable)
      .where(eq(InboxDraftTable.owner, owner))
      .all()
      .pipe(Effect.orDie)
    const sent = yield* db
      .select()
      .from(InboxEgressTable)
      .where(eq(InboxEgressTable.owner, owner))
      .all()
      .pipe(Effect.orDie)
    const next = rows.reduce((highest, row) => {
      const value = Number(row.list_id.slice("in_".length))
      return Number.isInteger(value) && value >= highest ? value + 1 : highest
    }, 1)
    const saved: Saved = {
      rows: rows.map((row) => ({
        listId: row.list_id,
        source: row.source,
        externalId: row.external_id,
        actor: row.actor,
        snippet: row.snippet,
        ...(row.revision === null ? {} : { revision: row.revision }),
        threadId: row.thread_id,
        reply: row.reply,
        ...(row.deep_link ? { deepLink: row.deep_link } : {}),
        ...(row.person_id ? { personId: row.person_id } : {}),
        ...(row.commitment_id ? { commitmentId: row.commitment_id } : {}),
        open: row.open,
        ...(row.reveal_at !== null ? { revealAt: row.reveal_at } : {}),
      })),
      drafts: drafts.map((row) => ({ id: row.list_id, text: row.text, sent: row.sent })),
      sent: sent.map((row) => ({ text: row.text, threadId: row.thread_id, listId: row.list_id })),
      next,
    }
    return saved
  })
}

function save(tx: Tx, owner: string, saved: Saved) {
  return Effect.gen(function* () {
    yield* tx.delete(InboxRowTable).where(eq(InboxRowTable.owner, owner)).run()
    yield* tx.delete(InboxDraftTable).where(eq(InboxDraftTable.owner, owner)).run()
    yield* tx.delete(InboxEgressTable).where(eq(InboxEgressTable.owner, owner)).run()
    if (saved.rows.length > 0)
      yield* tx
        .insert(InboxRowTable)
        .values(
          saved.rows.map((row) => ({
            owner,
            source: row.source,
            external_id: row.externalId,
            list_id: row.listId,
            actor: row.actor,
            snippet: row.snippet,
            revision: row.revision ?? null,
            thread_id: row.threadId,
            reply: row.reply,
            deep_link: row.deepLink ?? null,
            person_id: row.personId ?? null,
            commitment_id: row.commitmentId ?? null,
            open: row.open,
            reveal_at: row.revealAt ?? null,
          })),
        )
        .run()
    if (saved.drafts.length > 0)
      yield* tx
        .insert(InboxDraftTable)
        .values(saved.drafts.map((draft) => ({ owner, list_id: draft.id, text: draft.text, sent: draft.sent })))
        .run()
    if (saved.sent.length > 0)
      yield* tx
        .insert(InboxEgressTable)
        .values(
          saved.sent.map((row, index) => ({
            owner,
            id: `eg_${index}`,
            list_id: row.listId,
            text: row.text,
            thread_id: row.threadId,
          })),
        )
        .run()
  }).pipe(Effect.orDie)
}

function loadPeople(db: Db | Tx) {
  return Effect.gen(function* () {
    const rows = yield* db.select().from(MeetingPersonTable).all().pipe(Effect.orDie)
    const items = yield* db
      .select()
      .from(MeetingItemTable)
      .where(eq(MeetingItemTable.kind, "commitment"))
      .all()
      .pipe(Effect.orDie)
    const people = new Map(rows.map((row) => [row.id, row]))
    const newest = items.reduce((found, item) => {
      const current = found.get(item.id)
      if (!current || item.revision > current.revision) found.set(item.id, item)
      return found
    }, new Map<string, (typeof items)[number]>())
    return addressBook(people, [...newest.values()])
  })
}

function addressBook(
  people: Map<string, typeof MeetingPersonTable.$inferSelect>,
  items: (typeof MeetingItemTable.$inferSelect)[],
): Person[] {
  const openCommitments = new Map(
    items
      .filter((item) => item.state === "proposed" || item.state === "accepted" || item.state === "overdue")
      .flatMap((item) =>
        [item.owner, item.counterparty]
          .filter((id): id is string => id !== null && id !== "me")
          .map((id) => [canonical(people, id), item.id] as const),
      ),
  )
  const grouped = new Map<string, { emails: string[]; handles: string[] }>()
  for (const row of people.values()) {
    const id = canonical(people, row.id)
    const bucket = grouped.get(id) ?? { emails: [], handles: [] }
    for (const name of [row.name, ...row.aliases]) {
      if (name.includes("@")) bucket.emails.push(name)
      else bucket.handles.push(name)
    }
    grouped.set(id, bucket)
  }
  return [...grouped.entries()].map(([id, bucket]) => ({
    id,
    emails: bucket.emails,
    handles: bucket.handles,
    ...(openCommitments.has(id) ? { openCommitmentId: openCommitments.get(id) } : {}),
  }))
}
