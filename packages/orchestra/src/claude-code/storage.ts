export * as ClaudeCodeStorage from "./storage"

import path from "node:path"
import { Database } from "bun:sqlite"
import { Effect } from "effect"
import type { FSUtil } from "@orchestra/core/fs-util"

const APPLICATION_ID = 0x4f434343
const VERSION = 1

/** Private auxiliary database. No public Session schema, lease, or project-state lock directory. */
export function create<A>(input: {
  fs: FSUtil.Interface
  directory: Effect.Effect<string, unknown>
  empty: () => A
  decode: (text: string) => A
}) {
  const open = Effect.gen(function* () {
    const dir = yield* input.directory
    const file = path.join(dir, "archive.sqlite")
    const entries = yield* input.fs.readDirectoryEntries(dir)
    const existing = entries.find((entry) => entry.name === "archive.sqlite")
    if (existing && existing.type !== "file") return yield* Effect.fail(new Error("claude-code-unsafe-path"))
    if (!existing) yield* Effect.scoped(input.fs.open(file, { flag: "wx", mode: 0o600 }).pipe(
      Effect.asVoid, Effect.catchReason("PlatformError", "AlreadyExists", () => Effect.void)))
    if ((yield* input.fs.realPath(file)) !== file || (yield* input.fs.stat(file)).type !== "File")
      return yield* Effect.fail(new Error("claude-code-unsafe-path"))
    // SQLite may create a rollback journal during COMMIT. Refuse planted side-file links as well.
    if ((yield* input.fs.readDirectoryEntries(dir)).some((entry) =>
      ["archive.sqlite-journal", "archive.sqlite-wal", "archive.sqlite-shm"].includes(entry.name) && entry.type !== "file"))
      return yield* Effect.fail(new Error("claude-code-unsafe-path"))
    yield* input.fs.chmod(file, 0o600)
    const legacy = entries.find((entry) => entry.name === "archive.json")
    if (legacy && legacy.type !== "file") return yield* Effect.fail(new Error("claude-code-unsafe-path"))
    const legacyPath = path.join(dir, "archive.json")
    if (legacy && (yield* input.fs.realPath(legacyPath)) !== legacyPath)
      return yield* Effect.fail(new Error("claude-code-unsafe-path"))
    // File creation is not migration completion: every contender supplies the legacy candidate until COMMIT.
    const backup = legacy ? yield* input.fs.readFileString(legacyPath) : undefined
    return yield* Effect.acquireRelease(Effect.try({ try: () => new Database(file, { create: true, strict: true }), catch: (cause) => cause }),
      (db) => Effect.sync(() => db.close())).pipe(Effect.map((db) => ({ db, backup })))
  })
  const modify = <B>(transform: (state: A) => B, write = true) => Effect.scoped(Effect.gen(function* () {
    const { db, backup } = yield* open
    return yield* Effect.try({ try: () => {
      db.exec("PRAGMA busy_timeout=30000; PRAGMA synchronous=FULL;")
      return db.transaction(() => {
        const tables = db.query<{ name: string; type: string }, []>("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all()
        const application = db.query<{ application_id: number }, []>("PRAGMA application_id").get()?.application_id
        const version = db.query<{ user_version: number }, []>("PRAGMA user_version").get()?.user_version
        const initializing = tables.length === 0 && application === 0 && version === 0
        if (!initializing && (application !== APPLICATION_ID || version !== VERSION || tables.length !== 1 ||
          tables[0].name !== "native_state" || tables[0].type !== "table")) throw new Error("claude-code-corrupt-storage")
        if (initializing) db.exec("CREATE TABLE native_state (id INTEGER PRIMARY KEY CHECK (id = 1), payload TEXT NOT NULL)")
        const rows = db.query<{ id: number; payload: string }, []>("SELECT id,payload FROM native_state").all()
        if (!initializing && (rows.length !== 1 || rows[0].id !== 1)) throw new Error("claude-code-corrupt-storage")
        const row = rows[0]
        // Decode ownership and read CURRENT state under the kernel-protected SQLite transaction.
        const state = row ? input.decode(row.payload) : backup !== undefined ? input.decode(backup) : input.empty()
        const result = transform(state)
        if (write || !row) db.query("INSERT INTO native_state(id,payload) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload").run(JSON.stringify(state))
        if (initializing) db.exec(`PRAGMA application_id=${APPLICATION_ID}; PRAGMA user_version=${VERSION};`)
        return result
      }).immediate()
    }, catch: (cause) => cause })
  }))
  return { modify, read: modify((state) => state, false) }
}
