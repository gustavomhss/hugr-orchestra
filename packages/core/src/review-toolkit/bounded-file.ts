export * as ReviewBoundedFile from "./bounded-file"

import { constants } from "node:fs"
import type { Stats } from "node:fs"
import { lstat, open } from "node:fs/promises"
import type { FileHandle } from "node:fs/promises"
import path from "node:path"
import { Effect } from "effect"

export type Reason = "missing" | "symlink" | "path-outside" | "unreadable" | "not-file" | "too-large" | "nofollow-unavailable" | "changed"
export type Result = { readonly ok: true; readonly bytes: Uint8Array } | { readonly ok: false; readonly reason: Reason }

// Identity checks surround the descriptor open and read: O_NOFOLLOW alone only protects the leaf.
export function read(root: string, relative: string, maxBytes: number, beforeRead: (file: string) => Effect.Effect<void>): Effect.Effect<Result> {
  return Effect.scoped(Effect.gen(function* () {
    if (!relative || path.isAbsolute(relative) || /[\\\0\r\n]/.test(relative) || /^[a-z]:/i.test(relative) || relative.split("/").some((part) => !part || part === "." || part === ".."))
      return yield* Effect.fail<Reason>("path-outside")
    const file = path.join(path.resolve(root), relative)
    const before = yield* walk(file)
    const leaf = before[before.length - 1]
    if (!leaf?.stats.isFile()) return yield* Effect.fail<Reason>("not-file")
    if (leaf.stats.size > maxBytes) return yield* Effect.fail<Reason>("too-large")
    // Missing input is resolved first, including on hosts without a no-follow open.
    if (!constants.O_NOFOLLOW || !constants.O_NONBLOCK) return yield* Effect.fail<Reason>("nofollow-unavailable")
    yield* beforeRead(file)
    const handle = yield* Effect.acquireRelease(
      io(() => open(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)).pipe(
        Effect.mapError((reason): Reason => reason === "missing" ? "changed" : reason),
      ),
      (value) => io(() => value.close()).pipe(Effect.ignore),
    )
    const opened = yield* io(() => handle.stat())
    if (!opened.isFile()) return yield* Effect.fail<Reason>("not-file")
    if (!same(leaf.stats, opened)) return yield* Effect.fail<Reason>("changed")
    yield* unchanged(before)
    const bytes = yield* capture(handle, maxBytes)
    if (bytes.length > maxBytes) return yield* Effect.fail<Reason>("too-large")
    if (!same(opened, yield* io(() => handle.stat()))) return yield* Effect.fail<Reason>("changed")
    const repeated = yield* capture(handle, maxBytes)
    if (!bytes.equals(repeated) || !same(opened, yield* io(() => handle.stat()))) return yield* Effect.fail<Reason>("changed")
    yield* unchanged(before)
    return { ok: true, bytes } as const
  })).pipe(Effect.catch((reason) => Effect.succeed({ ok: false, reason } as const)))
}

function io<A>(run: () => Promise<A>) {
  return Effect.tryPromise({
    try: run,
    catch: (error): Reason => {
      const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined
      if (code === "ENOENT") return "missing"
      if (code === "ELOOP") return "symlink"
      return "unreadable"
    },
  })
}

function same(left: Stats, right: Stats) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode &&
    left.size === right.size && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs
}

function walk(file: string) {
  return Effect.gen(function* () {
    const volume = path.parse(file).root
    const parts = file.slice(volume.length).split(path.sep).filter(Boolean)
    const files = [volume, ...parts.map((_, index) => path.join(volume, ...parts.slice(0, index + 1)))]
    const entries: Array<{ file: string; stats: Stats }> = []
    for (const item of files) {
      const stats = yield* io(() => lstat(item))
      if (stats.isSymbolicLink()) return yield* Effect.fail<Reason>("symlink")
      if (item !== file && !stats.isDirectory()) return yield* Effect.fail<Reason>("not-file")
      entries.push({ file: item, stats })
    }
    return entries
  })
}

function unchanged(entries: Array<{ file: string; stats: Stats }>) {
  return Effect.gen(function* () {
    const after = yield* walk(entries[entries.length - 1]!.file).pipe(
      Effect.mapError((reason): Reason => reason === "missing" ? "changed" : reason),
    )
    if (after.length !== entries.length || after.some((entry, index) => {
      const prior = entries[index]!.stats
      return entry.stats.dev !== prior.dev || entry.stats.ino !== prior.ino || entry.stats.mode !== prior.mode
    })) return yield* Effect.fail<Reason>("changed")
  })
}

function capture(handle: FileHandle, maxBytes: number) {
  return io(async () => {
    const buffer = Buffer.alloc(maxBytes + 1)
    let size = 0
    while (size < buffer.length) {
      const part = await handle.read(buffer, size, buffer.length - size, size)
      if (!part.bytesRead) break
      size += part.bytesRead
    }
    return buffer.subarray(0, size)
  })
}
