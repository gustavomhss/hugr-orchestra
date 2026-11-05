import { expect, test } from "bun:test"
import { randomUUID } from "node:crypto"
import { readdir, readFile, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { CapabilityRequestTable } from "@orchestra/core/capability/sql"
import { Database } from "@orchestra/core/database/database"
import { ConflictError, ForbiddenError, InvalidRequestError, ServiceUnavailableError } from "@orchestra/protocol/errors"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { AbsolutePath } from "@orchestra/schema/schema"
import { eq, sql } from "drizzle-orm"
import { Deferred, Effect, Fiber, Schema, SchemaAST } from "effect"
import { FabricContexts } from "../../../modules/fabric/src/context"
import { FabricContextTable } from "../../../modules/fabric/src/context/sql"
import { reservationBarrier } from "../../../modules/fabric/test/fixture/context-barrier"
import { fabricContextError } from "../src/handlers/fabric-contexts"
import { FabricContextsFixture } from "./fabric-contexts-fixture"

type Fixture = Effect.Success<ReturnType<typeof FabricContextsFixture.make>>
const base = "/api/fabric/contexts"
const expired = [409, "ConflictError", "Fabric context reference has expired"] as const
const denied = [403, "ForbiddenError", "Fabric context access is denied"] as const
const unavailable = [503, "ServiceUnavailableError", "Fabric context is unavailable"] as const
const createScope = { placements: "instance", actions: ["fabric.context.create", "fabric.context.list"] } as const
const resolveURL = (ref: FabricContext.Ref) => `${base}/${ref.id}?generation=${ref.generation}`

function wire(request: Effect.Effect<Response>, status: number) {
  return Effect.gen(function* () {
    const response = yield* request
    const raw = yield* Effect.promise(() => response.text())
    // Keep the scaffold's actual status AND body in the first failing diagnostic.
    expect([response.status, raw]).toEqual([status, raw])
    return { raw, value: yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(raw) }
  })
}

function page(f: Fixture, auth: string, preparing = false) {
  return wire(f.request(`${base}${preparing ? "/preparing" : ""}`, { auth }), 200).pipe(
    Effect.flatMap((body) => Schema.decodeUnknownEffect(FabricContext.Page)(body.value)))
}

function create(f: Fixture, auth: string, key: string = randomUUID()) {
  return Effect.promise(() => f.client(auth).fabricContexts.create({ "idempotency-key": key })).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(FabricContext.Info)))
}

function publicError(request: Effect.Effect<Response>, expected: readonly [number, string, string], secrets: readonly string[] = []) {
  return wire(request, expected[0]).pipe(Effect.map((body) => {
    expect(body.value).toEqual({ _tag: expected[1], message: expected[2] })
    for (const secret of secrets) expect(body.raw).not.toContain(secret)
    return body.value
  }))
}

function partition(f: Fixture, ref: FabricContext.Ref) {
  return Effect.gen(function* () {
    const auth = (yield* f.issue()).header
    expect(yield* page(f, auth)).toEqual({ items: [] })
    for (const inaccessible of [ref, { id: FabricContext.ID.create(), generation: 1 }]) {
      yield* publicError(f.request(resolveURL(inaccessible), { auth }), denied)
      yield* publicError(f.request(`${base}/remove`, { auth, key: randomUUID(), payload: inaccessible }), denied)
    }
    // Each supposedly isolated graph must also prove it can authorize its own work.
    const own = yield* create(f, auth)
    expect(own.context.id).not.toBe(ref.id)
    expect(yield* Effect.promise(() => f.client(auth).fabricContexts.resolve(own.context))).toEqual(own)
    expect(yield* page(f, auth)).toEqual({ items: [own.context] })
  })
}

function mainFile(f: Fixture) {
  return f.database.db.all(sql`PRAGMA database_list`).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ name: Schema.String, file: Schema.String })))),
    Effect.map((rows) => rows.find((row) => row.name === "main")?.file))
}

