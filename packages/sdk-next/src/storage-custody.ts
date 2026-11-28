export * as StorageCustody from "./storage-custody"

import { lstat, mkdir, open, readlink, realpath, stat } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, resolve } from "node:path"
import type { BigIntStats } from "node:fs"
import type { Database } from "@orchestra/core/database/database"
import { Effect, Exit, Schema, Scope, Semaphore } from "effect"

export class StoreInUseError extends Schema.TaggedErrorClass<StoreInUseError>()("Orchestra.StoreInUseError", {
  filename: Schema.String,
}) {
  override get message() {
    return "An embedded Orchestra host already owns this database: " + this.filename
  }
}

export class UnsupportedStoreError extends Schema.TaggedErrorClass<UnsupportedStoreError>()(
  "Orchestra.UnsupportedStoreError",
  {
    filename: Schema.String,
    reason: Schema.String,
  },
) {
  override get message() {
    return "Cannot acquire embedded Orchestra database " + this.filename + ": " + this.reason
  }
}

const permit = Semaphore.makeUnsafe(1)
const stores = new Map<object, { canonical: string; physical: string }>()

/** One module/process owns a physical file until all host resources and its retained handle have closed. */
export const acquire = Effect.fn("StorageCustody.acquire")(function* (
  filename: string,
  options?: { open?: typeof open },
) {
  if (filename !== ":memory:" && (!filename || !isAbsolute(filename) || filename.startsWith("file:")))
    return yield* Effect.fail(
      new UnsupportedStoreError({ filename, reason: "Expected an absolute filename or :memory:" }),
    )

  const scope = yield* Scope.Scope
  if (filename === ":memory:")
    return { filename, confirm: (database: Database.Interface) => confirm(filename, database) }

  return yield* permit.withPermit(
    Effect.gen(function* () {
      const handles = yield* Scope.make()
      const token = {}
      const state = { closed: true }
      yield* Scope.addFinalizer(
        handles,
        Effect.sync(() => {
          if (state.closed) stores.delete(token)
        }),
      )
      return yield* Effect.gen(function* () {
        const target = yield* io(filename, () => canonical(filename))
        if (Array.from(stores.values()).some((entry) => entry.canonical === target))
          return yield* Effect.fail(new StoreInUseError({ filename }))
        yield* io(filename, () => mkdir(dirname(target), { recursive: true }))
        // acquireRelease masks the real open handoff until the obtained FD has a finalizer, even if its waiter cancels.
        const file = yield* Effect.acquireRelease(
          io(filename, () => retain(target, options?.open ?? open)).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                state.closed = false
              }),
            ),
          ),
          (file) =>
            io(filename, () => file.close()).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  state.closed = true
                }),
              ),
              Effect.orDie,
            ),
        ).pipe(Effect.provideService(Scope.Scope, handles))
        const resolved = yield* io(filename, () => realpath(target))
        const identity = yield* io(filename, async () => physical(filename, await file.stat({ bigint: true })))
        if (Array.from(stores.values()).some((entry) => entry.canonical === resolved || entry.physical === identity))
          return yield* Effect.fail(new StoreInUseError({ filename }))
        const entry = { canonical: resolved, physical: identity }
        return yield* Effect.uninterruptible(
          Effect.gen(function* () {
            stores.set(token, entry)
            yield* Scope.addFinalizerExit(scope, (exit) => Scope.close(handles, exit))
            return { filename, confirm: (database: Database.Interface) => confirm(filename, database, identity) }
          }),
        )
      }).pipe(Effect.onExit((exit) => (Exit.isFailure(exit) ? Scope.close(handles, exit) : Effect.void)))
    }),
  )
})

function confirm(filename: string, database: Database.Interface, identity?: string) {
  return Effect.gen(function* () {
    const rows = yield* database.db
      .all<{ file: string | null }>("SELECT file FROM pragma_database_list WHERE name = 'main'")
      .pipe(Effect.mapError((cause) => new UnsupportedStoreError({ filename, reason: String(cause) })))
    const actual = rows[0]?.file
    if (filename === ":memory:" && actual === "") return
    if (!identity || !actual)
      return yield* Effect.fail(
        new UnsupportedStoreError({ filename, reason: "SQLite opened a different kind of store" }),
      )
    const observed = yield* io(filename, async () =>
      physical(filename, await stat(await canonical(actual), { bigint: true })),
    )
    if (observed !== identity)
      return yield* Effect.fail(
        new UnsupportedStoreError({ filename, reason: "SQLite opened a different physical store" }),
      )
  })
}

// Filesystem Promises cannot synchronously cancel; retain the acquisition permit through each started IO.
const io = <A>(filename: string, run: () => Promise<A>) =>
  Effect.tryPromise({
    try: run,
    catch: (cause) =>
      cause instanceof UnsupportedStoreError ? cause : new UnsupportedStoreError({ filename, reason: String(cause) }),
  }).pipe(Effect.uninterruptible)

async function canonical(filename: string, links = 0): Promise<string> {
  const path = resolve(filename)
  const info = await lstat(path).catch((error: unknown) => {
    if (code(error, "ENOENT")) return undefined
    throw error
  })
  if (info?.isSymbolicLink()) {
    if (links >= 40) throw new UnsupportedStoreError({ filename, reason: "Too many symbolic links" })
    return canonical(resolve(dirname(path), await readlink(path)), links + 1)
  }
  if (info) return realpath(path)
  const parent = dirname(path)
  if (parent === path) throw new UnsupportedStoreError({ filename, reason: "Filesystem root does not exist" })
  return join(await canonical(parent, links), basename(path))
}

async function retain(filename: string, load: typeof open) {
  const info = await lstat(filename).catch((error: unknown) => {
    if (code(error, "ENOENT")) return undefined
    throw error
  })
  if (info && !info.isFile()) throw new UnsupportedStoreError({ filename, reason: "Expected a regular file" })
  return load(filename, "wx", 0o600).catch(async (error: unknown) => {
    if (!code(error, "EEXIST")) throw error
    if (!(await lstat(filename)).isFile())
      throw new UnsupportedStoreError({ filename, reason: "Expected a regular file" })
    return load(filename, "r")
  })
}

function physical(filename: string, info: BigIntStats) {
  if (!info.isFile() || info.ino === 0n || info.dev < 0n)
    throw new UnsupportedStoreError({ filename, reason: "Stable regular-file identity is unavailable" })
  return info.dev.toString() + ":" + info.ino.toString()
}

function code(error: unknown, value: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === value
}
