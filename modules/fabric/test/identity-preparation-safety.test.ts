import { expect, test } from "bun:test"
import { CredentialCipher } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { Location } from "@orchestra/core/location"
import { Effect } from "effect"
import { FabricIdentityPreparation } from "../src/identity-preparation"
import { FabricIdentitySecretTable } from "../src/identity-secret/sql"
import { FabricIdentityAttemptTable } from "../src/identity-attempt/sql"
import { fixtures, request } from "./fixture/context"
import { refusal } from "./fixture/identity-attempt"
import { layers, preparedSetup } from "./fixture/identity-preparation"

const cases = fixtures()

test("PKP06 cancellation between seal and publication wins; pending cancellation deletes its secret atomically", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* preparedSetup(f.root)
        const cipher = yield* CredentialCipher.Service
        const db = yield* Database.Service
        const seen = { sealed: false, armed: true }
        const operators = {
          ...s.operators,
          validate: (
            binding: Parameters<typeof s.operators.validate>[0],
            target: Parameters<typeof s.operators.validate>[1],
          ) =>
            Effect.gen(function* () {
              if (seen.sealed && seen.armed && target.action === "fabric.identity.prepare") {
                seen.armed = false
                expect(yield* db.inTransaction!).toBe(false)
                yield* s.attempts.cancel(s.selection).pipe(Effect.orDie)
              }
              yield* s.operators.validate(binding, target)
            }),
        }
        const service = yield* FabricIdentityPreparation.make({ ...s.options, operators }).pipe(
          Effect.provideService(CredentialCipher.Service, {
            open: cipher.open,
            seal: (value) => {
              seen.sealed = true
              return cipher.seal(value)
            },
          }),
        )
        yield* refusal(s.run(service.prepare(s.selection)), "conflict")
        expect(seen.armed).toBe(false)
        expect((yield* db.db.select().from(FabricIdentityAttemptTable).get())!.state).toBe("cancelled")
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual([])
        const next = yield* s.run(s.attempts.begin(s.input))
        const pending = yield* s.run(s.preparation.prepare({ ...s.selection, attempt: next }))
        const cancelled = yield* s.run(s.attempts.cancel({ ...s.selection, attempt: pending.attempt }))
        expect(cancelled.revision).toBe(3)
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual([])
        yield* refusal(s.run(s.preparation.prepare({ ...s.selection, attempt: cancelled })), "conflict")
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PKP07 live revocation after seal and a fixed expiry both prohibit publishing/returning material", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const clock = { value: 1800000000000 }
        const s = yield* preparedSetup(f.root, () => clock.value)
        const cipher = yield* CredentialCipher.Service
        const db = yield* Database.Service
        const delegated = yield* request(s.operators, s.operators.issue({ origin: "sdk" }))
        const seen = { sealed: false, armed: true }
        const operators = {
          ...s.operators,
          validate: (
            binding: Parameters<typeof s.operators.validate>[0],
            target: Parameters<typeof s.operators.validate>[1],
          ) =>
            Effect.gen(function* () {
              if (seen.sealed && seen.armed && target.action === "fabric.identity.prepare") {
                seen.armed = false
                yield* s.operators.revoke(delegated.authority)
              }
              yield* s.operators.validate(binding, target)
            }),
        }
        const service = yield* FabricIdentityPreparation.make({ ...s.options, operators }).pipe(
          Effect.provideService(CredentialCipher.Service, {
            open: cipher.open,
            seal: (value) => {
              seen.sealed = true
              return cipher.seal(value)
            },
          }),
        )
        const operation = s.operators.withRequest(
          delegated.authority,
          { requestID: "pkce-revocation", idempotencyKey: "pkce-revocation" },
          service.prepare(s.selection),
        )
        yield* refusal(
          operation.pipe(Effect.provideService(Location.Service, s.info.location)),
          "authentication_required",
        )
        expect(seen.armed).toBe(false)
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual([])
        const ready = yield* s.run(s.preparation.prepare(s.selection))
        const before = yield* db.db.select().from(FabricIdentitySecretTable)
        clock.value += 600000
        yield* refusal(s.run(s.preparation.prepare({ ...s.selection, attempt: ready.attempt })), "expired")
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual(before)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("PKP08 real SQL instrumentation sees transactions, but every cipher call stays outside; ambient SQL refuses", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* preparedSetup(f.root)
        const db = yield* Database.Service
        const cipher = yield* CredentialCipher.Service
        const seen = { depth: 0, transactions: 0, seals: 0, opens: 0 }
        const transaction: typeof db.db.transaction = (callback, options) =>
          db.db.transaction(
            (tx) =>
              Effect.acquireUseRelease(
                Effect.sync(() => {
                  seen.depth++
                  seen.transactions++
                }),
                () => callback(tx),
                () =>
                  Effect.sync(() => {
                    seen.depth--
                  }),
              ),
            options,
          )
        const measured = new Proxy(db.db, {
          get: (target, key, receiver) => (key === "transaction" ? transaction : Reflect.get(target, key, receiver)),
        })
        const service = yield* FabricIdentityPreparation.make(s.options).pipe(
          Effect.provideService(Database.Service, { ...db, db: measured }),
          Effect.provideService(CredentialCipher.Service, {
            seal: (value) => {
              expect(seen.depth).toBe(0)
              seen.seals++
              return cipher.seal(value)
            },
            open: (value) => {
              expect(seen.depth).toBe(0)
              seen.opens++
              return cipher.open(value)
            },
          }),
        )
        yield* s.run(service.prepare(s.selection))
        expect(seen.transactions).toBeGreaterThan(0)
        expect(seen.seals).toBeGreaterThan(0)
        expect(seen.opens).toBeGreaterThan(0)
        const calls = seen.opens + seen.seals
        yield* db.db.transaction(() => refusal(s.run(service.prepare(s.selection)), "unavailable"), {
          behavior: "immediate",
        })
        expect(seen.opens + seen.seals).toBe(calls)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})
