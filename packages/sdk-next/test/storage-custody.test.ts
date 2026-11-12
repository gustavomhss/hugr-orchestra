import { expect } from "bun:test"
import { link, lstat, mkdir, open, readFile, stat, symlink, type FileHandle } from "node:fs/promises"
import { join } from "node:path"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, Option, Scope } from "effect"
import { Database } from "@orchestra/core/database/database"
import { testEffect } from "@orchestra/core/test/lib/effect"
import { Orchestra } from "../src"
import { directory } from "./fixture/embedded-custody"

const it = testEffect(Layer.empty)

// These are explicitly API RED until the private production helper exists; default behavioural proof is separate.
async function helper() {
  const { StorageCustody } = await import("../src/storage-custody")
  return StorageCustody
}

it.live(
  "private API: missing store materializes empty mode0600 parents, survives failure and reopens",
  () =>
    Effect.gen(function* () {
      const tmp = yield* directory()
      const custody = yield* Effect.promise(helper)
      const filename = join(tmp.path, "new-parent", "nested", "store.sqlite")
      const scope = yield* Scope.make()
      yield* Effect.addFinalizer(() => Scope.close(scope, Exit.void))
      const lease = yield* custody.acquire(filename).pipe(Effect.provideService(Scope.Scope, scope))
      expect(lease.filename).toBe(filename)
      const info = yield* Effect.promise(() => stat(filename))
      expect(info.isFile()).toBe(true)
      expect(info.size).toBe(0)
      if (process.platform !== "win32") expect(info.mode & 0o777).toBe(0o600)
      expect(yield* Effect.promise(() => Bun.file(filename + "-wal").exists())).toBe(false)
      const contender = yield* Orchestra.create({ database: filename }).pipe(Effect.exit)
      expect(tag(contender)).toBe("Orchestra.StoreInUseError")
      expect((yield* Effect.promise(() => stat(filename))).size).toBe(0)
      expect(yield* Effect.promise(() => Bun.file(filename + "-wal").exists())).toBe(false)
      yield* Scope.close(scope, Exit.fail(new Error("constructor failed")))
      expect((yield* Effect.promise(() => stat(filename))).size).toBe(0)
      yield* Orchestra.create({ database: filename })
      expect((yield* Effect.promise(() => stat(filename))).size).toBeGreaterThan(0)
    }),
  10000,
)

it.live.skipIf(process.platform !== "win32")(
  "private API: alternate-case B is refused while A is still pre-SQLite",
  () =>
    Effect.gen(function* () {
      const tmp = yield* directory()
      const custody = yield* Effect.promise(helper)
      const filename = join(tmp.path, "db.sqlite")
      yield* custody.acquire(filename)
      const alternate = join(tmp.path, "DB.sqlite")
      // The real file now exists; this is the filesystem's answer, not a guessed case-folding rule or probe.
      const original = yield* Effect.promise(() => stat(filename, { bigint: true }))
      const alias = yield* Effect.promise(() => stat(alternate, { bigint: true }))
      expect(alias.dev).toBe(original.dev)
      expect(alias.ino).toBe(original.ino)
      expect(tag(yield* Orchestra.create({ database: alternate }).pipe(Effect.exit))).toBe("Orchestra.StoreInUseError")
      expect((yield* Effect.promise(() => stat(filename))).size).toBe(0)
      expect(yield* Effect.promise(() => Bun.file(filename + "-wal").exists())).toBe(false)
    }),
)

it.live("private API: a hardlink created after reservation cannot enter before A opens SQLite", () =>
  Effect.gen(function* () {
    const tmp = yield* directory()
    const custody = yield* Effect.promise(helper)
    const filename = join(tmp.path, "store.sqlite")
    const alias = join(tmp.path, "linked.sqlite")
    yield* custody.acquire(filename)
    yield* Effect.promise(() => link(filename, alias))
    expect(tag(yield* Orchestra.create({ database: alias }).pipe(Effect.exit))).toBe("Orchestra.StoreInUseError")
    expect((yield* Effect.promise(() => stat(filename))).size).toBe(0)
    expect(yield* Effect.promise(() => Bun.file(alias + "-wal").exists())).toBe(false)
  }),
)

