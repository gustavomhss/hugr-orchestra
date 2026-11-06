import { expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { CredentialCipher } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { Location } from "@orchestra/core/location"
import { CapabilityRequestTable } from "@orchestra/core/capability/sql"
import { Effect, Exit } from "effect"
import { eq } from "drizzle-orm"
import { FabricIdentityExchangeMaterial } from "../src/identity-exchange-material"
import { FabricIdentityAttemptTable } from "../src/identity-attempt/sql"
import { FabricIdentitySecretTable } from "../src/identity-secret/sql"
import { FabricIdentityProfile } from "../src/identity-profile"
import { FabricContextTable } from "../src/context/sql"
import { fixtures, request } from "./fixture/context"
import { refusal } from "./fixture/identity-attempt"
import { callbackSetup, response } from "./fixture/identity-callback"
import { exchangeMaterialSetup } from "./fixture/identity-exchange-material"
import { layers } from "./fixture/identity-preparation"

const cases = fixtures()

test("EXM01 exchanging metadata revision 3 opens only its original revision 2 envelope without changing storage", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* exchangeMaterialSetup(f.root)
        const db = yield* Database.Service
        const cipher = yield* CredentialCipher.Service
        const before = yield* db.db.select().from(FabricIdentitySecretTable)
        const attempts = yield* db.db.select().from(FabricIdentityAttemptTable)
        expect(before[0]!.revision).toBe(2)
        expect(attempts[0]!.revision).toBe(3)
        expect(attempts[0]!.state).toBe("exchanging")
        const material = yield* s.run(s.reader.read(s.selected))
        const plain = cipher.open(before[0]!.sealed)
        if (!plain) throw new Error("Actual cipher must open the prepared envelope")
        const envelope = JSON.parse(plain)
        expect(material).toEqual({
          verifier: envelope.verifier,
          nonce: envelope.nonce,
          correlationID: envelope.correlationID,
          scopes: s.input.scopes,
          redirectUri: s.host.redirectUri,
          createdAt: attempts[0]!.time_created,
          expiresAt: attempts[0]!.expires_at,
        })
        expect(new URL(s.ready.authorizationURL).searchParams.get("nonce")).toBe(material.nonce)
        expect(Object.isFrozen(material)).toBe(true)
        expect(Object.isFrozen(material.scopes)).toBe(true)
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual(before)
        expect(yield* db.db.select().from(FabricIdentityAttemptTable)).toEqual(attempts)
        const receipts = JSON.stringify(yield* db.db.select().from(CapabilityRequestTable))
        expect(receipts).not.toContain(material.verifier)
        expect(receipts).not.toContain(material.nonce)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("EXM02 fresh operator, actual Location/profile and exchanging phase guard every decrypt", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* callbackSetup(f.root)
        const ready = yield* s.run(s.callbacks.register(s.selection))
        const cipher = yield* CredentialCipher.Service
        const seen = { opens: 0 }
        const measured = {
          seal: cipher.seal,
          open: (value: string) => {
            seen.opens++
            return cipher.open(value)
          },
        }
        const reader = yield* FabricIdentityExchangeMaterial.make(s.options).pipe(
          Effect.provideService(CredentialCipher.Service, measured),
        )
        yield* refusal(s.run(reader.read({ context: s.info.context, attempt: ready.attempt })), "conflict")
        expect(seen.opens).toBe(0)
        s.callbacks.receive(response(ready.authorizationURL, s.host.redirectUri))
        const claim = yield* s.run(s.callbacks.claim({ ...s.selection, attempt: ready.attempt }))
        if (claim.outcome !== "claimed") throw new Error("Expected claimed callback")
        const selected = { context: s.info.context, attempt: claim.attempt }
        yield* s.run(reader.read(selected))
        expect(seen.opens).toBe(1)
        yield* refusal(
          reader.read(selected).pipe(Effect.provideService(Location.Service, s.info.location)),
          "invocation_binding_missing",
        )
        const other = yield* request(s.operators, s.contexts.create({}))
        yield* refusal(
          request(s.operators, reader.read(selected)).pipe(Effect.provideService(Location.Service, other.location)),
          "denied",
        )
        const changed = FabricIdentityProfile.admit({
          deployment: "desktop",
          clientID: s.host.clientID,
          redirectUri: "http://localhost:54322/api/fabric/oauth/callback",
        })
        if (!changed.ok) throw new Error("Changed host positive control failed")
        const foreign = yield* FabricIdentityExchangeMaterial.make({ ...s.options, profile: changed.value }).pipe(
          Effect.provideService(CredentialCipher.Service, measured),
        )
        yield* refusal(s.run(foreign.read(selected)), "denied")
        yield* request(s.operators, s.contexts.remove(s.info.context))
        yield* refusal(s.run(reader.read(selected)), "expired")
        expect(seen.opens).toBe(1)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("EXM03 same-deadline authenticated envelopes cannot be swapped across attempts or secret revisions", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* exchangeMaterialSetup(f.root, () => 1800000000000)
        const next = yield* s.run(s.attempts.begin(s.input))
        const ready = yield* s.run(s.callbacks.register({ ...s.selection, attempt: next }))
        const db = yield* Database.Service
        const original = (yield* db.db
          .select()
          .from(FabricIdentitySecretTable)
          .where(eq(FabricIdentitySecretTable.id, s.attempt.id))
          .get())!
        const other = (yield* db.db
          .select()
          .from(FabricIdentitySecretTable)
          .where(eq(FabricIdentitySecretTable.id, ready.attempt.id))
          .get())!
        yield* s.run(s.reader.read(s.selected))
        yield* db.db
          .update(FabricIdentitySecretTable)
          .set({ sealed: other.sealed, bytes: other.bytes })
          .where(eq(FabricIdentitySecretTable.id, original.id))
        const swapped = yield* db.db.select().from(FabricIdentitySecretTable)
        yield* refusal(s.run(s.reader.read(s.selected)), "unavailable")
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual(swapped)
        yield* db.db
          .update(FabricIdentitySecretTable)
          .set({ ...original, revision: 3 })
          .where(eq(FabricIdentitySecretTable.id, original.id))
        yield* refusal(s.run(s.reader.read(s.selected)), "unavailable")
        const broken = original.sealed.slice(0, -5) + "AAAAA"
        yield* db.db
          .update(FabricIdentitySecretTable)
          .set({ revision: 2, sealed: broken, bytes: Buffer.byteLength(broken) })
          .where(eq(FabricIdentitySecretTable.id, original.id))
        const before = yield* db.db.select().from(FabricIdentitySecretTable)
        yield* refusal(s.run(s.reader.read(s.selected)), "unavailable")
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual(before)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("EXM04 revocation after decrypt prevents material delivery; expiry and ambient SQL never decrypt", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const clock = { value: 1800000000000 }
        const s = yield* exchangeMaterialSetup(f.root, () => clock.value)
        const db = yield* Database.Service
        const cipher = yield* CredentialCipher.Service
        const seen = { opens: 0, armed: false }
        const operators = {
          ...s.operators,
          validate: (
            binding: Parameters<typeof s.operators.validate>[0],
            target: Parameters<typeof s.operators.validate>[1],
          ) =>
            Effect.gen(function* () {
              yield* s.operators.validate(binding, target)
              if (!seen.armed || !seen.opens || target.action !== "fabric.identity.exchange") return
              seen.armed = false
              yield* db.db
                .update(FabricContextTable)
                .set({ state: "deleted", generation: 2 })
                .where(eq(FabricContextTable.id, s.info.context.id))
                .pipe(Effect.orDie)
            }),
        }
        const reader = yield* FabricIdentityExchangeMaterial.make({ ...s.options, operators }).pipe(
          Effect.provideService(CredentialCipher.Service, {
            seal: cipher.seal,
            open: (value) => {
              seen.opens++
              return cipher.open(value)
            },
          }),
        )
        yield* db.db.transaction(() => refusal(s.run(reader.read(s.selected)), "unavailable"), {
          behavior: "immediate",
        })
        expect(seen.opens).toBe(0)
        clock.value += 600000
        yield* refusal(s.run(reader.read(s.selected)), "expired")
        expect(seen.opens).toBe(0)
        clock.value = Number.NaN
        yield* refusal(s.run(reader.read(s.selected)), "unavailable")
        clock.value = 1800000000000
        const before = yield* db.db.select().from(FabricIdentitySecretTable)
        seen.armed = true
        yield* refusal(s.run(reader.read(s.selected)), "expired")
        expect(seen.armed).toBe(false)
        expect(seen.opens).toBe(1)
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual(before)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("EXM05 wrong key or missing ciphertext never consumes the runtime code ticket or reseals data", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* exchangeMaterialSetup(f.root)
        yield* s.run(s.reader.read(s.selected))
        const db = yield* Database.Service
        const cipher = yield* CredentialCipher.Service
        const original = (yield* db.db.select().from(FabricIdentitySecretTable).get())!
        const plain = cipher.open(original.sealed)
        if (!plain) throw new Error("Real cipher positive control must open the original")
        const wrong = CredentialCipher.seal(plain, randomBytes(32))
        yield* db.db.update(FabricIdentitySecretTable).set({ sealed: wrong, bytes: Buffer.byteLength(wrong) })
        const before = yield* db.db.select().from(FabricIdentitySecretTable)
        yield* refusal(s.run(s.reader.read(s.selected)), "unavailable")
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual(before)
        yield* db.db.delete(FabricIdentitySecretTable)
        yield* refusal(s.run(s.reader.read(s.selected)), "unavailable")
        expect(yield* s.run(s.callbacks.consume({ ...s.selected, ticket: s.claim.ticket }))).toEqual({
          code: "SYNTHETIC_CALLBACK_CODE_FIRST",
        })
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual([])
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("EXM06 call-time refs cannot retarget read and ciphertext changed after decrypt cannot deliver stale material", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* exchangeMaterialSetup(f.root)
        const supplied = { context: { ...s.selected.context }, attempt: { ...s.selected.attempt } }
        const scheduled = s.reader.read(supplied)
        supplied.context.generation++
        supplied.attempt.revision++
        yield* s.run(scheduled)
        const db = yield* Database.Service
        const cipher = yield* CredentialCipher.Service
        const original = (yield* db.db.select().from(FabricIdentitySecretTable).get())!
        const seen = { opens: 0, armed: true }
        const operators = {
          ...s.operators,
          validate: (
            binding: Parameters<typeof s.operators.validate>[0],
            target: Parameters<typeof s.operators.validate>[1],
          ) =>
            Effect.gen(function* () {
              yield* s.operators.validate(binding, target)
              if (!seen.armed || !seen.opens || target.action !== "fabric.identity.exchange") return
              seen.armed = false
              yield* db.db
                .update(FabricIdentitySecretTable)
                .set({ sealed: original.sealed + "A", bytes: original.bytes + 1 })
                .pipe(Effect.orDie)
            }),
        }
        const reader = yield* FabricIdentityExchangeMaterial.make({ ...s.options, operators }).pipe(
          Effect.provideService(CredentialCipher.Service, {
            seal: cipher.seal,
            open: (value) => {
              seen.opens++
              return cipher.open(value)
            },
          }),
        )
        const exit = yield* Effect.exit(s.run(reader.read(s.selected)))
        expect(seen.armed).toBe(false)
        expect(seen.opens).toBe(1)
        expect(Exit.isFailure(exit)).toBe(true)
        if (!Exit.isFailure(exit) || exit.cause.reasons[0]?._tag !== "Fail")
          throw new Error("Expected typed conflict, not stale material or a defect")
        expect(exit.cause.reasons[0].error.code).toBe("conflict")
        expect((yield* db.db.select().from(FabricIdentitySecretTable).get())!.sealed).toBe(original.sealed + "A")
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})
