export * as PhysicalPath from "./physical-path"

import path from "path"
import fs, { type FileHandle } from "fs/promises"
import { constants } from "fs"

const MAX_LINKS = 40

/**
 * The real location of `target`: every symlink or junction in it is followed, including a dangling final link
 * (a write would create its target) and the nearest existing ancestor of a path that does not exist yet.
 */
export async function physicalPath(target: string, depth = 0): Promise<string> {
  if (depth > MAX_LINKS) throw new Error(`Too many symbolic links: ${target}`)
  const real = await fs.realpath(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return undefined
    throw error
  })
  if (real) return real
  const parent = path.dirname(target)
  if (parent === target) return target
  const base = await physicalPath(parent, depth + 1)
  const link = await fs.readlink(target).catch(() => undefined)
  if (link === undefined) return path.join(base, path.basename(target))
  return physicalPath(path.resolve(base, link), depth + 1)
}

/**
 * Write `content` to a path already resolved by `physicalPath` and judged by the permission checks. A symlink put
 * there afterwards, or in one of its parents, is refused instead of followed, and nothing is truncated before that
 * is known. `exclusive` refuses a target that already exists.
 *
 * There is no `openat` here, so a parent swapped for a link exactly while the file is opened can still leave a new,
 * empty file where that link points; the checks after the open make sure nothing is written to it.
 */
export async function writePhysical(target: string, content: string | Uint8Array, options?: { exclusive?: boolean }) {
  await fs.mkdir(path.dirname(target), { recursive: true })
  // O_NOFOLLOW does not exist on Windows; the checks after the open cover a final-component swap there.
  const handle = await fs.open(
    target,
    constants.O_WRONLY | constants.O_CREAT | (options?.exclusive ? constants.O_EXCL : 0) | (constants.O_NOFOLLOW ?? 0),
    0o666,
  )
  await opensAt(handle, target)
    .then(async (same) => {
      if (!same) throw new Error(`Refusing to write through a changed link: ${target}`)
      await handle.truncate(0)
      await handle.writeFile(content)
    })
    .finally(() => handle.close())
}

// Whether the opened file is the one at `target`, reached with no link on the way. On Linux the descriptor names its
// own path. Elsewhere the path is checked first and its file then matched to the descriptor, so a parent swapped and
// swapped back around the open is caught; the path check must come before the identity check for that.
async function opensAt(handle: FileHandle, target: string) {
  if (process.platform === "linux") {
    const own = await fs.readlink(`/proc/self/fd/${handle.fd}`).catch(() => undefined)
    if (own !== undefined) return own === target
  }
  if ((await fs.realpath(target).catch(() => undefined)) !== target) return false
  const named = await fs.lstat(target, { bigint: true }).catch(() => undefined)
  const opened = await handle.stat({ bigint: true })
  return named !== undefined && named.dev === opened.dev && named.ino === opened.ino
}
