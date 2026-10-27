import { describe, expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { DatabaseMigration } from "@orchestra/core/database/migration"
import { Project } from "@orchestra/core/project"
import { ProjectTable } from "@orchestra/core/project/sql"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionSchema } from "@orchestra/core/session/schema"
import { SessionTable } from "@orchestra/core/session/sql"
import meetingRecordMigration from "../src/database/migration/20261026003504_meeting_record"
import meetingMemoryMigration from "../src/database/migration/20261026232319_meeting_memory"
import type { SqlClient as SqlClientService } from "effect/unstable/sql/SqlClient"

const run = <A, E>(effect: Effect.Effect<A, E, SqlClientService>) =>
  Effect.runPromise(
    effect.pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true })), Effect.scoped),
  )

const makeDb = EffectDrizzleSqlite.makeWithDefaults()

describe("DatabaseMigration meeting memory", () => {
  test("keeps segments across the meeting rebuild and detaches meetings from a deleted session", async () => {
    await run(
      Effect.gen(function* () {
        const db = yield* makeDb
        yield* DatabaseMigration.apply(db)
        // The app runs with foreign keys on, which is what makes dropping `meeting` cascade into its segments.
        yield* db.run(sql`PRAGMA foreign_keys = ON`)
        yield* Effect.forEach(
          ["meeting_item", "meeting_proposal", "meeting_person", "meeting_segment", "meeting"],
          (table) => db.run(sql`DROP TABLE ${sql.identifier(table)}`),
        )
        yield* db.run(
          sql`DELETE FROM migration WHERE id IN (${meetingRecordMigration.id}, ${meetingMemoryMigration.id})`,
        )
        yield* DatabaseMigration.applyOnly(db, [meetingRecordMigration])

        yield* db
          .insert(ProjectTable)
          .values({ id: Project.ID.global, worktree: AbsolutePath.make("/project"), sandboxes: [] })
          .run()
        yield* db
          .insert(SessionTable)
          .values({
            id: SessionSchema.ID.make("ses_old"),
            project_id: Project.ID.global,
            slug: "old",
            directory: "/project",
            title: "old",
            version: "test",
          })
          .run()
        yield* db.run(sql`INSERT INTO meeting (id, session_id, title, time_started) VALUES ('mtg_old', 'ses_old', 'Old', 1)`)
        yield* Effect.forEach(["seg_1", "seg_2"], (id, index) =>
          db.run(
            sql`INSERT INTO meeting_segment (id, meeting_id, track, text, start_ms, end_ms) VALUES (${id}, 'mtg_old', 'mic', 'hello', ${index}, ${index + 1})`,
          ),
        )

        yield* DatabaseMigration.applyOnly(db, [meetingMemoryMigration])

        expect(yield* db.all(sql`SELECT id FROM meeting_segment ORDER BY start_ms`)).toEqual([
          { id: "seg_1" },
          { id: "seg_2" },
        ])
        expect(yield* db.all(sql`SELECT retention, consent, card_status FROM meeting`)).toEqual([
          { retention: "kept", consent: "unknown", card_status: "pending" },
        ])

        yield* db.run(sql`DELETE FROM session WHERE id = 'ses_old'`)
        expect(yield* db.all(sql`SELECT id, session_id FROM meeting`)).toEqual([{ id: "mtg_old", session_id: null }])
        expect(yield* db.all(sql`SELECT count(*) AS count FROM meeting_segment`)).toEqual([{ count: 2 }])
      }),
    )
  })
})
