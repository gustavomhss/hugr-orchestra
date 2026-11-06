import { expect, test } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { Location } from "@orchestra/core/location"
import { Effect } from "effect"
import { eq } from "drizzle-orm"
import { FabricIdentityCallbacks } from "../src/identity-callback"
import { FabricIdentityAttemptTable } from "../src/identity-attempt/sql"
import { FabricIdentitySecretTable } from "../src/identity-secret/sql"
import { FabricContextTable } from "../src/context/sql"
import { fixtures, request } from "./fixture/context"
import { refusal } from "./fixture/identity-attempt"
import { layers } from "./fixture/identity-preparation"
import { callbackSetup, response } from "./fixture/identity-callback"

const cases = fixtures()

test("CBC05 claim/consume require fresh authority and actual Location; refusal does not spend callback or ticket", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* callbackSetup(f.root)
        const ready = yield* s.run(s.callbacks.register(s.selection))
        s.callbacks.receive(response(ready.authorizationURL, s.host.redirectUri))
        const selected = { ...s.selection, attempt: ready.attempt }
        yield* refusal(
          s.callbacks.claim(selected).pipe(Effect.provideService(Location.Service, s.info.location)),
          "invocation_binding_missing",
        )
        yield* refusal(request(s.operators, s.callbacks.claim(selected)), "denied")
        const other = yield* request(s.operators, s.contexts.create({}))
        yield* refusal(
          request(s.operators, s.callbacks.claim(selected)).pipe(
            Effect.provideService(Location.Service, other.location),
          ),
          "denied",
        )
        const restricted = yield* request(
          s.operators,
          s.operators.issue({ origin: "sdk", scope: { placements: "instance", actions: ["fabric.context.read"] } }),
        )
        yield* refusal(
          s.operators
            .withRequest(restricted.authority, { requestID: "restricted-claim" }, s.callbacks.claim(selected))
            .pipe(Effect.provideService(Location.Service, s.info.location)),
          "target_denied",
        )
        const claimed = yield* s.run(s.callbacks.claim(selected))
        if (claimed.outcome !== "claimed") throw new Error("Authorized continuation must obtain its callback")
        const consume = { context: s.info.context, attempt: claimed.attempt, ticket: claimed.ticket }
        yield* refusal(
          s.callbacks.consume(consume).pipe(Effect.provideService(Location.Service, s.info.location)),
          "invocation_binding_missing",
        )
        yield* refusal(
          request(s.operators, s.callbacks.consume(consume)).pipe(
            Effect.provideService(Location.Service, other.location),
          ),
          "denied",
        )
        yield* refusal(
          s.operators
            .withRequest(restricted.authority, { requestID: "restricted-consume" }, s.callbacks.consume(consume))
            .pipe(Effect.provideService(Location.Service, s.info.location)),
          "target_denied",
        )
        expect(yield* s.run(s.callbacks.consume(consume))).toEqual({ code: "SYNTHETIC_CALLBACK_CODE_FIRST" })
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("CBC06 bounded quota, expiration, invalid time and closed Scope cannot renew or reconstruct an inbox", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const clock = { value: 1800000000000 }
        const s = yield* callbackSetup(f.root, { now: () => clock.value, maxEntries: 1 })
        const ready = yield* s.run(s.callbacks.register(s.selection))
        const second = yield* s.run(s.attempts.begin(s.input))
        yield* refusal(s.run(s.callbacks.register({ ...s.selection, attempt: second })), "limit")
        const db = yield* Database.Service
        expect(
          (yield* db.db
            .select()
            .from(FabricIdentityAttemptTable)
            .where(eq(FabricIdentityAttemptTable.id, second.id))
            .get())!.state,
        ).toBe("preparing")
        expect(yield* s.run(s.callbacks.register(s.selection))).toEqual(ready)
        clock.value += 600000
        expect(s.callbacks.receive(response(ready.authorizationURL, s.host.redirectUri))).toBeUndefined()
        yield* refusal(s.run(s.callbacks.claim({ ...s.selection, attempt: ready.attempt })), "expired")
        const third = yield* s.run(s.attempts.begin(s.input))
        const thirdReady = yield* s.run(s.callbacks.register({ ...s.selection, attempt: third }))
        clock.value = Number.NaN
        expect(s.callbacks.receive(response(thirdReady.authorizationURL, s.host.redirectUri))).toBeUndefined()
        yield* refusal(s.run(s.callbacks.claim({ ...s.selection, attempt: thirdReady.attempt })), "unavailable")
        const closed = yield* Effect.scoped(FabricIdentityCallbacks.make(s.options))
        yield* refusal(s.run(closed.register({ ...s.selection, attempt: third })), "unavailable")
        yield* refusal(FabricIdentityCallbacks.make({ ...s.options, maxEntries: 257 }), "invalid-input")
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("CBC07 revocation after resolution is rechecked inside the claim writer without changing pending material", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* callbackSetup(f.root)
        const db = yield* Database.Service
        const seen = { armed: false }
        const transaction: typeof db.db.transaction = (callback, options) =>
          Effect.gen(function* () {
            if (seen.armed) {
              seen.armed = false
              expect(yield* db.inTransaction!).toBe(false)
              yield* db.db
                .update(FabricContextTable)
                .set({ state: "deleted", generation: 2 })
                .where(eq(FabricContextTable.id, s.info.context.id))
                .pipe(Effect.orDie)
            }
            return yield* db.db.transaction(callback, options)
          })
        const measured = new Proxy(db.db, {
          get: (target, key, receiver) => (key === "transaction" ? transaction : Reflect.get(target, key, receiver)),
        })
        const callbacks = yield* FabricIdentityCallbacks.make(s.options).pipe(
          Effect.provideService(Database.Service, { ...db, db: measured }),
        )
        const ready = yield* s.run(callbacks.register(s.selection))
        callbacks.receive(response(ready.authorizationURL, s.host.redirectUri))
        const before = yield* db.db.select().from(FabricIdentitySecretTable)
        seen.armed = true
        yield* refusal(s.run(callbacks.claim({ ...s.selection, attempt: ready.attempt })), "expired")
        expect(seen.armed).toBe(false)
        expect((yield* db.db.select().from(FabricIdentityAttemptTable).get())!.state).toBe("pending")
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual(before)
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("CBC08 closing Scope after claim loses the ticket honestly; a fresh service cannot recover code from SQL", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* callbackSetup(f.root)
        const ended = yield* Effect.scoped(
          Effect.gen(function* () {
            const callbacks = yield* FabricIdentityCallbacks.make(s.options)
            const ready = yield* s.run(callbacks.register(s.selection))
            callbacks.receive(response(ready.authorizationURL, s.host.redirectUri))
            const claim = yield* s.run(callbacks.claim({ ...s.selection, attempt: ready.attempt }))
            if (claim.outcome !== "claimed")
              throw new Error("Expected claim before closing the receiving process scope")
            return { callbacks, claim, selected: { ...s.selection, attempt: ready.attempt } }
          }),
        )
        const consume = { context: s.info.context, attempt: ended.claim.attempt, ticket: ended.claim.ticket }
        yield* refusal(s.run(ended.callbacks.consume(consume)), "unavailable")
        const fresh = yield* FabricIdentityCallbacks.make(s.options)
        yield* refusal(s.run(fresh.claim(ended.selected)), "conflict")
        yield* refusal(s.run(fresh.consume(consume)), "denied")
        const db = yield* Database.Service
        const rows = yield* db.db.select().from(FabricIdentityAttemptTable)
        expect(rows[0]!.state).toBe("exchanging")
        expect(JSON.stringify(rows)).not.toContain("SYNTHETIC_CALLBACK_CODE_FIRST")
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})
