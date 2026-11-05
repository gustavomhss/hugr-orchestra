import { afterAll, expect, test } from "bun:test"
import { mkdtempSync } from "node:fs"
import { rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Deferred, Effect, Fiber, Layer } from "effect"
import { Credential } from "@orchestra/core/credential"
import { Database } from "@orchestra/core/database/database"
import { Integration } from "@orchestra/core/integration"

const root = mkdtempSync(path.join(os.tmpdir(), "orchestra-cache-interleave-"))
afterAll(() => rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => undefined))
const cache = (serialized: string) => Credential.Cache.make({ type: "cache", methodID: Integration.MethodID.make("interleave"),
  format: "identity.fixture", version: 1, serialized })

test("CCT01 a real SQLite writer interleaved after snapshot read cannot be overwritten", () => Effect.runPromise(
  Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const state = { armed: false, pauses: 0 }

    // Schedule only: delegate every query/row to the original real SQLite client, unchanged.
    // Intercept the SELECT builder's completed get, not an UPDATE or a transaction/SQL implementation.
    function observe<T extends object>(target: T): T {
      return new Proxy(target, { get(object, key) {
        const member: unknown = Reflect.get(object, key, object)
        if (typeof member !== "function") return member
        return (...args: unknown[]) => {
          const result: unknown = Reflect.apply(member, object, args)
          if (key === "get" && Effect.isEffect(result)) return result.pipe(Effect.tap(() => Effect.suspend(() => {
            if (!state.armed) return Effect.void
            state.armed = false
            state.pauses++
            return Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))
          })))
          if ((key === "select" || key === "from" || key === "where") && result !== null && typeof result === "object")
            return observe(result)
          return result
        }
      } })
    }

    return yield* Effect.gen(function* () {
      const credentials = yield* Credential.Service
      const created = yield* credentials.create({ integrationID: Integration.ID.make("cache-interleave"), value: cache("initial") })
      const first = yield* credentials.cache.read(created.id)
      expect(first?.mode).toBe("owned")
      if (first?.mode !== "owned") return
      state.armed = true
      const pending = yield* credentials.cache.compareAndSwap({ id: created.id, revision: first.revision,
        value: cache("stale-writer") }).pipe(Effect.forkChild)
      // Missing interception is a named failure/timeout, never a skip or a passing empty observation.
      yield* Deferred.await(entered).pipe(Effect.timeout("10 seconds"))
      expect(state.pauses).toBe(1)
      const newer = yield* Effect.gen(function* () {
        const other = yield* Credential.Service
        yield* other.update(created.id, { value: cache("interleaved-winner") })
        const snapshot = yield* other.cache.read(created.id)
        expect(snapshot?.mode).toBe("owned")
        if (snapshot?.mode !== "owned") throw new Error("Expected the independent writer's persisted snapshot")
        expect(snapshot.revision).not.toBe(first.revision)
        expect(snapshot.credential.value).toEqual(cache("interleaved-winner"))
        return snapshot
      }).pipe(
        Effect.provide(Credential.layerFrom(undefined).pipe(Layer.provide(Database.layerFromPath(path.join(root, "cache.db"))))),
        Effect.ensuring(Deferred.succeed(release, undefined)),
      )
      expect(yield* Fiber.join(pending).pipe(Effect.timeout("10 seconds"))).toEqual({ updated: false })
      expect(yield* credentials.cache.read(created.id)).toEqual(newer)
      expect(state.pauses).toBe(1)
    }).pipe(Effect.provide(Credential.layerFrom(undefined).pipe(Layer.provide(
      Layer.succeed(Database.Service, { ...database, db: observe(database.db) }),
    ))))
  })).pipe(Effect.provide(Database.layerFromPath(path.join(root, "cache.db"))))),
30000)
