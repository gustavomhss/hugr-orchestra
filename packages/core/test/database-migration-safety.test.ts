import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { Effect, Exit } from "effect"
import { sql } from "drizzle-orm"
import { DatabaseMigration } from "../src/database/migration"
import { migrations } from "../src/database/migration.gen"
import sessionMetadataMigration from "../src/database/migration/20260511173437_session-metadata"
import { tmpdir } from "./fixture/tmpdir"
import { run, migration, seed, ids, notes, snapshots, namedLegacy } from "./fixture/migration-safety"

// M5: simulate a backup made before a destructive migration that an older build already committed.
test("M5 pins the pre-A legacy backup through four failed retries and later success, capturing new data each time", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  const original = `${file}.backup-before-A-1`
  await seed(file, ["000_base"])
  await run(file, (db) => db.run(sql`VACUUM INTO ${original}`))
  const originalHash = createHash("sha256").update(await readFile(original)).digest("hex")
  await run(file, (db) => db.transaction((tx) => Effect.gen(function* () {
    yield* tx.run("DELETE FROM note")
    yield* tx.run("INSERT INTO migration VALUES ('001_A',1)")
  }), { behavior: "immediate" }))
  const failure = new Error("migration-B-failed")
  const failed: DatabaseMigration.Migration = { id: "002_B", up: () => Effect.fail(failure) }
  for (const attempt of [1, 2, 3, 4]) {
    await run(file, (db) => db.run(sql`INSERT INTO note VALUES (${`between-retries-${attempt}`})`))
    const outcome = await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), migration("001_A"), failed]).pipe(Effect.exit))
    expect(Exit.isFailure(outcome)).toBe(true)
    const captured = await Promise.all((await snapshots(file)).map((name) => notes(join(tmp.path, name))))
    expect(captured.some((rows) => rows.includes(`between-retries-${attempt}`))).toBe(true)
    expect(await readFile(original).then((bytes) => createHash("sha256").update(bytes).digest("hex"), () => null)).toBe(originalHash)
    await Bun.sleep(2)
  }
  await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), migration("001_A"), migration("002_B")]))
  expect(await readFile(original).then((bytes) => createHash("sha256").update(bytes).digest("hex"), () => null)).toBe(originalHash)
  expect(await notes(original)).toEqual(["precious"])
  expect(await ids(file)).toEqual(["000_base", "001_A", "002_B"])
  expect((await snapshots(file)).length).toBeLessThanOrEqual(6) // fixed legacy pin + ring3 + current + active
})

test("M5 rolls back the entire new batch when a later migration fails", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file, ["000_base"])
  const destructive: DatabaseMigration.Migration = { id: "001_A", up: (tx) => tx.run("DELETE FROM note").pipe(Effect.asVoid) }
  const failed: DatabaseMigration.Migration = { id: "002_B", up: () => Effect.fail(new Error("late-batch-failure")) }
  const outcome = await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), destructive, failed]).pipe(Effect.exit))
  expect(Exit.isFailure(outcome)).toBe(true)
  expect(await notes(file)).toEqual(["precious"])
  expect(await ids(file)).toEqual(["000_base"])
})

for (const conversionOnly of [false, true]) {
  test(`M6 reconciles partial new journal with every legacy fact, conversion-only=${conversionOnly}`, async () => {
    await using tmp = await tmpdir()
    const file = join(tmp.path, "source.db")
    await seed(file, ["20260101000000_first"])
    await namedLegacy(file, ["20260101000000_first", "20260101000001_second"])
    const targets = [migration("20260101000000_first"), migration("20260101000001_second", "must-not-replay")]
    // A conversion-only call uses real shipped facts so the global universe supplies their identities.
    if (conversionOnly) {
      await run(file, (db) => Effect.gen(function* () {
        yield* db.run("DELETE FROM migration")
        yield* db.run(sql`INSERT INTO migration VALUES (${sessionMetadataMigration.id},1)`)
        yield* db.run("DELETE FROM __drizzle_migrations")
        yield* db.run(sql`INSERT INTO __drizzle_migrations(name,created_at) VALUES (${sessionMetadataMigration.id},1), (${migrations[0].id},1)`)
      }))
    }
    await run(file, (db) => DatabaseMigration.applyOnly(db, conversionOnly ? [] : targets))
    expect(await ids(file)).toEqual(conversionOnly
      ? [sessionMetadataMigration.id, migrations[0].id].sort()
      : targets.map((item) => item.id))
    expect(await notes(file)).toEqual(["precious"])
  })
}

test("M6 valid earlier unnamed legacy rows do not survive a later invalid timestamp", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file)
  await run(file, (db) => Effect.gen(function* () {
    yield* db.run("CREATE TABLE __drizzle_migrations (created_at INTEGER)")
    yield* db.run(sql`INSERT INTO __drizzle_migrations VALUES (${Date.UTC(2026,0,1)}), (1234567890000)`)
  }))
  const outcome = await run(file, (db) => DatabaseMigration.applyOnly(db, [migration("20260101000000_first")]).pipe(Effect.exit))
  expect(Exit.isFailure(outcome)).toBe(true)
  expect(await ids(file)).toEqual([])
  expect(await notes(file)).toEqual(["precious"])
})

for (const completed of [false, true]) {
  for (const operation of ["apply", "applyOnly"] as const) {
    test(`M7 rejects later unknown named legacy facts before mutation, completed=${completed}, ${operation}`, async () => {
      await using tmp = await tmpdir()
      const file = join(tmp.path, "source.db")
      await seed(file, completed ? [sessionMetadataMigration.id] : [])
      await namedLegacy(file, [sessionMetadataMigration.id, "20990101000000_future"])
      const before = await ids(file)
      const outcome = await run(file, (db) => DatabaseMigration[operation](db, [sessionMetadataMigration]).pipe(Effect.exit))
      expect(await ids(file)).toEqual(before)
      expect(await snapshots(file)).toEqual([])
      expect(Exit.isFailure(outcome)).toBe(true)
      expect(await notes(file)).toEqual(["precious"])
    })
  }
}