test("FHT04 durable HTTP replay revalidates authority and real owner/root/store partitions", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const f = yield* FabricContextsFixture.make()
    const auth = (yield* f.issue()).header
    expect(yield* page(f, auth)).toEqual({ items: [] })
    const scoped = yield* f.issue(createScope)
    const key = "http-durable-create"
    const info = yield* create(f, scoped.header, key)
    expect(yield* create(f, scoped.header, key)).toEqual(info)
    const original = yield* f.database.db.select().from(FabricContextTable)
    expect(original).toHaveLength(1)
    const row = original[0]!
    expect([row.id, row.state, row.generation]).toEqual([info.context.id, "active", 1])
    expect(yield* Effect.promise(() => readdir(f.root))).toEqual([info.context.id])
    const receipts = yield* f.database.db.select().from(CapabilityRequestTable)
    expect(receipts.map((receipt) => [receipt.action, receipt.result])).toEqual([["fabric.context.create", info.context]])
    expect(Object.keys(receipts[0]!.result as object).sort()).toEqual(["generation", "id"])

    // Outer fixture lifetime encloses every independently acquired SQLite/router graph.
    const fresh = yield* FabricContextsFixture.make({ filename: f.filename, root: f.root })
    const freshAuth = (yield* fresh.issue()).header
    expect(fresh.database).not.toBe(f.database)
    expect(fresh.database.db).not.toBe(f.database.db)
    expect(fresh.operators).not.toBe(f.operators)
    expect(fresh.database.storageID).toBe(f.database.storageID)
    expect(yield* mainFile(f)).toBe(f.filename)
    expect(yield* mainFile(fresh)).toBe(f.filename)
    expect(yield* page(fresh, freshAuth)).toEqual({ items: [info.context] })
    expect(yield* create(fresh, freshAuth, key)).toEqual(info)
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toEqual(receipts)
    const marker = path.join(info.location.directory, ".orchestra-fabric-context")
    const markerBefore = yield* Effect.promise(() => readFile(marker, "utf8"))
    const modifiedBefore = (yield* Effect.promise(() => stat(info.location.directory))).mtimeMs

    const noDelete = yield* f.request(`${base}/remove`, { auth: scoped.header, key: "scope-cannot-delete", payload: info.context })
    expect(noDelete.status).toBe(403)
    yield* f.operators.revoke(scoped.authority)
    expect((yield* f.request(base, { auth: scoped.header, key, payload: {} })).status).toBe(401)
    const listOnly = yield* f.issue({ placements: "instance", actions: ["fabric.context.list"] })
    expect(yield* page(f, listOnly.header)).toEqual({ items: [info.context] })
    expect((yield* f.request(base, { auth: listOnly.header, key, payload: {} })).status).toBe(403)
    expect(yield* f.database.db.select().from(FabricContextTable)).toEqual(original)
    expect(yield* f.database.db.select().from(CapabilityRequestTable)).toEqual(receipts)
    expect(yield* Effect.promise(() => readdir(f.root))).toEqual([info.context.id])
    expect(yield* Effect.promise(() => readFile(marker, "utf8"))).toBe(markerBefore)
    expect((yield* Effect.promise(() => stat(info.location.directory))).mtimeMs).toBe(modifiedBefore)

    yield* partition(yield* FabricContextsFixture.make({ filename: f.filename, root: f.root, principal: "other-http-owner" }), info.context)
    yield* partition(yield* FabricContextsFixture.make({ filename: f.filename,
      root: AbsolutePath.make(path.join(f.directory, "other-root")) }), info.context)
    const store = yield* FabricContextsFixture.make({ root: f.root })
    expect(store.database).not.toBe(f.database)
    expect(store.database.db).not.toBe(f.database.db)
    expect(store.database.storageID).not.toBe(f.database.storageID)
    expect(yield* mainFile(store)).toBe(store.filename)
    expect(store.filename).not.toBe(f.filename)
    // Copy an actual active HTTP-created row, not a synthetic row with a made-up store.
    yield* store.database.db.insert(FabricContextTable).values(row).run()
    yield* partition(store, info.context)
    expect(yield* store.database.db.select().from(FabricContextTable).where(eq(FabricContextTable.id, row.id))).toEqual([row])

    const beforeRemove = yield* f.database.db.select().from(CapabilityRequestTable)
    const removeKey = "http-durable-remove"
    const tombstone = yield* Effect.promise(() => f.client(auth).fabricContexts.remove({ ...info.context, "idempotency-key": removeKey }))
      .pipe(Effect.flatMap(Schema.decodeUnknownEffect(FabricContext.Ref)))
    expect(tombstone).toEqual({ id: info.context.id, generation: info.context.generation + 1 })
    expect(yield* Effect.promise(() => fresh.client(freshAuth).fabricContexts.remove({ ...info.context, "idempotency-key": removeKey })))
      .toEqual(tombstone)
    yield* publicError(f.request(`${base}/remove`, { auth, key: "new-remove-key", payload: info.context }), expired)
    yield* publicError(f.request(resolveURL(info.context), { auth }), expired)
    yield* publicError(f.request(base, { auth, key, payload: {} }), expired)
    const afterRemove = yield* f.database.db.select().from(CapabilityRequestTable)
    expect(afterRemove).toHaveLength(beforeRemove.length + 1)
    expect(afterRemove).toEqual(expect.arrayContaining(beforeRemove))
    expect(afterRemove.filter((receipt) => receipt.action === "fabric.context.delete").map((receipt) => receipt.result)).toEqual([tombstone])
    expect(yield* f.database.db.select().from(FabricContextTable).where(eq(FabricContextTable.id, row.id)))
      .toEqual([{ ...row, state: "deleted", generation: 2, time_updated: expect.any(Number) }])
    expect(yield* Effect.promise(() => readdir(info.location.directory))).toEqual([".orchestra-fabric-context"])
  }))), 90000)

