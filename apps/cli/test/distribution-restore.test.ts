import { expect, test } from "bun:test"
import { mkdtemp, readFile, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { holdBackLastMigration, isolatedMigrationApplied, restoreIsolatedDatabase } from "./fixture/distribution-restore"
import { Database } from "bun:sqlite"

test("isolated restore keeps the backup bytes and drops wal sidecars", async () => {
  const dir = await mkdtemp(join(tmpdir(), "isolated-restore-"))
  const file = join(dir, "proof.sqlite")
  await writeFile(file, "live-migrated")
  await writeFile(`${file}-wal`, "wal")
  await writeFile(`${file}-shm`, "shm")
  await writeFile(`${file}.backup-legacy-20`, "pre-migration")

  await restoreIsolatedDatabase(file)

  expect(await readFile(file, "utf8")).toBe("pre-migration")
  expect(await readFile(`${file}.aside`, "utf8")).toBe("live-migrated")
  expect(await readFile(`${file}-wal.aside`, "utf8")).toBe("wal")
  await expect(readFile(`${file}-wal`)).rejects.toThrow()
  await expect(readFile(`${file}-shm`)).rejects.toThrow()
})

test("isolated restore accepts a hyphenated migration id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "isolated-restore-"))
  const file = join(dir, "proof.sqlite")
  await writeFile(file, "live")
  await writeFile(`${file}.backup-20261105202635_inbox-location-20`, "pre")

  await restoreIsolatedDatabase(file)

  expect(await readFile(file, "utf8")).toBe("pre")
})

test("holding back the last single-table migration leaves that table pending", async () => {
  const dir = await mkdtemp(join(tmpdir(), "isolated-restore-"))
  const file = join(dir, "proof.sqlite")
  const db = new Database(file)
  db.run("CREATE TABLE session (id text PRIMARY KEY)")
  db.run("CREATE TABLE migration (id text PRIMARY KEY, time_completed integer NOT NULL)")
  db.run("INSERT INTO migration (id, time_completed) VALUES ('20261105235919_inbox-calendar', 1)")
  db.run("CREATE TABLE inbox_calendar (owner text)")
  db.close()

  const held = await holdBackLastMigration(file)
  expect(held).toEqual({ id: "20261105235919_inbox-calendar", table: "inbox_calendar" })
  expect(isolatedMigrationApplied(file, held.id, held.table)).toBe(false)

  const opened = new Database(file)
  expect(opened.query("SELECT id FROM migration").all()).toEqual([])
  expect(opened.query("SELECT name FROM sqlite_master WHERE name = 'inbox_calendar'").get()).toBeNull()
  opened.run("INSERT INTO migration (id, time_completed) VALUES (?, 2)", [held.id])
  opened.run(`CREATE TABLE "${held.table}" (owner text)`)
  opened.close()
  expect(isolatedMigrationApplied(file, held.id, held.table)).toBe(true)
})

test("holding back refuses a migration that is not one table", async () => {
  const dir = await mkdtemp(join(tmpdir(), "isolated-restore-"))
  const file = join(dir, "proof.sqlite")
  const db = new Database(file)
  db.run("CREATE TABLE session (id text PRIMARY KEY)")
  db.run("CREATE TABLE migration (id text PRIMARY KEY, time_completed integer NOT NULL)")
  db.run("INSERT INTO migration (id, time_completed) VALUES ('20260428004200_add_session_path', 1)")
  db.run("CREATE TABLE session_kept (id text)")
  db.close()

  await expect(holdBackLastMigration(file)).rejects.toThrow("ISOLATED_DB_MIGRATION_NOT_ONE_TABLE")
  const opened = new Database(file)
  expect(opened.query("SELECT id FROM migration").get()).toEqual({ id: "20260428004200_add_session_path" })
  opened.close()
})

test("isolated restore refuses a missing, extra, or unnamed backup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "isolated-restore-"))
  const file = join(dir, "proof.sqlite")
  await writeFile(file, "live")
  await expect(restoreIsolatedDatabase(file)).rejects.toThrow("ISOLATED_DB_BACKUP_COUNT: 0")

  await writeFile(`${file}.backup-legacy-1`, "a")
  await writeFile(`${file}.backup-legacy-2`, "b")
  await expect(restoreIsolatedDatabase(file)).rejects.toThrow("ISOLATED_DB_BACKUP_COUNT: 2")

  const other = await mkdtemp(join(tmpdir(), "isolated-restore-"))
  const named = join(other, "proof.sqlite")
  await writeFile(named, "live")
  await writeFile(`${named}.backup-has space-3`, "x")
  await expect(restoreIsolatedDatabase(named)).rejects.toThrow("ISOLATED_DB_BACKUP_NAME")
})
