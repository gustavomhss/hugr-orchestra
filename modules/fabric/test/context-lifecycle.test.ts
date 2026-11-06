import { expect, test } from "bun:test"
import { lstat, mkdir, readdir, readFile, readlink, rm, stat, symlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { inspect } from "node:util"
import { Database } from "@orchestra/core/database/database"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { Project } from "@orchestra/schema/project"
import { AbsolutePath } from "@orchestra/schema/schema"
import { eq } from "drizzle-orm"
import { Deferred, Effect, Exit, Fiber, Option, Schema } from "effect"
import { FabricContexts } from "../src/context"
import { FabricContextTable } from "../src/context/sql"
import { failure, fixtures, layer, owner, request } from "./fixture/context"
import { reservationBarrier } from "./fixture/context-barrier"

const cases = fixtures()

const rows = Effect.gen(function* () {
  const database = yield* Database.Service
  return yield* database.db.select().from(FabricContextTable)
})
const entries = (root: string) => Effect.promise(() => readdir(root).then((items) => items.sort()))
const marker = (directory: string) => path.join(directory, ".orchestra-fabric-context")

test("FCT05 interruption after a real committed reservation recovers the same ID", () => {
  const fixture = cases.box()
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const barrier = yield* reservationBarrier(database, fixture)
    const contexts = yield* FabricContexts.make({ operators, root: fixture.root, maxContexts: 1 }).pipe(
      Effect.provideService(Database.Service, { ...database, db: barrier.db }))
    barrier.state.armed = true
    const pending = yield* request(operators, contexts.create({}), "crash-reservation").pipe(Effect.forkChild)
    const boundary = yield* Effect.raceFirst(
      Deferred.await(barrier.entered).pipe(Effect.map((id) => ({ kind: "entered" as const, id }))),
      Fiber.await(pending).pipe(Effect.map((exit) => ({ kind: "completed" as const, exit }))),
    ).pipe(Effect.timeout("10 seconds"))
    if (boundary.kind === "completed") {
      if (Exit.isFailure(boundary.exit)) {
        const error = yield* failure(Effect.failCause(boundary.exit.cause), "unavailable")
        throw new Error(`FCT05 create failed before committed-reservation barrier: ${error._tag}/${error.code}`)
      }
      throw new Error("FCT05 create completed without the committed-reservation barrier")
    }
    expect(barrier.state.pauses).toBe(1)
    expect((yield* request(operators, contexts.list({}))).items).toEqual([])
    yield* failure(request(operators, contexts.create({}), "over-preparing-quota"), "limit")
    expect(yield* entries(fixture.root)).toEqual([])
    yield* Fiber.interrupt(pending)
    const interrupted = yield* Fiber.await(pending)
    expect(Exit.isFailure(interrupted) && interrupted.cause.reasons.some((reason) => reason._tag === "Interrupt")).toBe(true)
    yield* Deferred.succeed(barrier.release, undefined)
    expect((yield* rows).map((row) => [row.id, row.state])).toEqual([[boundary.id, "preparing"]])
    expect(yield* entries(fixture.root)).toEqual([])
    yield* Effect.gen(function* () {
      const fresh = yield* owner()
      const recovered = yield* FabricContexts.make({ operators: fresh, root: fixture.root, maxContexts: 1 })
      const info = yield* request(fresh, recovered.create({}), "crash-reservation")
      expect(info.context).toEqual({ id: boundary.id, generation: 1 })
      expect(info.location.directory).toBe(AbsolutePath.make(path.join(fixture.root, boundary.id)))
      expect((yield* Effect.promise(() => stat(marker(info.location.directory)))).isFile()).toBe(true)
      expect((yield* rows).map((row) => [row.id, row.state])).toEqual([[boundary.id, "active"]])
      expect(yield* request(fresh, recovered.resolve(info.context))).toEqual(info)
    }).pipe(Effect.provide(layer(fixture.filename)))
    expect(barrier.state.pauses).toBe(1)
  })).pipe(Effect.provide(layer(fixture.filename))))
}, 30000)

