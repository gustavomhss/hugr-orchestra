import { describe, expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { DatabaseMigration } from "@orchestra/core/database/migration"
import retireLegacySessionEventsMigration from "../src/database/migration/20261026013700_retire_legacy_session_events"
import type { SqlClient as SqlClientService } from "effect/unstable/sql/SqlClient"

const run = <A, E>(effect: Effect.Effect<A, E, SqlClientService>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true })), Effect.scoped),
  )

const makeDb = EffectDrizzleSqlite.makeWithDefaults()

describe("DatabaseMigration retire legacy Session events", () => {
  test("retires legacy Session event rows and records the compaction marker", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        const legacy = [
          "session.created.1",
          "session.updated.1",
          "session.deleted.1",
          "message.updated.1",
          "message.removed.1",
          "message.part.updated.1",
          "message.part.removed.1",
        ]
        yield* db.run(sql`INSERT INTO event_sequence (aggregate_id, seq) VALUES ('session', ${legacy.length})`)
        yield* Effect.forEach(legacy, (type, seq) =>
          db.run(
            sql`INSERT INTO event (id, aggregate_id, seq, type, data) VALUES (${`legacy_${seq}`}, 'session', ${seq}, ${type}, '{}')`,
          ),
        )
        yield* db.run(
          sql`INSERT INTO event (id, aggregate_id, seq, type, data) VALUES ('kept', 'session', ${legacy.length}, 'session.next.renamed.1', '{}')`,
        )
        yield* db.run(sql`DELETE FROM migration WHERE id = ${retireLegacySessionEventsMigration.id}`)
        yield* DatabaseMigration.applyOnly(db, [retireLegacySessionEventsMigration])

        expect(yield* db.all(sql`SELECT id, type FROM event ORDER BY seq`)).toEqual([
          { id: "kept", type: "session.next.renamed.1" },
        ])
        expect(yield* db.all(sql`SELECT name FROM data_migration WHERE name = 'event_snapshot_compaction'`)).toEqual([
          { name: "event_snapshot_compaction" },
        ])
      }),
    )
  })

  test("records no compaction marker when no legacy Session event rows exist", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        yield* db.run(sql`INSERT INTO event_sequence (aggregate_id, seq) VALUES ('session', 0)`)
        yield* db.run(
          sql`INSERT INTO event (id, aggregate_id, seq, type, data) VALUES ('kept', 'session', 0, 'session.next.renamed.1', '{}')`,
        )
        yield* db.run(sql`DELETE FROM migration WHERE id = ${retireLegacySessionEventsMigration.id}`)
        yield* DatabaseMigration.applyOnly(db, [retireLegacySessionEventsMigration])

        expect(yield* db.all(sql`SELECT id FROM event`)).toEqual([{ id: "kept" }])
        expect(yield* db.all(sql`SELECT name FROM data_migration WHERE name = 'event_snapshot_compaction'`)).toEqual([])
      }),
    )
  })

  test("skips a database without an event table", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        yield* db.run(sql`DROP TABLE event`)
        yield* db.run(sql`DELETE FROM migration WHERE id = ${retireLegacySessionEventsMigration.id}`)
        yield* DatabaseMigration.applyOnly(db, [retireLegacySessionEventsMigration])

        expect(yield* db.all(sql`SELECT id FROM migration WHERE id = ${retireLegacySessionEventsMigration.id}`)).toEqual([
          { id: retireLegacySessionEventsMigration.id },
        ])
        expect(yield* db.all(sql`SELECT name FROM data_migration WHERE name = 'event_snapshot_compaction'`)).toEqual([])
      }),
    )
  })
})
