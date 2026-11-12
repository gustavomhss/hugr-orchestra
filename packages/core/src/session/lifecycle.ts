export * as SessionLifecycle from "./lifecycle"

import { eq } from "drizzle-orm"
import { DateTime, Effect, Option } from "effect"
import { Database } from "../database/database"
import { EventV2 } from "../event"
import { SessionEvent } from "./event"
import type { SessionExecution } from "./execution"
import type { SessionRunCoordinator } from "./run-coordinator"
import { SessionSchema } from "./schema"
import { SessionTable } from "./sql"
import { KeyedMutex } from "../effect/keyed-mutex"

// These guards coordinate this process's child admission and recursive deletion; execution ownership remains separate.
const parents = KeyedMutex.makeUnsafe<SessionSchema.ID>()
export const withParent = <A, E, R>(sessionID: SessionSchema.ID, effect: Effect.Effect<A, E, R>) =>
  parents.withLock(sessionID)(effect)

/** Freeze child admission recursively. Never wait for execution/drain ownership inside this guard. */
export const withTree = <A, E, R>(
  db: Database.Interface["db"],
  sessionID: SessionSchema.ID,
  use: (ids: ReadonlyArray<SessionSchema.ID>) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> => withParent(sessionID, Effect.gen(function* () {
  const children = yield* db.select({ id: SessionTable.id }).from(SessionTable)
    .where(eq(SessionTable.parent_id, sessionID)).all().pipe(Effect.orDie)
  const hold = (index: number, ids: ReadonlyArray<SessionSchema.ID>): Effect.Effect<A, E, R> =>
    index === children.length ? use(ids)
      : withTree(db, children[index].id, (nested) => hold(index + 1, [...ids, ...nested]))
  return yield* hold(0, [sessionID])
}))

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

/** Every child, grandchild and so on of the Session, parents before their children. */
export const descendants: (
  db: Database.Interface["db"],
  sessionID: SessionSchema.ID,
) => Effect.Effect<SessionSchema.ID[]> = Effect.fn("SessionLifecycle.descendants")(function* (db, sessionID) {
  const children = yield* db
    .select({ id: SessionTable.id })
    .from(SessionTable)
    .where(eq(SessionTable.parent_id, sessionID))
    .all()
    .pipe(Effect.orDie)
  const nested = yield* Effect.forEach(children, (child) => descendants(db, child.id))
  return [...children.map((child) => child.id), ...nested.flat()]
})

/**
 * Interrupts the run of every Session in `ids`, then holds each one as a drain would while `effect` runs. A wake that
 * lands between the interrupt and the hold starts a fresh drain, so the hold fails with None and the stop repeats.
 */
export const stopped = <A, E>(
  execution: SessionExecution.Interface,
  ids: ReadonlyArray<SessionSchema.ID>,
  effect: Effect.Effect<A, E>,
  options?: SessionRunCoordinator.InterruptOptions,
): Effect.Effect<A, E> =>
  ids.reduceRight(
    (inner, id): Effect.Effect<A, E> =>
      Effect.uninterruptible(execution.interrupt(id, options)).pipe(
        Effect.andThen(execution.exclusive(id, inner, options)),
        Effect.flatMap(
          Option.match({
            onNone: () => stopped(execution, [id], inner, options),
            onSome: Effect.succeed,
          }),
        ),
      ),
    effect,
  )

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
