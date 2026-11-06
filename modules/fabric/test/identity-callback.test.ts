import { expect, test } from "bun:test"
import { CredentialCipher } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { CapabilityRequestTable } from "@orchestra/core/capability/sql"
import { Effect, Exit } from "effect"
import { FabricIdentityCallbacks } from "../src/identity-callback"
import { FabricIdentityAttemptTable } from "../src/identity-attempt/sql"
import { FabricIdentitySecretTable } from "../src/identity-secret/sql"
import { fixtures } from "./fixture/context"
import { refusal } from "./fixture/identity-attempt"
import { layers } from "./fixture/identity-preparation"
import { callbackSetup, response } from "./fixture/identity-callback"

const cases = fixtures()

test("CBC01 unauthenticated receive accesses neither SQL nor cipher; authorized claim/ticket never projects code", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* callbackSetup(f.root)
        const db = yield* Database.Service
        const cipher = yield* CredentialCipher.Service
        const seen = { queries: 0, crypto: 0 }
        const measured = new Proxy(db.db, {
          get: (target, key, receiver) => {
            if (["select", "insert", "update", "delete", "run", "transaction"].some((value) => value === key))
              seen.queries++
            return Reflect.get(target, key, receiver)
          },
        })
        const callbacks = yield* FabricIdentityCallbacks.make(s.options).pipe(
          Effect.provideService(Database.Service, { ...db, db: measured }),
          Effect.provideService(CredentialCipher.Service, {
            seal: (value) => {
              seen.crypto++
              return cipher.seal(value)
            },
            open: (value) => {
              seen.crypto++
              return cipher.open(value)
            },
          }),
        )
        const ready = yield* s.run(callbacks.register(s.selection))
        expect(seen.queries).toBeGreaterThan(0)
        expect(seen.crypto).toBeGreaterThan(0)
        const before = { ...seen }
        expect(
          callbacks.receive(
            response(ready.authorizationURL, s.host.redirectUri) +
              "&client_info=PRIVATE_HINT&cloud_instance_host_name=evil.invalid",
          ),
        ).toBeUndefined()
        expect(seen).toEqual(before)
        expect((yield* db.db.select().from(FabricIdentityAttemptTable).get())!.state).toBe("pending")
        const claim = yield* s.run(callbacks.claim({ ...s.selection, attempt: ready.attempt }))
        expect(claim.outcome).toBe("claimed")
        if (claim.outcome !== "claimed") throw new Error("Expected runtime claim ticket")
        expect(claim.attempt.revision).toBe(3)
        expect(Object.isFrozen(claim.ticket)).toBe(true)
        expect(Object.keys(claim.ticket)).toEqual([])
        for (const value of [
          JSON.stringify(claim),
          JSON.stringify(yield* db.db.select().from(CapabilityRequestTable)),
          JSON.stringify(yield* db.db.select().from(FabricIdentityAttemptTable)),
        ]) {
          expect(value).not.toContain("SYNTHETIC_CALLBACK_CODE_FIRST")
          expect(value).not.toContain("PRIVATE_HINT")
        }
        expect(
          yield* s.run(callbacks.consume({ context: s.info.context, attempt: claim.attempt, ticket: claim.ticket })),
        ).toEqual({ code: "SYNTHETIC_CALLBACK_CODE_FIRST" })
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("CBC02 invalid callbacks do not capture; a second valid response cannot replace the first code", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* callbackSetup(f.root)
        const ready = yield* s.run(s.callbacks.register(s.selection))
        const selected = { ...s.selection, attempt: ready.attempt }
        const valid = response(ready.authorizationURL, s.host.redirectUri)
        for (const url of [
          valid.replace("localhost", "evil.invalid"),
          valid.replace(":54321", ":54322"),
          valid + "#ignored",
          valid + "&state=duplicate",
          valid.replace("?state=", "?state=X"),
          valid.replace("SYNTHETIC_CALLBACK_CODE_FIRST", ""),
          valid.replace("SYNTHETIC_CALLBACK_CODE_FIRST", "x".repeat(8193)),
        ]) {
          expect(s.callbacks.receive(url)).toBeUndefined()
          yield* refusal(s.run(s.callbacks.claim(selected)), "unavailable")
        }
        s.callbacks.receive(valid)
        s.callbacks.receive(response(ready.authorizationURL, s.host.redirectUri, "SYNTHETIC_MUST_NOT_REPLACE_FIRST"))
        const repeated = yield* s.run(s.callbacks.register(s.selection))
        expect(repeated).toEqual(ready)
        const claim = yield* s.run(s.callbacks.claim(selected))
        if (claim.outcome !== "claimed") throw new Error("Expected first valid capture")
        expect(
          yield* s.run(s.callbacks.consume({ context: s.info.context, attempt: claim.attempt, ticket: claim.ticket })),
        ).toEqual({ code: "SYNTHETIC_CALLBACK_CODE_FIRST" })
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("CBC03 concurrent durable claims have one winner, copied tickets fail, and code is consumed once", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* callbackSetup(f.root)
        const ready = yield* s.run(s.callbacks.register(s.selection))
        s.callbacks.receive(response(ready.authorizationURL, s.host.redirectUri))
        const selected = { ...s.selection, attempt: ready.attempt }
        const exits = yield* Effect.all(
          [1, 2].map(() => s.run(s.callbacks.claim(selected)).pipe(Effect.exit)),
          { concurrency: "unbounded" },
        )
        expect(exits.filter(Exit.isSuccess)).toHaveLength(1)
        expect(exits.filter(Exit.isFailure)).toHaveLength(1)
        const winner = exits.find(Exit.isSuccess)
        if (!winner || winner.value.outcome !== "claimed") throw new Error("Expected one actual code claim")
        const claim = winner.value
        const consume = { context: s.info.context, attempt: claim.attempt, ticket: claim.ticket }
        yield* refusal(s.run(s.callbacks.consume({ ...consume, ticket: { ...claim.ticket } })), "denied")
        const consumed = yield* Effect.all(
          [1, 2].map(() => s.run(s.callbacks.consume(consume)).pipe(Effect.exit)),
          { concurrency: "unbounded" },
        )
        expect(consumed.filter(Exit.isSuccess)).toHaveLength(1)
        expect(consumed.filter(Exit.isFailure)).toHaveLength(1)
        const fresh = yield* FabricIdentityCallbacks.make(s.options)
        yield* refusal(s.run(fresh.claim(selected)), "conflict")
        yield* refusal(s.run(fresh.register(selected)), "conflict")
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})

test("CBC04 remote denial is sanitized, completed only by the current operator, and remains terminal after expiry", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const clock = { value: 1800000000000 }
        const s = yield* callbackSetup(f.root, { now: () => clock.value })
        const ready = yield* s.run(s.callbacks.register(s.selection))
        const state = new URL(ready.authorizationURL).searchParams.get("state")!
        s.callbacks.receive(
          s.host.redirectUri +
            "?" +
            new URLSearchParams({ state, error: "access_denied", error_description: "PRIVATE_REMOTE_DETAIL" }),
        )
        const db = yield* Database.Service
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toHaveLength(1)
        const denied = yield* s.run(s.callbacks.claim({ ...s.selection, attempt: ready.attempt }))
        expect(denied).toEqual({ outcome: "denied", attempt: { id: s.attempt.id, revision: 3 } })
        expect(JSON.stringify(denied)).not.toContain("PRIVATE")
        expect(yield* db.db.select().from(FabricIdentitySecretTable)).toEqual([])
        clock.value += 600001
        expect((yield* s.run(s.attempts.inspect({ ...s.selection, attempt: denied.attempt }))).state).toBe("denied")
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})
