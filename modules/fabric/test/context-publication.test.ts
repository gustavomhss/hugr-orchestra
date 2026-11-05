import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { lstat, readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { Database } from "@orchestra/core/database/database"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Deferred, Effect, Exit, Fiber, Schema } from "effect"
import { FabricContexts } from "../src/context"
import { FabricContextTable } from "../src/context/sql"
import { failure, fixtures, layer, owner, request } from "./fixture/context"
import { publicationBarrier } from "./fixture/context-publication"

const cases = fixtures()
const rows = Effect.gen(function* () {
  const database = yield* Database.Service
  return yield* database.db.select().from(FabricContextTable)
})

test("FCT13 cancellation and revocation fence publication after real directory preparation", async () => {
  // The barrier orders real SQL/marker observations; it is not a universal callback-purity detector.
  for (const kind of ["cancel", "revoke"] as const) {
    const fixture = cases.box()
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const database = yield* Database.Service
      const operators = yield* owner()
      const authority = kind === "revoke" ? (yield* operators.issue({ origin: "sdk" })).authority : operators.configured
      const barrier = yield* publicationBarrier(database, fixture.filename)
      const options = { operators, root: fixture.root, maxContexts: 1 }
      const contexts = yield* FabricContexts.make(options).pipe(
        Effect.provideService(Database.Service, { ...database, db: barrier.db }))
      const controls = yield* FabricContexts.make(options)
      barrier.state.armed = true
      const pending = yield* operators.withRequest(authority,
        { requestID: randomUUID(), idempotencyKey: kind }, contexts.create({})).pipe(Effect.forkChild)
      yield* Effect.gen(function* () {
        const boundary = yield* Effect.raceFirst(
          Deferred.await(barrier.entered).pipe(Effect.map((ref) => ({ kind: "entered" as const, ref }))),
          Fiber.await(pending).pipe(Effect.map((exit) => ({ kind: "completed" as const, exit }))),
        ).pipe(Effect.timeout("10 seconds"))
        if (boundary.kind === "completed") {
          if (Exit.isFailure(boundary.exit)) {
            const error = yield* failure(Effect.failCause(boundary.exit.cause), "unavailable")
            throw new Error(`FCT13/${kind} create failed before prepared-directory publication barrier: ${error._tag}/${error.code}`)
          }
          throw new Error(`FCT13/${kind} create completed without the prepared-directory publication barrier`)
        }
        const ref = boundary.ref
        expect(barrier.state.pauses).toBe(1)
        expect(ref.generation).toBe(1)
        const reserved = yield* rows
        expect(reserved.map((row) => [row.id, row.state, row.generation])).toEqual([[ref.id, "preparing", 1]])
        const row = reserved[0]
        if (!row) throw new Error(`FCT13/${kind} expected the actual preparing reservation`)
        expect(row.directory).toBe(AbsolutePath.make(path.join(fixture.root, ref.id)))
        expect(row.preparation_nonce.length).toBeGreaterThan(0)
        const marker = path.join(row.directory, ".orchestra-fabric-context")
        expect((yield* Effect.promise(() => lstat(row.directory))).isDirectory()).toBe(true)
        expect((yield* Effect.promise(() => lstat(marker))).isFile()).toBe(true)
        const markerBytes = yield* Effect.promise(() => readFile(marker))
        const decoded = Schema.decodeUnknownSync(Schema.Struct({ id: FabricContext.ID, nonce: Schema.NonEmptyString })
          .annotate({ parseOptions: { onExcessProperty: "error" } }))(
          Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(markerBytes.toString("utf8")))
        expect(decoded).toEqual({ id: row.id, nonce: row.preparation_nonce })
        const entries = (yield* Effect.promise(() => readdir(row.directory))).sort()
        expect(entries).toEqual([".orchestra-fabric-context"])
        const rootEntries = (yield* Effect.promise(() => readdir(fixture.root))).sort()
        expect(rootEntries).toEqual([ref.id])
        expect(yield* request(operators, controls.list({}))).toEqual({ items: [] })
        expect(yield* request(operators, controls.preparing({}))).toEqual({ items: [ref] })

        if (kind === "cancel") {
          expect(yield* request(operators, controls.remove(ref), "cancel-prepared-publication"))
            .toEqual({ id: ref.id, generation: 2 })
          expect(yield* request(operators, controls.remove(ref), "cancel-prepared-publication"))
            .toEqual({ id: ref.id, generation: 2 })
          expect((yield* rows).map((item) => [item.id, item.state, item.generation]))
            .toEqual([[ref.id, "deleted", 2]])
          expect(yield* request(operators, controls.preparing({}))).toEqual({ items: [] })
          expect(yield* Effect.promise(() => readFile(marker))).toEqual(markerBytes)
          expect((yield* Effect.promise(() => readdir(row.directory))).sort()).toEqual(entries)
        }
        if (kind === "revoke") yield* operators.revoke(authority)

        yield* Deferred.succeed(barrier.release, undefined)
        yield* failure(Fiber.join(pending).pipe(Effect.timeout("10 seconds")),
          kind === "cancel" ? "expired" : "authentication_required")
        expect(barrier.state.pauses).toBe(1)
        expect((yield* rows).filter((item) => item.state === "active")).toEqual([])
        expect(yield* request(operators, controls.list({}))).toEqual({ items: [] })
        expect((yield* rows).map((item) => [item.id, item.state, item.generation]))
          .toEqual([[ref.id, kind === "cancel" ? "deleted" : "preparing", kind === "cancel" ? 2 : 1]])
        expect(yield* request(operators, controls.preparing({})))
          .toEqual({ items: kind === "cancel" ? [] : [ref] })
        expect(yield* Effect.promise(() => readFile(marker))).toEqual(markerBytes)
        expect((yield* Effect.promise(() => readdir(row.directory))).sort()).toEqual(entries)
        expect((yield* Effect.promise(() => readdir(fixture.root))).sort()).toEqual(rootEntries)

        if (kind === "revoke") {
          expect(yield* request(operators, controls.remove(ref), "cancel-revoked-prepared-publication"))
            .toEqual({ id: ref.id, generation: 2 })
        }
        expect((yield* rows).map((item) => [item.id, item.state, item.generation])).toEqual([[ref.id, "deleted", 2]])
        expect(yield* request(operators, controls.preparing({}))).toEqual({ items: [] })
        expect(yield* Effect.promise(() => readFile(marker))).toEqual(markerBytes)
        expect((yield* Effect.promise(() => readdir(row.directory))).sort()).toEqual(entries)
        const replacement = yield* request(operators, controls.create({}), `replacement-${kind}`)
        expect(replacement.context.id).not.toBe(ref.id)
        expect(replacement.context.generation).toBe(1)
        expect(yield* request(operators, controls.resolve(replacement.context))).toEqual(replacement)
        expect(yield* request(operators, controls.list({}))).toEqual({ items: [replacement.context] })
        expect(yield* request(operators, controls.preparing({}))).toEqual({ items: [] })
        expect((yield* rows).filter((item) => item.state === "active").map((item) => item.id))
          .toEqual([replacement.context.id])
        expect(yield* Effect.promise(() => readFile(marker))).toEqual(markerBytes)
        expect(barrier.state.pauses).toBe(1)
      }).pipe(Effect.ensuring(Deferred.succeed(barrier.release, undefined).pipe(Effect.andThen(Fiber.interrupt(pending)))))
    })).pipe(Effect.provide(layer(fixture.filename))))
  }
}, 60000)
