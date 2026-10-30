import { chmod, copyFile, lstat, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises"
import { basename, join } from "node:path"
import { RipgrepBundle } from "@orchestra/core/ripgrep/bundle"
import { requireTreeSitterBundle } from "@orchestra/script/tree-sitter-prebuilds"
import {
  cliRipgrepKey,
  cliTreeSitterTarget,
  copyCliRipgrep,
  copyCliTreeSitter,
  omniCompanions,
  readCliManifest,
  requireOmniPair,
  verifyCliArtifact,
} from "./cli-artifacts"

/**
 * Copies the bundled CLI for `target` into `cache` with what it loads from beside itself: its omni pair, its
 * tree-sitter and the rg it runs instead of downloading one (ripgrep-<target>/, absent only where the packager puts rg
 * on PATH, as Nix does). That rg must be the pinned executable or, signed, pass `signature` (cli-artifacts.ts
 * signatureCheck).
 */
export async function installCliArtifact(
  source: string,
  target: string,
  cache: string,
  options: { signature?: (file: string) => Promise<boolean> } = {},
) {
  const ripgrep = (await lstat(join(source, `ripgrep-${target}`)).catch(() => undefined))?.isDirectory()
    ? join(source, `ripgrep-${target}`)
    : undefined
  const manifest = await readCliManifest(source)
  const artifact = manifest.artifacts.find((entry) => entry.target === target)
  if (!artifact) throw new Error(`CLI artifact missing for target: ${target}`)
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
      if (ripgrep !== undefined)
        await RipgrepBundle.verify(join(directory, "ripgrep"), cliRipgrepKey(target)!, { signature: options.signature })
      // A cache without the pair (an install from before the pair shipped) is rebuilt, not returned.
      await requireOmniPair(directory, target)
      return verifyCliArtifact(directory, target)
    })
    .catch(() => undefined)
  // A valid installed copy is checked against the digest its directory is named for, so the bundle's own copy is hashed
  // only when it is installed: hashing both on every launch cost about a second.
  if (existing) return existing
  const bundled = await verifyCliArtifact(source, target)
  if (manifest.version !== bundled.version) throw new Error("CLI source manifest changed during installation")
  const companions = await requireOmniPair(join(source, `omni-${target}`), target)
  await mkdir(directory, { recursive: true })
  if (!(await lstat(directory)).isDirectory()) throw new Error("CLI cache root must be a real directory")
  const staging = await mkdtemp(join(directory, ".install-"))
  return copyFile(bundled.path, join(staging, artifact.file))
    .then(async () => {
      if (!target.startsWith("windows-")) await chmod(join(staging, artifact.file), 0o755)
      // The installed binary loads its omni pair, tree-sitter and rg from beside itself, so the bundle's copies move
      // in before the manifest.
      await Promise.all(companions.map((file) => copyFile(file, join(staging, basename(file)))))
      if (!target.startsWith("windows-")) await chmod(join(staging, omniCompanions(target)[1]), 0o755)
      copyCliTreeSitter(join(source, `tree-sitter-${target}`), join(staging, "tree-sitter"), target)
      if (ripgrep !== undefined)
        await copyCliRipgrep(ripgrep, join(staging, "ripgrep"), target, { signature: options.signature })
      await writeFile(join(staging, "manifest.json"), JSON.stringify({ ...manifest, artifacts: [artifact] }))
      await verifyCliArtifact(staging, target)
      await requireOmniPair(staging, target)
      for (const name of omniCompanions(target)) {
        await rm(join(directory, name), { recursive: true, force: true })
        await rename(join(staging, name), join(directory, name))
      }
      await rm(join(directory, "tree-sitter"), { recursive: true, force: true })
      await rename(join(staging, "tree-sitter"), join(directory, "tree-sitter"))
      await rm(join(directory, "ripgrep"), { recursive: true, force: true })
      if (ripgrep !== undefined) await rename(join(staging, "ripgrep"), join(directory, "ripgrep"))
      await rename(join(staging, artifact.file), join(directory, artifact.file))
      await rename(join(staging, "manifest.json"), join(directory, "manifest.json"))
      await requireOmniPair(directory, target)
      return verifyCliArtifact(directory, target)
    })
    .finally(() => rm(staging, { recursive: true, force: true }))
}
