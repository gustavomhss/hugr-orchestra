import { expect } from "bun:test"
import { readFile } from "node:fs/promises"
import path from "node:path"
import { Database } from "@orchestra/core/database/database"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { Deferred, Effect, Option, Schema } from "effect"
import { FabricContextTable } from "../../src/context/sql"

export function publicationBarrier(database: Database.Interface, filename: string) {
  return Effect.gen(function* () {
    const entered = yield* Deferred.make<FabricContext.Ref>()
    const release = yield* Deferred.make<void>()
    const state = { armed: false, pauses: 0 }
    const marker = Schema.Struct({ id: FabricContext.ID, nonce: Schema.NonEmptyString })
      .annotate({ parseOptions: { onExcessProperty: "error" } })
    // Pause BEFORE entering a real transaction, only after a committed preparing row
    // and its real exact marker exist. Never invoke or replace the SQL callback here.
    function beforeTransaction<T extends object>(target: T): T {
      return new Proxy(target, { get(object, key) {
        const member: unknown = Reflect.get(object, key, object)
        if (typeof member !== "function") return member
        return (...args: unknown[]) => {
          if (key !== "transaction") return Reflect.apply(member, object, args)
          return Effect.gen(function* () {
            if (state.armed) {
              const rows = yield* Effect.gen(function* () {
                const other = yield* Database.Service
                return yield* other.db.select().from(FabricContextTable)
              }).pipe(Effect.provide(Database.layerFromPath(filename)))
              const row = rows.find((item) => item.state === "preparing")
              const body = row ? yield* Effect.promise(() => readFile(path.join(row.directory, ".orchestra-fabric-context"), "utf8")
                .catch((error: unknown) => {
                  if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined
                  throw error
                })) : undefined
              if (row && body !== undefined) {
                const parsed = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(body)
                if (Option.isNone(parsed)) throw new Error("Publication barrier encountered malformed marker JSON")
                const decoded = Schema.decodeUnknownOption(marker)(parsed.value)
                expect(Option.isSome(decoded) && decoded.value.id === row.id && decoded.value.nonce === row.preparation_nonce).toBe(true)
                state.armed = false
                state.pauses++
                yield* Deferred.succeed(entered, { id: row.id, generation: row.generation })
                yield* Deferred.await(release)
              }
            }
            const result: unknown = Reflect.apply(member, object, args)
            if (!Effect.isEffect(result)) throw new Error("Expected the actual SQL transaction Effect")
            return yield* result
          })
        }
      } })
    }
    return { db: beforeTransaction(database.db), entered, release, state }
  })
}
