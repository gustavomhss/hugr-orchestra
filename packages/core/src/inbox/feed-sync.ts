import { and, eq } from "drizzle-orm"
import { randomUUID } from "node:crypto"
import { Effect } from "effect"
import type { Inbox } from "@orchestra/schema/inbox"
import type { Database } from "../database/database"
import { Failure, type Options } from "../capability/channel/http"
import { feedAddress, fetchFeed, parseFeed, type FeedEntry } from "./feed"
import { InboxFeedTable } from "./sql"

type Db = Database.Interface["db"]
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]
type FeedRow = typeof InboxFeedTable.$inferSelect

export function makeFeedSync(input: {
  db: Db
  owner: string
  transport?: Options
  publish: (tx: Tx, row: FeedRow, entries: readonly FeedEntry[]) => Effect.Effect<void, unknown>
}) {
  const where = (id: string) => and(eq(InboxFeedTable.owner, input.owner), eq(InboxFeedTable.id, id))
  return {
    list: () =>
      input.db
        .select()
        .from(InboxFeedTable)
        .where(eq(InboxFeedTable.owner, input.owner))
        .all()
        .pipe(Effect.map((rows) => rows.map(publicFeed))),
    add: (value: Inbox.FeedInput) =>
      Effect.gen(function* () {
        const url = yield* Effect.try({
          try: () => feedAddress(value.source, value.url),
          catch: () => new Failure({ reason: "invalid_response" }),
        })
        const rows = yield* input.db.select().from(InboxFeedTable).where(eq(InboxFeedTable.owner, input.owner)).all()
        const current = rows.find((row) => row.source === value.source && row.url === url)
        if (current) return publicFeed(current)
        if (rows.length >= 50) return yield* new Failure({ reason: "response_limit" })
        const row: FeedRow = {
          owner: input.owner,
          id: randomUUID(),
          source: value.source,
          url,
          name: value.name ?? new URL(url).hostname,
          initialized: false,
          seen: [],
          etag: null,
          modified: null,
          state: "idle",
          checked_at: null,
          retry_at: null,
        }
        yield* input.db.insert(InboxFeedTable).values(row).run()
        return publicFeed(row)
      }),
    remove: (id: string) => input.db.delete(InboxFeedTable).where(where(id)).run().pipe(Effect.asVoid),
    sync: (id: string) =>
      Effect.gen(function* () {
        const row = yield* input.db.select().from(InboxFeedTable).where(where(id)).get()
        if (!row) return yield* new Failure({ reason: "invalid_response" })
        if (row.retry_at && row.retry_at > Date.now()) return publicFeed(row)
        const result = yield* fetchFeed(
          row.url,
          { etag: row.etag ?? undefined, modified: row.modified ?? undefined },
          input.transport,
        ).pipe(
          Effect.flatMap((response) =>
            Effect.gen(function* () {
              if (response.status === "not_modified" && !row.initialized)
                return yield* new Failure({ reason: "invalid_response" })
              const entries =
                response.status === "ok"
                  ? yield* Effect.try({
                      try: () => parseFeed(response.xml!, row.url),
                      catch: (error) =>
                        error instanceof Failure ? error : new Failure({ reason: "invalid_response" }),
                    })
                  : undefined
              const seen = [...new Set([...row.seen, ...(entries?.map((entry) => entry.id) ?? [])])]
              if (seen.length > 10_000 || Buffer.byteLength(JSON.stringify(seen)) > 1024 * 1024)
                return yield* new Failure({ reason: "response_limit" })
              return {
                entries,
                patch: {
                  initialized: true,
                  seen,
                  state: "synced" as const,
                  retry_at: null,
                  etag: response.status === "ok" ? (response.etag ?? null) : row.etag,
                  modified: response.status === "ok" ? (response.modified ?? null) : row.modified,
                },
              }
            }),
          ),
          Effect.catch((error) =>
            Effect.succeed({
              entries: undefined,
              patch: {
                initialized: row.initialized,
                seen: row.seen,
                etag: row.etag,
                modified: row.modified,
                state:
                  error instanceof Failure && (error.rateLimited || error.status === 429)
                    ? ("rate_limited" as const)
                    : ("failed" as const),
                retry_at:
                  error instanceof Failure && (error.rateLimited || error.status === 429)
                    ? Date.now() + (error.retryAfterMs ?? 60_000)
                    : null,
              },
            }),
          ),
        )
        const updated = { ...row, ...result.patch, checked_at: Date.now() }
        yield* input.db.transaction((tx) =>
          Effect.gen(function* () {
            if (result.entries) yield* input.publish(tx, row, result.entries)
            yield* tx.update(InboxFeedTable).set(updated).where(where(id)).run()
          }),
        )
        return publicFeed(updated)
      }),
  }
}

function publicFeed(row: FeedRow): Inbox.Feed {
  return {
    id: row.id,
    source: row.source,
    url: row.url,
    name: row.name,
    initialized: row.initialized,
    state: row.state,
    ...(row.checked_at === null ? {} : { checkedAt: row.checked_at }),
    ...(row.retry_at === null ? {} : { retryAt: row.retry_at }),
  }
}