test("FCT09 owner can discover and cancel a real preparing admission without publishing it", () => {
  const fixture = cases.box()
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const barrier = yield* reservationBarrier(database, fixture)
    const contexts = yield* FabricContexts.make({ operators, root: fixture.root, maxContexts: 1 }).pipe(
      Effect.provideService(Database.Service, { ...database, db: barrier.db }))
    const controls = yield* FabricContexts.make({ operators, root: fixture.root, maxContexts: 1 })
    barrier.state.armed = true
    const pending = yield* request(operators, contexts.create({}), "cancel-preparing").pipe(Effect.forkChild)
    const boundary = yield* Effect.raceFirst(
      Deferred.await(barrier.entered).pipe(Effect.map((id) => ({ kind: "entered" as const, id }))),
      Fiber.await(pending).pipe(Effect.map((exit) => ({ kind: "completed" as const, exit }))),
    ).pipe(Effect.timeout("10 seconds"))
    if (boundary.kind === "completed") {
      if (Exit.isFailure(boundary.exit)) {
        const error = yield* failure(Effect.failCause(boundary.exit.cause), "unavailable")
        throw new Error(`FCT09 create failed before committed-reservation barrier: ${error._tag}/${error.code}`)
      }
      throw new Error("FCT09 create completed without the committed-reservation barrier")
    }
    expect(barrier.state.pauses).toBe(1)
    const ref = { id: boundary.id, generation: 1 }
    expect(yield* request(operators, controls.list({}))).toEqual({ items: [] })
    expect(yield* request(operators, controls.preparing({}))).toEqual({ items: [ref] })
    yield* failure(request(operators, controls.resolve(ref)), "unavailable")
    const stranger = yield* owner("other-context-operator")
    const foreign = yield* FabricContexts.make({ operators: stranger, root: fixture.root })
    expect(yield* request(stranger, foreign.preparing({}))).toEqual({ items: [] })
    yield* failure(request(stranger, foreign.remove(ref)), "denied")
    const reserved = yield* rows
    const reservation = reserved.find((row) => row.id === ref.id)
    if (!reservation) throw new Error("Expected the actual committed preparing row")
    const alternate = cases.box()
    const relocated = yield* FabricContexts.make({ operators, root: alternate.root })
    expect(yield* request(operators, relocated.preparing({}))).toEqual({ items: [] })
    expect(yield* rows).toEqual(reserved)
    expect(yield* entries(alternate.root)).toEqual([])
    yield* Effect.gen(function* () {
      const other = yield* Database.Service
      expect(other.storageID).not.toBe(database.storageID)
      yield* other.db.insert(FabricContextTable).values(reservation).run()
      const current = yield* owner()
      const copied = yield* FabricContexts.make({ operators: current, root: fixture.root })
      expect(yield* request(current, copied.preparing({}))).toEqual({ items: [] })
      expect(yield* other.db.select().from(FabricContextTable)).toEqual([reservation])
    }).pipe(Effect.provide(layer(alternate.filename)))
    expect(yield* request(operators, controls.preparing({}))).toEqual({ items: [ref] })
    expect(yield* rows).toEqual(reserved)
    expect(yield* entries(fixture.root)).toEqual([])
    const deleted = yield* request(operators, controls.remove(ref), "cancel-explicit")
    expect(deleted).toEqual({ id: ref.id, generation: 2 })
    expect(yield* request(operators, controls.preparing({}))).toEqual({ items: [] })
    expect(yield* entries(fixture.root)).toEqual([])
    yield* Deferred.succeed(barrier.release, undefined)
    yield* failure(Fiber.join(pending).pipe(Effect.timeout("10 seconds")), "expired")
    expect((yield* rows).find((row) => row.id === ref.id)?.state).toBe("deleted")
    expect(yield* request(operators, controls.list({}))).toEqual({ items: [] })
    const replacement = yield* request(operators, controls.create({}), "after-cancel")
    expect(replacement.context.id).not.toBe(ref.id)
    expect((yield* rows).filter((row) => row.state === "active")).toHaveLength(1)
    expect(yield* request(operators, controls.resolve(replacement.context))).toEqual(replacement)
  })).pipe(Effect.provide(layer(fixture.filename))))
}, 30000)

