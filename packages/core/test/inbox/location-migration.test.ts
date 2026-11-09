import { expect, test } from "bun:test"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { DatabaseMigration } from "../../src/database/migration"
import inboxMigration from "../../src/database/migration/20261105094327_inbox"
import locationMigration from "../../src/database/migration/20261105202635_inbox-location"

test("location migration preserves old rows, drafts and egress as unassigned and allows owner-local keys", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const db = yield* EffectDrizzleSqlite.makeWithDefaults()
      yield* DatabaseMigration.applyOnly(db, [inboxMigration])
      yield* db.run(sql`INSERT INTO inbox_row (source, external_id, list_id, actor, snippet, thread_id, reply, open)
      VALUES ('slack', 'same', 'in_1', 'ada', 'keep this', 'thread', 1, 1)`)
      yield* db.run(sql`INSERT INTO inbox_draft VALUES ('in_1', 'private draft', 0)`)
      yield* db.run(sql`INSERT INTO inbox_egress VALUES ('eg_0', 'in_1', 'reviewed text', 'thread')`)
      yield* DatabaseMigration.applyOnly(db, [locationMigration])
      expect(yield* db.all(sql`SELECT owner, external_id, snippet, open FROM inbox_row`)).toEqual([
        { owner: "", external_id: "same", snippet: "keep this", open: 1 },
      ])
      expect(yield* db.all(sql`SELECT * FROM inbox_draft`)).toEqual([
        { owner: "", list_id: "in_1", text: "private draft", sent: 0 },
      ])
      expect(yield* db.all(sql`SELECT * FROM inbox_egress`)).toEqual([
        { owner: "", id: "eg_0", list_id: "in_1", text: "reviewed text", thread_id: "thread" },
      ])
      yield* db.run(sql`INSERT INTO inbox_row (owner, source, external_id, list_id, actor, snippet, thread_id, reply, open)
      SELECT 'project-b', source, external_id, list_id, actor, snippet, thread_id, reply, open FROM inbox_row`)
      yield* db.run(sql`INSERT INTO inbox_draft VALUES ('project-b', 'in_1', 'other draft', 0)`)
      yield* db.run(sql`INSERT INTO inbox_egress VALUES ('project-b', 'eg_0', 'in_1', 'other send', 'thread')`)
      expect(yield* db.all(sql`SELECT owner FROM inbox_row ORDER BY owner`)).toEqual([
        { owner: "" },
        { owner: "project-b" },
      ])
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", disableWAL: true })), Effect.scoped),
  )
})