it.live("private API: canonical directory alias retains the original filename and refuses B pre-SQLite", () =>
  Effect.gen(function* () {
    const tmp = yield* directory()
    const custody = yield* Effect.promise(helper)
    const actual = join(tmp.path, "actual")
    const alias = join(tmp.path, "alias")
    yield* Effect.promise(() => mkdir(actual))
    yield* Effect.promise(() => symlink(actual, alias, "junction"))
    const originalFilename = join(alias, "store.sqlite")
    const lease = yield* custody.acquire(originalFilename)
    expect(lease.filename).toBe(originalFilename)
    const filename = join(actual, "store.sqlite")
    expect(tag(yield* Orchestra.create({ database: filename }).pipe(Effect.exit))).toBe("Orchestra.StoreInUseError")
    expect((yield* Effect.promise(() => stat(filename))).size).toBe(0)
    expect(yield* Effect.promise(() => Bun.file(filename + "-wal").exists())).toBe(false)
  }),
)

it.live.skipIf(process.platform === "win32")(
  "private API: dangling symlink targets are followed before the missing store is materialized",
  () =>
    Effect.gen(function* () {
      const tmp = yield* directory()
      const custody = yield* Effect.promise(helper)
      const alias = join(tmp.path, "dangling.sqlite")
      const target = join(tmp.path, "new-parent", "target.sqlite")
      yield* Effect.promise(() => symlink(join("new-parent", "target.sqlite"), alias))
      const lease = yield* custody.acquire(alias)
      expect(lease.filename).toBe(alias)
      expect((yield* Effect.promise(() => lstat(alias))).isSymbolicLink()).toBe(true)
      expect((yield* Effect.promise(() => stat(target))).size).toBe(0)
      expect(tag(yield* Orchestra.create({ database: target }).pipe(Effect.exit))).toBe("Orchestra.StoreInUseError")
      expect((yield* Effect.promise(() => stat(target))).size).toBe(0)
      expect(yield* Effect.promise(() => Bun.file(target + "-wal").exists())).toBe(false)
    }),
)

it.live.skipIf(process.platform === "win32")(
  "private API: symlink loops fail explicitly and do not replace the selected entries",
  () =>
    Effect.gen(function* () {
      const tmp = yield* directory()
      const custody = yield* Effect.promise(helper)
      const first = join(tmp.path, "first")
      const second = join(tmp.path, "second")
      yield* Effect.promise(() => symlink(second, first))
      yield* Effect.promise(() => symlink(first, second))
      const result = yield* custody.acquire(first).pipe(Effect.exit)
      expect(tag(result)).toBe("Orchestra.UnsupportedStoreError")
      expect((yield* Effect.promise(() => lstat(first))).isSymbolicLink()).toBe(true)
      expect((yield* Effect.promise(() => lstat(second))).isSymbolicLink()).toBe(true)
    }),
)

it.live("private API: a directory is an unsupported store and is never removed", () =>
  Effect.gen(function* () {
    const tmp = yield* directory()
    const custody = yield* Effect.promise(helper)
    expect(tag(yield* custody.acquire(tmp.path).pipe(Effect.exit))).toBe("Orchestra.UnsupportedStoreError")
    expect((yield* Effect.promise(() => stat(tmp.path))).isDirectory()).toBe(true)
  }),
)

