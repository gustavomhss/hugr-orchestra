import { Effect, Schema, Stream } from "effect"
import { and, asc, desc, eq, gt, lt } from "drizzle-orm"
import { EventV2 } from "../event"
import type { Database } from "../database/database"
import type { Interface } from "../session"
import { SessionDurable } from "@orchestra/schema/durable-event-manifest"
import { MessageDecodeError } from "./error"
import { SessionEvent } from "./event"
import { SessionMessage } from "./message"
import { SessionSchema } from "./schema"
import { SessionMessageTable } from "./sql"
import type { SessionStore } from "./store"

export function makeRead(input: {
  db: Database.Interface["db"]
  events: EventV2.Interface
  store: SessionStore.Interface
  get: Interface["get"]
}) {
  const db = input.db
  const store = input.store
  const events = input.events
  const get = input.get
  const decodeMessage = Schema.decodeUnknownEffect(SessionMessage.Message)
  const isDurableSessionEvent = Schema.is(SessionEvent.Durable)
  const decode = (row: typeof SessionMessageTable.$inferSelect) =>
    decodeMessage({ ...row.data, id: row.id, type: row.type }).pipe(
      Effect.mapError(
        () =>
          new MessageDecodeError({
            sessionID: SessionSchema.ID.make(row.session_id),
            messageID: SessionMessage.ID.make(row.id),
          }),
      ),
    )

  const api: Pick<Interface, "messages" | "message" | "context" | "events" | "history"> = {
    messages: Effect.fn("V2Session.messages")(function* (input) {
      yield* get(input.sessionID)
      const direction = input.cursor?.direction ?? "next"
      const requestedOrder = input.order ?? "desc"
      const order = direction === "previous" ? (requestedOrder === "asc" ? "desc" : "asc") : requestedOrder
      const anchor = input.cursor
        ? yield* db
            .select({ seq: SessionMessageTable.seq })
            .from(SessionMessageTable)
            .where(
              and(eq(SessionMessageTable.session_id, input.sessionID), eq(SessionMessageTable.id, input.cursor.id)),
            )
            .get()
            .pipe(Effect.orDie)
        : undefined
      if (input.cursor && !anchor) return []
      const boundary = anchor
        ? order === "asc"
          ? gt(SessionMessageTable.seq, anchor.seq)
          : lt(SessionMessageTable.seq, anchor.seq)
        : undefined
      const where = boundary
        ? and(eq(SessionMessageTable.session_id, input.sessionID), boundary)
        : eq(SessionMessageTable.session_id, input.sessionID)
      const query = db
        .select()
        .from(SessionMessageTable)
        .where(where)
        .orderBy(order === "asc" ? asc(SessionMessageTable.seq) : desc(SessionMessageTable.seq))
      const rows = yield* (input.limit === undefined ? query.all() : query.limit(input.limit).all()).pipe(
        Effect.orDie,
      )
      return yield* Effect.forEach(direction === "previous" ? rows.toReversed() : rows, decode)
    }),
    message: Effect.fn("V2Session.message")(function* (input) {
      const stored = yield* store.message(input.messageID)
      return stored?.sessionID === input.sessionID ? stored.message : undefined
    }),
    context: Effect.fn("V2Session.context")(function* (sessionID) {
      yield* get(sessionID)
      return yield* store.context(sessionID)
    }),
    events: (input) =>
      Stream.unwrap(
        get(input.sessionID)
          .pipe(Effect.as(events.durable({ aggregateID: input.sessionID, after: input.after }))),
      ).pipe(Stream.filter((event): event is SessionEvent.DurableEvent => isDurableSessionEvent(event))),
    history: Effect.fn("V2Session.history")(function* (input) {
      yield* get(input.sessionID)
      return yield* EventV2.readAggregate(db, {
        ...input,
        aggregateID: input.sessionID,
        manifest: SessionDurable,
      })
    }),
  }
  return { decode, api }
}
