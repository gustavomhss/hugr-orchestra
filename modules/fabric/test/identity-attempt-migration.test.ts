import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { Database } from "@orchestra/core/database/database"
import { sql } from "drizzle-orm"
import { Effect, Exit } from "effect"
import { FabricIdentityAttemptTable } from "../src/identity-attempt/sql"
import { fixtures, layer } from "./fixture/context"

const cases = fixtures()
const migration = "20261105230711_fabric_identity_attempt"

test("IDA09 existing Database backs up before attempt migration; newer schema remains untouched", async () => {
  const f = cases.box()
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* Database.Service
        expect(yield* db.db.all(sql`SELECT id FROM migration WHERE id=${migration}`)).toEqual([{ id: migration }])
        yield* db.db.run(sql`DROP TABLE fabric_identity_attempt`)
        yield* db.db.run(sql`DELETE FROM migration WHERE id=${migration}`)
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
  expect(readdirSync(f.directory).filter((name) => name.includes(".backup-"))).toEqual([])
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const db = yield* Database.Service
        expect(yield* db.db.select().from(FabricIdentityAttemptTable)).toEqual([])
        expect(yield* db.db.all(sql`SELECT id FROM migration WHERE id=${migration}`)).toEqual([{ id: migration }])
        yield* db.db.run(sql`INSERT INTO migration (id,time_completed) VALUES ('20990101000000_unknown_schema',0)`)
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
  expect(readdirSync(f.directory).filter((name) => name.includes(".backup-"))).toHaveLength(1)
  const before = readFileSync(f.filename)
  const reopened = await Effect.runPromiseExit(
    Effect.scoped(
      Effect.gen(function* () {
        yield* Database.Service
        throw new Error("Newer schema must not expose Database")
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
  expect(Exit.isFailure(reopened)).toBe(true)
  if (!Exit.isFailure(reopened)) throw new Error("Expected newer-schema refusal")
  expect(String(reopened.cause)).toContain("newer Orchestra version")
  expect(readFileSync(f.filename)).toEqual(before)
})
