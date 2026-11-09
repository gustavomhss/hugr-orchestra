import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { Inbox } from "@orchestra/schema/inbox"
import type { Database } from "../database/database"
import type { SlackAuth } from "./slack-auth"
import { decode, Failure, type Request } from "../capability/channel/http"
import { InboxSlackTable } from "./sql"
import type { Pulled } from "./types"

const Job = Schema.Struct({
  channel: Schema.String,
  thread: Schema.optionalKey(Schema.String),
  cursor: Schema.String,
  seen: Schema.Array(Schema.String),
})
const Saved = Schema.Struct({
  ...Inbox.SlackScope.fields,
  jobs: Schema.Array(Job),
  oldest: Schema.String,
  latest: Schema.String,
  pages: Schema.Int,
  discoverySeen: Schema.optionalKey(Schema.Array(Schema.String)),
})
export type SlackSaved = typeof Saved.Type
type Db = Database.Interface["db"]
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0]

const Conversation = Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^[CDG][A-Z0-9]+$/)),
  name: Schema.optionalKey(Schema.String),
  user: Schema.optionalKey(Schema.String),
  is_im: Schema.optionalKey(Schema.Boolean),
  is_mpim: Schema.optionalKey(Schema.Boolean),
  is_private: Schema.optionalKey(Schema.Boolean),
  is_archived: Schema.optionalKey(Schema.Boolean),
})
const Message = Schema.Struct({
  ts: Schema.String.check(Schema.isPattern(/^\d+\.\d+$/)),
  text: Schema.optionalKey(Schema.String),
  user: Schema.optionalKey(Schema.String),
  bot_id: Schema.optionalKey(Schema.String),
  thread_ts: Schema.optionalKey(Schema.String),
  reply_count: Schema.optionalKey(Schema.Int),
})
const Paging = {
  ok: Schema.Literal(true),
  response_metadata: Schema.optionalKey(Schema.Struct({ next_cursor: Schema.optionalKey(Schema.String) })),
}

