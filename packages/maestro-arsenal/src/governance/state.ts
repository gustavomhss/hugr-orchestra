// Replaces governance/_state.py and unbounded MCP JSONL. No repo markers or user-global fallback.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
import { constants } from "node:fs"
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises"
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path"
import { randomUUID } from "node:crypto"
import { type GovernanceContext, id, requireValue } from "./contracts.ts"

export const STATE_BYTES = 512 * 1024
const queues = new Map<string, { tail: Promise<unknown>; pending: number }>()

export async function sourceRoot(context: GovernanceContext, requested?: string) {
  requireValue(isAbsolute(context.directory), "SOURCE_ROOT_NOT_ABSOLUTE")
  await context.authorize({ effect: "read", paths: [context.directory], commands: [] })
  const root = await realpath(context.directory)
  requireValue(requested === undefined || resolve(requested) === resolve(context.directory), "SOURCE_ROOT_OVERRIDE_DENIED")
  return root
}

export async function scopedPath(root: string, path: string) {
  requireValue(path.length > 0 && !path.includes("\0"), "PATH_INVALID")
  const target = resolve(root, path)
  requireValue(target !== root && !relative(root, target).startsWith(`..${sep}`) && relative(root, target) !== "..", "PATH_ESCAPE")
  const parts = relative(root, target).split(sep)
  await parts.reduce(async (previous, part) => {
    const parent = await previous
    const child = join(parent, part)
    const stat = await lstat(child).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw new Error(`PATH_ACQUISITION_FAILED: ${error.code}`)
    })
    requireValue(!stat?.isSymbolicLink(), `PATH_SYMLINK_DENIED: ${child}`)
    return child
  }, Promise.resolve(root))
  return target
}

async function stateFile(context: GovernanceContext, kind: string, key: string, write: boolean) {
  id(context.projectID)
  id(kind)
  id(key)
  requireValue(isAbsolute(context.stateDirectory), "STATE_ROOT_NOT_ABSOLUTE")
  await context.authorize({ effect: "read", paths: [context.directory, context.stateDirectory], commands: [] })
  const root = await realpath(context.stateDirectory)
  const repo = await realpath(context.directory)
  requireValue(root !== repo && relative(repo, root) !== "" && (relative(repo, root).startsWith(`..${sep}`) || isAbsolute(relative(repo, root))), "STATE_ROOT_INSIDE_REPOSITORY")
  const file = await scopedPath(root, join(context.projectID, kind, `${key}.json`))
  await context.authorize({ effect: "read", paths: [file], commands: [] })
  if (write) {
    await context.authorize({ effect: "write", paths: [dirname(file), file, `${file}.lock`], commands: [] })
    await scopedPath(root, relative(root, file))
    await mkdir(dirname(file), { recursive: true, mode: 0o700 })
    await scopedPath(root, relative(root, file))
  }
  return file
}
/** Read-only managed path resolver. Host supplies the same stateDirectory as E; no private root derivation. */
export async function statePath(context: GovernanceContext, kind: string, key: string) {
  return stateFile(context, kind, key, false)
}

export async function readBoundedBytes(file: string, missing = false, limit = STATE_BYTES) {
  const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT" && missing) return undefined
    throw new Error(`STATE_READ_FAILED: ${error.code}: ${file}`)
  })
  if (!handle) return undefined
  return handle.stat().then(async (stat) => {
    requireValue(stat.isFile(), `STATE_NOT_REGULAR: ${file}`)
    requireValue(stat.size <= limit, `STATE_OVERFLOW: ${file}`)
    const buffer = Buffer.alloc(limit + 1)
    const read = await handle.read(buffer, 0, buffer.length, 0)
    requireValue(read.bytesRead <= limit, `STATE_OVERFLOW: ${file}`)
    requireValue(read.bytesRead === stat.size, `STATE_CHANGED_OR_SHORT_READ: ${file}`)
    const after = await handle.stat()
    requireValue(after.size === stat.size && after.mtimeMs === stat.mtimeMs && after.ctimeMs === stat.ctimeMs, `STATE_CHANGED_DURING_READ: ${file}`)
    return buffer.subarray(0, read.bytesRead)
  }).finally(() => handle.close())
}
export async function readBounded(file: string, missing = false, limit = STATE_BYTES) {
  return (await readBoundedBytes(file, missing, limit))?.toString("utf8")
}

export async function readState(context: GovernanceContext, kind: string, key: string, missing = false): Promise<unknown> {
  const raw = await readBounded(await stateFile(context, kind, key, false), missing)
  if (raw === undefined) return undefined
  return parseState(raw)
}
function parseState(raw: string): unknown {
  // Untrusted persistent JSON is a real acquisition boundary; corrupt state must not become missing state.
  try { return JSON.parse(raw) as unknown }
  catch { throw new Error("STATE_JSON_INVALID") }
}

export async function updateState<T>(context: GovernanceContext, kind: string, key: string, update: (current: unknown) => T) {
  const file = await stateFile(context, kind, key, true)
  const queue = queues.get(file) ?? { tail: Promise.resolve(), pending: 0 }
  requireValue(queue.pending < 64, "STATE_QUEUE_OVERFLOW")
  queue.pending++
  queues.set(file, queue)
  const operation = queue.tail.catch(() => undefined).then(async () => {
    const lock = await open(`${file}.lock`, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
      .catch((error: NodeJS.ErrnoException) => { throw new Error(`STATE_LOCK_FAILED: ${error.code}`) })
    const temporary = join(dirname(file), `.${key}-${randomUUID()}.tmp`)
    return Promise.resolve().then(async () => {
      const raw = await readBounded(file, true)
      const next = update(raw === undefined ? undefined : parseState(raw))
      const encoded = JSON.stringify(next) + "\n"
      requireValue(Buffer.byteLength(encoded) <= STATE_BYTES, "STATE_OVERFLOW")
      await context.authorize({ effect: "write", paths: [file, temporary], commands: [] })
      const output = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600)
      await output.writeFile(encoded).then(() => output.sync()).finally(() => output.close())
      await scopedPath(await realpath(context.stateDirectory), relative(await realpath(context.stateDirectory), file))
      await rename(temporary, file)
      return next
    }).finally(async () => {
      await unlink(temporary).catch((error: NodeJS.ErrnoException) => { if (error.code !== "ENOENT") throw error })
      await lock.close()
      await unlink(`${file}.lock`)
    })
  })
  queue.tail = operation
  return operation.finally(() => {
    queue.pending--
    if (queue.pending === 0) queues.delete(file)
  })
}
