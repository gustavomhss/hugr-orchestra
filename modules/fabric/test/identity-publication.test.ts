import { expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { Database } from "@orchestra/core/database/database"
import { Credential } from "@orchestra/core/credential"
import { CredentialCipher } from "@orchestra/core/credential/cipher"
import { CredentialTable } from "@orchestra/core/credential/sql"
import { FabricConnection } from "@orchestra/schema/fabric-connection"
import { FabricResource } from "@orchestra/schema/fabric-resource"
import { Integration } from "@orchestra/schema/integration"
import { AppProcess } from "@orchestra/core/process"
import { Location } from "@orchestra/core/location"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { CapabilityRequestTable } from "@orchestra/core/capability/sql"
import { Effect, Exit, Layer, Option, Schema } from "effect"
import { eq, sql } from "drizzle-orm"
import { FabricIdentityAttempts } from "../src/identity-attempt"
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
        // Three trigger writes make the connection insert visible in total_changes after a full rollback erases the rows.
        yield* db.db.run(
          sql`CREATE TRIGGER pub_connection_fail BEFORE INSERT ON fabric_connection BEGIN INSERT INTO pub_connection_attempt VALUES (NEW.id); INSERT INTO pub_connection_attempt VALUES (NEW.id); INSERT INTO pub_connection_attempt VALUES (NEW.id); SELECT RAISE(ABORT, 'PUB_FORCED_SQL'); END`,
        )
        const before = yield* db.db.get<{ n: number }>(sql`SELECT total_changes() AS n`)
        const publisher = yield* FabricIdentityPublication.make({ ...s.options, exchange: s.host })
        const exit = yield* Effect.exit(
          s.run(publisher.publish({ context: s.selected.context, attempt: s.selected.attempt, completion })),
        )
        expect(Exit.isFailure(exit)).toBe(true)
        if (!Exit.isFailure(exit) || exit.cause.reasons[0]?._tag !== "Fail")
          throw new Error("Expected the forced connection insert to abort")
        expect(exit.cause.reasons[0].error).toMatchObject({ code: "outcome_unknown" })
        const after = yield* db.db.get<{ n: number }>(sql`SELECT total_changes() AS n`)
        if (!before || !after) throw new Error("SQLite change counter was unavailable")
        expect(after.n - before.n).toBe(4)
        expect(yield* db.db.get<{ n: number }>(sql`SELECT count(*) AS n FROM pub_connection_attempt`)).toEqual({ n: 0 })
        expect(yield* db.db.select().from(CredentialTable)).toEqual([])
        expect(yield* db.db.select().from(FabricConnectionTable)).toEqual([])
        expect((yield* db.db.select().from(FabricIdentityAttemptTable).get())!.state).toBe("exchanging")
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).not.toEqual([])
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("PUB04 a secret changed after sealing refuses publication and preserves another writer's ciphertext", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        const completion = yield* s.run(s.host.exchange(s.selected))
        const credentials = yield* Credential.Service
        const cipher = yield* CredentialCipher.Service
        const db = yield* Database.Service
        const foreign = yield* credentials.create({
          integrationID: Integration.ID.make("foreign-publisher"),
          label: "foreign",
          value: Credential.Cache.make({
            type: "cache",
            methodID: Integration.MethodID.make("entra"),
            format: "microsoft.identity.cache",
            version: 1,
            serialized: "FOREIGN_CACHE_MUST_SURVIVE",
          }),
        })
        const stored = yield* db.db
          .select({ sealed: sql<string>`${CredentialTable.value}` })
          .from(CredentialTable)
          .where(eq(CredentialTable.id, foreign.id))
          .get()
        if (!stored) throw new Error("Foreign cache positive control was not stored")
        const seen = { sealed: false, armed: true }
        const operators = {
          ...s.operators,
          validate: (
            binding: Parameters<typeof s.operators.validate>[0],
            target: Parameters<typeof s.operators.validate>[1],
          ) =>
            Effect.gen(function* () {
              if (
                seen.sealed &&
                seen.armed &&
                target.action === "fabric.identity.publish" &&
                db.inTransaction &&
                !(yield* db.inTransaction)
              ) {
                seen.armed = false
                yield* Effect.promise(async () => {
                  const { Database } = await import("bun:sqlite")
                  const store = new Database(f.filename)
                  store
                    .query("UPDATE fabric_identity_secret SET sealed = sealed || 'x', bytes = bytes + 1 WHERE id = ?")
                    .run(s.selected.attempt.id)
                  store.close()
                })
              }
              yield* s.operators.validate(binding, target)
            }),
        }
        const publisher = yield* FabricIdentityPublication.make({ ...s.options, operators, exchange: s.host }).pipe(
          Effect.provideService(CredentialCipher.Service, {
            open: cipher.open,
            seal: (value) => {
              seen.sealed = true
              return cipher.seal(value)
            },
          }),
        )
        yield* publicationRefusal(
          s.run(publisher.publish({ context: s.selected.context, attempt: s.selected.attempt, completion })),
          "conflict",
        )
        expect(seen.sealed).toBe(true)
        expect(seen.armed).toBe(false)
        const after = yield* db.db
          .select({ sealed: sql<string>`${CredentialTable.value}` })
          .from(CredentialTable)
          .where(eq(CredentialTable.id, foreign.id))
          .get()
        expect(after).toEqual(stored)
        expect(yield* db.db.select().from(FabricConnectionTable)).toEqual([])
        expect((yield* db.db.select().from(FabricIdentityAttemptTable).get())!.state).toBe("exchanging")
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).not.toEqual([])
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("PUB05 one concurrent publication wins, the same key retries, and a new key does not open another connection", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        const completion = yield* s.run(s.host.exchange(s.selected))
        const publisher = yield* FabricIdentityPublication.make({ ...s.options, exchange: s.host })
        const input = { context: s.selected.context, attempt: s.selected.attempt, completion }
        const raced = yield* Effect.all(
          [
            Effect.exit(s.run(publisher.publish(input), "pub05-left")),
            Effect.exit(s.run(publisher.publish(input), "pub05-right")),
          ],
          { concurrency: 2 },
        )
        expect(raced.filter(Exit.isSuccess)).toHaveLength(1)
        expect(raced.filter(Exit.isFailure)).toHaveLength(1)
        const db = yield* Database.Service
        expect(yield* db.db.select().from(CredentialTable)).toHaveLength(1)
        expect(yield* db.db.select().from(FabricConnectionTable)).toHaveLength(1)
        const winner = raced.find(Exit.isSuccess)
        if (!winner) throw new Error("Concurrent publication had no winner")
        const winnerKey = raced[0] === winner ? "pub05-left" : "pub05-right"
        const published = winner.value
        expect(yield* s.run(publisher.publish(input), winnerKey)).toEqual(published)
        yield* publicationRefusal(
          s.run(publisher.publish(input), winnerKey === "pub05-left" ? "pub05-right" : "pub05-left"),
          "conflict",
        )
        yield* publicationRefusal(s.run(publisher.publish(input), "pub05-new"), "conflict")
        expect(yield* db.db.select().from(FabricConnectionTable)).toHaveLength(1)
        expect(yield* db.db.select().from(CredentialTable)).toHaveLength(1)
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("PUB06 swapped envelopes, swapped cache bytes and a wrong key refuse without rewriting stored secrets", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        const publisher = yield* FabricIdentityPublication.make({ ...s.options, exchange: s.host })
        const firstCompletion = yield* s.run(s.host.exchange(s.selected))
        const first = yield* s.run(
          publisher.publish({ context: s.selected.context, attempt: s.selected.attempt, completion: firstCompletion }),
        )
        const next = yield* s.next()
        const secondCompletion = yield* s.run(s.host.exchange(next))
        const second = yield* s.run(
          publisher.publish({ context: next.context, attempt: next.attempt, completion: secondCompletion }),
        )
        const cipher = yield* CredentialCipher.Service
        const db = yield* Database.Service
        const positive = yield* s.run(publisher.get({ context: s.selected.context, connection: first.connection }))
        expect(positive.state).toBe("connected")
        expect(JSON.stringify(positive)).not.toContain("SYNTHETIC_CXH_REFRESH")
        const rows = yield* db.db.select().from(FabricConnectionTable)
        const left = rows.find((row) => row.id === first.connection.id)
        const right = rows.find((row) => row.id === second.connection.id)
        if (!left || !right) throw new Error("Both published connections must be stored")
        yield* db.db
          .update(FabricConnectionTable)
          .set({ sealed: right.sealed, bytes: right.bytes })
          .where(eq(FabricConnectionTable.id, left.id))
          .run()
        const swapped = (yield* db.db
          .select()
          .from(FabricConnectionTable)
          .where(eq(FabricConnectionTable.id, left.id))
          .get())!
        yield* publicationRefusal(
          s.run(publisher.get({ context: s.selected.context, connection: first.connection })),
          "unavailable",
        )
        expect(
          yield* db.db.select().from(FabricConnectionTable).where(eq(FabricConnectionTable.id, left.id)).get(),
        ).toEqual(swapped)
        yield* db.db
          .update(FabricConnectionTable)
          .set({ sealed: left.sealed, bytes: left.bytes })
          .where(eq(FabricConnectionTable.id, left.id))
          .run()
        const cache = yield* db.db
          .select({ sealed: sql<string>`${CredentialTable.value}` })
          .from(CredentialTable)
          .where(eq(CredentialTable.id, left.credential_id))
          .get()
        const other = yield* db.db
          .select({ sealed: sql<string>`${CredentialTable.value}` })
          .from(CredentialTable)
          .where(eq(CredentialTable.id, right.credential_id))
          .get()
        if (!cache || !other) throw new Error("Published caches must remain stored")
        yield* db.db
          .update(CredentialTable)
          .set({ value: sql`${other.sealed}` as never })
          .where(eq(CredentialTable.id, left.credential_id))
          .run()
        yield* publicationRefusal(
          s.run(publisher.get({ context: s.selected.context, connection: first.connection })),
          "unavailable",
        )
        expect(
          yield* db.db
            .select({ sealed: sql<string>`${CredentialTable.value}` })
            .from(CredentialTable)
            .where(eq(CredentialTable.id, left.credential_id))
            .get(),
        ).toEqual({ sealed: other.sealed })
        yield* db.db
          .update(CredentialTable)
          .set({ value: sql`${cache.sealed}` as never })
          .where(eq(CredentialTable.id, left.credential_id))
          .run()
        const plain = cipher.open(left.sealed)
        if (!plain) throw new Error("Real cipher must open the connection envelope before key substitution")
        const wrong = CredentialCipher.seal(plain, randomBytes(32))
        yield* db.db
          .update(FabricConnectionTable)
          .set({ sealed: wrong, bytes: Buffer.byteLength(wrong) })
          .where(eq(FabricConnectionTable.id, left.id))
          .run()
        const substituted = yield* db.db
          .select()
          .from(FabricConnectionTable)
          .where(eq(FabricConnectionTable.id, left.id))
          .get()
        yield* publicationRefusal(
          s.run(publisher.get({ context: s.selected.context, connection: first.connection })),
          "unavailable",
        )
        expect(
          yield* db.db.select().from(FabricConnectionTable).where(eq(FabricConnectionTable.id, left.id)).get(),
        ).toEqual(substituted)
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("PUB07 completed inspection survives the original deadline and cancel or callback reuse cannot reopen it", () => {
  expectSpawn(import.meta.path)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        const publisher = yield* FabricIdentityPublication.make({ ...s.options, exchange: s.host })
        const completion = yield* s.run(s.host.exchange(s.selected))
        const published = yield* s.run(
          publisher.publish({ context: s.selected.context, attempt: s.selected.attempt, completion }),
        )
        const clock = { value: Date.now() + 11 * 60 * 1000 }
        const attempts = yield* FabricIdentityAttempts.make({
          operators: s.operators,
          root: s.options.root,
          profile: s.options.profile,
          now: () => clock.value,
        })
        expect(
          yield* s.run(attempts.inspect({ context: s.selected.context, attempt: published.attempt })),
        ).toMatchObject({ state: "completed", attempt: published.attempt })
        yield* publicationRefusal(
          s.run(attempts.cancel({ context: s.selected.context, attempt: published.attempt })),
          "conflict",
        )
        yield* publicationRefusal(s.run(s.callbacks.consume(s.selected)), "conflict")
        expect((yield* (yield* Database.Service).db.select().from(FabricIdentityAttemptTable).get())!.state).toBe(
          "completed",
        )
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("PUB08 canonical connection identity, expiry before consume and the context limit refuse a second publication", () => {
  expectSpawn(import.meta.path)
  expect(FabricConnection.ID).toBe(FabricResource.ConnectionID)
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* contextualSetup(f.root)
        const completion = yield* s.run(s.host.exchange(s.selected))
        const clock = { value: Date.now() }
        const publisher = yield* FabricIdentityPublication.make({
          ...s.options,
          now: () => clock.value,
          exchange: s.host,
        })
        const input = { context: s.selected.context, attempt: s.selected.attempt, completion }
        clock.value += 11 * 60 * 1000
        yield* publicationRefusal(s.run(publisher.publish(input)), "expired")
        clock.value = Date.now()
        const published = yield* s.run(publisher.publish(input))
        expect(published.connection.id.startsWith("fconn_")).toBe(true)
        expect(Option.isNone(Schema.decodeUnknownOption(FabricConnection.ID)(published.connection.id))).toBe(false)
        const info = yield* s.run(publisher.get({ context: s.selected.context, connection: published.connection }))
        expect(Object.isFrozen(info)).toBe(true)
        expect(Object.keys(info).sort()).toEqual([
          "cloud",
          "connection",
          "context",
          "homeAccountID",
          "objectID",
          "scopes",
          "state",
          "tenantID",
        ])
        expect(JSON.stringify(info)).not.toContain("SYNTHETIC_CXH_REFRESH")
        expect(JSON.stringify(info)).not.toContain("enc:v1:")
        const db = yield* Database.Service
        const row = yield* db.db.select().from(FabricConnectionTable).get()
        if (!row) throw new Error("Published connection missing")
        yield* Effect.forEach(
          Array.from({ length: 63 }, () => FabricConnection.ID.create()),
          (id) =>
            db.db
              .insert(FabricConnectionTable)
              .values({ ...row, id })
              .run(),
          { concurrency: 1 },
        )
        const next = yield* s.next()
        const another = yield* s.run(s.host.exchange(next))
        clock.value = Date.now()
        yield* publicationRefusal(
          s.run(publisher.publish({ context: next.context, attempt: next.attempt, completion: another })),
          "limit",
        )
        expect(yield* db.db.select().from(FabricConnectionTable)).toHaveLength(64)
        expect(yield* db.db.select().from(CredentialTable)).toHaveLength(1)
        expect(
          (yield* db.db
            .select()
            .from(FabricIdentityAttemptTable)
            .where(eq(FabricIdentityAttemptTable.id, next.attempt.id))
            .get())!.state,
        ).toBe("exchanging")
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})
