export * as ArtifactBlobs from "./blob"

import { createHash } from "node:crypto"
import { constants, type BigIntStats } from "node:fs"
import { lstat, mkdir, open, realpath, type FileHandle } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"
import { Effect } from "effect"
import type { FSUtil } from "../../fs-util"
import { Failure, failure } from "./error"
import { matchesMime } from "./mime"

export function hash(data: Uint8Array | string) {
  return createHash("sha256").update(data).digest("hex")
}

/**
 * No model/worker-selected paths: private canonical roots and checked file lifetimes limit their authority.
 * Lifetimes retain root/staging identity and stop on observed legitimate host replacement. Node path APIs
 * cannot anchor every directory-relative syscall, so check-to-syscall races remain; postchecks do not prove
 * absolute confinement against a malicious same-UID host. Reads still bind no-follow, bounded I/O to one FD.
 */
export function make(input: { root: string; boundedBytes: number; storageID: string; fs: FSUtil.Interface }) {
  const root = resolve(input.root)
  const identity = new TextEncoder().encode(hash(input.storageID))
  const io = <A>(body: () => Promise<A>) => Effect.tryPromise({
    try: body,
    catch: (error) => error instanceof Failure ? error : failure("artifact_io_failed", "Artifact filesystem operation failed"),
  })
  const rootInfo = () => directory(root, true)
  const claimedRoot = async (create: boolean) => {
    if (create) await ensureDirectory(root)
    const info = await rootInfo()
    if (create) await withFile(join(root, ".store"), writeFlags(), 0o600, async (file) => {
      await file.writeFile(identity)
      await file.chmod(0o400)
      await file.sync()
    }).catch((error: unknown) => {
      if (!hasCode(error, "EEXIST")) throw error
    })
    const marker = await readBytes(join(root, ".store"), identity.length, info, 1, identity.length)
    if (!marker.every((byte, index) => byte === identity[index]))
      throw failure("artifact_io_failed", "Artifact root belongs to another database")
    return info
  }

  const read = Effect.fn("ArtifactBlobs.read")(function* (
    digest: string, bytes: number, mime: string,
  ): Effect.fn.Return<Uint8Array, Failure> {
    if (!/^[0-9a-f]{64}(?![\s\S])/.test(digest) || !Number.isSafeInteger(bytes) || bytes < 0 || bytes > input.boundedBytes)
      return yield* failure("artifact_corrupt", "Artifact blob is unavailable or corrupt")
    const data = yield* io(async () => readBytes(join(root, digest), bytes, await claimedRoot(false), 1)).pipe(
      Effect.mapError(() => failure("artifact_corrupt", "Artifact blob is unavailable or corrupt")),
    )
    if (hash(data) !== digest || !matchesMime(data, mime))
      return yield* failure("artifact_corrupt", "Artifact blob is unavailable or corrupt")
    return data
  })

  const publish = Effect.fn("ArtifactBlobs.publish")(function* (data: Uint8Array, mime: string) {
    if (data.byteLength > input.boundedBytes)
      return yield* failure("invalid_input", "Artifact blob exceeds byte bound")
    const digest = hash(data)
    const info = yield* io(() => claimedRoot(true))
    yield* Effect.scoped(Effect.gen(function* () {
      const staging = yield* Effect.acquireRelease(
        Effect.gen(function* () {
          yield* io(() => unchangedRoot(info))
          const path = yield* input.fs.makeTempDirectory({ directory: root, prefix: "stage-" })
          const stat = yield* io(async () => {
            await unchangedRoot(info)
            return directory(path, true)
          })
          return { path, stat }
        }),
        // Observed identity loss leaves scratch for later verified GC; no unlink after a failed check.
        (staging) => removeChecked(staging.path, staging.stat, info, true).pipe(Effect.catch(() => Effect.void)),
      )
      const path = join(staging.path, "blob")
      yield* io(async () => {
        await unchangedRoot(info)
        if (!sameFile(staging.stat, await directory(staging.path, true)))
          throw failure("artifact_io_failed", "Artifact staging directory changed during access")
        await withFile(path, writeFlags(), 0o600, async (file) => {
          regular(await file.stat({ bigint: true }), false, 1)
          await file.writeFile(data)
          await file.chmod(0o400)
          await file.sync()
        })
        const verified = await readBytes(path, data.byteLength, info, 1)
        if (hash(verified) !== digest || !matchesMime(verified, mime))
          throw failure("artifact_corrupt", "Artifact blob is unavailable or corrupt")
      })
      yield* input.fs.link(path, join(root, digest)).pipe(Effect.catchIf(
        (error) => error.reason._tag === "AlreadyExists", () => Effect.void,
      ))
      const linked = yield* io(async () => readBytes(join(root, digest), data.byteLength, info, 2))
      if (hash(linked) !== digest || !matchesMime(linked, mime))
        return yield* failure("artifact_corrupt", "Artifact blob is unavailable or corrupt")
    })).pipe(Effect.catchTag("PlatformError", () => Effect.fail(failure("artifact_io_failed", "Artifact blob publication failed"))))
    // The staging hard link is gone before metadata can be inserted. Existing hard-linked foreign files are rejected.
    yield* read(digest, data.byteLength, mime)
    return digest
  })

  const cleanup = Effect.fn("ArtifactBlobs.cleanup")(function* (retained: ReadonlySet<string>, cutoff: number) {
    const info = yield* io(() => claimedRoot(false)).pipe(Effect.catchIf(
      (error) => error.code === "artifact_io_failed", () => Effect.succeed(undefined),
    ))
    if (!info) {
      // Missing roots are normal before first publication; an existing unsafe root is a named failure.
      const absent = yield* io(() => lstat(root, { bigint: true }).then(() => false, (error: unknown) => {
        if (hasCode(error, "ENOENT")) return true
        throw error
      }))
      if (absent) return
      return yield* failure("artifact_io_failed", "Artifact cleanup root is unavailable")
    }
    const names = yield* input.fs.readDirectory(root)
    yield* Effect.forEach(names.filter((name) => !retained.has(name) &&
      (/^[0-9a-f]{64}(?![\s\S])/.test(name) || /^stage-[a-zA-Z0-9_-]+(?![\s\S])/.test(name))),
    (name) => Effect.gen(function* () {
      const path = join(root, name)
      const stat = yield* io(async () => {
        await unchangedRoot(info)
        const current = await lstat(path, { bigint: true })
        if (current.isSymbolicLink()) throw failure("artifact_io_failed", "Artifact cleanup entry is unsafe")
        return current
      })
      if (stat.mtimeMs < BigInt(cutoff)) yield* removeChecked(path, stat, info, name.startsWith("stage-"))
    }))
    yield* io(() => unchangedRoot(info))
  })

  async function unchangedRoot(info: BigIntStats) {
    if (!sameFile(info, await rootInfo())) throw failure("artifact_io_failed", "Artifact root changed during access")
  }

  const removeChecked = Effect.fn("ArtifactBlobs.removeChecked")(function* (
    path: string, expected: BigIntStats, rootStat: BigIntStats, recursive: boolean,
  ) {
    yield* io(async () => {
      await unchangedRoot(rootStat)
      const current = await lstat(path, { bigint: true })
      if (current.isSymbolicLink() || !sameFile(expected, current) || current.isDirectory() !== expected.isDirectory())
        throw failure("artifact_io_failed", "Artifact cleanup entry identity changed")
      if (current.isDirectory()) await directory(path, false)
      await unchangedRoot(rootStat)
    })
    yield* input.fs.remove(path, { recursive })
  })

  async function readBytes(path: string, bytes: number, rootStat: BigIntStats, links: number, limit = input.boundedBytes) {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > limit)
      throw failure("artifact_corrupt", "Artifact blob exceeds read bound")
    await unchangedRoot(rootStat)
    const before = await lstat(path, { bigint: true })
    regular(before, true, links)
    return withFile(path, readFlags(), undefined, async (file) => {
      const opened = await file.stat({ bigint: true })
      regular(opened, true, links)
      if (!sameFile(before, opened) || opened.size !== BigInt(bytes))
        throw failure("artifact_corrupt", "Artifact blob is unavailable or corrupt")
      const data = new Uint8Array(bytes)
      let offset = 0
      while (offset < bytes) {
        const chunk = await file.read(data, offset, Math.min(64 * 1024, bytes - offset), offset)
        if (chunk.bytesRead === 0) throw failure("artifact_corrupt", "Artifact blob is unavailable or corrupt")
        offset += chunk.bytesRead
      }
      const after = await file.stat({ bigint: true })
      if (after.size !== BigInt(bytes) || after.mtimeNs !== opened.mtimeNs || after.ctimeNs !== opened.ctimeNs ||
        !sameFile(after, await lstat(path, { bigint: true }))) throw failure("artifact_corrupt", "Artifact blob changed during access")
      await unchangedRoot(rootStat)
      return data
    })
  }

  return { read, publish, cleanup }
}

