import { expect, test } from "bun:test"
import type { Database } from "bun:sqlite"
import path from "path"
import { Effect } from "effect"
import { SqlClient } from "effect/unstable/sql"
import { layer } from "@opencode-ai/core/database/sqlite.bun"
import { Sqlite } from "@opencode-ai/core/database/sqlite"
import { tmpdir } from "./fixture/tmpdir"

// Bun's own statement cache holds 20 statements. A statement left open keeps the database file open after close,
// which Windows reports as EBUSY when the directory is removed.
test("reuses statements past Bun's cache and leaves none open when the database closes", async () => {
  await using tmp = await tmpdir()
  const filename = path.join(tmp.path, "release.sqlite")
  const compiled: string[] = []
  const indexes = Array.from({ length: 30 }, (_, index) => index)
  await Effect.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const native = (yield* Sqlite.Native) as Database
      const prepare = native.prepare.bind(native)
      native.prepare = ((query: string) => {
        compiled.push(query)
        return prepare(query)
      }) as Database["prepare"]

      yield* sql.unsafe("CREATE TABLE item (value INTEGER NOT NULL)")
      const values = yield* Effect.forEach(indexes, (index) =>
        sql.unsafe<{ value: number }>(`INSERT INTO item (value) VALUES (${index}) RETURNING value`),
      )
      expect(values.map((rows) => rows[0]?.value)).toEqual(indexes)
      const counts = yield* Effect.forEach([1, 2, 3], () =>
        sql.unsafe<{ count: number }>("SELECT count(*) AS count FROM item"),
      )
      expect(counts.map((rows) => rows[0]?.count)).toEqual([30, 30, 30])
      expect(compiled.filter((query) => query === "SELECT count(*) AS count FROM item")).toHaveLength(1)
      // The log exists while the connection is open, so its absence after close is evidence.
      expect(yield* Effect.promise(() => Bun.file(`${filename}-wal`).exists())).toBe(true)
    }).pipe(Effect.provide(layer({ filename })), Effect.scoped),
  )

  // SQLite deletes the write-ahead log only when the connection really closes. The adapter's strict close refuses
  // while any statement is open, and the fallback close then leaves the connection, its log and its file open.
  expect(await Bun.file(`${filename}-wal`).exists()).toBe(false)
})