test("FHT05 fixed public errors preserve privacy and damaged folders remain untouched by resolve/remove", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const f = yield* FabricContextsFixture.make()
    const auth = (yield* f.issue()).header
    expect(yield* page(f, auth)).toEqual({ items: [] })
    const key = "http-damaged-create"
    const info = yield* create(f, auth, key)
    const row = (yield* f.database.db.select().from(FabricContextTable))[0]!
    const marker = path.join(info.location.directory, ".orchestra-fabric-context")
    const markerBody = yield* Effect.promise(() => readFile(marker, "utf8"))
    const secrets = [f.root, row.directory, row.principal, row.storage_id, row.preparation_nonce, markerBody, key, "SQL", "stack"]

    // This pure production-mapper probe complements, never replaces, the HTTP positives above.
    const projections = [
      ["invalid-input", InvalidRequestError, 400, "InvalidRequestError", "Fabric context input is invalid"],
      ["denied", ForbiddenError, 403, "ForbiddenError", "Fabric context access is denied"],
      ["expired", ConflictError, 409, "ConflictError", "Fabric context reference has expired"],
      ["conflict", ConflictError, 409, "ConflictError", "Fabric context request conflicts"],
      ["limit", ConflictError, 409, "ConflictError", "Fabric context limit is reached"],
      ["unavailable", ServiceUnavailableError, 503, "ServiceUnavailableError", "Fabric context is unavailable"],
    ] as const
    for (const [code, protocol, status, tag, message] of projections) {
      for (const enumerable of [false, true]) {
        const failure = new FabricContext.Failure({ code, message: "PRIVATE domain message /private/fabric SQL" })
        Object.defineProperty(failure, "cause", { value: { path: row.directory, nonce: row.preparation_nonce }, enumerable })
        Object.defineProperty(failure, "rawpath", { value: row.directory, enumerable: true })
        Object.defineProperty(failure, "SQL", { value: "SELECT * FROM fabric_context", enumerable: false })
        const mapped = fabricContextError(failure)
        expect(mapped).toBeInstanceOf(protocol)
        expect(SchemaAST.resolveAt<number>("httpApiStatus")(protocol.ast)).toBe(status)
        const encoded = JSON.stringify(mapped)
        expect(yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(encoded)).toEqual({ _tag: tag, message })
        for (const secret of [...secrets, failure.message, "PRIVATE", "SELECT"]) expect(encoded).not.toContain(secret)
      }
    }

    yield* publicError(f.request(resolveURL({ ...info.context, generation: info.context.generation + 1 }), { auth }), expired, secrets)
    const foreign = yield* FabricContextsFixture.make({ filename: f.filename, root: f.root, principal: "damage-foreign-owner" })
    const foreignAuth = (yield* foreign.issue()).header
    expect(yield* page(foreign, foreignAuth)).toEqual({ items: [] })
    const foreignInfo = yield* create(foreign, foreignAuth)
    expect(yield* Effect.promise(() => foreign.client(foreignAuth).fabricContexts.resolve(foreignInfo.context))).toEqual(foreignInfo)
    const unknown = { id: FabricContext.ID.create(), generation: 1 }
    const unknownError = yield* publicError(f.request(resolveURL(unknown), { auth }), denied, secrets)
    expect(yield* publicError(f.request(resolveURL(foreignInfo.context), { auth }), denied, secrets)).toEqual(unknownError)

    const sentinel = path.join(info.location.directory, "untouched")
    yield* Effect.promise(() => writeFile(sentinel, "synthetic damage sentinel", { flag: "wx" }))
    // Bounded damage: unlink only the marker belonging to this actual HTTP-created child.
    yield* Effect.promise(() => unlink(marker))
    const rootEntries = (yield* Effect.promise(() => readdir(f.root))).sort()
    const childModified = (yield* Effect.promise(() => stat(info.location.directory))).mtimeMs
    const rootModified = (yield* Effect.promise(() => stat(f.root))).mtimeMs
    yield* publicError(f.request(resolveURL(info.context), { auth }), unavailable, secrets)
    expect(yield* Effect.promise(() => readdir(info.location.directory))).toEqual(["untouched"])
    expect((yield* Effect.promise(() => stat(info.location.directory))).mtimeMs).toBe(childModified)
    expect(yield* f.database.db.select().from(FabricContextTable).where(eq(FabricContextTable.id, row.id))).toEqual([row])

    const removed = yield* wire(f.request(`${base}/remove`, { auth, key: "http-damaged-remove", payload: info.context }), 200)
    expect(yield* Schema.decodeUnknownEffect(FabricContext.Ref)(removed.value)).toEqual({ id: row.id, generation: 2 })
    expect(yield* f.database.db.select().from(FabricContextTable).where(eq(FabricContextTable.id, row.id)))
      .toEqual([{ ...row, state: "deleted", generation: 2, time_updated: expect.any(Number) }])
    expect(yield* page(f, auth)).toEqual({ items: [] })
    yield* publicError(f.request(resolveURL(info.context), { auth }), expired, secrets)
    expect(yield* Effect.promise(() => readdir(info.location.directory))).toEqual(["untouched"])
    expect(yield* Effect.promise(() => readFile(sentinel, "utf8"))).toBe("synthetic damage sentinel")
    expect((yield* Effect.promise(() => readdir(f.root))).sort()).toEqual(rootEntries)
    expect((yield* Effect.promise(() => stat(f.root))).mtimeMs).toBe(rootModified)
    expect((yield* Effect.promise(() => stat(info.location.directory))).mtimeMs).toBe(childModified)
  }))), 90000)

