import { expect } from "bun:test"
import { readdir } from "node:fs/promises"
import { Database } from "@orchestra/core/database/database"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { Deferred, Effect } from "effect"
import { FabricContextTable } from "../../src/context/sql"

export function reservationBarrier(database: Database.Interface, fixture: { filename: string; root: string }) {
  return Effect.gen(function* () {
    const entered = yield* Deferred.make<FabricContext.ID>()
    const release = yield* Deferred.make<void>()
    const state = { armed: false, pauses: 0 }
    // Schedule one completed real transaction. Queries, callbacks and rows are not replaced.
    // Independent SQL visibility proves commitment; this is not a universal SQL-only callback detector.
    function afterCommit<T extends object>(target: T): T {
      return new Proxy(target, { get(object, key) {
        const member: unknown = Reflect.get(object, key, object)
        if (typeof member !== "function") return member
        return (...args: unknown[]) => {
          const result: unknown = Reflect.apply(member, object, args)
          if (key !== "transaction" || !Effect.isEffect(result)) return result
          return result.pipe(Effect.tap(() => Effect.gen(function* () {
            if (!state.armed) return
            const committed = yield* Effect.gen(function* () {
              const other = yield* Database.Service
              return yield* other.db.select().from(FabricContextTable)
            }).pipe(Effect.provide(Database.layerFromPath(fixture.filename)))
            if (!committed.some((row) => row.state === "preparing")) return
            expect(committed).toHaveLength(1)
            const row = committed[0]!
            expect(row.state).toBe("preparing")
            expect(row.generation).toBe(1)
            expect(yield* Effect.promise(() => readdir(fixture.root))).toEqual([])
            state.armed = false
            state.pauses++
            yield* Deferred.succeed(entered, row.id)
            yield* Deferred.await(release)
          })))
        }
      } })
    }
    return { db: afterCommit(database.db), entered, release, state }
  })
}
