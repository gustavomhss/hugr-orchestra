import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { lstat, mkdir, readdir, readFile, readlink, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { inspect } from "node:util"
import { Database } from "@orchestra/core/database/database"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Deferred, Effect, Exit, Fiber, Schema } from "effect"
import { FabricContexts } from "../src/context"
import { FabricContextTable } from "../src/context/sql"
import { failure, fixtures, layer, owner, request } from "./fixture/context"
import { reservationBarrier } from "./fixture/context-barrier"

const cases = fixtures()
const rows = Effect.gen(function* () {
  const database = yield* Database.Service
  return yield* database.db.select().from(FabricContextTable)
})

function committed<A, E>(name: string, barrier: {
  entered: Deferred.Deferred<FabricContext.ID>; state: { pauses: number }
}, pending: Fiber.Fiber<A, E>) {
  return Effect.gen(function* () {
    const boundary = yield* Effect.raceFirst(
      Deferred.await(barrier.entered).pipe(Effect.map((id) => ({ kind: "entered" as const, id }))),
      Fiber.await(pending).pipe(Effect.map((exit) => ({ kind: "completed" as const, exit }))),
    ).pipe(Effect.timeout("10 seconds"))
    if (boundary.kind === "completed") {
      if (Exit.isFailure(boundary.exit)) {
        const error = yield* failure(Effect.failCause(boundary.exit.cause), "unavailable")
        throw new Error(`${name} create failed before committed-reservation barrier: ${error._tag}/${error.code}`)
      }
      throw new Error(`${name} create completed without the committed-reservation barrier`)
    }
    expect(barrier.state.pauses).toBe(1)
    return boundary.id
  })
}

test("FCT10 publication revalidates an issued Core authority revoked after reservation", () => {
  const fixture = cases.box()
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const issued = yield* operators.issue({ origin: "sdk" })
    const barrier = yield* reservationBarrier(database, fixture)
    const contexts = yield* FabricContexts.make({ operators, root: fixture.root }).pipe(
      Effect.provideService(Database.Service, { ...database, db: barrier.db }))
    const controls = yield* FabricContexts.make({ operators, root: fixture.root })
    barrier.state.armed = true
    const pending = yield* operators.withRequest(issued.authority,
      { requestID: randomUUID(), idempotencyKey: "revoke-publication" }, contexts.create({})).pipe(Effect.forkChild)
    yield* Effect.gen(function* () {
      const ref = { id: yield* committed("FCT10", barrier, pending), generation: 1 }
      yield* operators.revoke(issued.authority)
      yield* Deferred.succeed(barrier.release, undefined)
      yield* failure(Fiber.join(pending).pipe(Effect.timeout("10 seconds")), "authentication_required")
      expect((yield* rows).map((row) => [row.id, row.state, row.generation])).toEqual([[ref.id, "preparing", 1]])
      expect(yield* request(operators, controls.list({}))).toEqual({ items: [] })
      expect(yield* request(operators, controls.preparing({}))).toEqual({ items: [ref] })
      expect(yield* request(operators, controls.remove(ref), "cancel-revoked-preparation"))
        .toEqual({ id: ref.id, generation: 2 })
      expect((yield* rows).map((row) => [row.id, row.state, row.generation])).toEqual([[ref.id, "deleted", 2]])
      expect(yield* request(operators, controls.preparing({}))).toEqual({ items: [] })
      expect(yield* request(operators, controls.list({}))).toEqual({ items: [] })
      expect(barrier.state.pauses).toBe(1)
    }).pipe(Effect.ensuring(Deferred.succeed(barrier.release, undefined).pipe(Effect.andThen(Fiber.interrupt(pending)))))
  })).pipe(Effect.provide(layer(fixture.filename))))
}, 60000)

