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
test("leaves no statement open after more distinct queries than Bun caches", async () => {
  await using tmp = await tmpdir()
  await Effect.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient
      const native = (yield* Sqlite.Native) as Database
      const values = yield* Effect.forEach(Array.from({ length: 30 }, (_, index) => index), (index) =>
        sql.unsafe<{ value: number }>(`SELECT ${index} AS value`),
      )
      expect(values.map((rows) => rows[0]?.value)).toEqual(Array.from({ length: 30 }, (_, index) => index))
      // sqlite3_close, unlike the default sqlite3_close_v2, refuses while any statement is still open.
      expect(() => native.close(true)).not.toThrow()
    }).pipe(Effect.provide(layer({ filename: path.join(tmp.path, "release.sqlite") })), Effect.scoped),
  )
})
