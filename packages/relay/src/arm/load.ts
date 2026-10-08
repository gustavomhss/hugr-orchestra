export * as ArmLoad from "./load"

import path from "node:path"
import { closeSync, constants, fstatSync, lstatSync, openSync, readSync } from "node:fs"
import { Effect, Schema } from "effect"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { RelaySprint } from "@orchestra/schema/relay-sprint"

// The strict loader for arm files and the Arsenal state file (WP5): no symlink, at most 512 KB, size and mtime
// unchanged across the read, then a schema decode.

export const MAX_BYTES = 512 * 1024

export class LoadError extends Schema.TaggedErrorClass<LoadError>()("ArmLoad.LoadError", {
  path: Schema.String,
  reason: Schema.Literals(["missing", "symlink", "overflow", "changed", "invalid"]),
}) {}

/**
 * The exact bytes of one regular file. The final path component must not be a symlink (checked before the open and
 * again by `O_NOFOLLOW` where the OS has it), the opened file must be the one inspected, and its size and mtime must
 * not change while it is read. A non-regular file is `overflow`, like an oversized one (Arsenal's
 * `completion-state-overflow-or-type`); an unreadable one is `invalid`.
 */
export const bytes = (file: string): Effect.Effect<Uint8Array, LoadError> =>
  Effect.gen(function* () {
    const link = yield* io(file, () => lstatSync(file, { bigint: true }))
    if (link.isSymbolicLink()) return yield* new LoadError({ path: file, reason: "symlink" })
    // Synchronous file calls: with effect 4.0.0-beta.83 an async close in a release is dropped when the fiber is
    // interrupted, which would leak the descriptor. The file is at most 512 KB.
    return yield* Effect.acquireUseRelease(
      io(file, () => openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))),
      (fd) =>
        Effect.gen(function* () {
          const before = yield* io(file, () => fstatSync(fd, { bigint: true }))
          if (before.dev !== link.dev || before.ino !== link.ino)
            return yield* new LoadError({ path: file, reason: "changed" })
          if (!before.isFile() || before.size > BigInt(MAX_BYTES))
            return yield* new LoadError({ path: file, reason: "overflow" })
          // One byte of headroom, so a file that grew past its stat is seen rather than truncated.
          const buffer = Buffer.alloc(MAX_BYTES + 1)
          const length = yield* io(file, () => fill(fd, buffer, 0))
          const after = yield* io(file, () => fstatSync(fd, { bigint: true }))
          if (BigInt(length) !== before.size || after.size !== before.size || after.mtimeNs !== before.mtimeNs)
            return yield* new LoadError({ path: file, reason: "changed" })
          return new Uint8Array(buffer.subarray(0, length))
        }),
      (fd) => Effect.try({ try: () => closeSync(fd), catch: () => undefined }).pipe(Effect.ignore),
    )
  })

/**
 * Decodes loaded bytes: strict UTF-8 (a BOM is skipped, as jq does), one JSON value, then the schema with its own
 * excess-property rule. Exported so a writer can refuse a file this loader would refuse.
 */
export const decode = <A>(file: string, data: Uint8Array, schema: Schema.Decoder<A>): Effect.Effect<A, LoadError> =>
  Effect.try({
    try: () => new TextDecoder("utf-8", { fatal: true }).decode(data),
    catch: () => new LoadError({ path: file, reason: "invalid" }),
  }).pipe(
    Effect.flatMap((text) =>
      Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(text).pipe(
        Effect.mapError(() => new LoadError({ path: file, reason: "invalid" })),
      ),
    ),
  )

export interface Loaded {
  readonly sprint: RelaySprint.Sprint
  // The exact sprint.json bytes; the engine never re-encodes a loaded plan.
  readonly sprintBytes: Uint8Array
  readonly meta: RelayArm.Meta
}

// The arm directory itself must be a real directory: a symlinked arm would put its plan and ledger elsewhere.
export const arm = (dir: string): Effect.Effect<Loaded, LoadError> =>
  Effect.gen(function* () {
    const info = yield* io(dir, () => lstatSync(dir))
    if (info.isSymbolicLink()) return yield* new LoadError({ path: dir, reason: "symlink" })
    if (!info.isDirectory()) return yield* new LoadError({ path: dir, reason: "missing" })
    const sprintFile = path.join(dir, RelayArm.Files.sprint)
    const metaFile = path.join(dir, RelayArm.Files.meta)
    const sprintBytes = yield* bytes(sprintFile)
    const metaBytes = yield* bytes(metaFile)
    return {
      sprint: yield* decode(sprintFile, sprintBytes, RelaySprint.Sprint),
      sprintBytes,
      meta: yield* decode(metaFile, metaBytes, RelayArm.Meta),
    }
  })

function io<A>(file: string, run: () => A) {
  return Effect.try({
    try: run,
    catch: (error) => {
      const code = (error as NodeJS.ErrnoException).code
      if (code === "ENOENT" || code === "ENOTDIR") return new LoadError({ path: file, reason: "missing" })
      // `O_NOFOLLOW` on a symlink that replaced the file after the lstat.
      if (code === "ELOOP") return new LoadError({ path: file, reason: "symlink" })
      return new LoadError({ path: file, reason: "invalid" })
    },
  })
}

// Reads until EOF or a full buffer; one read call may return less than the file holds.
function fill(fd: number, buffer: Buffer, offset: number): number {
  const read = readSync(fd, buffer, offset, buffer.length - offset, offset)
  if (read === 0 || offset + read === buffer.length) return offset + read
  return fill(fd, buffer, offset + read)
}
