export * as EventCompaction from "./compaction"

import { Effect } from "effect"
import { inArray, sql } from "drizzle-orm"
import { Event } from "@opencode-ai/schema/event"
import type { Database } from "../database/database"
import { EventTable } from "./sql"

export const SNAPSHOT_TYPES = ["message.updated", "message.part.updated"] as const
export const SNAPSHOT_COMPACTION_MARKER = "event_snapshot_compaction"

export function hasCompactedSnapshotEvents(db: Pick<Database.Interface["db"], "get">) {
  return Effect.gen(function* () {
    return Boolean(
      yield* db
        .get(
          sql`SELECT 1 WHERE EXISTS (SELECT 1 FROM data_migration WHERE name = ${SNAPSHOT_COMPACTION_MARKER}) OR EXISTS (SELECT 1 FROM event_sequence AS sequence WHERE NOT EXISTS (SELECT 1 FROM event WHERE aggregate_id = sequence.aggregate_id AND seq = 0) OR NOT EXISTS (SELECT 1 FROM event WHERE aggregate_id = sequence.aggregate_id AND seq = sequence.seq) OR EXISTS (SELECT 1 FROM event WHERE aggregate_id = sequence.aggregate_id GROUP BY aggregate_id HAVING COUNT(*) != MAX(seq) - MIN(seq) + 1))`,
        )
        .pipe(Effect.orDie),
    )
  })
}

/**
 * Compact snapshot-like durable events, keeping only the latest occurrence per
 * (aggregate, type, entity) and deleting intermediate full-state copies.
 *
 * These events carry the complete message/part payload on every update, so a
 * single message renders N rows whose payloads are total supersets of their
 * predecessors. Replaying the retained latest row reproduces the identical
 * final projection (the projector upserts by id), while intermediate rows are
 * pure write amplification.
 *
 * Deleting rows leaves `seq` gaps. Compaction records a durable marker in the
 * same transaction so workspace sync can permanently refuse unsafe replay.
 *
 * Non-snapshot lifecycle rows (`session.created`, `message.removed`,
 * `message.part.delta`, ...) are never touched, and `event_sequence` is left
 * at its current high-water mark.
 */
export const compactSnapshotEvents = Effect.fn("EventV2.compactSnapshotEvents")(function* (
  db: Database.Interface["db"],
) {
  if (yield* hasCompactedSnapshotEvents(db))
    return yield* Effect.die(
      new Error("Snapshot compaction already ran; refusing to compact a database that may have sync sequence gaps."),
    )
  const snapshotTypes = SNAPSHOT_TYPES.map((type) => Event.versionedType(type, 1))
  const result = yield* db
    .transaction(
      (tx) =>
        Effect.gen(function* () {
          const stats = yield* tx
            .select({
              rows: sql<number>`count(*)`,
              bytes: sql<number>`sum(length(data))`,
            })
            .from(EventTable)
            .where(inArray(EventTable.type, snapshotTypes))
            .get()
            .pipe(Effect.orDie)
          yield* tx
            .run(
              sql.raw(`
        DELETE FROM "event"
        WHERE "type" IN ('message.updated.1', 'message.part.updated.1')
          AND "id" NOT IN (
            SELECT "id" FROM (
              SELECT
                "id",
                ROW_NUMBER() OVER (
                  PARTITION BY "aggregate_id", "type", "entity"
                  ORDER BY "seq" DESC
                ) AS "rn"
              FROM (
                SELECT
                  "id",
                  "aggregate_id",
                  "type",
                  "seq",
                  CASE "type"
                    WHEN 'message.updated.1' THEN json_extract("data", '$.info.id')
                    WHEN 'message.part.updated.1' THEN json_extract("data", '$.part.id')
                  END AS "entity"
                FROM "event"
                WHERE "type" IN ('message.updated.1', 'message.part.updated.1')
              )
            )
            WHERE "rn" = 1
           )
       `),
            )
            .pipe(Effect.orDie)
          const remaining = yield* tx
            .select({
              rows: sql<number>`count(*)`,
              bytes: sql<number>`sum(length(data))`,
            })
            .from(EventTable)
            .where(inArray(EventTable.type, snapshotTypes))
            .get()
            .pipe(Effect.orDie)
          const removed = (stats?.rows ?? 0) - (remaining?.rows ?? 0)
          const bytes = (stats?.bytes ?? 0) - (remaining?.bytes ?? 0)
          if (removed > 0)
            yield* tx
              .run(
                sql`INSERT OR REPLACE INTO data_migration (name, time_completed) VALUES (${SNAPSHOT_COMPACTION_MARKER}, ${Date.now()})`,
              )
              .pipe(Effect.orDie)
          return { removed, bytes }
        }),
      { behavior: "immediate" },
    )
    .pipe(Effect.orDie)
  return result
})
