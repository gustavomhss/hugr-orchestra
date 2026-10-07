export * as SeatSkillRoot from "./seat-skill-root"

import { createHash, randomUUID } from "crypto"
import fs from "fs/promises"
import path from "path"
import { Global } from "@orchestra/core/global"
import { InstallationVersion } from "@orchestra/core/installation/version"
import { Seats } from "./seats"
import { SeatSkillContent } from "./seat-skill-content"

declare const ORCHESTRA_COMPILED: boolean

// Compiled builds (Bun binary and desktop Node sidecar) embed every seat's skill tree (F6.1) as one generated module
// mapping seat id to tree-relative path to text (script/seat-skills.ts). Each tree is copied to a real directory (F6.12)
// that the read tool and sandboxed shells can reach. That directory is under the cache: ToolSafety's sandbox denies
// reads under data/state. Running from source reads each tree in place (`Seats.skillSource`).
const embedded = typeof ORCHESTRA_COMPILED !== "undefined" && ORCHESTRA_COMPILED ? await import(
  // @ts-expect-error - generated file at build time
  "orchestra-seat-skills.gen.ts"
)
  .then((module) => module.default as Record<string, Record<string, string>>)
  .catch((cause) => {
    throw new SeatSkillContent.PackagingError("Cannot import compiled seat skill module", { cause })
  }) : undefined
if (typeof ORCHESTRA_COMPILED !== "undefined" && ORCHESTRA_COMPILED &&
  (!embedded || typeof embedded !== "object" || Array.isArray(embedded)))
  throw new SeatSkillContent.PackagingError("Invalid compiled seat skill module")
if (embedded && Object.keys(embedded).some((id) => !Seats.find(id)?.skills.length))
  throw new SeatSkillContent.PackagingError("Foreign embedded seat skill tree")

/** The skill root of every seat that has skills, by seat id. */
export const roots: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    await Promise.all(
      Object.values(Seats.all)
        .filter((seat) => seat.skills.length > 0)
        .map(async (seat) => {
          const files = embedded?.[seat.id]
          if (embedded && !files) throw new SeatSkillContent.PackagingError(`Missing embedded seat skill tree: ${seat.id}`)
          if (files) SeatSkillContent.validate(seat.id, files, seat.skills)
          const root = files ? await extract(seat.id, files, Global.Path.cache, InstallationVersion) : Seats.skillSource(seat.id)
          if (!files) await SeatSkillContent.read(seat.id, root, seat.skills)
          return [seat.id, root] as const
        }),
    ),
  ),
)

// Copies `files` into a directory keyed `<version>-<digest12>` by the installation version and the embedded content
// digest (the F6.12 manifest), unless it already holds exactly those bytes. Two builds never share a copy, even with the
// same version string (unversioned builds are all "local"), so no install replaces or removes a copy another process
// is reading. Old copies are kept: a rollback re-selects its own. Only a partial or tampered copy of this very content
// is replaced whole: the tree is written to a sibling temp directory and renamed into place.
export async function extract(id: string, files: Record<string, string>, cache: string, version: string) {
  SeatSkillContent.validate(id, files)
  if (!version || /[\\/:\p{Cc}]/u.test(version) || version === "." || version === "..")
    throw new SeatSkillContent.PackagingError(`Invalid seat skill installation version: ${version}`)
  const entries = Object.entries(files).map(([file, text]) => [file, new TextEncoder().encode(text)] as const)
  const expected = digest(entries)
  const dir = path.join(cache, `${id}-skills`, `${version}-${expected.slice(0, 12)}`)
  // Windows temp and cache paths can carry 8.3 short names (RUNNER~1); permission checks compare canonical paths, so the
  // root handed to grants and the read tool must be the canonical one.
  const canonical = () => fs.realpath(dir)
  if (await readTree(dir).then((tree) => tree && digest(tree)) === expected) return canonical()

  const temp = `${dir}.${randomUUID()}.tmp`
  // A per-copy publication lock keeps the verification/removal pair atomic for cooperative starts. A crashed holder
  // fails acquisition closed; we never steal a lock from a publisher that might still be alive.
  const lock = `${dir}.lock`
  await fs.mkdir(path.dirname(dir), { recursive: true })
  const deadline = Date.now() + 10000
  const acquire = async (): Promise<void> => {
    const error = await fs.mkdir(lock).then(() => undefined, (error: NodeJS.ErrnoException) => error)
    if (!error) return
    if (error.code !== "EEXIST" || Date.now() >= deadline)
      throw new SeatSkillContent.PackagingError(`Cannot acquire seat skill publication lock: ${id}`, { cause: error })
    await new Promise((resolve) => setTimeout(resolve, 50))
    return acquire()
  }
  await acquire()
  try {
    // A competing start may have published while we acquired the lock. Never remove its valid tree.
    if (await readTree(dir).then((tree) => tree && digest(tree)) === expected) return canonical()
    await Promise.all(entries.map(async ([file, bytes]) => {
      const target = path.join(temp, ...file.split("/"))
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, bytes)
    }))
    await fs.rm(dir, { recursive: true, force: true })
    await place(temp, dir)
    if (await readTree(dir).then((tree) => tree && digest(tree)) !== expected)
      throw new SeatSkillContent.PackagingError(`Cannot verify extracted seat skill tree: ${id}`)
    return canonical()
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
    await fs.rmdir(lock)
  }
}

// Windows can refuse a rename for a moment while another handle (an indexer, antivirus, a read that just closed) still
// holds the directory, so a transient refusal is retried briefly before it counts as a failure.
async function place(from: string, to: string, delays = [50, 100, 200, 400]): Promise<void> {
  const error = await fs.rename(from, to).then(
    () => undefined,
    (error: NodeJS.ErrnoException) => error,
  )
  if (!error) return
  if (!["EPERM", "EACCES", "EBUSY"].includes(error.code ?? "") || delays.length === 0) throw error
  await new Promise((resolve) => setTimeout(resolve, delays[0]))
  return place(from, to, delays.slice(1))
}

// Every non-directory entry counts, so an added file or a planted link also fails verification.
async function readTree(dir: string) {
  const root = await fs.lstat(dir).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new SeatSkillContent.PackagingError(`Cannot acquire extracted seat skill root: ${dir}`, { cause: error })
  })
  if (!root) return undefined
  if (root.isSymbolicLink() || !root.isDirectory())
    throw new SeatSkillContent.PackagingError(`Invalid extracted seat skill root: ${dir}`)
  const visit = async (current: string): Promise<readonly (readonly [string, Uint8Array])[]> => (await Promise.all(
    (await fs.readdir(current, { withFileTypes: true })).map(async (entry) => {
      const target = path.join(current, entry.name)
      if (entry.isDirectory()) return visit(target)
      const file = path.relative(dir, target).split(path.sep).join("/")
      if (!entry.isFile()) return [[`${file}\0not-a-file`, new Uint8Array()] as const]
      return [[file, new Uint8Array(await fs.readFile(target))] as const]
    }),
  )).flat()
  return visit(dir)
}

function digest(entries: readonly (readonly [string, Uint8Array])[]) {
  const hash = createHash("sha256")
  entries
    .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .forEach(([file, bytes]) => hash.update(`${file}\0${createHash("sha256").update(bytes).digest("hex")}\n`))
  return hash.digest("hex")
}