it.live(
  "private API: confirm checks SQLite's actual main store and preserves controlled private memory",
  () =>
    Effect.gen(function* () {
      const tmp = yield* directory()
      const custody = yield* Effect.promise(helper)
      const filename = join(tmp.path, "reserved.sqlite")
      const lease = yield* custody.acquire(filename)
      const wrongContext = yield* Layer.build(Database.layerFromPath(join(tmp.path, "wrong.sqlite")).pipe(Layer.fresh))
      const wrong = Context.get(wrongContext, Database.Service)
      expect(tag(yield* lease.confirm(wrong).pipe(Effect.exit))).toBe("Orchestra.UnsupportedStoreError")
      const rightContext = yield* Layer.build(Database.layerFromPath(filename).pipe(Layer.fresh))
      yield* lease.confirm(Context.get(rightContext, Database.Service))
      const firstMemory = yield* custody.acquire(":memory:")
      const secondMemory = yield* custody.acquire(":memory:")
      const memoryContext = yield* Layer.build(Database.layerFromPath(":memory:").pipe(Layer.fresh))
      yield* firstMemory.confirm(Context.get(memoryContext, Database.Service))
      yield* secondMemory.confirm(Context.get(memoryContext, Database.Service))
      expect((yield* Effect.promise(() => readFile(filename))).subarray(0, 16).toString()).toBe("SQLite format 3\u0000")
    }),
  10000,
)

it.live(
  "private API: interrupted real open handoff retains the permit, closes its FD once, then admits retry",
  () =>
    Effect.gen(function* () {
      const tmp = yield* directory()
      const custody = yield* Effect.promise(helper)
      const filename = join(tmp.path, "handoff.sqlite")
      const entered = yield* Deferred.make<void>()
      const handoff = Promise.withResolvers<void>()
      const state: { handle?: FileHandle; closeEvents: number; closeCalls: number } = { closeEvents: 0, closeCalls: 0 }
      return yield* Effect.gen(function* () {
        const trackedOpen: typeof open = async (...args) => {
          const handle = await open(...args)
          state.handle = handle
          const close = handle.close.bind(handle)
          handle.close = async () => {
            state.closeCalls++
            await close()
          }
          handle.on("close", () => {
            state.closeEvents++
          })
          Effect.runSync(Deferred.succeed(entered, undefined))
          await handoff.promise
          return handle
        }
        const acquisition = yield* custody.acquire(filename, { open: trackedOpen }).pipe(Effect.forkChild)
        yield* Deferred.await(entered)
        const interrupted = yield* Fiber.interrupt(acquisition).pipe(Effect.forkChild)
        expect(Option.isNone(yield* Fiber.await(interrupted).pipe(Effect.timeoutOption("30 millis")))).toBe(true)
        const handle = state.handle
        if (!handle) throw new Error("Real open did not return a handle")
        expect(handle.fd).toBeGreaterThanOrEqual(0)
        expect(state.closeEvents).toBe(0)
        // A contender waiting for the acquisition permit remains cancellable and cannot release A's pending handoff.
        const contender = yield* Orchestra.create({ database: filename }).pipe(
          Effect.forkChild({ startImmediately: true }),
        )
        expect(contender.pollUnsafe()).toBeUndefined()
        yield* Fiber.interrupt(contender)
        expect(handle.fd).toBeGreaterThanOrEqual(0)
        handoff.resolve()
        yield* Fiber.join(interrupted)
        expect(handle.fd).toBe(-1)
        expect(state.closeEvents).toBe(1)
        expect(state.closeCalls).toBe(1)
        expect((yield* Effect.promise(() => stat(filename))).size).toBe(0)
        const next = yield* Orchestra.create({ database: filename })
        expect(yield* next.sessions.active()).toEqual({})
      }).pipe(Effect.ensuring(Effect.sync(() => handoff.resolve())))
    }),
  10000,
)

function tag(exit: Exit.Exit<unknown, unknown>) {
  if (Exit.isSuccess(exit)) return undefined
  const cause = Cause.squash(exit.cause)
  return cause && typeof cause === "object" && "_tag" in cause ? cause._tag : undefined
}