test("FCT11 preparing refuses incompatible paths but resumes the exact admitted marker", async () => {
  // Synthetic after-marker crash states, not a universal host-attacker/TOCTOU claim.
  for (const kind of ["unmarked", "incompatible", "symlink", "exact"] as const) {
    const fixture = cases.box()
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const database = yield* Database.Service
      const operators = yield* owner()
      const barrier = yield* reservationBarrier(database, fixture)
      const contexts = yield* FabricContexts.make({ operators, root: fixture.root, maxContexts: 1 }).pipe(
        Effect.provideService(Database.Service, { ...database, db: barrier.db }))
      const controls = yield* FabricContexts.make({ operators, root: fixture.root, maxContexts: 1 })
      barrier.state.armed = true
      const pending = yield* request(operators, contexts.create({}), `prepare-${kind}`).pipe(Effect.forkChild)
      yield* Effect.gen(function* () {
        const ref = { id: yield* committed(`FCT11/${kind}`, barrier, pending), generation: 1 }
        const row = (yield* rows).find((item) => item.id === ref.id)
        if (!row) throw new Error("FCT11 expected the actual committed reservation")
        expect(row.state).toBe("preparing")
        expect(row.generation).toBe(1)
        expect(row.preparation_nonce.length).toBeGreaterThan(0)
        const directory = path.join(fixture.root, ref.id)
        const external = path.join(fixture.directory, "external")
        const target = kind === "symlink" ? external : directory
        const marker = path.join(directory, ".orchestra-fabric-context")
        const sentinel = "SENTINEL-context-recovery-synthetic"
        const markerBody = JSON.stringify({ id: row.id,
          nonce: kind === "exact" || kind === "symlink" ? row.preparation_nonce : "wrong-synthetic-nonce" })
        yield* Effect.promise(async () => {
          await mkdir(target, { mode: 0o700 })
          if (kind !== "exact") await writeFile(path.join(target, "sentinel"), sentinel)
          if (kind !== "unmarked") await writeFile(path.join(target, ".orchestra-fabric-context"), markerBody, { mode: 0o600, flag: "wx" })
          if (kind === "symlink") await symlink(external, directory, "dir")
        })
        const before = (yield* Effect.promise(() => readdir(directory))).sort()
        yield* Deferred.succeed(barrier.release, undefined)
        if (kind === "exact") {
          const info = yield* Fiber.join(pending).pipe(Effect.timeout("10 seconds"))
          expect(info.context).toEqual(ref)
          expect(info.location.directory).toBe(AbsolutePath.make(directory))
          expect(yield* request(operators, controls.resolve(ref))).toEqual(info)
          expect(yield* request(operators, controls.list({}))).toEqual({ items: [ref] })
          expect(yield* request(operators, controls.preparing({}))).toEqual({ items: [] })
          expect((yield* rows).map((item) => [item.id, item.state, item.generation])).toEqual([[ref.id, "active", 1]])
          expect(yield* Effect.promise(() => readFile(marker, "utf8"))).toBe(markerBody)
          expect((yield* Effect.promise(() => readdir(directory))).sort()).toEqual(before)
          expect(before).toEqual([".orchestra-fabric-context"])
          return
        }
        const error = yield* failure(Fiber.join(pending).pipe(Effect.timeout("10 seconds")), "unavailable")
        for (const rendered of [String(error), error.message, JSON.stringify(error), inspect(error)]) {
          for (const secret of [row.preparation_nonce, sentinel, markerBody, "wrong-synthetic-nonce"])
            expect(rendered).not.toContain(secret)
        }
        expect((yield* rows).map((item) => [item.id, item.state, item.generation])).toEqual([[ref.id, "preparing", 1]])
        expect(yield* request(operators, controls.list({}))).toEqual({ items: [] })
        expect(yield* request(operators, controls.preparing({}))).toEqual({ items: [ref] })
        // Both failed preparation and explicit cancellation leave the occupied path untouched.
        for (const stage of ["failed", "cancelled"] as const) {
          if (stage === "cancelled") {
            expect(yield* request(operators, controls.remove(ref), `cancel-${kind}`)).toEqual({ id: ref.id, generation: 2 })
            expect((yield* rows).map((item) => [item.id, item.state, item.generation])).toEqual([[ref.id, "deleted", 2]])
          }
          expect((yield* Effect.promise(() => readdir(directory))).sort()).toEqual(before)
          expect(yield* Effect.promise(() => readFile(path.join(directory, "sentinel"), "utf8"))).toBe(sentinel)
          if (kind === "incompatible" || kind === "symlink") expect((yield* Effect.promise(() => readFile(marker, "utf8"))) === markerBody).toBe(true)
          if (kind === "unmarked") expect(before).toEqual(["sentinel"])
          if (kind === "symlink") {
            expect((yield* Effect.promise(() => lstat(directory))).isSymbolicLink()).toBe(true)
            expect(yield* Effect.promise(() => readlink(directory))).toBe(external)
            expect((yield* Effect.promise(() => readdir(external))).sort()).toEqual(before)
            expect(yield* Effect.promise(() => readFile(path.join(external, "sentinel"), "utf8"))).toBe(sentinel)
          }
        }
        expect(yield* request(operators, controls.preparing({}))).toEqual({ items: [] })
        const replacement = yield* request(operators, controls.create({}), `after-cancel-${kind}`)
        expect(replacement.context.id).not.toBe(ref.id)
        expect(yield* request(operators, controls.resolve(replacement.context))).toEqual(replacement)
        expect((yield* rows).filter((item) => item.state === "active").map((item) => item.id)).toEqual([replacement.context.id])
      }).pipe(Effect.ensuring(Deferred.succeed(barrier.release, undefined).pipe(Effect.andThen(Fiber.interrupt(pending)))))
      expect(barrier.state.pauses).toBe(1)
    })).pipe(Effect.provide(layer(fixture.filename))))
  }
}, 60000)

