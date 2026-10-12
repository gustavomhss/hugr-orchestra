export * as SessionArchive from "./archive"

import { and, asc, desc, eq, gt, isNull, like, lt, or, sql, type SQL } from "drizzle-orm"
import { DateTime, Effect, Layer } from "effect"
import { Database } from "../database/database"
import { makeGlobalNode } from "../effect/app-node"
import { EventV2 } from "../event"
import type { ListInput } from "../session"
import { SessionEvent } from "./event"
import { fromRow } from "./info"
import { SessionSchema } from "./schema"
import { SessionTable } from "./sql"

/** Returns false only when the Session is missing. The caller owns its public NotFound error. */
export const set = Effect.fn("SessionArchive.set")(function* (
  db: Database.Interface["db"],
  events: EventV2.Interface,
  input: { readonly sessionID: SessionSchema.ID; readonly archived: boolean },
) {
  // Keep the read and event append under one write lock, including concurrent exact retries.
  return yield* db
    .transaction(
      () =>
        Effect.gen(function* () {
          const row = yield* db
            .select({ archived: SessionTable.time_archived })
            .from(SessionTable)
            .where(eq(SessionTable.id, input.sessionID))
            .get()
          if (!row) return false
          if ((row.archived !== null) === input.archived) return true
          const timestamp = yield* DateTime.now
          yield* events.publish(SessionEvent.ArchiveChanged, {
            sessionID: input.sessionID,
            timestamp,
            archived: input.archived ? timestamp : null,
          })
          return true
        }),
      { behavior: "immediate" },
    )
    .pipe(Effect.orDie)
})

/** Visibility is a SQL predicate, applied before pagination rather than trimming projected pages. */
export const list = Effect.fn("SessionArchive.list")(function* (db: Database.Interface["db"], input: ListInput = {}) {
  const direction = input.anchor?.direction ?? "next"
  const requestedOrder = input.order ?? "desc"
  const order = direction === "previous" ? (requestedOrder === "asc" ? "desc" : "asc") : requestedOrder
  const sortColumn = SessionTable.time_created
  const conditions: Array<SQL | undefined> = []
  if (!input.includeArchived) conditions.push(isNull(SessionTable.time_archived))
  if ("directory" in input) conditions.push(eq(SessionTable.directory, input.directory))
  if (input.workspaceID) conditions.push(eq(SessionTable.workspace_id, input.workspaceID))
  if ("project" in input) {
    conditions.push(eq(SessionTable.project_id, input.project))
    if (input.subpath)
      conditions.push(
        or(
          eq(SessionTable.path, input.subpath),
          sql`substr(${SessionTable.path}, 1, ${input.subpath.length + 1}) = ${`${input.subpath}/`}`,
        ),
      )
  }
  if (input.search) conditions.push(like(SessionTable.title, `%${input.search}%`))
  if (input.anchor)
    conditions.push(
      order === "asc"
        ? or(
            gt(sortColumn, input.anchor.time),
            and(eq(sortColumn, input.anchor.time), gt(SessionTable.id, input.anchor.id)),
          )
        : or(
            lt(sortColumn, input.anchor.time),
            and(eq(sortColumn, input.anchor.time), lt(SessionTable.id, input.anchor.id)),
          ),
    )
  const query = db
    .select()
    .from(SessionTable)
    .where(and(...conditions))
    .orderBy(
      order === "asc" ? asc(sortColumn) : desc(sortColumn),
      order === "asc" ? asc(SessionTable.id) : desc(SessionTable.id),
    )
  const rows = yield* (input.limit === undefined ? query.all() : query.limit(input.limit).all()).pipe(Effect.orDie)
  return (direction === "previous" ? rows.toReversed() : rows).map(fromRow)
})

const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2.Service
    yield* events.project(SessionEvent.ArchiveChanged, (event) =>
      Effect.gen(function* () {
        const updated = yield* database.db
          .update(SessionTable)
          .set({
            time_archived: event.data.archived === null ? null : DateTime.toEpochMillis(event.data.archived),
            time_updated: DateTime.toEpochMillis(event.data.timestamp),
          })
          .where(eq(SessionTable.id, event.data.sessionID))
          .returning({ id: SessionTable.id })
          .get()
          .pipe(Effect.orDie)
        if (!updated)
          return yield* Effect.die(new Error(`Archive projection Session not found: ${event.data.sessionID}`))
      }),
    )
  }),
)

export const node = makeGlobalNode({ name: "session-archive", layer, deps: [Database.node, EventV2.node] })
