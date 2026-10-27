import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { DatabaseMigration } from "@orchestra/core/database/migration"
import { tmpdir } from "./fixture/tmpdir"

const makeDb = EffectDrizzleSqlite.makeWithDefaults()

const run = <A, E>(file: string, body: (db: Effect.Success<typeof makeDb>) => Effect.Effect<A, E>) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* body(yield* makeDb)
    }).pipe(Effect.provide(SqliteClient.layer({ filename: file })), Effect.scoped),
  )

const addNote = (id: string): DatabaseMigration.Migration => ({
  id,
  up: (tx) => tx.run(sql`INSERT INTO note (body) VALUES (${id})`).pipe(Effect.asVoid),
})

const seed = (file: string, applied: string[]) =>
  run(file, (db) =>
    Effect.gen(function* () {
      yield* db.run(sql`CREATE TABLE session (id text PRIMARY KEY)`)
      yield* db.run(sql`CREATE TABLE note (body text)`)
      yield* db.run(sql`INSERT INTO note (body) VALUES ('precious')`)
      yield* db.run(sql`CREATE TABLE migration (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)`)
      yield* Effect.forEach(applied, (id) => db.run(sql`INSERT INTO migration (id, time_completed) VALUES (${id}, 1)`))
    }),
  )

const backups = async (dir: string) => (await fs.readdir(dir)).filter((name) => name.includes(".backup-")).sort()

describe("DatabaseMigration backup and newer-schema guard", () => {
  test("backs up an existing database before a pending migration runs", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "orchestra.db")
    await seed(file, ["001_a"])

    await run(file, (db) => DatabaseMigration.apply(db, [addNote("001_a"), addNote("002_b")]))

    const [name, ...rest] = await backups(tmp.path)
    expect(rest).toEqual([])
    expect(name).toMatch(/^orchestra\.db\.backup-001_a-\d+$/)
    // the copy holds the pre-migration state; the live database moved on
    const copy = await run(path.join(tmp.path, name), (db) => db.all(sql`SELECT body FROM note`))
    expect(copy).toEqual([{ body: "precious" }])
    const live = await run(file, (db) => db.all(sql`SELECT body FROM note ORDER BY rowid`))
    expect(live).toEqual([{ body: "precious" }, { body: "002_b" }])
  })

  test("does not back up when nothing is pending", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "orchestra.db")
    await seed(file, ["001_a"])

    await run(file, (db) => DatabaseMigration.apply(db, [addNote("001_a")]))

    expect(await backups(tmp.path)).toEqual([])
  })

  test("keeps only the three newest backups", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "orchestra.db")
    await seed(file, ["001_a"])
    await Promise.all(
      [1, 2, 3, 4].map((n) => Bun.write(path.join(tmp.path, `orchestra.db.backup-old-${n}`), "x")),
    )

    await run(file, (db) => DatabaseMigration.apply(db, [addNote("001_a"), addNote("002_b")]))

    const kept = await backups(tmp.path)
    expect(kept).toHaveLength(3)
    expect(kept).not.toContain("orchestra.db.backup-old-1")
    expect(kept).not.toContain("orchestra.db.backup-old-2")
  })

  test("refuses a database migrated by a newer build and leaves it untouched", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "orchestra.db")
    await seed(file, ["001_a", "009_from_the_future"])

    const error = await run(file, (db) => DatabaseMigration.apply(db, [addNote("001_a"), addNote("002_b")])).then(
      () => undefined,
      (error: unknown) => error,
    )

    expect(String(error)).toContain("newer Orchestra version")
    expect(String(error)).toContain("009_from_the_future")
    expect(await backups(tmp.path)).toEqual([])
    const notes = await run(file, (db) => db.all(sql`SELECT body FROM note`))
    expect(notes).toEqual([{ body: "precious" }])
  })

  test("two connections applying the same migration add its column once", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "orchestra.db")
    await seed(file, ["001_a"])
    const addColumn: DatabaseMigration.Migration = {
      id: "002_b",
      up: (tx) => tx.run(sql`ALTER TABLE note ADD COLUMN extra text`).pipe(Effect.asVoid),
    }

    await Promise.all([
      run(file, (db) => DatabaseMigration.applyOnly(db, [addNote("001_a"), addColumn])),
      run(file, (db) => DatabaseMigration.applyOnly(db, [addNote("001_a"), addColumn])),
    ])

    const columns = await run(file, (db) => db.all<{ name: string }>(sql`SELECT name FROM pragma_table_info('note')`))
    expect(columns.filter((column) => column.name === "extra")).toHaveLength(1)
  })
})
