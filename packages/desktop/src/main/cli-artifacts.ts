import { constants } from "node:fs"
import { lstat, open, realpath } from "node:fs/promises"
import { createHash } from "node:crypto"
import { join, resolve } from "node:path"

export type CliArtifactManifest = {
  schema: 1
  version: string
  artifacts: ReadonlyArray<{ target: string; file: string; sha256: string }>
}

export function nativeCliTarget(platform: string, arch: string): string {
  if (!["darwin", "win32", "linux"].includes(platform) || !["arm64", "x64"].includes(arch))
    throw new Error(`Unsupported CLI platform: ${platform}/${arch}`)
  return `${platform === "win32" ? "windows" : platform}-${arch}${arch === "x64" ? "-baseline" : ""}`
}

export async function readCliManifest(directory: string): Promise<CliArtifactManifest> {
  const value: unknown = JSON.parse((await readCliFile(directory, "manifest.json")).toString("utf8"))
  if (!value || typeof value !== "object") throw new Error("Invalid CLI manifest")
  const manifest = value as Partial<CliArtifactManifest>
  if (
    manifest.schema !== 1 ||
    typeof manifest.version !== "string" ||
    !manifest.version.trim() ||
    manifest.version !== manifest.version.trim() ||
    /[\x00-\x1f]/.test(manifest.version) ||
    !Array.isArray(manifest.artifacts) ||
    !manifest.artifacts.length
  )
    throw new Error("Invalid CLI manifest schema/version/artifacts")
  const targets = new Set<string>()
  const files = new Set<string>()
  await Promise.all(
    manifest.artifacts.map(async (artifact: unknown) => {
      if (!artifact || typeof artifact !== "object") throw new Error("Invalid CLI artifact")
      const entry = artifact as Partial<CliArtifactManifest["artifacts"][number]>
      if (
        typeof entry.target !== "string" ||
        !/^(?:darwin|windows)-(?:arm64|x64(?:-baseline)?)$|^linux-(?:arm64|x64(?:-baseline)?)(?:-musl)?$/.test(
          entry.target,
        ) ||
        typeof entry.file !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(entry.file) ||
        entry.file === "manifest.json" ||
        typeof entry.sha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(entry.sha256)
      )
        throw new Error("Invalid CLI artifact target/file/digest")
      if (targets.has(entry.target) || files.has(entry.file.toLowerCase()))
        throw new Error("Duplicate CLI artifact target/file")
      targets.add(entry.target)
      files.add(entry.file.toLowerCase())
      await requireCliFile(directory, entry.file)
    }),
  )
  return manifest as CliArtifactManifest
}

export async function verifyCliArtifact(directory: string, target: string): Promise<{ path: string; version: string }> {
  const manifest = await readCliManifest(directory)
  const artifact = manifest.artifacts.find((entry) => entry.target === target)
  if (!artifact) throw new Error(`CLI artifact missing for target: ${target}`)
  if (
    createHash("sha256")
      .update(await readCliFile(directory, artifact.file))
      .digest("hex") !== artifact.sha256
  )
    throw new Error(`CLI artifact digest mismatch: ${target}`)
  return { path: resolve(directory, artifact.file), version: manifest.version }
}

async function requireCliFile(directory: string, file: string) {
  if (!(await lstat(directory)).isDirectory()) throw new Error("CLI artifact root must be a real directory")
  const root = await realpath(directory)
  const path = join(root, file)
  const stat = await lstat(path)
  if (!stat.isFile() || (await realpath(path)) !== path) throw new Error("CLI artifact must be a confined regular file")
  return { path, stat }
}

async function readCliFile(directory: string, file: string) {
  const input = await requireCliFile(directory, file)
  const handle = await open(input.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0))
  return handle
    .stat()
    .then(async (stat) => {
      if (!stat.isFile() || stat.dev !== input.stat.dev || stat.ino !== input.stat.ino)
        throw new Error("CLI artifact must be a confined regular file")
      return handle.readFile()
    })
    .finally(() => handle.close())
}
