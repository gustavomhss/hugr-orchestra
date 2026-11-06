import { expect, test } from "bun:test"
import { Database } from "@orchestra/core/database/database"
import { Project } from "@orchestra/core/project"
import { Location } from "@orchestra/core/location"
import { CapabilityRequestTable } from "@orchestra/core/capability/sql"
import { Capability } from "@orchestra/schema/capability"
import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import { eq } from "drizzle-orm"
import { Effect, Option, Schema } from "effect"
import { FabricContexts } from "../src/context"
import { FabricContextTable } from "../src/context/sql"
import { FabricIdentityAttempts } from "../src/identity-attempt"
import { FabricIdentityAttemptTable } from "../src/identity-attempt/sql"
import { fixtures, layer, owner, request } from "./fixture/context"
import { profile, refusal, setup } from "./fixture/identity-attempt"

const cases = fixtures()

test("IDA07 context is revalidated inside SQL after real resolution; ambient SQL never observes directories", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const db = yield* Database.Service
        const project = yield* Project.Service
        const seen = { reads: 0, armed: false }
        const operators = {
          ...s.operators,
          require: (target: Parameters<typeof s.operators.require>[0]) =>
            Effect.gen(function* () {
              const binding = yield* s.operators.require(target)
              if (seen.armed && target.action === "fabric.identity.begin") {
                seen.armed = false
                yield* db.db
                  .update(FabricContextTable)
                  .set({ state: "deleted", generation: 2 })
                  .where(eq(FabricContextTable.id, s.input.context.id))
                  .pipe(Effect.orDie)
              }
              return binding
            }),
        }
        const attempts = yield* FabricIdentityAttempts.make({ operators, root: f.root, profile: s.host }).pipe(
          Effect.provideService(Project.Service, {
            ...project,
            resolve: (directory) =>
              Effect.gen(function* () {
                expect(yield* db.inTransaction!).toBe(false)
                seen.reads++
                return yield* project.resolve(directory)
              }),
          }),
        )
        const first = yield* s.run(attempts.begin(s.input))
        expect(seen.reads).toBeGreaterThan(0)
        const reads = seen.reads
        yield* db.db.transaction(() => refusal(s.run(attempts.begin(s.input)), "unavailable"), {
          behavior: "immediate",
        })
        expect(seen.reads).toBe(reads)
        seen.armed = true
        yield* refusal(s.run(attempts.begin(s.input)), "expired")
        const rows = yield* db.db.select().from(FabricIdentityAttemptTable)
        expect(rows.map((row) => row.id)).toEqual([first.id])
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})

test("IDA08 failed current validation rolls back reservation and receipt together; canonical schema stays closed", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const original = yield* owner()
        const db = yield* Database.Service
        const seen = { armed: true, afterInsert: 0 }
        const operators = {
          ...original,
          validate: (
            binding: Parameters<typeof original.validate>[0],
            target: Parameters<typeof original.validate>[1],
          ) =>
            Effect.gen(function* () {
              yield* original.validate(binding, target)
              if (!seen.armed || target.action !== "fabric.identity.begin" || !(yield* db.inTransaction!)) return
              const rows = yield* db.db.select().from(FabricIdentityAttemptTable).pipe(Effect.orDie)
              if (rows.length === 0) return
              seen.afterInsert++
              return yield* new Capability.Failure({
                code: "target_denied",
                message: "Synthetic current denial after domain insert",
              })
            }),
        }
        const contexts = yield* FabricContexts.make({ operators, root: f.root })
        const info = yield* request(operators, contexts.create({}))
        const attempts = yield* FabricIdentityAttempts.make({ operators, root: f.root, profile: profile() })
        const input: FabricIdentityAttempt.Begin = {
          context: info.context,
          scopes: ["https://api.fabric.microsoft.com/Workspace.Read.All"],
        }
        const attempt = request(operators, attempts.begin(input), "rollback-then-retry").pipe(
          Effect.provideService(Location.Service, info.location),
        )
        yield* refusal(attempt, "target_denied")
        expect(seen.afterInsert).toBe(1)
        expect(yield* db.db.select().from(FabricIdentityAttemptTable)).toEqual([])
        expect(
          (yield* db.db.select().from(CapabilityRequestTable)).filter((row) => row.action === "fabric.identity.begin"),
        ).toEqual([])
        seen.armed = false
        expect((yield* attempt).revision).toBe(1)
        const id = FabricIdentityAttempt.ID.create()
        expect(id).not.toBe(FabricIdentityAttempt.ID.create())
        expect(Schema.is(FabricIdentityAttempt.ID)(id)).toBe(true)
        for (const invalid of [id.replace("foat_", "wrong_"), id + "\n", "foat_" + "0".repeat(63)])
          expect(Schema.is(FabricIdentityAttempt.ID)(invalid)).toBe(false)
        for (const value of [
          { ...input, scopes: [] },
          { ...input, scopes: ["https://evil.invalid/all"] },
          { ...input, principal: "forged" },
        ])
          expect(Option.isNone(Schema.decodeUnknownOption(FabricIdentityAttempt.Begin)(value))).toBe(true)
      }),
    ).pipe(Effect.provide(layer(f.filename))),
  )
})
