import { expect, test } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { Credential } from "@orchestra/core/credential"
import { CredentialTable } from "@orchestra/core/credential/sql"
import { AppProcess } from "@orchestra/core/process"
import { Location } from "@orchestra/core/location"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { CapabilityRequestTable } from "@orchestra/core/capability/sql"
import { Effect, Exit, Layer } from "effect"
import { sql } from "drizzle-orm"
import { FabricIdentityPublication } from "../src/identity-publication"
import { FabricIdentityAttemptTable } from "../src/identity-attempt/sql"
import { FabricIdentitySecretTable } from "../src/identity-secret/sql"
import { FabricConnectionTable } from "../src/connection/sql"
import { fixtures } from "./fixture/context"
import { layers } from "./fixture/identity-preparation"
import { contextualSetup } from "./fixture/identity-exchange"
import { objectID, tenant } from "./fixture/identity-token"
import type { FabricIdentityPublicationContract } from "../src/identity-publication-contract"

const cases = fixtures()
const layer = (filename: string) =>
  Credential.layerFrom(undefined).pipe(
    Layer.provideMerge(Layer.merge(layers(filename), LayerNode.compile(LayerNode.group([AppProcess.node])))),
  )

function publicationRefusal<A, R>(
  operation: Effect.Effect<A, FabricIdentityPublicationContract.Error, R>,
  code: FabricIdentityPublicationContract.Error["code"],
) {
  return Effect.gen(function* () {
    const exit = yield* Effect.exit(operation)
    expect(Exit.isFailure(exit)).toBe(true)
    if (!Exit.isFailure(exit) || exit.cause.reasons[0]?._tag !== "Fail")
      throw new Error("Expected typed publication refusal")
    expect(exit.cause.reasons[0].error.code).toBe(code)
  })
}

test("PUB01 real exchange completion publishes one protected cache and connection without leaking secrets", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        const completion = yield* s.run(s.host.exchange(s.selected))
        const publisher = yield* FabricIdentityPublication.make({ ...s.options, exchange: s.host })
        const published = yield* s.run(
          publisher.publish({ context: s.selected.context, attempt: s.selected.attempt, completion }),
        )
        expect(published.attempt).toEqual({ ...s.selected.attempt, revision: 4 })
        expect(published.connection.generation).toBe(1)
        const info = yield* s.run(publisher.get({ context: s.selected.context, connection: published.connection }))
        expect(info).toMatchObject({ state: "connected", cloud: "public", tenantID: tenant, objectID })
        expect(JSON.stringify(info)).not.toContain("SYNTHETIC_CXH_REFRESH")
        const db = yield* Database.Service
        const credentials = yield* Credential.Service
        const rows = yield* db.db.select({ id: CredentialTable.id }).from(CredentialTable)
        expect(rows).toHaveLength(1)
        const snapshot = yield* credentials.cache.read(rows[0]!.id)
        if (!snapshot || snapshot.mode !== "owned") throw new Error("Published cache must be an owned credential")
        expect(snapshot.credential.value.serialized).toContain("SYNTHETIC_CXH_REFRESH")
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual([])
        expect((yield* db.db.select().from(FabricIdentityAttemptTable).get())!.state).toBe("completed")
        expect(yield* db.db.select().from(FabricConnectionTable)).toHaveLength(1)
        const receipts = JSON.stringify(yield* db.db.select().from(CapabilityRequestTable))
        expect(receipts).not.toContain("SYNTHETIC_CXH_REFRESH")
        expect(receipts).not.toContain(snapshot.credential.value.serialized)
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("PUB02 a copied completion and a missing invocation refuse before publication", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        const completion = yield* s.run(s.host.exchange(s.selected))
        const publisher = yield* FabricIdentityPublication.make({ ...s.options, exchange: s.host })
        const input = { context: s.selected.context, attempt: s.selected.attempt, completion }
        yield* publicationRefusal(
          publisher.publish(input).pipe(Effect.provideService(Location.Service, s.info.location)),
          "invocation_binding_missing",
        )
        yield* publicationRefusal(
          s.run(publisher.publish({ ...input, completion: { ...completion } as typeof completion })),
          "denied",
        )
        const db = yield* Database.Service
        expect(yield* db.db.select().from(CredentialTable)).toEqual([])
        expect(yield* db.db.select().from(FabricConnectionTable)).toEqual([])
        expect((yield* db.db.select().from(FabricIdentityAttemptTable).get())!.state).toBe("exchanging")
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("PUB03 a real SQL failure after the first write rolls back credential, connection and attempt together", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        const completion = yield* s.run(s.host.exchange(s.selected))
        const db = yield* Database.Service
        yield* db.db.run(sql`CREATE TABLE pub_connection_attempt (id TEXT NOT NULL)`)
        yield* db.db.run(
          sql`CREATE TRIGGER pub_connection_fail BEFORE INSERT ON fabric_connection BEGIN INSERT INTO pub_connection_attempt VALUES (NEW.id); SELECT RAISE(ABORT, 'PUB_FORCED_SQL'); END`,
        )
        const publisher = yield* FabricIdentityPublication.make({ ...s.options, exchange: s.host })
        const exit = yield* Effect.exit(
          s.run(publisher.publish({ context: s.selected.context, attempt: s.selected.attempt, completion })),
        )
        expect(Exit.isFailure(exit)).toBe(true)
        expect(yield* db.db.select({ id: sql<string>`id` }).from(sql`pub_connection_attempt`)).toHaveLength(1)
        expect(yield* db.db.select().from(CredentialTable)).toEqual([])
        expect(yield* db.db.select().from(FabricConnectionTable)).toEqual([])
        expect((yield* db.db.select().from(FabricIdentityAttemptTable).get())!.state).toBe("exchanging")
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).not.toEqual([])
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})
