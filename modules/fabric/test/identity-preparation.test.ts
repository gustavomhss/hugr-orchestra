import { expect, test } from "bun:test"
import { createHash, randomBytes } from "node:crypto"
import { CredentialCipher } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { Location } from "@orchestra/core/location"
import { CapabilityRequestTable } from "@orchestra/core/capability/sql"
import { Deferred, Effect, Exit } from "effect"
import { eq, sql } from "drizzle-orm"
import { FabricIdentityPreparation } from "../src/identity-preparation"
import { FabricIdentityProfile } from "../src/identity-profile"
import { FabricIdentitySecretTable } from "../src/identity-secret/sql"
import { FabricIdentityAttemptTable } from "../src/identity-attempt/sql"
import { fixtures, layer, request } from "./fixture/context"
import { refusal } from "./fixture/identity-attempt"
import { layers, preparedSetup } from "./fixture/identity-preparation"

const cases = fixtures()

test("PKP01 real PKCE/URL and authenticated ciphertext preserve the original deadline without secret receipts", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* preparedSetup(f.root)
        const ready = yield* s.run(s.preparation.prepare(s.selection))
        expect(ready.attempt).toEqual({ id: s.attempt.id, revision: 2 })
        const url = new URL(ready.authorizationURL)
        expect(url.origin).toBe("https://login.microsoftonline.com")
        expect(url.pathname).toBe("/organizations/oauth2/v2.0/authorize")
        expect(url.searchParams.get("redirect_uri")).toBe(s.host.redirectUri)
        expect(url.searchParams.get("client_id")).toBe(s.host.clientID)
        expect(url.searchParams.get("response_type")).toBe("code")
        expect(url.searchParams.get("code_challenge_method")).toBe("S256")
        const db = yield* Database.Service
        const row = (yield* db.db.select().from(FabricIdentitySecretTable).get())!
        const cipher = yield* CredentialCipher.Service
        const plain = cipher.open(row.sealed)
        if (!plain) throw new Error("Actual cipher positive control must open this fresh envelope")
        const envelope = JSON.parse(plain)
        expect(envelope.state).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(envelope.nonce).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(envelope.state).not.toBe(envelope.nonce)
        expect(envelope.challenge).toBe(createHash("sha256").update(envelope.verifier).digest("base64url"))
        expect(url.searchParams.get("state")).toBe(envelope.state)
        expect(url.searchParams.get("nonce")).toBe(envelope.nonce)
        expect(url.searchParams.get("code_challenge")).toBe(envelope.challenge)
        expect(url.searchParams.get("scope")?.split(" ")).toContain(s.input.scopes[0])
        expect(ready.authorizationURL).not.toContain(envelope.verifier)
        expect(row.bytes).toBe(Buffer.byteLength(row.sealed))
        const stored = (yield* db.db.select().from(FabricIdentityAttemptTable).get())!
        expect(envelope.expiresAt).toBe(stored.expires_at)
        expect(stored.expires_at).toBe(stored.time_created + 600000)
        expect(stored.state).toBe("pending")
        expect((yield* s.run(s.attempts.inspect({ ...s.selection, attempt: ready.attempt }))).state).toBe("pending")
        const receipts = yield* db.db.select().from(CapabilityRequestTable)
        for (const bytes of [JSON.stringify(receipts), JSON.stringify(stored), row.sealed])
          for (const secret of [envelope.verifier, envelope.state, envelope.nonce]) expect(bytes).not.toContain(secret)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PKP02 concurrent preparation and a fresh service reuse the same durable material, never a new PKCE", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* preparedSetup(f.root)
        const db = yield* Database.Service
        const cipher = yield* CredentialCipher.Service
        const barrier = yield* Deferred.make<void>()
        const arrivals = { count: 0 }
        yield* db.db.run(sql`CREATE TABLE pkp_secret_write_audit (attempt_id TEXT NOT NULL)`)
        yield* db.db.run(
          sql`CREATE TRIGGER pkp_secret_insert AFTER INSERT ON fabric_identity_secret BEGIN INSERT INTO pkp_secret_write_audit VALUES (NEW.id); END`,
        )
        yield* db.db.run(
          sql`CREATE TRIGGER pkp_secret_update AFTER UPDATE ON fabric_identity_secret BEGIN INSERT INTO pkp_secret_write_audit VALUES (NEW.id); END`,
        )
        const makeRacer = () =>
          Effect.gen(function* () {
            const state = { sealed: false, waited: false }
            const operators = {
              ...s.operators,
              validate: (
                binding: Parameters<typeof s.operators.validate>[0],
                target: Parameters<typeof s.operators.validate>[1],
              ) =>
                Effect.gen(function* () {
                  yield* s.operators.validate(binding, target)
                  if (!state.sealed || state.waited || target.action !== "fabric.identity.prepare") return
                  expect(yield* db.inTransaction!).toBe(false)
                  state.waited = true
                  arrivals.count++
                  if (arrivals.count === 2) yield* Deferred.succeed(barrier, undefined)
                  yield* Deferred.await(barrier)
                }),
            }
            return yield* FabricIdentityPreparation.make({ ...s.options, operators }).pipe(
              Effect.provideService(CredentialCipher.Service, {
                open: cipher.open,
                seal: (value) => {
                  state.sealed = true
                  return cipher.seal(value)
                },
              }),
            )
          })
        const racers = yield* Effect.all([makeRacer(), makeRacer()])
        const exits = yield* Effect.all(
          racers.map((racer) => s.run(racer.prepare(s.selection)).pipe(Effect.exit)),
          { concurrency: "unbounded" },
        )
        expect(arrivals.count).toBe(2)
        expect(yield* db.db.all(sql`SELECT COUNT(*) AS total FROM pkp_secret_write_audit`)).toEqual([{ total: 1 }])
        const outcomes = exits.map((exit) => {
          expect(Exit.isSuccess(exit)).toBe(true)
          if (!Exit.isSuccess(exit)) throw new Error("Actual concurrent preparation must reconcile the durable winner")
          return exit.value
        })
        expect(outcomes[0]).toEqual(outcomes[1])
        const before = yield* db.db.select().from(FabricIdentitySecretTable)
        expect(before).toHaveLength(1)
        const again = yield* Effect.gen(function* () {
          const service = yield* FabricIdentityPreparation.make(s.options)
          return yield* s.run(service.prepare(s.selection))
        }).pipe(Effect.provide(layer(f.filename)))
        expect(again).toEqual(outcomes[0])
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual(before)
        expect(yield* db.db.all(sql`SELECT COUNT(*) AS total FROM pkp_secret_write_audit`)).toEqual([{ total: 1 }])
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PKP03 wrong current Location/context/profile cannot reach the actual decrypt primitive", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* preparedSetup(f.root)
        const ready = yield* s.run(s.preparation.prepare(s.selection))
        const cipher = yield* CredentialCipher.Service
        const seen = { opens: 0 }
        const service = yield* FabricIdentityPreparation.make(s.options).pipe(
          Effect.provideService(CredentialCipher.Service, {
            seal: cipher.seal,
            open: (value) => {
              seen.opens++
              return cipher.open(value)
            },
          }),
        )
        yield* s.run(service.prepare({ ...s.selection, attempt: ready.attempt }))
        expect(seen.opens).toBeGreaterThan(0)
        const control = seen.opens
        const changed = FabricIdentityProfile.admit({
          deployment: "desktop",
          clientID: s.host.clientID,
          redirectUri: "http://localhost:54322/api/fabric/oauth/callback",
        })
        if (!changed.ok) throw new Error("Changed host profile positive control failed")
        const foreignProfile = yield* FabricIdentityPreparation.make({ ...s.options, profile: changed.value }).pipe(
          Effect.provideService(CredentialCipher.Service, {
            seal: cipher.seal,
            open: (value) => {
              seen.opens++
              return cipher.open(value)
            },
          }),
        )
        yield* refusal(s.run(foreignProfile.prepare(s.selection)), "denied")
        const other = yield* request(s.operators, s.contexts.create({}))
        yield* refusal(
          request(s.operators, service.prepare(s.selection)).pipe(
            Effect.provideService(Location.Service, other.location),
          ),
          "denied",
        )
        yield* refusal(s.run(service.prepare({ ...s.selection, context: other.context })), "denied")
        yield* request(s.operators, s.contexts.remove(s.info.context))
        yield* refusal(s.run(service.prepare(s.selection)), "expired")
        expect(seen.opens).toBe(control)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PKP04 a valid ciphertext copied from another attempt is refused after authentication without overwrite", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* preparedSetup(f.root, () => 1800000000000)
        yield* s.run(s.preparation.prepare(s.selection))
        const other = yield* s.run(s.attempts.begin(s.input))
        yield* s.run(s.preparation.prepare({ ...s.selection, attempt: other }))
        const db = yield* Database.Service
        const rows = yield* db.db.select().from(FabricIdentitySecretTable)
        const original = rows.find((row) => row.id === s.attempt.id)!
        const swapped = rows.find((row) => row.id === other.id)!
        yield* db.db
          .update(FabricIdentitySecretTable)
          .set({ sealed: swapped.sealed, bytes: swapped.bytes })
          .where(eq(FabricIdentitySecretTable.id, original.id))
        const before = yield* db.db.select().from(FabricIdentitySecretTable)
        yield* refusal(s.run(s.preparation.prepare(s.selection)), "unavailable")
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual(before)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PKP05 wrong key and corrupt ciphertext preserve the durable winner and never reseal after read failure", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* preparedSetup(f.root)
        yield* s.run(s.preparation.prepare(s.selection))
        const cipher = yield* CredentialCipher.Service
        const seen = { seals: 0 }
        const wrong = yield* FabricIdentityPreparation.make(s.options).pipe(
          Effect.provideService(CredentialCipher.Service, {
            open: cipher.open,
            seal: (value) => {
              seen.seals++
              return cipher.seal(value)
            },
          }),
        )
        const db = yield* Database.Service
        const original = yield* db.db.select().from(FabricIdentitySecretTable)
        const plain = cipher.open(original[0]!.sealed)
        if (!plain) throw new Error("Real cipher must open the original before key substitution")
        const wrongKey = CredentialCipher.seal(plain, randomBytes(32))
        yield* db.db.update(FabricIdentitySecretTable).set({ sealed: wrongKey, bytes: Buffer.byteLength(wrongKey) })
        const substituted = yield* db.db.select().from(FabricIdentitySecretTable)
        yield* refusal(s.run(wrong.prepare(s.selection)), "unavailable")
        expect(seen.seals).toBe(0)
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual(substituted)
        const broken = original[0]!.sealed.slice(0, -5) + "AAAAA"
        yield* db.db.update(FabricIdentitySecretTable).set({ sealed: broken, bytes: Buffer.byteLength(broken) })
        const before = yield* db.db.select().from(FabricIdentitySecretTable)
        yield* refusal(s.run(s.preparation.prepare(s.selection)), "unavailable")
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual(before)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})
