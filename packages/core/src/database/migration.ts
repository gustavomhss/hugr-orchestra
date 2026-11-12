export * as DatabaseMigration from "./migration"

import { sql } from "drizzle-orm"
import { Effect, Semaphore } from "effect"
import type { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import { migrations } from "./migration.gen"
import schema from "./schema.gen"
import { MigrationBackup } from "./migration-backup"

type Database = EffectDrizzleSqlite.EffectSQLiteDatabase
type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0]
const lock = Semaphore.makeUnsafe(1)

export type Migration = {
  id: string
  up: (tx: Transaction) => Effect.Effect<void, unknown>
}
export type BackupEvent = MigrationBackup.Event
export type Options = { backup?: MigrationBackup.Options }

export function apply(db: Database, input: Migration[] = migrations, options?: Options) {
  return execute(db, input, input, true, options)
}

/** Incremental callers execute their targets, but must still recognize the rest of the shipped journal. */
export function applyOnly(db: Database, input: Migration[], options?: Options) {
  return execute(db, input, [...migrations, ...input], false, options)
}

function execute(db: Database, targets: Migration[], universe: Migration[], initialize: boolean, options?: Options) {
  return lock.withPermit(
    Effect.gen(function* () {
      const backup = yield* db.transaction(
        (tx) =>
          Effect.gen(function* () {
            // Classification, validation and the complete batch share the cross-process write reservation.
            const tables = yield* tx.all<{ name: string }>(
              sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
            )
            const journal = yield* readJournal(tx, universe)
            if (initialize && !tables.some((table) => table.name === "session")) {
              if (tables.length) return yield* Effect.die("Database is not empty and has no session table")
              yield* schema.up(tx)
              yield* createJournal(tx)
              yield* Effect.forEach(targets, (migration) => record(tx, migration.id))
              return
            }
            const completed = new Set([...journal.applied, ...journal.legacy])
            const pending = targets.filter((migration) => !completed.has(migration.id))
            const changing =
              !journal.exists || journal.legacy.some((id) => !journal.applied.includes(id)) || pending.length > 0
            const file = (yield* tx.all<{ file: string | null }>(
              sql`SELECT file FROM pragma_database_list WHERE name = 'main'`,
            ))[0]?.file
            const manager = file ? yield* MigrationBackup.open(file, changing, options?.backup) : undefined
            if (manager) yield* manager.recover(journal)
            if (!changing) return
            if (manager)
              yield* manager.capture({
                baselineIDs: journal.applied,
                legacyIDs: journal.legacy,
                targetIDs: [
                  ...new Set([...journal.applied, ...journal.legacy, ...targets.map((item) => item.id)]),
                ].sort(),
              })
            yield* createJournal(tx)
            yield* Effect.forEach(
              journal.legacy.filter((id) => !journal.applied.includes(id)),
              (id) => record(tx, id),
            )
            for (const migration of pending) {
              yield* migration.up(tx)
              yield* record(tx, migration.id)
            }
            return manager
          }),
        { behavior: "immediate" },
      )
      if (!backup) return
      // COMMIT is observable separately from filesystem finalization. Recovery infers it from complete journal facts.
      const attemptID = backup.attemptID
      yield* backup.observe({ kind: "committed", attemptID })
      yield* db.transaction(
        (tx) =>
          Effect.gen(function* () {
            const journal = yield* readJournal(tx, universe)
            const current = yield* MigrationBackup.open(backup.file, false, options?.backup)
            if (!current || current.attemptID !== attemptID) return
            yield* current.recover(journal)
          }),
        { behavior: "immediate" },
      )
    }),
  )
}

function createJournal(tx: Transaction) {
  return tx.run(sql`CREATE TABLE IF NOT EXISTS migration (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)`)
}

function record(tx: Transaction, id: string) {
  return tx.run(sql`INSERT INTO migration (id, time_completed) VALUES (${id}, ${Date.now()})`)
}

function readJournal(tx: Transaction, universe: Migration[]) {
  return Effect.gen(function* () {
    const known = new Set(universe.map((item) => item.id))
    if (known.has("20260511173437_session-metadata")) known.add("20260530232709_lovely_romulus")
    const exists = !!(yield* tx.get(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='migration'`))
    const applied = exists
      ? (yield* tx.all<{ id: unknown }>(sql`SELECT id FROM migration ORDER BY id`)).map((row) => row.id)
      : []
    const unknown = applied.filter((id) => typeof id !== "string" || !known.has(id))
    if (unknown.length)
      return yield* Effect.fail(
        new Error(
          `This database was created by a newer Orchestra version (it has migrations this build does not know: ${unknown.join(", ")}). Update the app before opening it.`,
        ),
      )
    const legacy: string[] = []
    if (yield* tx.get(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'`)) {
      const columns = (yield* tx.all<{ name: string }>(
        sql`SELECT name FROM pragma_table_info('__drizzle_migrations')`,
      )).map((row) => row.name)
      const rows = yield* tx.all<{ name?: unknown; created_at?: unknown }>(sql`SELECT * FROM __drizzle_migrations`)
      for (const row of rows) {
        if (columns.includes("name") && row.name !== null && row.name !== undefined) {
          if (typeof row.name !== "string" || !row.name.length || !known.has(row.name))
            return yield* Effect.fail(new Error(`Unknown legacy migration name: ${String(row.name)}`))
          legacy.push(row.name)
          continue
        }
        const timestamp = row.created_at
        if (
          typeof timestamp !== "number" ||
          !Number.isSafeInteger(timestamp) ||
          !Number.isFinite(new Date(timestamp).getTime())
        )
          return yield* Effect.fail(new Error(`Invalid legacy migration timestamp: ${String(timestamp)}`))
        const prefix = new Date(timestamp).toISOString().replace(/[-:T]/g, "").slice(0, 14)
        const matches = [...new Set(universe.map((item) => item.id))].filter((id) => id.startsWith(`${prefix}_`))
        if (matches.length !== 1)
          return yield* Effect.fail(
            new Error(`Legacy migration timestamp ${timestamp} does not match any known migration unambiguously`),
          )
        legacy.push(matches[0]!)
      }
    }
    return {
      exists,
      applied: [...new Set(applied.filter((id): id is string => typeof id === "string"))].sort(),
      legacy: [...new Set(legacy)].sort(),
    }
  })
}