for (const ambiguous of [false, true]) {
  test(`M7 validates all UTC timestamp candidates before importing, ambiguous=${ambiguous}`, async () => {
    await using tmp = await tmpdir()
    const file = join(tmp.path, "source.db")
    await seed(file)
    await run(file, (db) => Effect.gen(function* () {
      yield* db.run("CREATE TABLE __drizzle_migrations (created_at INTEGER)")
      yield* db.run(sql`INSERT INTO __drizzle_migrations VALUES (${Date.UTC(2026,0,1)})`)
    }))
    const outcome = await run(file, (db) => DatabaseMigration.applyOnly(db, ambiguous
      ? [migration("20260101000000_first"), migration("20260101000000_second")]
      : [migration("20260102000000_other")]).pipe(Effect.exit))
    expect(await ids(file)).toEqual([])
    expect(Exit.isFailure(outcome)).toBe(true)
    expect(await notes(file)).toEqual(["precious"])
  })
}

for (const future of [false, true]) {
  test(`M7 applyOnly uses the shipped universe while still refusing real unknown IDs, future=${future}`, async () => {
    await using tmp = await tmpdir()
    const file = join(tmp.path, "source.db")
    await run(file, (db) => DatabaseMigration.apply(db))
    await run(file, (db) => db.run(sql`DELETE FROM migration WHERE id=${sessionMetadataMigration.id}`))
    if (future) await run(file, (db) => db.run("INSERT INTO migration VALUES ('20990101000000_future',1)"))
    const before = await ids(file)
    const outcome = await run(file, (db) => DatabaseMigration.applyOnly(db, [sessionMetadataMigration]).pipe(Effect.exit))
    expect(Exit.isFailure(outcome)).toBe(future)
    expect(await ids(file)).toEqual(future ? before : [...before, sessionMetadataMigration.id].sort())
  })
}

for (const exact of [false, true]) {
  test(`M7 full apply accepts only the exact historical alias when its canonical exists, exact=${exact}`, async () => {
    await using tmp = await tmpdir()
    const file = join(tmp.path, "source.db")
    const historical = exact ? "20260530232709_lovely_romulus" : "20260530232709_lovely_romulus_future"
    await seed(file, [historical])
    const outcome = await run(file, (db) => DatabaseMigration.apply(db, [sessionMetadataMigration]).pipe(Effect.exit))
    expect(Exit.isFailure(outcome)).toBe(!exact)
    expect(await ids(file)).toEqual(exact ? [sessionMetadataMigration.id, historical].sort() : [historical])
  })
}

for (const slot of ["owner.pending", "foreign-entry"]) {
  test(`M5 refuses an unrecognizable control namespace (${slot}) before migration or new snapshots`, async () => {
    await using tmp = await tmpdir()
    const file = join(tmp.path, "source.db")
    await seed(file, ["000_base"])
    await mkdir(`${file}.migration-work`)
    await writeFile(join(`${file}.migration-work`, slot), "foreign-or-partial-control")
    const outcome = await run(file, (db) => DatabaseMigration.apply(db, [migration("000_base"), migration("001_A")]).pipe(Effect.exit))
    expect(Exit.isFailure(outcome)).toBe(true)
    expect(await notes(file)).toEqual(["precious"])
    expect(await readFile(join(`${file}.migration-work`, slot), "utf8")).toBe("foreign-or-partial-control")
    expect(await snapshots(file)).toEqual([])
  })
}

test("M7 unknown first legacy row does not create a journal, backup or control state", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file)
  await run(file, (db) => db.run("DROP TABLE migration"))
  await namedLegacy(file, ["20990101000000_future", sessionMetadataMigration.id])
  const before = await run(file, (db) => db.all("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name"))
  const outcome = await run(file, (db) => DatabaseMigration.apply(db, [sessionMetadataMigration]).pipe(Effect.exit))
  expect(await run(file, (db) => db.all("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name"))).toEqual(before)
  expect(await snapshots(file)).toEqual([])
  expect((await readdir(tmp.path)).some((name) => name.includes("migration-work") || name.includes("migration-backups"))).toBe(false)
  expect(Exit.isFailure(outcome)).toBe(true)
})

test("M6 mixed named and null-name timestamp legacy rows reconcile in conversion-only mode", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file)
  await namedLegacy(file, [sessionMetadataMigration.id])
  await run(file, (db) => db.run(sql`INSERT INTO __drizzle_migrations(name,created_at) VALUES (NULL,${Date.UTC(2026,0,27,22,23,53)})`))
  await run(file, (db) => DatabaseMigration.applyOnly(db, []))
  expect(await ids(file)).toEqual([migrations[0].id, sessionMetadataMigration.id].sort())
})

test("M7 a non-null empty legacy name cannot fall back to its otherwise valid timestamp", async () => {
  await using tmp = await tmpdir()
  const file = join(tmp.path, "source.db")
  await seed(file)
  await namedLegacy(file, [])
  await run(file, (db) => db.run(sql`INSERT INTO __drizzle_migrations(name,created_at) VALUES ('',${Date.UTC(2026,0,27,22,23,53)})`))
  const outcome = await run(file, (db) => DatabaseMigration.applyOnly(db, []).pipe(Effect.exit))
  expect(await ids(file)).toEqual([])
  expect(Exit.isFailure(outcome)).toBe(true)
})