test("FCT12 real interrupted preparing admissions paginate without projecting active Locations", () => {
  const fixture = cases.box()
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const refs = yield* Effect.forEach(Array.from({ length: 17 }, (_, index) => index), (index) => Effect.gen(function* () {
      const previous = yield* rows
      expect(previous).toHaveLength(index)
      expect(previous.every((row) => row.state === "preparing" && row.generation === 1)).toBe(true)
      const barrier = yield* reservationBarrier(database, fixture, { ids: previous.map((row) => row.id), entries: [] })
      const contexts = yield* FabricContexts.make({ operators, root: fixture.root, maxContexts: 32 }).pipe(
        Effect.provideService(Database.Service, { ...database, db: barrier.db }))
      barrier.state.armed = true
      const pending = yield* request(operators, contexts.create({}), `pending-page-${index}`).pipe(Effect.forkChild)
      return yield* Effect.gen(function* () {
        const ref = { id: yield* committed(`FCT12/${index}`, barrier, pending), generation: 1 }
        yield* Fiber.interrupt(pending).pipe(Effect.timeout("10 seconds"))
        const interrupted = yield* Fiber.await(pending)
        expect(Exit.isFailure(interrupted) && interrupted.cause.reasons.some((reason) => reason._tag === "Interrupt")).toBe(true)
        yield* Deferred.succeed(barrier.release, undefined)
        expect(barrier.state.pauses).toBe(1)
        expect((yield* rows).filter((row) => row.id === ref.id).map((row) => [row.state, row.generation]))
          .toEqual([["preparing", 1]])
        expect(yield* Effect.promise(() => readdir(fixture.root))).toEqual([])
        return ref
      }).pipe(Effect.ensuring(Deferred.succeed(barrier.release, undefined).pipe(Effect.andThen(Fiber.interrupt(pending)))))
    }), { concurrency: 1 })
    const controls = yield* FabricContexts.make({ operators, root: fixture.root, maxContexts: 32 })
    const ordered = refs.toSorted((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    expect(new Set(ordered.map((ref) => ref.id)).size).toBe(17)
    expect((yield* rows).map((row) => row.id).sort()).toEqual(ordered.map((ref) => ref.id))
    expect(yield* request(operators, controls.list({}))).toEqual({ items: [] })
    const first = yield* request(operators, controls.preparing({}))
    expect(first).toEqual({ items: ordered.slice(0, 16), after: ordered[15]!.id })
    const last = yield* request(operators, controls.preparing({ after: first.after! }))
    expect(last).toEqual({ items: ordered.slice(16) })
    const maximum = yield* request(operators, controls.preparing({ limit: 32 }))
    expect(maximum).toEqual({ items: ordered })
    const singles: FabricContext.Page[] = []
    for (const index of Array.from({ length: 17 }, (_, index) => index)) {
      const after = singles.at(-1)?.after
      const page = yield* request(operators, controls.preparing({ limit: 1, ...(after === undefined ? {} : { after }) }))
      expect(page).toEqual({ items: [ordered[index]], ...(index < 16 ? { after: ordered[index]!.id } : {}) })
      singles.push(page)
    }
    expect(singles.flatMap((page) => page.items)).toEqual(ordered)
    for (const page of [first, last, maximum, ...singles]) {
      const encoded = Schema.encodeSync(FabricContext.Page)(page)
      expect(Object.keys(encoded).sort()).toEqual(page.after === undefined ? ["items"] : ["after", "items"])
      expect(encoded.items).toEqual(page.items)
      for (const ref of encoded.items) expect(Object.keys(ref).sort()).toEqual(["generation", "id"])
    }
    const stranger = yield* owner("foreign-context-recovery")
    const foreign = yield* FabricContexts.make({ operators: stranger, root: fixture.root, maxContexts: 32 })
    expect(yield* request(stranger, foreign.preparing({ limit: 32 }))).toEqual({ items: [] })
    expect(yield* request(operators, controls.preparing({ limit: 32 }))).toEqual({ items: ordered })
    expect((yield* rows).every((row) => row.state === "preparing" && row.generation === 1)).toBe(true)
    expect(yield* Effect.promise(() => readdir(fixture.root))).toEqual([])
  })).pipe(Effect.provide(layer(fixture.filename))))
}, 90000)
