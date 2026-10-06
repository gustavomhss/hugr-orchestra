export * as BackendSkillRoot from "./backend-skill-root"

import { createHash, randomUUID } from "crypto"
import fs from "fs/promises"
import path from "path"
import { Global } from "@opencode-ai/core/global"
import { InstallationVersion } from "@opencode-ai/core/installation/version"

// The authored skill tree (F6.1). Running from source reads it in place.
export const source = path.resolve(import.meta.dir, "../../../backend-specialist/skills")

// Compiled builds embed the tree as a generated file map, tree-relative path -> embedded file (script/build.ts).
// The embed lives on Bun's virtual filesystem, so it is copied to a real directory (F6.12) that the read tool and
// sandboxed shells can reach. That directory is under the cache: ToolSafety's sandbox denies reads under data/state.
const embedded = await import(
  // @ts-expect-error - generated file at build time
  "opencode-backend-skills.gen.ts"
)
  .then((module) => module.default as Record<string, string>)
  .catch(() => undefined)

export const root = embedded ? await extract(embedded, Global.Path.cache, InstallationVersion) : source

// Copies `files` into a directory keyed `<version>-<digest12>` by the installation version and the embedded content
// digest (the F6.12 manifest), unless it already holds exactly those bytes. Two builds never share a copy, even with the
// same version string (unversioned builds are all "local"), so no install replaces or removes a copy another process
// is reading. Old copies are kept: a rollback re-selects its own. Only a partial or tampered copy of this very content
// is replaced whole: the tree is written to a sibling temp directory and renamed into place.
export async function extract(files: Record<string, string>, cache: string, version: string) {
  const entries = await Promise.all(
    Object.entries(files).map(async ([file, from]) => [file, await Bun.file(from).bytes()] as const),
  )
  const expected = digest(entries)
  const dir = path.join(cache, "backend-skills", `${version}-${expected.slice(0, 12)}`)
  // Windows temp and cache paths can carry 8.3 short names (RUNNER~1); permission checks compare canonical paths, so the
  // root handed to grants and the read tool must be the canonical one.
  const canonical = () => fs.realpath(dir)
  if (digest(await readTree(dir)) === expected) return canonical()

  const temp = `${dir}.${randomUUID()}.tmp`
  await Promise.all(entries.map(([file, bytes]) => Bun.write(path.join(temp, ...file.split("/")), bytes)))
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
  await Bun.sleep(delays[0]!)
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
        return [file, await Bun.file(path.join(dir, file)).bytes()] as const
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
