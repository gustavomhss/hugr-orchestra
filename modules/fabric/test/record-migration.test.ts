import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { Database } from "@orchestra/core/database/database"
import { sql } from "drizzle-orm"
import { Effect, Exit } from "effect"
import { fixtures } from "./fixture/context"
import { layers, rows, setup } from "./fixture/record"

const cases = fixtures()
const migration = "20261105195255_fabric_record"

test("PR09 existing store migrates with a real backup; newer schema refuses before protected writes", async () => {
  const f = cases.box()
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* Database.Service
        const known = yield* db.db.all<{ id: string }>(sql`SELECT id FROM migration WHERE id=${migration}`)
        expect(known).toEqual([{ id: migration }])
        // Recreate the previous schema using the actual Database's migration journal.
        // No fabricated sqlite adapter or copy of the migration logic is involved.
        yield* db.db.run(sql`DROP TABLE fabric_record`)
        yield* db.db.run(sql`DELETE FROM migration WHERE id=${migration}`)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
  expect(readdirSync(f.directory).filter((name) => name.includes(".backup-"))).toEqual([])
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* Database.Service
        expect(yield* rows).toEqual([])
        expect(yield* db.db.all(sql`SELECT id FROM migration WHERE id=${migration}`)).toEqual([{ id: migration }])
        const s = yield* setup(f.root)
        expect(s.context.generation).toBe(1)
        yield* db.db.run(sql`INSERT INTO migration (id,time_completed) VALUES ('20990101000000_unknown_schema',0)`)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
  expect(readdirSync(f.directory).filter((name) => name.includes(".backup-"))).toHaveLength(1)
  const before = readFileSync(f.filename)
  const reopened = await Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Database.Service
        throw new Error("Newer schema must not produce a usable Database")
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
  expect(Exit.isFailure(reopened)).toBe(true)
  if (!Exit.isFailure(reopened)) throw new Error("Expected newer-schema refusal")
  expect(String(reopened.cause)).toContain("newer Orchestra version")
  expect(readFileSync(f.filename)).toEqual(before)
})
