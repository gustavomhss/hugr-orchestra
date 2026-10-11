import path from "path"
import fs from "fs/promises"
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
 * is known.
 */
export async function writePhysical(target: string, content: string) {
  await fs.mkdir(path.dirname(target), { recursive: true })
  // O_NOFOLLOW does not exist on Windows; the realpath comparison below covers a final-component swap there.
  const handle = await fs.open(target, constants.O_WRONLY | constants.O_CREAT | (constants.O_NOFOLLOW ?? 0), 0o666)
  await fs
    .realpath(target)
    .then(async (now) => {
      if (now !== target) throw new Error(`Refusing to write through a changed link: ${target}`)
      await handle.truncate(0)
      await handle.writeFile(content)
    })
    .finally(() => handle.close())
}