test("FCT06 filesystem and stored placement tampering never repairs or adopts a context", async () => {
  // Linux symlinks are exercised, not skipped; no Windows privilege claim is made.
  for (const kind of ["missing", "file", "symlink", "marker", "marker-missing", "marker-symlink", "marker-large", "marker-id", "marker-extra", "project-id", "project-directory"] as const) {
    const fixture = cases.box()
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const database = yield* Database.Service
      const operators = yield* owner()
      const contexts = yield* FabricContexts.make({ operators, root: fixture.root })
      const intentKey = `tamper-${kind}`
      const info = yield* request(operators, contexts.create({}), intentKey)
      expect(yield* request(operators, contexts.resolve(info.context))).toEqual(info)
      const directory = info.location.directory
      const external = path.join(fixture.directory, "external")
      const sentinel = "SENTINEL-context-lifecycle-synthetic"
      const originalMarker = yield* Effect.promise(() => readFile(marker(directory), "utf8"))
      const initialRow = (yield* rows).find((row) => row.id === info.context.id)
      if (!initialRow) throw new Error("Expected the published context control row")
      const changedMarker = kind === "marker-id"
        ? JSON.stringify({ id: FabricContext.ID.create(), nonce: initialRow.preparation_nonce })
        : kind === "marker-extra"
          ? JSON.stringify({ id: info.context.id, nonce: initialRow.preparation_nonce, extra: { synthetic: true } })
          : undefined
      yield* Effect.promise(async () => {
        await mkdir(external)
        await writeFile(path.join(external, "sentinel"), sentinel)
        // Valid original marker at the target makes symlink refusal causal, not a missing-marker accident.
        if (kind === "symlink") await writeFile(marker(external), originalMarker)
        if (kind === "missing" || kind === "file" || kind === "symlink") await rm(directory, { recursive: true })
        if (kind === "file") await writeFile(directory, sentinel)
        if (kind === "symlink") await symlink(external, directory, "dir")
        if (kind === "marker") await writeFile(marker(directory), JSON.stringify({ id: info.context.id, nonce: sentinel }))
        if (kind === "marker-missing" || kind === "marker-symlink") await rm(marker(directory))
        if (kind === "marker-symlink") {
          await writeFile(path.join(external, "marker-target"), originalMarker)
          await symlink(path.join(external, "marker-target"), marker(directory), "file")
        }
        // Trailing whitespace keeps the JSON/closed object valid while exceeding the read budget.
        if (kind === "marker-large") await writeFile(marker(directory), originalMarker + " ".repeat(1100))
        if (changedMarker !== undefined) await writeFile(marker(directory), changedMarker)
      })
      if (kind === "project-id" || kind === "project-directory")
        yield* database.db.update(FabricContextTable).set(kind === "project-id"
          ? { project_id: Project.ID.make("tampered-context-project") }
          : { project_directory: AbsolutePath.make(external) }).where(eq(FabricContextTable.id, info.context.id))
      const stored = yield* rows
      const before = yield* entries(fixture.root)
      // Persisted placement divergence is an unavailable observed placement, not a stale generation.
      const error = yield* failure(request(operators, contexts.resolve(info.context)), "unavailable")
      expect(error).toBeInstanceOf(FabricContext.Failure)
      const replay = yield* failure(request(operators, contexts.create({}), intentKey), "unavailable")
      for (const rejected of [error, replay]) {
        const diagnostic = `${rejected.message}\n${JSON.stringify(rejected)}\n${inspect(rejected, { showHidden: true })}`
        for (const secret of [sentinel, originalMarker, initialRow.preparation_nonce]) expect(diagnostic).not.toContain(secret)
      }
      expect(yield* rows).toEqual(stored)
      expect(yield* entries(fixture.root)).toEqual(before)
      expect(yield* Effect.promise(() => readFile(path.join(external, "sentinel"), "utf8"))).toBe(sentinel)
      expect(yield* entries(external)).toEqual(kind === "symlink" ? [".orchestra-fabric-context", "sentinel"]
        : kind === "marker-symlink" ? ["marker-target", "sentinel"] : ["sentinel"])
      if (kind === "symlink") {
        expect((yield* Effect.promise(() => lstat(directory))).isSymbolicLink()).toBe(true)
        expect(yield* Effect.promise(() => readlink(directory))).toBe(external)
      }
      if (kind === "file") expect(yield* Effect.promise(() => readFile(directory, "utf8"))).toBe(sentinel)
      if (kind === "marker") expect(yield* Effect.promise(() => readFile(marker(directory), "utf8")))
        .toBe(JSON.stringify({ id: info.context.id, nonce: sentinel }))
      if (kind === "marker-large") expect((yield* Effect.promise(() => readFile(marker(directory), "utf8"))) === originalMarker + " ".repeat(1100)).toBe(true)
      if (changedMarker !== undefined) expect((yield* Effect.promise(() => readFile(marker(directory), "utf8"))) === changedMarker).toBe(true)
      if (kind === "marker-missing") expect(yield* Effect.promise(() => readdir(directory))).toEqual([])
      if (kind === "marker-symlink") {
        expect((yield* Effect.promise(() => lstat(marker(directory)))).isSymbolicLink()).toBe(true)
        expect((yield* Effect.promise(() => readFile(path.join(external, "marker-target"), "utf8"))) === originalMarker).toBe(true)
      }
      const deleted = yield* request(operators, contexts.remove(info.context), `remove-${kind}`)
      expect(deleted.generation).toBe(info.context.generation + 1)
      expect(yield* entries(fixture.root)).toEqual(before)
      if (changedMarker !== undefined) expect((yield* Effect.promise(() => readFile(marker(directory), "utf8"))) === changedMarker).toBe(true)
    })).pipe(Effect.provide(layer(fixture.filename))))
  }
}, 30000)

