import { and, asc, desc, eq, gt, gte, ne, or } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { Database } from "../database/database"
import { MessageDecodeError } from "./error"
import { SessionMessage } from "./message"
import { SessionSchema } from "./schema"
import { SessionContextEpochTable, SessionMessageTable } from "./sql"

type DatabaseService = Database.Interface["db"]

const decode = Schema.decodeUnknownEffect(SessionMessage.Message)

export const latestCompaction = Effect.fnUntraced(function* (db: DatabaseService, sessionID: SessionSchema.ID) {
  return yield* db
    .select({ seq: SessionMessageTable.seq })
    .from(SessionMessageTable)
    .where(and(eq(SessionMessageTable.session_id, sessionID), eq(SessionMessageTable.type, "compaction")))
    .orderBy(desc(SessionMessageTable.seq))
    .limit(1)
    .get()
    .pipe(Effect.orDie)
})

const messageRows = Effect.fnUntraced(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  compaction: { readonly seq: number } | undefined,
  baselineSeq?: number,
  notBefore?: number,
) {
  const rows = yield* db
    .select()
    .from(SessionMessageTable)
    .where(
      and(
        eq(SessionMessageTable.session_id, sessionID),
        compaction
          ? or(
              gte(SessionMessageTable.seq, compaction.seq),
              baselineSeq === undefined
                ? undefined
                : and(eq(SessionMessageTable.type, "system"), gt(SessionMessageTable.seq, baselineSeq)),
            )
          : undefined,
        baselineSeq === undefined
          ? undefined
          : or(ne(SessionMessageTable.type, "system"), gt(SessionMessageTable.seq, baselineSeq)),
        notBefore === undefined ? undefined : gte(SessionMessageTable.seq, notBefore),
      ),
    )
    .orderBy(asc(SessionMessageTable.seq))
    .all()
    .pipe(Effect.orDie)
  return rows
})

const decodeMessageRow = (row: typeof SessionMessageTable.$inferSelect) =>
  decode({ ...row.data, id: row.id, type: row.type }).pipe(
    Effect.mapError(
      () =>
        new MessageDecodeError({
          sessionID: SessionSchema.ID.make(row.session_id),
          messageID: SessionMessage.ID.make(row.id),
        }),
    ),
  )

export const load = Effect.fn("SessionHistory.load")(function* (db: DatabaseService, sessionID: SessionSchema.ID) {
  const [epoch, compaction] = yield* Effect.all(
    [
      db
        .select({ baselineSeq: SessionContextEpochTable.baseline_seq })
        .from(SessionContextEpochTable)
        .where(eq(SessionContextEpochTable.session_id, sessionID))
        .get()
        .pipe(Effect.orDie),
      latestCompaction(db, sessionID),
    ],
    { concurrency: "unbounded" },
  )
  return yield* Effect.forEach(yield* messageRows(db, sessionID, compaction, epoch?.baselineSeq), decodeMessageRow)
})

/** Every stored message of the Session in order, compacted history included. */
export const loadAll = Effect.fn("SessionHistory.loadAll")(function* (db: DatabaseService, sessionID: SessionSchema.ID) {
  return yield* Effect.forEach(yield* messageRows(db, sessionID, undefined), decodeMessageRow)
})

export const loadForRunner = Effect.fn("SessionHistory.loadForRunner")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  baselineSeq: number,
) {
  return (yield* entriesForRunner(db, sessionID, baselineSeq)).map((entry) => entry.message)
})

type RunnerEntry = { seq: number; message: SessionMessage.Message }

// One decoded window per live session. A later read re-decodes from the last seq, which is the row a
// step updates in place, plus anything appended. An older row is not refreshed; compaction changes the key.
const runnerWindows = new WeakMap<object, Map<string, { baselineSeq: number; compactionSeq: number | undefined; entries: RunnerEntry[] }>>()

function sessionWindows(db: DatabaseService) {
  const existing = runnerWindows.get(db)
  if (existing) return existing
  const created = new Map<string, { baselineSeq: number; compactionSeq: number | undefined; entries: RunnerEntry[] }>()
  runnerWindows.set(db, created)
  return created
}

function rememberRunnerWindow(db: DatabaseService, sessionID: string, baselineSeq: number, compactionSeq: number | undefined, entries: RunnerEntry[]) {
  const windows = sessionWindows(db)
  windows.delete(sessionID)
  windows.set(sessionID, { baselineSeq, compactionSeq, entries })
  const oldest = windows.keys().next().value
  if (windows.size > 4 && oldest !== undefined) windows.delete(oldest)
}

const decodeRunnerRows = (rows: readonly (typeof SessionMessageTable.$inferSelect)[]) =>
  Effect.forEach(rows, (row) => decodeMessageRow(row).pipe(Effect.map((message) => ({ seq: row.seq, message }))))

export const entriesForRunner = Effect.fn("SessionHistory.entriesForRunner")(function* (
  db: DatabaseService,
  sessionID: SessionSchema.ID,
  baselineSeq: number,
) {
  const compaction = yield* latestCompaction(db, sessionID)
  const cached = sessionWindows(db).get(sessionID)
  const boundary = cached?.entries[cached.entries.length - 1]
  if (cached && cached.baselineSeq === baselineSeq && cached.compactionSeq === compaction?.seq && boundary) {
    const rows = yield* messageRows(db, sessionID, compaction, baselineSeq, boundary.seq)
    if (rows[0]?.seq === boundary.seq) {
      const tail = yield* decodeRunnerRows(rows)
      const entries = [...cached.entries.filter((entry) => entry.seq < boundary.seq), ...tail]
      rememberRunnerWindow(db, sessionID, baselineSeq, compaction?.seq, entries)
      return entries
    }
  }
  const entries = yield* decodeRunnerRows(yield* messageRows(db, sessionID, compaction, baselineSeq))
  rememberRunnerWindow(db, sessionID, baselineSeq, compaction?.seq, entries)
  return entries
})

export * as SessionHistory from "./history"
