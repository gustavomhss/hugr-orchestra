import { lstat, readFile, readdir, rm } from "node:fs/promises"
import { basename, dirname, join } from "node:path"
import { readCliManifest, verifyCliArtifact } from "./cli-artifacts"

export function cliStateHomes(defaultHome: string, homes: readonly (string | undefined)[]) {
  return [...new Set([defaultHome, ...homes.filter((home): home is string => home !== undefined)])]
}

export async function finishCliResolution(
  artifact: { path: string; version: string },
  version: () => Promise<string>,
  cache?: { directory: string; stateHomes: readonly string[] },
) {
  if ((await version()) !== artifact.version) throw new Error("Owned CLI executable version differs from its manifest")
  if (cache) await pruneCliCache(cache.directory, dirname(artifact.path), await cliServicesInactive(cache.stateHomes))
  return artifact.path
}

// Read before service discovery: a health/version mismatch may erase a registration while its process still runs.
export async function cliServicesInactive(stateHomes: readonly string[]) {
  const inactive = await Promise.all(
    stateHomes.map(async (home) => {
      const file = join(home, "orchestra", "server.json")
      try {
        if (!(await stateDirectorySafe(home)) || !(await stateDirectorySafe(dirname(file)))) return false
        const stat = await lstat(file)
        if (!stat.isFile() || stat.isSymbolicLink()) return false
        const value: unknown = JSON.parse(await readFile(file, "utf8"))
        if (
          !value ||
          typeof value !== "object" ||
          !("pid" in value) ||
          typeof value.pid !== "number" ||
          !Number.isSafeInteger(value.pid) ||
          value.pid <= 0
        )
          return false
        try {
          process.kill(value.pid, 0)
          return false
        } catch (error) {
          return (error as NodeJS.ErrnoException).code === "ESRCH"
        }
      } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ENOENT"
      }
    }),
  )
  return inactive.length > 0 && inactive.every(Boolean)
}

async function stateDirectorySafe(directory: string): Promise<boolean> {
  try {
    const stat = await lstat(directory)
    return stat.isDirectory() && !stat.isSymbolicLink()
  } catch (error) {
    const parent = dirname(directory)
    return (error as NodeJS.ErrnoException).code === "ENOENT" && parent !== directory && stateDirectorySafe(parent)
  }
}

// Optional cleanup never prevents starting the verified CLI. An active or uncertain old daemon retains its files.
export async function pruneCliCache(cache: string, keep: string, inactive: boolean) {
  if (!inactive) return
  const entries = await readdir(cache).catch(() => [])
  await Promise.all(
    entries.map(async (name) => {
      const directory = join(cache, name)
      if (directory === keep) return
      try {
        const stat = await lstat(directory)
        if (!stat.isDirectory() || stat.isSymbolicLink()) return
        const manifest = await readCliManifest(directory)
        if (manifest.artifacts.length !== 1) return
        const artifact = manifest.artifacts[0]!
        if (
          basename(directory) !==
          `${manifest.version.replace(/[^a-zA-Z0-9._-]/g, "-")}-${artifact.target}-${artifact.sha256}`
        )
          return
        await verifyCliArtifact(directory, artifact.target)
        await rm(directory, { recursive: true, force: true })
      } catch {
        // An unrelated directory, invalid manifest, or locked old installation stays in place.
      }
    }),
  )
}
