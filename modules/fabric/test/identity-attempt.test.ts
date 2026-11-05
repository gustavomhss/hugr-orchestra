import { expect, test } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { CapabilityRequestTable } from "@orchestra/core/capability/sql"
import { Location } from "@orchestra/core/location"
import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { eq } from "drizzle-orm"
import { Effect, Exit, Schema } from "effect"
import { FabricIdentityAttempts } from "../src/identity-attempt"
import { FabricIdentityAttemptTable } from "../src/identity-attempt/sql"
import { fixtures, layer, owner, request } from "./fixture/context"
import { refusal, setup } from "./fixture/identity-attempt"

const cases = fixtures()

test("IDA01 reserves real SQL metadata and a Ref-only receipt without OAuth secrets", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const first = yield* s.run(s.attempts.begin(s.input))
        expect(Schema.is(FabricIdentityAttempt.Ref)(first)).toBe(true)
        expect(Object.keys(first).sort()).toEqual(["id", "revision"])
        expect(first.revision).toBe(1)
        const info = yield* s.run(s.attempts.inspect({ context: s.input.context, attempt: first }))
        expect(info.state).toBe("preparing")
        expect(Object.keys(info).sort()).toEqual(["attempt", "expiresAt", "state"])
        const db = yield* Database.Service
        const row = yield* db.db.select().from(FabricIdentityAttemptTable).get()
        expect(row?.id).toBe(first.id)
        expect(row?.expires_at).toBe(row!.time_created + 600000)
        expect(row?.directory).toBe(s.info.location.directory)
        const receipts = yield* db.db.select().from(CapabilityRequestTable)
        const receipt = receipts.find((entry) => entry.action === "fabric.identity.begin")
        expect(receipt?.result).toEqual(first)
        for (const key of ["code", "state_nonce", "nonce", "verifier", "token", "sealed"])
          expect(Object.keys(row!).includes(key)).toBe(false)
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("IDA02 exact durable retry survives a fresh Database service and conflicting reuse cannot reserve again", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const first = yield* s.run(s.attempts.begin(s.input), "same-reservation")
        const replay = yield* Effect.gen(function* () {
          const attempts = yield* FabricIdentityAttempts.make({ operators: s.operators, root: f.root, profile: s.host })
          return yield* s.run(attempts.begin(s.input), "same-reservation")
        }).pipe(Effect.provide(layer(f.filename)))
        expect(replay).toEqual(first)
        const other = yield* request(s.operators, s.contexts.create({}))
        yield* refusal(
          request(s.operators, s.attempts.begin({ ...s.input, context: other.context }), "same-reservation").pipe(
            Effect.provideService(Location.Service, other.location),
          ),
          "outcome_unknown",
        )
        const db = yield* Database.Service
        expect(yield* db.db.select().from(FabricIdentityAttemptTable)).toHaveLength(1)
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("IDA03 actual Location is required on every read/write, even with the same global Project", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const first = yield* s.run(s.attempts.begin(s.input))
        const selected = { context: s.input.context, attempt: first }
        const other = yield* request(s.operators, s.contexts.create({}))
        expect(other.location.project.id).toBe(s.info.location.project.id)
        expect(other.location.directory).not.toBe(s.info.location.directory)
        const wrong = [
          other.location,
          { ...s.info.location, workspaceID: WorkspaceID.make("wrk_other") },
          { ...s.info.location, project: { ...s.info.location.project, directory: f.root } },
        ]
        for (const effect of [
          s.attempts.begin(s.input).pipe(Effect.asVoid),
          s.attempts.inspect(selected).pipe(Effect.asVoid),
          s.attempts.cancel(selected).pipe(Effect.asVoid),
        ]) {
          yield* refusal(request(s.operators, effect), "denied")
          for (const location of wrong)
            yield* refusal(
              request(s.operators, effect).pipe(Effect.provideService(Location.Service, location)),
              "denied",
            )
        }
        expect((yield* s.run(s.attempts.inspect(selected))).state).toBe("preparing")
        const db = yield* Database.Service
        expect(yield* db.db.select().from(FabricIdentityAttemptTable)).toHaveLength(1)
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("IDA04 stored owner/store and current revoked authority cannot be replayed as a grant", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const first = yield* s.run(s.attempts.begin(s.input), "owner-retry")
        const db = yield* Database.Service
        const row = (yield* db.db.select().from(FabricIdentityAttemptTable).get())!
        yield* db.db
          .update(FabricIdentityAttemptTable)
          .set({ storage_id: "copied-store" })
          .where(eq(FabricIdentityAttemptTable.id, first.id))
        yield* refusal(s.run(s.attempts.begin(s.input), "owner-retry"), "denied")
        yield* db.db
          .update(FabricIdentityAttemptTable)
          .set({ storage_id: row.storage_id })
          .where(eq(FabricIdentityAttemptTable.id, first.id))
        const stranger = yield* owner("different-operator")
        const foreign = yield* FabricIdentityAttempts.make({ operators: stranger, root: f.root, profile: s.host })
        yield* refusal(
          request(stranger, foreign.inspect({ context: s.input.context, attempt: first })).pipe(
            Effect.provideService(Location.Service, s.info.location),
          ),
          "denied",
        )
        const delegated = yield* request(s.operators, s.operators.issue({ origin: "sdk" }))
        yield* s.operators.revoke(delegated.authority)
        yield* refusal(
          s.operators
            .withRequest(
              delegated.authority,
              { requestID: "revoked-request", idempotencyKey: "owner-retry" },
              s.attempts.begin(s.input),
            )
            .pipe(Effect.provideService(Location.Service, s.info.location)),
          "authentication_required",
        )
        yield* request(s.operators, s.contexts.remove(s.input.context))
        yield* refusal(s.run(s.attempts.begin(s.input), "owner-retry"), "expired")
        expect((yield* db.db.select().from(FabricIdentityAttemptTable).get())!.state).toBe("preparing")
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("IDA05 concurrent cancellation has one CAS winner, exact retry and an immutable terminal row", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const first = yield* s.run(s.attempts.begin(s.input))
        const selected = { context: s.input.context, attempt: first }
        const exits = yield* Effect.all(
          ["cancel-one", "cancel-two"].map((key) => s.run(s.attempts.cancel(selected), key).pipe(Effect.exit)),
          { concurrency: "unbounded" },
        )
        expect(exits.filter(Exit.isSuccess)).toHaveLength(1)
        expect(exits.filter(Exit.isFailure)).toHaveLength(1)
        const index = exits.findIndex(Exit.isSuccess)
        const winner = exits[index]!
        if (!Exit.isSuccess(winner)) throw new Error("Missing actual cancellation winner")
        expect(winner.value).toEqual({ id: first.id, revision: 2 })
        expect(yield* s.run(s.attempts.cancel(selected), ["cancel-one", "cancel-two"][index])).toEqual(winner.value)
        expect((yield* s.run(s.attempts.inspect({ ...selected, attempt: winner.value }))).state).toBe("cancelled")
        yield* refusal(s.run(s.attempts.cancel(selected)), "conflict")
        yield* refusal(s.run(s.attempts.cancel({ ...selected, attempt: winner.value })), "conflict")
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("IDA06 deadline is fixed, reads never renew it, backward host time and quota preserve rows", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const clock = { value: 1800000000000 }
        const s = yield* setup(f.root, { now: () => clock.value, maxAttempts: 1 })
        const first = yield* s.run(s.attempts.begin(s.input))
        const selected = { context: s.input.context, attempt: first }
        const db = yield* Database.Service
        const original = yield* db.db.select().from(FabricIdentityAttemptTable)
        yield* refusal(s.run(s.attempts.begin(s.input)), "limit")
        clock.value += 599999
        expect((yield* s.run(s.attempts.inspect(selected))).state).toBe("preparing")
        clock.value++
        expect((yield* s.run(s.attempts.inspect(selected))).state).toBe("expired")
        yield* refusal(s.run(s.attempts.cancel(selected)), "expired")
        clock.value = original[0]!.time_created - 1
        yield* refusal(s.run(s.attempts.inspect(selected)), "unavailable")
        expect(yield* db.db.select().from(FabricIdentityAttemptTable)).toEqual(original)
        yield* refusal(
          FabricIdentityAttempts.make({ operators: s.operators, root: f.root, profile: { ...s.host } }),
          "invalid-input",
        )
        yield* refusal(
          FabricIdentityAttempts.make({ operators: s.operators, root: f.root, profile: s.host, maxAttempts: 1025 }),
          "invalid-input",
        )
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})