test("FCT07 quota, exclusive pagination and tombstones preserve lifecycle identity", async () => {
  const fixture = cases.box()
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root: fixture.root, maxContexts: 2 })
    const first = yield* request(operators, contexts.create({}), "first-create")
    const second = yield* request(operators, contexts.create({}), "second-create")
    const before = yield* entries(fixture.root)
    yield* failure(request(operators, contexts.create({})), "limit")
    expect(yield* entries(fixture.root)).toEqual(before)
    expect((yield* rows).map((row) => row.state)).toEqual(["active", "active"])
    const page1 = yield* request(operators, contexts.list({ limit: 1 }))
    expect(page1.items).toHaveLength(1)
    expect(page1.after).toBe(page1.items[0]!.id)
    const page2 = yield* request(operators, contexts.list({ limit: 1, after: page1.after }))
    expect(page2.items).toHaveLength(1)
    expect(page2.after).toBeUndefined()
    expect([...page1.items, ...page2.items].map((ref) => ref.id)).toEqual([first.context.id, second.context.id].sort())
    expect(yield* request(operators, contexts.list({ limit: 1 }))).toEqual(page1)
    const deleted = yield* request(operators, contexts.remove(first.context), "remove-first")
    expect(deleted).toEqual({ id: first.context.id, generation: first.context.generation + 1 })
    yield* failure(request(operators, contexts.resolve(first.context)), "expired")
    yield* failure(request(operators, contexts.resolve(deleted)), "expired")
    expect((yield* Effect.promise(() => stat(first.location.directory))).isDirectory()).toBe(true)
    expect(yield* request(operators, contexts.remove(first.context), "remove-first")).toEqual(deleted)
    yield* failure(request(operators, contexts.remove(first.context), "different-remove"), "expired")
    yield* failure(request(operators, contexts.create({}), "first-create"), "expired")
    const replacement = yield* request(operators, contexts.create({}), "replacement-create")
    expect(replacement.context.id).not.toBe(first.context.id)
    expect((yield* rows).filter((row) => row.state === "active")).toHaveLength(2)
    expect((yield* rows).find((row) => row.id === deleted.id)?.state).toBe("deleted")
    expect((yield* rows).find((row) => row.id === deleted.id)?.generation).toBe(deleted.generation)
  })).pipe(Effect.provide(layer(fixture.filename))))
  const mixed = cases.box()
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const controls = yield* FabricContexts.make({ operators, root: mixed.root, maxContexts: 2 })
    const active = yield* request(operators, controls.create({}), "mixed-active")
    const existing = yield* rows
    const before = yield* entries(mixed.root)
    expect(existing.map((row) => [row.id, row.state])).toEqual([[active.context.id, "active"]])
    expect(before).toEqual([active.context.id])
    const barrier = yield* reservationBarrier(database, mixed, { ids: existing.map((row) => row.id), entries: before })
    const contexts = yield* FabricContexts.make({ operators, root: mixed.root, maxContexts: 2 }).pipe(
      Effect.provideService(Database.Service, { ...database, db: barrier.db }))
    barrier.state.armed = true
    const pending = yield* request(operators, contexts.create({}), "mixed-preparing").pipe(Effect.forkChild)
    yield* Effect.gen(function* () {
      const boundary = yield* Effect.raceFirst(
        Deferred.await(barrier.entered).pipe(Effect.map((id) => ({ kind: "entered" as const, id }))),
        Fiber.await(pending).pipe(Effect.map((exit) => ({ kind: "completed" as const, exit }))),
      ).pipe(Effect.timeout("10 seconds"))
      if (boundary.kind === "completed") {
        if (Exit.isFailure(boundary.exit)) {
          const error = yield* failure(Effect.failCause(boundary.exit.cause), "unavailable")
          throw new Error(`FCT07 create failed before mixed-quota barrier: ${error._tag}/${error.code}`)
        }
        throw new Error("FCT07 create completed without the mixed-quota reservation barrier")
      }
      expect(barrier.state.pauses).toBe(1)
      const committed = yield* rows
      expect(committed).toHaveLength(2)
      expect(committed.find((row) => row.id === active.context.id)?.state).toBe("active")
      expect(committed.find((row) => row.id === boundary.id)?.state).toBe("preparing")
      yield* failure(request(operators, controls.create({}), "mixed-third-distinct"), "limit")
      expect(yield* rows).toEqual(committed)
      expect(yield* entries(mixed.root)).toEqual(before)
      const stranger = yield* owner("quota-other-principal")
      const foreign = yield* FabricContexts.make({ operators: stranger, root: mixed.root, maxContexts: 1 })
      const otherOwner = yield* request(stranger, foreign.create({}), "other-owner-quota")
      expect(yield* request(stranger, foreign.resolve(otherOwner.context))).toEqual(otherOwner)
      const otherRoot = AbsolutePath.make(path.join(mixed.directory, "other-context-root"))
      const separated = yield* FabricContexts.make({ operators, root: otherRoot, maxContexts: 1 })
      const otherPlacement = yield* request(operators, separated.create({}), "other-root-quota")
      expect(yield* request(operators, separated.resolve(otherPlacement.context))).toEqual(otherPlacement)
      const partitioned = yield* rows
      expect(partitioned).toHaveLength(4)
      const ownerRow = partitioned.find((row) => row.id === active.context.id)!
      const foreignRow = partitioned.find((row) => row.id === otherOwner.context.id)!
      const otherRootRow = partitioned.find((row) => row.id === otherPlacement.context.id)!
      expect(foreignRow.principal).not.toBe(ownerRow.principal)
      expect(foreignRow.root).toBe(ownerRow.root)
      expect(otherRootRow.principal).toBe(ownerRow.principal)
      expect(otherRootRow.root).not.toBe(ownerRow.root)
      expect([foreignRow.storage_id, otherRootRow.storage_id]).toEqual([ownerRow.storage_id, ownerRow.storage_id])
      yield* Fiber.interrupt(pending)
      const interrupted = yield* Fiber.await(pending)
      expect(Exit.isFailure(interrupted) && interrupted.cause.reasons.some((reason) => reason._tag === "Interrupt")).toBe(true)
      expect(yield* rows).toEqual(partitioned)
      expect((yield* rows).find((row) => row.id === boundary.id)?.state).toBe("preparing")
      expect(yield* request(operators, controls.list({}))).toEqual({ items: [active.context] })
      expect(yield* entries(mixed.root)).toEqual([active.context.id, otherOwner.context.id].sort())
      expect(yield* entries(otherRoot)).toEqual([otherPlacement.context.id])
      expect(barrier.state.pauses).toBe(1)
    }).pipe(Effect.ensuring(Fiber.interrupt(pending).pipe(Effect.ensuring(Deferred.succeed(barrier.release, undefined)))))
  })).pipe(Effect.provide(layer(mixed.filename))))
  const pagination = cases.box()
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root: pagination.root, maxContexts: 17 })
    const created = yield* Effect.forEach(Array.from({ length: 17 }), () => request(operators, contexts.create({})))
    const page = yield* request(operators, contexts.list({}))
    expect(page.items).toHaveLength(16)
    expect(page.after).toBe(page.items[15]!.id)
    const tail = yield* request(operators, contexts.list({ after: page.after }))
    expect(tail.items).toHaveLength(1)
    expect(tail.after).toBeUndefined()
    expect([...page.items, ...tail.items].map((ref) => ref.id)).toEqual(created.map((info) => info.context.id).sort())
  })).pipe(Effect.provide(layer(pagination.filename))))
  const defaultQuota = cases.box()
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root: defaultQuota.root })
    const created = yield* Effect.forEach(Array.from({ length: 64 }), (_, index) =>
      request(operators, contexts.create({}), `default-quota-${index}`), { concurrency: 1 })
    expect(created).toHaveLength(64)
    expect(new Set(created.map((info) => info.context.id)).size).toBe(64)
    expect(created.every((info) => Option.isSome(Schema.decodeUnknownOption(FabricContext.Ref)(info.context)))).toBe(true)
    const committed = yield* rows
    expect(committed).toHaveLength(64)
    expect(committed.every((row) => row.state === "active" && row.generation === 1)).toBe(true)
    expect(committed.map((row) => row.id).sort()).toEqual(created.map((info) => info.context.id).sort())
    const ordered = created.map((info) => info.context).sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    const first = yield* request(operators, contexts.list({ limit: 32 }))
    expect(first).toEqual({ items: ordered.slice(0, 32), after: ordered[31]!.id })
    expect(yield* request(operators, contexts.list({ limit: 32, after: first.after! })))
      .toEqual({ items: ordered.slice(32) })
    const before = yield* entries(defaultQuota.root)
    expect(before).toHaveLength(64)
    expect(before).toEqual(created.map((info) => info.context.id).sort())
    const directories = yield* Effect.forEach(created, (info) =>
      Effect.promise(() => stat(info.location.directory)).pipe(Effect.map((value) => value.isDirectory())))
    expect(directories.every(Boolean)).toBe(true)
    yield* failure(request(operators, contexts.create({}), "default-quota-65"), "limit")
    expect(yield* rows).toEqual(committed)
    expect(yield* entries(defaultQuota.root)).toEqual(before)
  })).pipe(Effect.provide(layer(defaultQuota.filename))))
}, 90000)

