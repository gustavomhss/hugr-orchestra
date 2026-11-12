import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { basename, join } from "node:path"
import { readdir } from "node:fs/promises"
import { EffectDrizzleSqlite } from "@orchestra/effect-drizzle-sqlite"
import { layer } from "#sqlite"
import { DatabaseMigration } from "../../src/database/migration"

export const makeDb = EffectDrizzleSqlite.makeWithDefaults()
export const run = <A, E>(filename: string, body: (db: Effect.Success<typeof makeDb>) => Effect.Effect<A, E>, readonly = false) =>
  Effect.runPromise(Effect.gen(function* () { return yield* body(yield* makeDb) }).pipe(Effect.provide(layer({ filename, ...(readonly ? { readonly: true, readwrite: false, create: false, disableWAL: true } : {}) })), Effect.scoped))
export const migration = (id: string, body = id): DatabaseMigration.Migration => ({
  id, up: (tx) => tx.run(sql`INSERT INTO note(body) VALUES (${body})`).pipe(Effect.asVoid),
})
export const seed = (filename: string, ids: string[] = []) => run(filename, (db) => Effect.gen(function* () {
  yield* db.run("CREATE TABLE session (id TEXT PRIMARY KEY, metadata TEXT)")
  yield* db.run("CREATE TABLE note (body TEXT)")
  yield* db.run("INSERT INTO note VALUES ('precious')")
  yield* db.run("CREATE TABLE migration (id TEXT PRIMARY KEY, time_completed INTEGER NOT NULL)")
  yield* Effect.forEach(ids, (id) => db.run(sql`INSERT INTO migration VALUES (${id}, 1)`))
}))
export const ids = (filename: string) => run(filename, (db) => db.all<{ id: string }>("SELECT id FROM migration ORDER BY id").pipe(Effect.map((rows) => rows.map((row) => row.id))))
export const notes = (filename: string) => run(filename, (db) => db.all<{ body: string }>("SELECT body FROM note ORDER BY rowid").pipe(Effect.map((rows) => rows.map((row) => row.body))), true)
export const snapshots = async (filename: string) => (await readdir(join(filename, ".."))).filter((name) => name.startsWith(`${basename(filename)}.backup-`))
export const namedLegacy = (filename: string, names: string[]) => run(filename, (db) => Effect.gen(function* () {
  yield* db.run("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY, name TEXT, created_at INTEGER)")
  yield* Effect.forEach(names, (name) => db.run(sql`INSERT INTO __drizzle_migrations(name,created_at) VALUES (${name},1)`))
}))

