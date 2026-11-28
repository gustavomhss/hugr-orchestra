import assert from "node:assert/strict"
import { mkdtemp, rename, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import type { layer } from "../../src/database/sqlite.bun"

export async function proveReadonlyVacuum(sqliteLayer: typeof layer, mode: "wal" | "delete", rollback: boolean) {
  const directory = await mkdtemp(join(tmpdir(), "migration-vacuum-proof-"))
  const filename = join(directory, "source.sqlite")
  const backup = join(directory, "snapshot.sqlite")
  const failure = new Error("migration-after-capture-failed")
  const steps: string[] = []
  const makeDb = EffectDrizzleSqlite.makeWithDefaults()
  try {
    await Effect.runPromise(Effect.gen(function* () {
      const db = yield* makeDb
      yield* db.run(sql.raw(`PRAGMA journal_mode = ${mode}`))
      yield* db.run("PRAGMA busy_timeout = 5000")
      assert.equal((yield* db.get<{ journal_mode: string }>("PRAGMA journal_mode"))?.journal_mode, mode)
      yield* db.run("CREATE TABLE item (id INTEGER PRIMARY KEY, body TEXT NOT NULL)")
      yield* db.run("INSERT INTO item VALUES (1, 'baseline')")
      const migrated = yield* db.transaction((tx) => Effect.gen(function* () {
        // The callback runs after the real driver executes BEGIN IMMEDIATE. No DML precedes the reader.
        steps.push("writer-immediate")
        assert.deepEqual((yield* tx.all<{ id: number; body: string }>("SELECT id, body FROM item")).map((row) => ({ id: row.id, body: row.body })), [{ id: 1, body: "baseline" }])
        yield* Effect.gen(function* () {
          const reader = yield* makeDb
          assert.equal((yield* reader.all<{ file: string }>("SELECT file FROM pragma_database_list WHERE name = 'main'"))[0]?.file,
            (yield* tx.all<{ file: string }>("SELECT file FROM pragma_database_list WHERE name = 'main'"))[0]?.file)
          yield* reader.run(sql`VACUUM INTO ${backup}`)
          steps.push("reader-captured")
        }).pipe(Effect.provide(sqliteLayer({ filename, readonly: true, readwrite: false, create: false, disableWAL: true })), Effect.scoped)
        steps.push("reader-closed")
        yield* tx.run("ALTER TABLE item ADD COLUMN migrated TEXT")
        yield* tx.run("UPDATE item SET body = 'after-capture', migrated = 'yes' WHERE id = 1")
        yield* tx.run("INSERT INTO item VALUES (2, 'new-row', 'yes')")
        steps.push("writer-mutated")
        if (rollback) return yield* Effect.fail(failure)
      }), { behavior: "immediate" }).pipe(Effect.result)
      assert.equal(migrated._tag, rollback ? "Failure" : "Success")
      if (migrated._tag === "Failure") assert.equal(migrated.failure, failure)
      steps.push(rollback ? "writer-rolled-back" : "writer-committed")
      assert.deepEqual((yield* db.all<{ id: number; body: string }>("SELECT id, body FROM item ORDER BY id")).map((row) => ({ id: row.id, body: row.body })), rollback
        ? [{ id: 1, body: "baseline" }]
        : [{ id: 1, body: "after-capture" }, { id: 2, body: "new-row" }])
      assert.equal((yield* db.all<{ name: string }>("PRAGMA table_info(item)")).some((column) => column.name === "migrated"), !rollback)
    }).pipe(Effect.provide(sqliteLayer({ filename, disableWAL: true })), Effect.scoped))
    // Reopen the captured file through the same real leaf driver; it must have neither post-capture bytes nor schema.
    await Effect.runPromise(Effect.gen(function* () {
      const copy = yield* makeDb
      assert.deepEqual((yield* copy.all<{ id: number; body: string }>("SELECT id, body FROM item")).map((row) => ({ id: row.id, body: row.body })), [{ id: 1, body: "baseline" }])
      assert.equal((yield* copy.all<{ name: string }>("PRAGMA table_info(item)")).some((column) => column.name === "migrated"), false)
      assert.equal((yield* copy.get<{ integrity_check: string }>("PRAGMA integrity_check"))?.integrity_check, "ok")
    }).pipe(Effect.provide(sqliteLayer({ filename: backup, readonly: true, readwrite: false, create: false, disableWAL: true })), Effect.scoped))
    // Windows rename/removal catches a reader or writer handle that escaped its scope.
    await rename(backup, join(directory, "closed-snapshot.sqlite"))
    await rename(filename, join(directory, "closed-source.sqlite"))
    assert.deepEqual(steps, ["writer-immediate", "reader-captured", "reader-closed", "writer-mutated", rollback ? "writer-rolled-back" : "writer-committed"])
    return { mode, rollback, steps }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
