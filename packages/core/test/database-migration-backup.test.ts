import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import fs from "fs/promises"
import path from "path"
import { SqliteClient } from "@effect/sql-sqlite-bun"
import { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { DatabaseMigration } from "@orchestra/core/database/migration"
import { tmpdir } from "./fixture/tmpdir"
import { inspectBackupFootprint } from "./fixture/migration-safety"

const makeDb = EffectDrizzleSqlite.makeWithDefaults()

const run = <A, E>(file: string, body: (db: Effect.Success<typeof makeDb>) => Effect.Effect<A, E>, readonly = false) =>
  Effect.runPromise(
    Effect.gen(function* () {
      return yield* body(yield* makeDb)
    }).pipe(Effect.provide(SqliteClient.layer({ filename: file, ...(readonly ? { readonly: true, readwrite: false, create: false, disableWAL: true } : {}) })), Effect.scoped),
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
    expect((await inspectBackupFootprint(file)).backupNames).toContain(name)
    // the copy holds the pre-migration state; the live database moved on
    const copy = await run(path.join(tmp.path, name), (db) => db.all(sql`SELECT body FROM note`), true)
    expect(copy).toEqual([{ body: "precious" }])
    const live = await run(file, (db) => db.all(sql`SELECT body FROM note ORDER BY rowid`))
    expect(live).toEqual([{ body: "precious" }, { body: "002_b" }])
  })

  test("restoring the backup by the documented steps returns the pre-migration database", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "orchestra.db")
    await seed(file, ["001_a"])
    await run(file, (db) => DatabaseMigration.apply(db, [addNote("001_a"), addNote("002_b")]))
    const [name] = await backups(tmp.path)
    expect((await inspectBackupFootprint(file)).backupNames).toContain(name)
    const backup = path.join(tmp.path, name)
    const backupBytes = await fs.readFile(backup)
    const backupHash = createHash("sha256").update(backupBytes).digest("hex")
    await fs.writeFile(`${file}-wal`, "wal")
    await fs.writeFile(`${file}-shm`, "shm")

    await fs.rename(file, `${file}.aside`)
    await fs.rename(`${file}-wal`, `${file}-wal.aside`)
    await fs.rename(`${file}-shm`, `${file}-shm.aside`)
    await fs.copyFile(backup, file)

    expect(createHash("sha256").update(await fs.readFile(file)).digest("hex")).toBe(backupHash)
    await expect(fs.access(`${file}-wal`)).rejects.toThrow()
    await expect(fs.access(`${file}-shm`)).rejects.toThrow()
    await run(file, (db) => DatabaseMigration.apply(db, [addNote("001_a")]))
    expect(await run(file, (db) => db.all(sql`SELECT body FROM note`))).toEqual([{ body: "precious" }])
    expect(await run(`${file}.aside`, (db) => db.all(sql`SELECT body FROM note ORDER BY rowid`))).toEqual([
      { body: "precious" },
      { body: "002_b" },
    ])
    const refused = await run(`${file}.aside`, (db) => DatabaseMigration.apply(db, [addNote("001_a")])).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(String(refused)).toContain("newer Orchestra version")
    expect(String(refused)).toContain("002_b")
  })

  test("does not back up when nothing is pending", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "orchestra.db")
    await seed(file, ["001_a"])

    await run(file, (db) => DatabaseMigration.apply(db, [addNote("001_a")]))

    expect(await backups(tmp.path)).toEqual([])
  })

  test("refuses invalid legacy backups without pruning them or migrating", async () => {
    await using tmp = await tmpdir()
    const file = path.join(tmp.path, "orchestra.db")
    await seed(file, ["001_a"])
    await Promise.all(
      [1, 2, 3, 4].map((n) => Bun.write(path.join(tmp.path, `orchestra.db.backup-old-${n}`), "x")),
    )
    const result = await run(file, (db) => DatabaseMigration.apply(db, [addNote("001_a"), addNote("002_b")]).pipe(Effect.exit))
    expect(result._tag).toBe("Failure")
    expect(await backups(tmp.path)).toEqual([1, 2, 3, 4].map((n) => `orchestra.db.backup-old-${n}`))
    expect(await run(file, (db) => db.all(sql`SELECT body FROM note`))).toEqual([{ body: "precious" }])
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