// Small provider adapter. Each explicit sync step acquires one bounded page and commits its items and cursor
// together; restarting the renderer/process does not discard work or turn unfinished pagination into success.
export function makeSlackSync(input: {
  db: Db
  auth: ReturnType<typeof SlackAuth.make>
  owner: string
  commit: (tx: Tx, items: readonly Pulled[]) => Effect.Effect<void>
}) {
  const load = (generation: string) =>
    Effect.gen(function* () {
      const row = yield* input.db.select().from(InboxSlackTable).where(eq(InboxSlackTable.owner, input.owner)).get()
      if (row?.value.generation === generation) return yield* decode(Saved, row.value)
      return {
        generation,
        conversations: [],
        selected: [],
        state: "idle",
        jobs: [],
        oldest: "",
        latest: "",
        pages: 0,
      } satisfies SlackSaved
    })
  const save = (tx: Db | Tx, value: SlackSaved) =>
    tx
      .insert(InboxSlackTable)
      .values({ owner: input.owner, value })
      .onConflictDoUpdate({ target: InboxSlackTable.owner, set: { value } })
      .run()
  const call = (
    rpc: (input: Request) => Effect.Effect<Schema.Json, Failure>,
    method: string,
    query: Record<string, string | number | boolean | undefined>,
  ) => rpc({ method: "GET", path: `/api/${method}`, query })
  const publicScope = (value: SlackSaved): Inbox.SlackScope => ({
    generation: value.generation,
    conversations: value.conversations,
    selected: value.selected,
    state: value.state,
    ...(value.cursor ? { cursor: value.cursor } : {}),
    ...(value.retryAt === undefined ? {} : { retryAt: value.retryAt }),
    ...(value.syncedAt === undefined ? {} : { syncedAt: value.syncedAt }),
  })
  return {
    scope: () =>
      input.auth.withConnection(input.owner, undefined, (connection) =>
        load(connection.generation).pipe(Effect.map(publicScope)),
      ),
    discover: (generation: string, cursor?: string) =>
      input.auth.withConnection(input.owner, generation, (connection) =>
        Effect.gen(function* () {
          const current = yield* load(generation)
          if (cursor && cursor !== current.cursor) return yield* new Failure({ reason: "invalid_response" })
          const raw = yield* call(connection.rpc, "users.conversations", {
            types: "public_channel,private_channel,im,mpim",
            exclude_archived: true,
            limit: 200,
            cursor,
          })
          const page = yield* decode(Schema.Struct({ ...Paging, channels: Schema.Array(Conversation) }), raw)
          const next = page.response_metadata?.next_cursor || undefined
          const seen = cursor ? (current.discoverySeen ?? []) : []
          if ((next && (next === cursor || seen.includes(next))) || seen.length >= 1000)
            return yield* new Failure({ reason: "invalid_response" })
          const conversations = [
            ...new Map(
              [
                ...(cursor ? current.conversations : []),
                ...page.channels
                  .filter((channel) => !channel.is_archived)
                  .map(
                    (channel): Inbox.SlackConversation => ({
                      id: channel.id,
                      name: channel.name || channel.user || channel.id,
                      kind: channel.is_im
                        ? "direct"
                        : channel.is_mpim
                          ? "group"
                          : channel.is_private
                            ? "private"
                            : "channel",
                    }),
                  ),
              ].map((channel) => [channel.id, channel]),
            ).values(),
          ]
          if (conversations.length > 10_000) return yield* new Failure({ reason: "response_limit" })
          const value = { ...current, conversations, cursor: next, discoverySeen: next ? [...seen, next] : [] }
          yield* save(input.db, value)
          return publicScope(value)
        }),
      ),
    select: (generation: string, selected: readonly string[]) =>
      input.auth.withConnection(input.owner, generation, () =>
        Effect.gen(function* () {
          const current = yield* load(generation)
          if (
            selected.length > 200 ||
            new Set(selected).size !== selected.length ||
            selected.some((id) => !current.conversations.some((conversation) => conversation.id === id))
          )
            return yield* new Failure({ reason: "invalid_response" })
          const retryAt = (current.retryAt ?? 0) > Date.now() ? current.retryAt : undefined
          const value: SlackSaved = {
            ...current,
            selected: [...selected],
            jobs: [],
            state: selected.length && retryAt ? "rate_limited" : "idle",
            pages: 0,
            retryAt,
            syncedAt: undefined,
          }
          yield* save(input.db, value)
          return publicScope(value)
        }),
      ),
    sync: (generation: string) =>
      input.auth.withConnection(input.owner, generation, (connection) =>
        Effect.gen(function* () {
          const current = yield* load(generation)
          if (!current.selected.length || (current.retryAt ?? 0) > Date.now()) return publicScope(current)
          const value: SlackSaved = current.jobs.length
            ? current
            : {
                ...current,
                jobs: current.selected.map((channel) => ({ channel, cursor: "", seen: [] })),
                oldest: String(Math.floor(Date.now() / 1000) - 7 * 86400),
                latest: String(Date.now() / 1000),
                pages: 0,
                state: "pending",
                retryAt: undefined,
              }
          const job = value.jobs[0]!
          const step = Effect.gen(function* () {
            if (value.pages >= 1000) return yield* new Failure({ reason: "response_limit" })
            const raw = yield* call(connection.rpc, job.thread ? "conversations.replies" : "conversations.history", {
              channel: job.channel,
              ts: job.thread,
              oldest: job.thread ? undefined : value.oldest,
              latest: value.latest,
              inclusive: true,
              cursor: job.cursor || undefined,
              limit: 100,
            })
            const page = yield* decode(
              Schema.Struct({
                ...Paging,
                messages: Schema.Array(Message),
                has_more: Schema.optionalKey(Schema.Boolean),
                is_limited: Schema.optionalKey(Schema.Boolean),
              }),
              raw,
            )
            if (page.is_limited) return { ...value, state: "limited" as const }
            const cursor = page.response_metadata?.next_cursor || ""
            if ((page.has_more && !cursor) || (cursor && (cursor === job.cursor || job.seen.includes(cursor))))
              return yield* new Failure({ reason: "invalid_response" })
            const threads = job.thread
              ? []
              : page.messages
                  .filter((message) => (message.reply_count ?? 0) > 0)
                  .map((message) => ({ channel: job.channel, thread: message.ts, cursor: "", seen: [] }))
            const remaining = cursor
              ? [{ ...job, cursor, seen: [...job.seen, cursor] }, ...value.jobs.slice(1)]
              : value.jobs.slice(1)
            const jobs = [
              ...remaining,
              ...threads.filter(
                (thread) =>
                  !remaining.some((entry) => entry.channel === thread.channel && entry.thread === thread.thread),
              ),
            ]
            if (jobs.length > 2000) return yield* new Failure({ reason: "response_limit" })
            const items = page.messages
              .filter((message) => message.text && (message.user || message.bot_id))
              .map(
                (message): Pulled => ({
                  source: "slack",
                  externalId: `oauth:${generation}:${job.channel}:${message.ts}`,
                  actor: `slack:${connection.teamID}:${message.user || message.bot_id}`,
                  snippet: message.text!,
                  threadId: `oauth:${generation}:${job.channel}:${message.thread_ts || message.ts}`,
                  reply: false,
                  deepLink: `https://app.slack.com/client/${connection.teamID}/${job.channel}/thread/${job.channel}-${message.thread_ts || message.ts}`,
                }),
              )
            const next: SlackSaved = {
              ...value,
              jobs,
              pages: value.pages + 1,
              state: jobs.length ? "pending" : "synced",
              retryAt: undefined,
              ...(jobs.length ? {} : { syncedAt: Date.now() }),
            }
            yield* input.db.transaction((tx) =>
              Effect.gen(function* () {
                yield* input.commit(tx, items)
                yield* save(tx, next)
              }),
            )
            return next
          })
          const next = yield* step.pipe(
            Effect.catchDefect(() => Effect.succeed({ ...value, state: "failed" as const })),
            Effect.catch((error) =>
              Effect.succeed({
                ...value,
                state:
                  error instanceof Failure && error.status === 429 ? ("rate_limited" as const) : ("failed" as const),
                retryAt:
                  error instanceof Failure && error.status === 429
                    ? Date.now() + (error.retryAfterMs ?? 60_000)
                    : undefined,
              }),
            ),
          )
          // Failure/limited states retain the exact pending page; never advance a checkpoint on a failed write.
          if (next.state !== "pending" && next.state !== "synced") yield* save(input.db, next)
          return publicScope(next)
        }),
      ),
  }
}
