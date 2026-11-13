import { createHash } from "node:crypto"
import { copyFile, readdir, readFile, rename } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { Database } from "bun:sqlite"

// The documented restore: move the live database and its sidecars aside, then
// copy the migration backup onto the database path. The caller starts the same
// CLI afterwards. This does not open the owner's database.
export async function restoreIsolatedDatabase(file: string) {
  const backup = await onlyBackup(file)
  const bytes = await readFile(backup)
  const hash = createHash("sha256").update(bytes).digest("hex")
  await moveAside(file)
  await moveAside(`${file}-wal`)
  await moveAside(`${file}-shm`)
  await copyFile(backup, file)
  if (createHash("sha256").update(await readFile(file)).digest("hex") !== hash)
    throw new Error("ISOLATED_DB_RESTORE_BYTES")
  await absent(`${file}-wal`)
  await absent(`${file}-shm`)
}

// A fresh file records every migration inside the creating transaction and writes
// no backup. Holding back the last single-table migration makes the next open of
// this same file take the backup, then reapply that migration.
export async function holdBackLastMigration(file: string) {
  const db = new Database(file)
  try {
    const last = db.query("SELECT id FROM migration ORDER BY id DESC LIMIT 1").get() as { id: string } | null
    if (!last) throw new Error("ISOLATED_DB_MIGRATION_JOURNAL_EMPTY")
    const tables = createdTables(await readFile(migrationSource(last.id), "utf8"))
    if (tables.length !== 1) throw new Error(`ISOLATED_DB_MIGRATION_NOT_ONE_TABLE: ${last.id}`)
    const table = tables[0]!
    if (!/^[A-Za-z0-9_]+$/.test(table)) throw new Error("ISOLATED_DB_MIGRATION_TABLE_NAME")
    const exists = db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table)
    if (!exists) throw new Error(`ISOLATED_DB_MIGRATION_TABLE_ABSENT: ${table}`)
    db.run(`DROP TABLE "${table}"`)
    db.run("DELETE FROM migration WHERE id = ?", [last.id])
    db.run("PRAGMA wal_checkpoint(TRUNCATE)")
    return { id: last.id, table }
  } finally {
    db.close()
  }
}

export function isolatedMigrationApplied(file: string, id: string, table: string) {
  const db = new Database(file)
  try {
    const migrated = db.query("SELECT id FROM migration WHERE id = ?").get(id) !== null
    const present = db.query("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) !== null
    return migrated && present
  } finally {
    db.close()
  }
}

function migrationSource(id: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error("ISOLATED_DB_MIGRATION_ID")
  return join(import.meta.dirname, "../../../../packages/core/src/database/migration", `${id}.ts`)
}

function createdTables(source: string) {
  // Migration sources write the SQL inside a template string, so the backtick is escaped.
  return [...source.matchAll(/CREATE TABLE \\`([^`\\]+)\\`/g)].map((match) => match[1]!)
}

async function onlyBackup(file: string) {
  const base = basename(file)
  const names = (await readdir(dirname(file))).filter((name) => name.startsWith(`${base}.backup-`)).sort()
  if (names.length !== 1) throw new Error(`ISOLATED_DB_BACKUP_COUNT: ${names.length}`)
  const name = names[0]!
  const rest = name.slice(`${base}.backup-`.length)
  const split = rest.lastIndexOf("-")
  const from = rest.slice(0, split)
  const time = rest.slice(split + 1)
  if (split <= 0 || !/^[A-Za-z0-9_-]+$/.test(from) || !/^\d+$/.test(time))
    throw new Error("ISOLATED_DB_BACKUP_NAME")
  return join(dirname(file), name)
}

async function moveAside(path: string) {
  await rename(path, `${path}.aside`).catch((error: unknown) => {
    if (missing(error)) return
    throw error
  })
}

async function absent(path: string) {
  await readFile(path).then(
    () => {
      throw new Error("ISOLATED_DB_RESTORE_SIDECAR")
    },
    (error: unknown) => {
      if (missing(error)) return
      throw error
    },
  )
}

function missing(error: unknown) {
  return error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT"
}
