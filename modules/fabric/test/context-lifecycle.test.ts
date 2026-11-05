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
import { box, failure, layer, owner, request } from "./fixture/context"

const rows = Effect.gen(function* () {
  const database = yield* Database.Service
  return yield* database.db.select().from(FabricContextTable)
})
const entries = (root: string) => Effect.promise(() => readdir(root).then((items) => items.sort()))
const marker = (directory: string) => path.join(directory, ".orchestra-fabric-context")

test("FCT05 interruption after a real committed reservation recovers the same ID", () => {
  const fixture = box()
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const database = yield* Database.Service
    const operators = yield* owner()
    const entered = yield* Deferred.make<FabricContext.ID>()
    const release = yield* Deferred.make<void>()
    const state = { armed: false, pauses: 0 }
    // Scheduling only: every SQL callback, query, row and transaction result remains real.
    // This observes one post-commit boundary, not universal absence of FS inside SQL callbacks.
    function afterCommit<T extends object>(target: T): T {
      return new Proxy(target, { get(object, key) {
        const member: unknown = Reflect.get(object, key, object)
        if (typeof member !== "function") return member
        return (...args: unknown[]) => {
          const result: unknown = Reflect.apply(member, object, args)
          if (key !== "transaction" || !Effect.isEffect(result)) return result
          return result.pipe(Effect.tap(() => Effect.gen(function* () {
            if (!state.armed) return
            // Independent connection proves the row committed before delivery is paused.
            const committed = yield* rows.pipe(Effect.provide(Database.layerFromPath(fixture.filename)))
            if (!committed.some((row) => row.state === "preparing")) return
            expect(committed).toHaveLength(1)
            const row = committed[0]!
            expect(row.state).toBe("preparing")
            expect(row.generation).toBe(1)
            expect(yield* entries(fixture.root)).toEqual([])
            state.armed = false
            state.pauses++
            yield* Deferred.succeed(entered, row.id)
            yield* Deferred.await(release)
          })))
        }
      } })
    }
    const contexts = yield* FabricContexts.make({ operators, root: fixture.root, maxContexts: 1 }).pipe(
      Effect.provideService(Database.Service, { ...database, db: afterCommit(database.db) }))
    state.armed = true
    const pending = yield* request(operators, contexts.create({}), "crash-reservation").pipe(Effect.forkChild)
    const boundary = yield* Effect.raceFirst(
      Deferred.await(entered).pipe(Effect.map((id) => ({ kind: "entered" as const, id }))),
      Fiber.await(pending).pipe(Effect.map((exit) => ({ kind: "completed" as const, exit }))),
    ).pipe(Effect.timeout("10 seconds"))
    if (boundary.kind === "completed") {
      if (Exit.isFailure(boundary.exit)) {
        const error = yield* failure(Effect.failCause(boundary.exit.cause), "unavailable")
        throw new Error(`FCT05 create failed before committed-reservation barrier: ${error._tag}/${error.code}`)
      }
      throw new Error("FCT05 create completed without the committed-reservation barrier")
    }
    expect(state.pauses).toBe(1)
    expect((yield* request(operators, contexts.list({}))).items).toEqual([])
    yield* failure(request(operators, contexts.create({}), "over-preparing-quota"), "limit")
    expect(yield* entries(fixture.root)).toEqual([])
    yield* Fiber.interrupt(pending)
    const interrupted = yield* Fiber.await(pending)
    expect(Exit.isFailure(interrupted) && interrupted.cause.reasons.some((reason) => reason._tag === "Interrupt")).toBe(true)
    yield* Deferred.succeed(release, undefined)
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
    expect(state.pauses).toBe(1)
  })).pipe(Effect.provide(layer(fixture.filename))))
}, 30000)

test("FCT06 filesystem and stored placement tampering never repairs or adopts a context", async () => {
  // Linux symlinks are exercised, not skipped; no Windows privilege claim is made.
  for (const kind of ["missing", "file", "symlink", "marker", "project-id", "project-directory"] as const) {
    const fixture = box()
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const database = yield* Database.Service
      const operators = yield* owner()
      const contexts = yield* FabricContexts.make({ operators, root: fixture.root })
      const info = yield* request(operators, contexts.create({}))
      expect(yield* request(operators, contexts.resolve(info.context))).toEqual(info)
      const directory = info.location.directory
      const external = path.join(fixture.directory, "external")
      const sentinel = "SENTINEL-context-lifecycle-synthetic"
      yield* Effect.promise(async () => {
        await mkdir(external)
        await writeFile(path.join(external, "sentinel"), sentinel)
        if (kind === "missing" || kind === "file" || kind === "symlink") await rm(directory, { recursive: true })
        if (kind === "file") await writeFile(directory, sentinel)
        if (kind === "symlink") await symlink(external, directory, "dir")
        if (kind === "marker") await writeFile(marker(directory), JSON.stringify({ id: info.context.id, nonce: sentinel }))
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
      expect(`${error.message}\n${JSON.stringify(error)}\n${inspect(error, { showHidden: true })}`).not.toContain(sentinel)
      expect(yield* rows).toEqual(stored)
      expect(yield* entries(fixture.root)).toEqual(before)
      expect(yield* Effect.promise(() => readFile(path.join(external, "sentinel"), "utf8"))).toBe(sentinel)
      expect(yield* entries(external)).toEqual(["sentinel"])
      if (kind === "symlink") {
        expect((yield* Effect.promise(() => lstat(directory))).isSymbolicLink()).toBe(true)
        expect(yield* Effect.promise(() => readlink(directory))).toBe(external)
      }
      if (kind === "file") expect(yield* Effect.promise(() => readFile(directory, "utf8"))).toBe(sentinel)
      if (kind === "marker") expect(yield* Effect.promise(() => readFile(marker(directory), "utf8")))
        .toBe(JSON.stringify({ id: info.context.id, nonce: sentinel }))
    })).pipe(Effect.provide(layer(fixture.filename))))
  }
}, 30000)

test("FCT07 quota, exclusive pagination and tombstones preserve lifecycle identity", async () => {
  const fixture = box()
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
  const pagination = box()
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
}, 30000)

test("FCT08 closed wire schemas and actual domain boundaries reject authority and host input", async () => {
  const fixture = box()
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
    const creates: unknown[] = [{ principal: "injected" }, { path: fixture.root }, { storageID: "injected" }, { location: info.location }]
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
      const effect: ReturnType<typeof contexts.list> = Reflect.apply(contexts.list, contexts, [input])
      yield* failure(request(operators, effect), "invalid-input")
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
