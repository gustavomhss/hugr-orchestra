import assert from "node:assert/strict"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { basename, join } from "node:path"
import { readdir, readFile, lstat } from "node:fs/promises"
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


// Filesystem oracle only: inspect referenced files and inode identities, never reproduce recovery decisions.
export async function inspectBackupFootprint(filename: string, foreign: string[] = []) {
  const state = JSON.parse(await readFile(`${filename}.migration-backups.json`, "utf8")) as {
    legacyPins: { name: string; bytes: number }[]
    recentAttempts: { backup: { name: string; bytes: number } }[]
    currentBaselinePin: null | { name: string; bytes: number }
    active: null | { id: string; phase: "prepared" | "captured" | "ready"; tempName: string; finalName: string; backup: null | { name: string; bytes: number } }
    garbage: { name: string; bytes: number }[]
  }
  const work = `${filename}.migration-work`
  const entries = await readdir(work, { withFileTypes: true })
  const directories = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)
  assert.equal(entries.some((entry) => entry.isSymbolicLink()), false)
  assert.equal(entries.some((entry) => !entry.isDirectory() && !["owner.json", "owner.pending", "manifest.pending"].includes(entry.name)), false)
  assert.equal(directories.some((name) => name !== state.active?.id), false, "orphan UUID directory")
  if (!state.active) assert.deepEqual(directories, [])
  const scratch = await Promise.all(directories.map(async (name) => {
    assert.match(name, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i)
    const contents = await readdir(join(work, name), { withFileTypes: true })
    assert.equal(contents.some((entry) => entry.name !== "snapshot.sqlite" || !entry.isFile()), false, "unknown active scratch entry")
    return contents.map((entry) => join(work, name, entry.name))
  }))
  const backupNames = await snapshots(filename)
  const references = [...state.legacyPins, ...state.recentAttempts.map((entry) => entry.backup),
    ...(state.currentBaselinePin ? [state.currentBaselinePin] : []), ...state.garbage]
  const allowed = new Set([...references.map((entry) => entry.name), ...(state.active ? [state.active.finalName] : [])])
  assert.equal(backupNames.some((name) => !allowed.has(name) && !foreign.includes(join(filename, "..", name))), false, "unreferenced backup file")
  const files = [...backupNames.map((name) => join(filename, "..", name)), ...scratch.flat()].filter((name) => !foreign.includes(name))
  const physical = new Map<string, bigint>()
  const bytes = await Promise.all(files.map(async (name) => {
    const info = await lstat(name, { bigint: true })
    assert.equal(info.isFile() && !info.isSymbolicLink(), true)
    assert.notEqual(info.ino, 0n, "physical identity unavailable")
    physical.set(`${info.dev}:${info.ino}`, info.size)
    return info.size
  }))
  const physicalBytes = [...physical.values()].reduce((sum, value) => sum + value, 0n)
  const namedBytes = bytes.reduce((sum, value) => sum + value, 0n)
  assert.ok(physicalBytes <= namedBytes)
  assert.ok(physical.size <= state.legacyPins.length + 3 + 1 + 1, "physical snapshot bound exceeded")
  if (!state.active) assert.deepEqual(state.garbage, [], "normal finalize leaves pending garbage")
  return { state, directories, backupNames, physicalCopies: physical.size, physicalBytes, namedBytes }
}
