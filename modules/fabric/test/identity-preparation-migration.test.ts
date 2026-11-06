import { expect, test } from "bun:test"
import { readdirSync } from "node:fs"
import { Database } from "@orchestra/core/database/database"
import { Location } from "@orchestra/core/location"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { FabricContexts } from "../src/context"
import { FabricIdentityPreparation } from "../src/identity-preparation"
import { FabricIdentityAttemptTable } from "../src/identity-attempt/sql"
import { FabricIdentitySecretTable } from "../src/identity-secret/sql"
import { fixtures, owner, request } from "./fixture/context"
import { profile, setup } from "./fixture/identity-attempt"
import { layers } from "./fixture/identity-preparation"

const cases = fixtures()
const migration = "20261105235038_fabric_identity_secret"

test("PKP10 the previous metadata-only store is backed up, migrated and prepared without replacing its reservation", async () => {
  const f = cases.box()
  const original = await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const attempt = yield* s.run(s.attempts.begin(s.input))
        const db = yield* Database.Service
        const row = (yield* db.db.select().from(FabricIdentityAttemptTable).get())!
        expect(yield* db.db.all(sql`SELECT id FROM migration WHERE id=${migration}`)).toEqual([{ id: migration }])
        yield* db.db.run(sql`DROP TABLE fabric_identity_secret`)
        yield* db.db.run(sql`DELETE FROM migration WHERE id=${migration}`)
        return { row, selection: { context: s.info.context, attempt } }
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
  expect(readdirSync(f.directory).filter((name) => name.includes(".backup-"))).toEqual([])
  await Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const operators = yield* owner()
        const contexts = yield* FabricContexts.make({ operators, root: f.root })
        const info = yield* request(operators, contexts.resolve(original.selection.context))
        const preparation = yield* FabricIdentityPreparation.make({ operators, root: f.root, profile: profile() })
        const result = yield* request(operators, preparation.prepare(original.selection)).pipe(
          Effect.provideService(Location.Service, info.location),
        )
        expect(result.attempt).toEqual({ id: original.selection.attempt.id, revision: 2 })
        const db = yield* Database.Service
        const row = (yield* db.db.select().from(FabricIdentityAttemptTable).get())!
        expect(row.id).toBe(original.row.id)
        expect(row.time_created).toBe(original.row.time_created)
        expect(row.expires_at).toBe(original.row.expires_at)
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toHaveLength(1)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
  expect(readdirSync(f.directory).filter((name) => name.includes(".backup-"))).toHaveLength(1)
})
