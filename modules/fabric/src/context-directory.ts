export * as FabricContextDirectory from "./context-directory"

import { constants } from "node:fs"
import { lstat, mkdir, open, realpath } from "node:fs/promises"
import path from "node:path"
import { KeyedMutex } from "@orchestra/core/effect/keyed-mutex"
import { FabricContext } from "@orchestra/schema/fabric-context"
import { AbsolutePath } from "@orchestra/schema/schema"
import { Effect, Option, Schema } from "effect"
import type { FabricContextDirectoryContract } from "./context-directory-contract"

const marker = ".orchestra-fabric-context"
const maximum = 1024
const recordSchema = Schema.Struct({ id: FabricContext.ID, nonce: Schema.NonEmptyString })
  .annotate({ parseOptions: { onExcessProperty: "error" } })
// This pruned, process-local lock coordinates preparation, not durable ownership.
const preparing = KeyedMutex.makeUnsafe<string>()

export const make: FabricContextDirectoryContract.Factory = (supplied) => Effect.tryPromise({
  try: async () => {
    await mkdir(supplied, { recursive: true, mode: 0o700 })
    await requirePrivateDirectory(supplied)
    const root = AbsolutePath.make(await realpath(supplied))
    await requireRoot(root)
    return {
      root,
      // Keep the lock until non-cancellable filesystem promises have settled.
      prepare: (input) => preparing.withLock(path.join(root, input.id))(Effect.tryPromise({
        try: async () => {
          const record = requireRecord(input)
          const body = JSON.stringify(record)
          if (Buffer.byteLength(body) > maximum) throw new Error()
          await requireRoot(root)
          const child = AbsolutePath.make(path.join(root, record.id))
          const created = await mkdir(child, { mode: 0o700 }).then(
            () => true,
            (error: unknown) => {
              if (typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST")
                return false
              throw error
            },
          )
          if (!created) return observe(root, record)
          await requirePrivateDirectory(child)
          if (await realpath(child) !== child) throw new Error()
          const handle = await open(path.join(child, marker),
            constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
          try {
            await handle.writeFile(body, "utf8")
          } finally {
            await handle.close()
          }
          // Partial/unmarked children are deliberately left untouched on failure.
          return observe(root, record)
        },
        catch: unavailable,
      }).pipe(Effect.uninterruptible)),
      observe: (input) => Effect.tryPromise({
        try: () => observe(root, requireRecord(input)),
        catch: unavailable,
      }),
    } satisfies FabricContextDirectoryContract.Interface
  },
  catch: unavailable,
})

function unavailable() {
  return new FabricContext.Failure({ code: "unavailable", message: "Fabric context directory is unavailable" })
}

function requireRecord(input: unknown) {
  const record = Schema.decodeUnknownOption(recordSchema)(input)
  if (Option.isNone(record)) throw new Error()
  return record.value
}

async function requirePrivateDirectory(directory: string) {
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o7777) !== 0o700) throw new Error()
}

async function requireRoot(root: AbsolutePath) {
  await requirePrivateDirectory(root)
  if (await realpath(root) !== root) throw new Error()
}

async function observe(root: AbsolutePath, record: FabricContextDirectoryContract.Record) {
  await requireRoot(root)
  const child = AbsolutePath.make(path.join(root, record.id))
  await requirePrivateDirectory(child)
  if (await realpath(child) !== child) throw new Error()
  const filename = path.join(child, marker)
  const info = await lstat(filename)
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o7777) !== 0o600) throw new Error()
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const actual = await handle.stat()
    if (!actual.isFile() || (actual.mode & 0o7777) !== 0o600 || actual.size > maximum) throw new Error()
    // One fixed allocation/read budget, even if the file grows or returns short reads.
    const buffer = Buffer.alloc(maximum + 1)
    let size = 0
    while (size < buffer.length) {
      const result = await handle.read(buffer, size, buffer.length - size, size)
      if (result.bytesRead === 0) break
      size += result.bytesRead
    }
    if (size > maximum) throw new Error()
    const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(
      new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size)),
    )
    if (Option.isNone(json)) throw new Error()
    const decoded = requireRecord(json.value)
    if (decoded.id !== record.id || decoded.nonce !== record.nonce) throw new Error()
  } finally {
    await handle.close()
  }
  // lstat/realpath checks do not make this atomic against same-user OS renames.
  return child
}