test("FHT06 HTTP discovers and cancels a committed interrupted preparation without publishing a Location", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const f = yield* FabricContextsFixture.make()
    const auth = (yield* f.issue()).header
    expect(yield* page(f, auth)).toEqual({ items: [] })
    const baseline = yield* create(f, auth)
    const before = { ids: (yield* f.database.db.select().from(FabricContextTable)).map((row) => row.id),
      entries: yield* Effect.promise(() => readdir(f.root)) }
    const barrier = yield* reservationBarrier(f.database, f, before)
    const contexts = yield* f.local(FabricContexts.make({ operators: f.operators, root: f.root }).pipe(
      Effect.provideService(Database.Service, { ...f.database, db: barrier.db })))
    barrier.state.armed = true
    const key = randomUUID()
    const pending = yield* f.local(contexts.create({}), key).pipe(Effect.forkChild)
    yield* Effect.gen(function* () {
      const boundary = yield* Effect.raceFirst(
        Deferred.await(barrier.entered).pipe(Effect.map((id) => ({ kind: "entered" as const, id }))),
        Fiber.await(pending).pipe(Effect.map((exit) => ({ kind: "completed" as const, exit }))),
      ).pipe(Effect.timeout("10 seconds"))
      if (boundary.kind === "completed") throw new Error(`FHT06 create missed committed-reservation barrier: ${JSON.stringify(boundary.exit)}`)
      expect(barrier.state.pauses).toBe(1)
      const ref = { id: boundary.id, generation: 1 }
      const rows = yield* f.database.db.select().from(FabricContextTable).where(eq(FabricContextTable.id, ref.id))
      expect(rows).toHaveLength(1)
      expect([rows[0]!.state, rows[0]!.generation]).toEqual(["preparing", 1])
      expect(rows[0]!.preparation_nonce.length).toBeGreaterThan(0)
      expect((yield* Effect.promise(() => readdir(f.root))).sort()).toEqual([...before.entries].sort())
      yield* Fiber.interrupt(pending)
      const preparing = yield* page(f, auth, true)
      expect(preparing).toEqual({ items: [ref] })
      expect(Object.keys(preparing.items[0]!).sort()).toEqual(["generation", "id"])
      expect(yield* page(f, auth)).toEqual({ items: [baseline.context] })
      // Assigned transport expectation; current domain instead reports unavailable for preparing.
      yield* publicError(f.request(resolveURL(ref), { auth }), expired)
      expect((yield* Effect.promise(() => readdir(f.root))).sort()).toEqual([...before.entries].sort())
      const removeKey = "http-cancel-preparing"
      const tombstone = yield* Effect.promise(() => f.client(auth).fabricContexts.remove({ ...ref, "idempotency-key": removeKey }))
        .pipe(Effect.flatMap(Schema.decodeUnknownEffect(FabricContext.Ref)))
      expect(tombstone).toEqual({ id: ref.id, generation: 2 })
      expect(yield* Effect.promise(() => f.client(auth).fabricContexts.remove({ ...ref, "idempotency-key": removeKey }))).toEqual(tombstone)
      expect(yield* page(f, auth, true)).toEqual({ items: [] })
      expect(yield* page(f, auth)).toEqual({ items: [baseline.context] })
      yield* publicError(f.request(resolveURL(ref), { auth }), expired)
      yield* publicError(f.request(base, { auth, key, payload: {} }), expired)
      expect(yield* f.database.db.select().from(FabricContextTable).where(eq(FabricContextTable.id, ref.id)))
        .toEqual([{ ...rows[0]!, state: "deleted", generation: 2, time_updated: expect.any(Number) }])
      expect((yield* Effect.promise(() => readdir(f.root))).sort()).toEqual([...before.entries].sort())
      expect(barrier.state.pauses).toBe(1)
    }).pipe(Effect.ensuring(Effect.uninterruptible(
      Deferred.succeed(barrier.release, undefined).pipe(Effect.andThen(Fiber.interrupt(pending))))))
  }))), 90000)