async function ensureDirectory(path: string): Promise<void> {
  const existing = await lstat(path, { bigint: true }).catch((error: unknown) => {
    if (hasCode(error, "ENOENT")) return undefined
    throw error
  })
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink() || await realpath(path) !== path)
      throw failure("artifact_io_failed", "Artifact root is not a canonical directory")
    return
  }
  await ensureDirectory(dirname(path))
  await mkdir(path, { mode: 0o700 }).catch((error: unknown) => {
    if (!hasCode(error, "EEXIST")) throw error
  })
  await directory(path, true)
}

async function directory(path: string, privateMode: boolean) {
  const info = await lstat(path, { bigint: true })
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(path) !== path ||
    (privateMode && process.platform !== "win32" && (info.mode & 0o777n) !== 0o700n) || !owned(info))
    throw failure("artifact_io_failed", "Artifact root is not a private canonical directory")
  return info
}

function regular(info: BigIntStats, readonly: boolean, links: number) {
  if (!info.isFile() || info.isSymbolicLink() || !owned(info) || info.nlink > BigInt(links) ||
    (process.platform !== "win32" && (info.mode & 0o777n) !== (readonly ? 0o400n : 0o600n)) ||
    (process.platform === "win32" && readonly && (info.mode & 0o222n) !== 0n))
    throw failure("artifact_corrupt", "Artifact blob is not a private regular file")
}

function owned(info: BigIntStats) {
  return typeof process.getuid !== "function" || info.uid === BigInt(process.getuid())
}

function sameFile(left: BigIntStats, right: BigIntStats) {
  if (left.ino !== 0n || right.ino !== 0n) return left.dev === right.dev && left.ino === right.ino
  // Some Windows filesystems omit inode IDs. Bind path/descriptor creation identity and file state instead.
  return left.dev === right.dev && left.birthtimeNs === right.birthtimeNs && left.mode === right.mode &&
    left.uid === right.uid && left.isDirectory() === right.isDirectory() &&
    (left.isDirectory() || (left.size === right.size && left.ctimeNs === right.ctimeNs))
}

function hasCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error && error.code === code
}

function readFlags() {
  return constants.O_RDONLY | (process.platform === "win32" ? 0 : (constants.O_NOFOLLOW ?? 0) | constants.O_NONBLOCK)
}

function writeFlags() {
  return constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0)
}

async function withFile<A>(path: string, flags: number, mode: number | undefined, body: (file: FileHandle) => Promise<A>) {
  const file = await open(path, flags, mode)
  try {
    return await body(file)
  } finally {
    await file.close()
  }
}
