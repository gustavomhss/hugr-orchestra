import { expect, test } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { sql } from "drizzle-orm"
import { Effect } from "effect"
import { fixtures, layer } from "./fixture/context"

const cases = fixtures()

test("FCF01 nested real fixtures select their requested SQLite file and fresh clients", () => {
  const first = cases.box()
  const second = cases.box()
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    expect(yield* database.db.all(sql`PRAGMA database_list`))
      .toContainEqual({ seq: 0, name: "main", file: first.filename })
    yield* Effect.gen(function* () {
      const other = yield* Database.Service
      expect(other).not.toBe(database)
      expect(other.db).not.toBe(database.db)
      expect(other.storageID).not.toBe(database.storageID)
      expect(yield* other.db.all(sql`PRAGMA database_list`))
        .toContainEqual({ seq: 0, name: "main", file: second.filename })
    }).pipe(Effect.provide(layer(second.filename)))
    yield* Effect.gen(function* () {
      const reconstructed = yield* Database.Service
      expect(reconstructed).not.toBe(database)
      expect(reconstructed.db).not.toBe(database.db)
      expect(reconstructed.storageID).toBe(database.storageID)
      expect(yield* reconstructed.db.all(sql`PRAGMA database_list`))
        .toContainEqual({ seq: 0, name: "main", file: first.filename })
    }).pipe(Effect.provide(layer(first.filename)))
    expect(yield* Database.Service).toBe(database)
  })).pipe(Effect.provide(layer(first.filename))))
})
