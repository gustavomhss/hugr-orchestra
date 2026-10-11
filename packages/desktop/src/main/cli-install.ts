import { chmod, copyFile, lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { requireTreeSitterBundle } from "@orchestra/script/tree-sitter-prebuilds"
import { cliTreeSitterTarget, copyCliTreeSitter, readCliManifest, verifyCliArtifact } from "./cli-artifacts"

export async function installCliArtifact(source: string, target: string, cache: string) {
  const manifest = await readCliManifest(source)
  const bundled = await verifyCliArtifact(source, target)
  if (manifest.version !== bundled.version) throw new Error("CLI source manifest changed during installation")
  const artifact = manifest.artifacts.find((entry) => entry.target === target)!
  const directory = join(cache, `${manifest.version.replace(/[^a-zA-Z0-9._-]/g, "-")}-${target}-${artifact.sha256}`)
  const existing = await readCliManifest(directory)
    .then(async (installed) => {
      if (
        installed.version !== manifest.version ||
        installed.artifacts.length !== 1 ||
        installed.artifacts[0]?.sha256 !== artifact.sha256 ||
        installed.artifacts[0]?.file !== artifact.file
      )
        return
      requireTreeSitterBundle(join(directory, "tree-sitter"), cliTreeSitterTarget(target))
      return verifyCliArtifact(directory, target)
    })
    .catch(() => undefined)
  if (existing) return existing
  await mkdir(directory, { recursive: true })
  if (!(await lstat(directory)).isDirectory()) throw new Error("CLI cache root must be a real directory")
  const staging = await mkdtemp(join(directory, ".install-"))
  return copyFile(bundled.path, join(staging, artifact.file))
    .then(async () => {
      if (!target.startsWith("windows-")) await chmod(join(staging, artifact.file), 0o755)
      // The installed binary loads tree-sitter from beside itself, so the bundle's copy moves in before the manifest.
      copyCliTreeSitter(join(source, `tree-sitter-${target}`), join(staging, "tree-sitter"), target)
      await writeFile(join(staging, "manifest.json"), JSON.stringify({ ...manifest, artifacts: [artifact] }))
      await verifyCliArtifact(staging, target)
      await rm(join(directory, "tree-sitter"), { recursive: true, force: true })
      await rename(join(staging, "tree-sitter"), join(directory, "tree-sitter"))
      await rename(join(staging, artifact.file), join(directory, artifact.file))
      await rename(join(staging, "manifest.json"), join(directory, "manifest.json"))
      return verifyCliArtifact(directory, target)
    })
    .finally(() => rm(staging, { recursive: true, force: true }))
}
