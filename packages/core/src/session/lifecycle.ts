export * as SessionLifecycle from "./lifecycle"

import { eq } from "drizzle-orm"
import { DateTime, Effect } from "effect"
import { Database } from "../database/database"
import { EventV2 } from "../event"
import { SessionEvent } from "./event"
import { SessionSchema } from "./schema"
import { SessionTable } from "./sql"

const defaultTitle = /^(New session - |Child session - )\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

/** A title a Session got at creation, before anyone or the `title` agent named it. */
export const isDefaultTitle = (title: string) => defaultTitle.test(title)

/** Returns false only when the Session is missing. */
export const rename = Effect.fn("SessionLifecycle.rename")(function* (
  db: Database.Interface["db"],
  events: EventV2.Interface,
  input: { readonly sessionID: SessionSchema.ID; readonly title: string },
) {
  if (!(yield* exists(db, input.sessionID))) return false
  yield* events.publish(SessionEvent.Renamed, {
    sessionID: input.sessionID,
    timestamp: yield* DateTime.now,
    title: input.title,
  })
  return true
})

/** Deletes the Session and its children. Messages, parts and inputs cascade with the row. Returns false when missing. */
export const remove: (
  db: Database.Interface["db"],
  events: EventV2.Interface,
  sessionID: SessionSchema.ID,
) => Effect.Effect<boolean> = Effect.fn("SessionLifecycle.remove")(function* (db, events, sessionID) {
  if (!(yield* exists(db, sessionID))) return false
  const children = yield* db
    .select({ id: SessionTable.id })
    .from(SessionTable)
    .where(eq(SessionTable.parent_id, sessionID))
    .all()
    .pipe(Effect.orDie)
  yield* Effect.forEach(children, (child) => remove(db, events, child.id), { discard: true })
  yield* events.publish(SessionEvent.Deleted, { sessionID, timestamp: yield* DateTime.now })
  yield* events.remove(sessionID)
  return true
})

function exists(db: Database.Interface["db"], sessionID: SessionSchema.ID) {
  return db
    .select({ id: SessionTable.id })
    .from(SessionTable)
    .where(eq(SessionTable.id, sessionID))
    .get()
    .pipe(
      Effect.orDie,
      Effect.map((row) => row !== undefined),
    )
}
