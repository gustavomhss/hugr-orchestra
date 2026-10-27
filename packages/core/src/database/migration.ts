export * as DatabaseMigration from "./migration"

import { sql } from "drizzle-orm"
import { Effect, Semaphore } from "effect"
import type { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import { readdirSync, rmSync } from "fs"
import { basename, dirname, join } from "path"
import { migrations } from "./migration.gen"
import schema from "./schema.gen"

type Database = EffectDrizzleSqlite.EffectSQLiteDatabase
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
const lock = Semaphore.makeUnsafe(1)
const KEEP_BACKUPS = 3

export type Migration = {
  id: string
  up: (tx: Transaction) => Effect.Effect<void, unknown>
}

export function apply(db: Database, input: Migration[] = migrations) {
  return lock.withPermit(
    Effect.gen(function* () {
      const tables = yield* db.all<{ name: string }>(
        sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
      )
      if (tables.some((table) => table.name === "session")) return yield* applyExisting(db, input)
      if (tables.length > 0) return yield* Effect.die("Database is not empty and has no session table")
      // IMMEDIATE takes the write lock up front, so a second process (CLI and desktop share one database file)
      // waits here instead of both creating the schema; the check inside the lock sees what the first one did.
      yield* db.transaction((tx) =>
        Effect.gen(function* () {
          const created = yield* tx.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'session'`)
          if (created) return
          yield* schema.up(tx)
          yield* tx.run(
            sql`CREATE TABLE ${sql.identifier("migration")} (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)`,
          )
          yield* Effect.forEach(input, (migration) =>
            tx.run(
              sql`INSERT INTO ${sql.identifier("migration")} (id, time_completed) VALUES (${migration.id}, ${Date.now()})`,
            ),
          )
        }),
        { behavior: "immediate" },
      )
    }),
  )
}

/**
 * Opens an already-initialised database safely: refuses a schema written by a newer build, and takes a consistent
 * backup before any pending migration runs so a destructive migration can be undone by restoring the copy.
 */
function applyExisting(db: Database, input: Migration[]) {
  return Effect.gen(function* () {
    const hasJournal = yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'migration'`)
    const applied = hasJournal
      ? (yield* db.all<{ id: string }>(sql`SELECT id FROM ${sql.identifier("migration")} ORDER BY id`)).map((row) => row.id)
      : []
    const known = new Set(input.map((migration) => migration.id))
    const unknown = applied.filter((id) => !known.has(id))
    if (unknown.length > 0)
      return yield* Effect.die(
        new Error(
          `This database was created by a newer Orchestra version (it has migrations this build does not know: ${unknown.join(", ")}). Update the app before opening it.`,
        ),
      )
    if (input.every((migration) => applied.includes(migration.id))) return
    yield* backup(db, applied.at(-1) ?? "legacy")
    yield* applyOnly(db, input)
  })
}

function backup(db: Database, from: string) {
  return Effect.gen(function* () {
    const file = (yield* db.all<{ file: string | null }>(sql`SELECT file FROM pragma_database_list WHERE name = 'main'`))[0]?.file
    if (!file) return
    const target = `${file}.backup-${from}-${Date.now()}`
    yield* db.run(sql`VACUUM INTO ${target}`).pipe(
      Effect.mapError((error) => new Error(`Could not back up the database before migrating, nothing was changed: ${error}`)),
    )
    prune(file)
  })
}

function prune(file: string) {
  const prefix = `${basename(file)}.backup-`
  readdirSync(dirname(file))
    .filter((name) => name.startsWith(prefix))
    .map((name) => ({ name, time: Number(name.slice(name.lastIndexOf("-") + 1)) }))
    .sort((a, b) => b.time - a.time)
    .slice(KEEP_BACKUPS)
    .forEach((old) => rmSync(join(dirname(file), old.name), { force: true }))
}

export function applyOnly(db: Database, input: Migration[]) {
  return Effect.gen(function* () {
    yield* db.run(
      sql`CREATE TABLE IF NOT EXISTS ${sql.identifier("migration")} (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)`,
    )
    let completed = new Set(
      (yield* db.all<{ id: string }>(sql`SELECT id FROM ${sql.identifier("migration")}`)).map((row) => row.id),
    )
    if (completed.size === 0) {
      // Existing installs used Drizzle's migration journal. Seed the new
      // journal once so TypeScript migrations don't replay old SQL.
      if (
        yield* db.get(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${"__drizzle_migrations"}`)
      ) {
        const named = (yield* db.all<{ name: string }>(
          sql`SELECT name FROM pragma_table_info('__drizzle_migrations')`,
        )).some((column) => column.name === "name")

        if (named) {
          yield* db.run(sql`
            INSERT OR IGNORE INTO ${sql.identifier("migration")} (id, time_completed)
            SELECT name, ${Date.now()}
            FROM ${sql.identifier("__drizzle_migrations")}
            WHERE name IS NOT NULL
          `)
        }

        if (!named) {
          const entries = yield* db.all<{ created_at: number; prefix: string | null }>(sql`
            SELECT created_at, strftime('%Y%m%d%H%M%S', created_at / 1000, 'unixepoch') AS prefix
            FROM ${sql.identifier("__drizzle_migrations")}
            WHERE created_at IS NOT NULL
          `)

          for (const entry of entries) {
            const migration = input.find((item) => item.id.startsWith(`${entry.prefix}_`))
            if (!migration) {
              return yield* Effect.die(
                new Error(`Legacy migration timestamp ${entry.created_at} does not match any known migration`),
              )
            }
            yield* db.run(sql`
              INSERT OR IGNORE INTO ${sql.identifier("migration")} (id, time_completed)
              VALUES (${migration.id}, ${Date.now()})
            `)
          }
        }
        completed = new Set(
          (yield* db.all<{ id: string }>(sql`SELECT id FROM ${sql.identifier("migration")}`)).map((row) => row.id),
        )
      }
    }

    for (const migration of input) {
      if (completed.has(migration.id)) continue
      // The semaphore only serialises this process. IMMEDIATE makes another process (CLI and desktop share the
      // database file) wait for the write lock, and the journal is read again inside it, so a migration the other
      // process just applied is skipped instead of failing on a duplicate column.
      yield* db.transaction(
        (tx) =>
          Effect.gen(function* () {
            const done = yield* tx.get(sql`SELECT id FROM ${sql.identifier("migration")} WHERE id = ${migration.id}`)
            if (done) return
            yield* migration.up(tx)
            yield* tx.run(
              sql`INSERT INTO ${sql.identifier("migration")} (id, time_completed) VALUES (${migration.id}, ${Date.now()})`,
            )
          }),
        { behavior: "immediate" },
      )
    }
  })
}
