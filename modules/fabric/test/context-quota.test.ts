import { expect, test } from "bun:test"
import { readdir } from "node:fs/promises"
import { Database } from "@orchestra/core/database/database"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { Deferred, Effect, Exit, Fiber } from "effect"
import { FabricContexts } from "../src/context"
import { FabricContextTable } from "../src/context/sql"
import { failure, fixtures, layer, owner, request } from "./fixture/context"

const cases = fixtures()

test("FCT14 distinct request keys compete for quota inside real SQL admission", () => {
  const fixture = cases.box()
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const state = { arrivals: 0 }
    // Admit both callers to the boundary before either real transaction begins.
    // Every callback/result remains real; a count outside the transaction sees zero twice.
    function beforeAdmission<T extends object>(target: T): T {
      return new Proxy(target, { get(object, key) {
        const member: unknown = Reflect.get(object, key, object)
        if (typeof member !== "function") return member
        return (...args: unknown[]) => {
          if (key !== "transaction") return Reflect.apply(member, object, args)
          return Effect.gen(function* () {
            if (state.arrivals < 2) {
              state.arrivals++
              if (state.arrivals === 2) yield* Deferred.succeed(entered, undefined)
              yield* Deferred.await(release)
            }
            const result: unknown = Reflect.apply(member, object, args)
            if (!Effect.isEffect(result)) throw new Error("Expected the actual SQL transaction Effect")
            return yield* result
          })
        }
      } })
    }
    const contexts = yield* FabricContexts.make({ operators, root: fixture.root, maxContexts: 1 }).pipe(
      Effect.provideService(Database.Service, { ...database, db: beforeAdmission(database.db) }))
    const pending = yield* Effect.all(["quota-first", "quota-second"].map((key) =>
      request(operators, contexts.create({}), key).pipe(Effect.exit)), { concurrency: "unbounded" }).pipe(Effect.forkChild)
    yield* Effect.gen(function* () {
      const boundary = yield* Effect.raceFirst(
        Deferred.await(entered).pipe(Effect.map(() => "entered" as const)),
        Fiber.await(pending).pipe(Effect.map(() => "completed" as const)),
      ).pipe(Effect.timeout("10 seconds"))
      if (boundary === "completed") {
        const results = yield* Fiber.join(pending)
        for (const result of results) {
          if (Exit.isSuccess(result)) throw new Error("FCT14 creator succeeded without both real admission boundaries")
          yield* failure(Effect.failCause(result.cause), "unavailable")
        }
        throw new Error("FCT14 creators failed before admission barrier: FabricContext.Failure/unavailable")
      }
      expect(state.arrivals).toBe(2)
      expect(yield* database.db.select().from(FabricContextTable)).toEqual([])
      expect(yield* Effect.promise(() => readdir(fixture.root))).toEqual([])
      yield* Deferred.succeed(release, undefined)
      const results = yield* Fiber.join(pending).pipe(Effect.timeout("10 seconds"))
      const successes = results.filter(Exit.isSuccess)
      const failures = results.filter(Exit.isFailure)
      expect(successes).toHaveLength(1)
      expect(failures).toHaveLength(1)
      const refused = failures[0]
      if (!refused) throw new Error("Expected one quota refusal")
      expect(yield* failure(Effect.failCause(refused.cause), "limit")).toBeInstanceOf(FabricContext.Failure)
      const winner = successes[0]
      if (!winner) throw new Error("Expected one legitimate quota winner")
      const rows = yield* database.db.select().from(FabricContextTable)
      expect(rows.map((row) => [row.id, row.state, row.generation])).toEqual([[winner.value.context.id, "active", 1]])
      expect(yield* Effect.promise(() => readdir(fixture.root))).toEqual([winner.value.context.id])
      expect(yield* request(operators, contexts.resolve(winner.value.context))).toEqual(winner.value)
    }).pipe(Effect.ensuring(Deferred.succeed(release, undefined).pipe(Effect.andThen(Fiber.interrupt(pending)))))
  })).pipe(Effect.provide(layer(fixture.filename))))
}, 30000)
