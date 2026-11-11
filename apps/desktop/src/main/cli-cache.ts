import { lstat, readFile, readdir, rm } from "node:fs/promises"
import { basename, join } from "node:path"
import { readCliManifest, verifyCliArtifact } from "./cli-artifacts"

export function cliStateHomes(defaultHome: string, homes: readonly (string | undefined)[]) {
  return [...new Set([defaultHome, ...homes.filter((home): home is string => home !== undefined)])]
}

// Read before service discovery: a health/version mismatch may erase a registration while its process still runs.
export async function cliServicesInactive(stateHomes: readonly string[]) {
  const inactive = await Promise.all(
    stateHomes.map(async (home) => {
      const file = join(home, "orchestra", "server.json")
      try {
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
