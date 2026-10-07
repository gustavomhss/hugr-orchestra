export * as SeatSkillRoot from "./seat-skill-root"

import { createHash, randomUUID } from "crypto"
import fs from "fs/promises"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import { Seats } from "./seats"

// Compiled builds (Bun binary and desktop Node sidecar) embed every seat's skill tree (F6.1) as one generated module
// mapping seat id to tree-relative path to text (script/seat-skills.ts). Each tree is copied to a real directory (F6.12)
// that the read tool and sandboxed shells can reach. That directory is under the cache: ToolSafety's sandbox denies
// reads under data/state. Running from source reads each tree in place (`Seats.skillSource`).
const embedded = await import(
  // @ts-expect-error - generated file at build time
  "opencode-seat-skills.gen.ts"
)
  .then((module) => module.default as Record<string, Record<string, string>>)
  .catch(() => undefined)

/** The skill root of every seat that has skills, by seat id. */
export const roots: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    await Promise.all(
      Object.values(Seats.all)
        .filter((seat) => seat.skills.length > 0)
        .map(async (seat) => {
          const files = embedded?.[seat.id]
          if (embedded && !files) throw new Error(`Missing embedded seat skill tree: ${seat.id}`)
          const root = files ? await extract(seat.id, files, Global.Path.cache, InstallationVersion) : Seats.skillSource(seat.id)
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
  if (!/^[a-z]+(?:-[a-z]+)*$/.test(id) || Object.keys(files).length === 0)
    throw new Error(`Invalid or empty embedded seat skill tree: ${id}`)
  if (Object.keys(files).some((file) => file === "" || /[\\:\x00]/.test(file) || file.startsWith("/") || file.split("/").some((part) => part === "" || part === "." || part === "..")))
    throw new Error(`Invalid embedded seat skill path: ${id}`)
  const entries = Object.entries(files).map(([file, text]) => [file, new TextEncoder().encode(text)] as const)
  const expected = digest(entries)
  const dir = path.join(cache, `${id}-skills`, `${version}-${expected.slice(0, 12)}`)
  // Windows temp and cache paths can carry 8.3 short names (RUNNER~1); permission checks compare canonical paths, so the
  // root handed to grants and the read tool must be the canonical one.
  const canonical = () => fs.realpath(dir)
  if (digest(await readTree(dir)) === expected) return canonical()

  const temp = `${dir}.${randomUUID()}.tmp`
  await Promise.all(
    entries.map(async ([file, bytes]) => {
      const target = path.join(temp, ...file.split("/"))
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.writeFile(target, bytes)
    }),
  )
  await fs.rm(dir, { recursive: true, force: true })
  // A concurrent start may place the same tree first. Its copy is as good as this one.
  await place(temp, dir).catch(async (error) => {
    await fs.rm(temp, { recursive: true, force: true })
    if (digest(await readTree(dir)) !== expected) throw error
  })
  return canonical()
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
  const entries = await fs.readdir(dir, { recursive: true, withFileTypes: true }).catch(() => [])
  return Promise.all(
    entries
      .filter((entry) => !entry.isDirectory())
      .map(async (entry) => {
        const file = path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join("/")
        if (!entry.isFile()) return [`${file}\0not-a-file`, new Uint8Array()] as const
        return [file, new Uint8Array(await fs.readFile(path.join(dir, file)))] as const
      }),
  )
}

function digest(entries: readonly (readonly [string, Uint8Array])[]) {
  const hash = createHash("sha256")
  entries
    .toSorted(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .forEach(([file, bytes]) => hash.update(`${file}\0${createHash("sha256").update(bytes).digest("hex")}\n`))
  return hash.digest("hex")
}