test("FCT08 closed wire schemas and actual domain boundaries reject authority and host input", async () => {
  const fixture = cases.box()
  await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const contexts = yield* FabricContexts.make({ operators, root: fixture.root })
    const info = yield* request(operators, contexts.create({}))
    expect(yield* request(operators, contexts.resolve(info.context))).toEqual(info)
    expect(Schema.decodeUnknownOption(FabricContext.ID)(FabricContext.ID.create())._tag).toBe("Some")
    const encodedInfo = Schema.encodeSync(FabricContext.Info)(info)
    expect(Schema.decodeUnknownOption(FabricContext.Info)(encodedInfo)).toEqual(Option.some(info))
    expect(encodedInfo.location).not.toHaveProperty("workspaceID")
    const page = { items: [info.context], after: undefined }
    const encodedPage = Schema.encodeSync(FabricContext.Page)(page)
    expect(encodedPage).toEqual({ items: [info.context] })
    expect(Schema.decodeUnknownOption(FabricContext.Page)(encodedPage)).toEqual(Option.some({ items: [info.context] }))
    expect(Schema.encodeSync(FabricContext.Query)({ limit: undefined, after: undefined })).toEqual({})
    const creates: unknown[] = [null, undefined, 1, "", true, [], { principal: "injected" }, { path: fixture.root },
      { storageID: "injected" }, { location: info.location }]
    const queries: unknown[] = [{ limit: 0 }, { limit: 33 }, { limit: 1.5 }, { after: "bad-id" }, { principal: "injected" }]
    const refs: unknown[] = [{ ...info.context, generation: 0 }, { ...info.context, generation: 1.5 }, { ...info.context, principal: "injected" }]
    const stored = yield* rows
    const before = yield* entries(fixture.root)
    for (const input of creates) {
      expect(Option.isNone(Schema.decodeUnknownOption(FabricContext.Create)(input))).toBe(true)
      const effect: ReturnType<typeof contexts.create> = Reflect.apply(contexts.create, contexts, [input])
      yield* failure(request(operators, effect), "invalid-input")
    }
    for (const input of queries) {
      expect(Option.isNone(Schema.decodeUnknownOption(FabricContext.Query)(input))).toBe(true)
      for (const method of [contexts.list, contexts.preparing]) {
        const effect: ReturnType<typeof contexts.list> = Reflect.apply(method, contexts, [input])
        yield* failure(request(operators, effect), "invalid-input")
      }
    }
    for (const input of refs) {
      expect(Option.isNone(Schema.decodeUnknownOption(FabricContext.Ref)(input))).toBe(true)
      for (const method of [contexts.resolve, contexts.remove]) {
        const effect: Effect.Effect<unknown, Effect.Error<ReturnType<typeof contexts.resolve>>> = Reflect.apply(method, contexts, [input])
        yield* failure(request(operators, effect), "invalid-input")
      }
    }
    expect(Option.isNone(Schema.decodeUnknownOption(FabricContext.Info)({ ...info, principal: "injected" }))).toBe(true)
    expect(Option.isNone(Schema.decodeUnknownOption(FabricContext.Page)({ ...page, storageID: "injected" }))).toBe(true)
    expect(yield* rows).toEqual(stored)
    expect(yield* entries(fixture.root)).toEqual(before)
    yield* failure(FabricContexts.make({ operators, root: fixture.root }).pipe(Effect.provideService(Database.Service,
      { db: database.db, inTransaction: database.inTransaction })), "unavailable")
    yield* failure(FabricContexts.make({ operators, root: fixture.root }).pipe(Effect.provideService(Database.Service,
      { db: database.db, inTransaction: database.inTransaction, storageID: "" })), "unavailable")
    const invalidRoot = AbsolutePath.make(path.join(fixture.directory, "not-a-directory"))
    yield* Effect.promise(() => writeFile(invalidRoot, "synthetic-invalid-root"))
    yield* failure(FabricContexts.make({ operators, root: invalidRoot }), "unavailable")
    for (const maxContexts of [0, 65, NaN, Infinity, -Infinity, 1.5])
      yield* failure(FabricContexts.make({ operators, root: fixture.root, maxContexts }), "invalid-input")
    expect(yield* Effect.promise(() => readFile(invalidRoot, "utf8"))).toBe("synthetic-invalid-root")
    expect(yield* rows).toEqual(stored)
    expect(yield* entries(fixture.root)).toEqual(before)
  })).pipe(Effect.provide(layer(fixture.filename))))
}, 30000)
