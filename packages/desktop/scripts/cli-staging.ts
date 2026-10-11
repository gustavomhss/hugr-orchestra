import { createHash } from "node:crypto"
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path"
import { realpath } from "node:fs/promises"
import { nativeCliTarget, readCliManifest, verifyCliArtifact } from "../src/main/cli-artifacts"
import type { CliArtifactManifest } from "../src/main/cli-artifacts"

export function desktopCliTargets(platform: string, arch: string) {
  return [nativeCliTarget(platform, arch), ...(platform === "win32" ? ["linux-arm64", "linux-x64-baseline"] : [])]
}

// A Windows build's Linux CLIs run in WSL guests. They are omni builds whose preflight needs this pair next to the
// binary, so src/main/wsl/artifact.ts installs the pair from omni-<target>/ in the bundle (hashing those bytes) and
// refuses the install without it. The Linux CLI build already ships the pair in dist/cli-<target>/bin.
export const omniCompanions = ["hugr_omni.node", "hugr-omni-supervisor"] as const

export class WslOmniPairMissingError extends Error {
  constructor(target: string, path: string) {
    super(
      `WSL omni pair missing for ${target}: ${path} must be a regular file. Build the Linux CLI with OMNI_ARTIFACTS so it ships ${omniCompanions.join(" and ")} next to the binary.`,
    )
    this.name = "WslOmniPairMissingError"
  }
}

// Both files of the pair as regular files in one directory, or a named error.
export function requireOmniPair(directory: string, target: string) {
  return Promise.all(
    omniCompanions.map(async (name) => {
      const path = join(directory, name)
      if (!(await lstat(path).catch(() => undefined))?.isFile()) throw new WslOmniPairMissingError(target, path)
      return path
    }),
  )
}

export async function stageCliArtifacts(input: {
  dist: string
  prebuilt?: string
  directory: string
  version: string
  targets: readonly string[]
  sign?: (path: string, target: string) => Promise<void>
}) {
  if (
    !input.targets.length ||
    new Set(input.targets).size !== input.targets.length ||
    input.targets.some(
      (target) =>
        ![
          "darwin-arm64",
          "darwin-x64-baseline",
          "windows-arm64",
          "windows-x64-baseline",
          "linux-arm64",
          "linux-x64-baseline",
        ].includes(target),
    )
  )
    throw new Error("Unsupported or duplicate desktop CLI artifact target")
  // Bun's realpath and rename can disagree on symlink/.. traversal. Reject
  // parent segments rather than checking one path spelling and replacing another.
  if (input.prebuilt !== undefined && [input.prebuilt, input.directory].some((path) => path.split(/[\\/]/).includes("..")))
    throw new Error("Owned CLI prebuilt source/output overlap or ambiguous traversal")
  const prebuilt = input.prebuilt === undefined ? undefined : await readCliManifest(input.prebuilt)
  if (prebuilt && prebuilt.version !== input.version) throw new Error("Owned CLI prebuilt version mismatch")
  if (input.prebuilt !== undefined) {
    const producer = await realpath(input.prebuilt)
    const destination = await canonicalDirectory(input.directory)
    if ([relative(producer, destination), relative(destination, producer)].some(
      (path) => path === "" || (path !== ".." && !path.startsWith(`..${sep}`) && !isAbsolute(path)),
    )) throw new Error("Owned CLI prebuilt source/output overlap")
  }
  await mkdir(dirname(input.directory), { recursive: true })
  const staging = await mkdtemp(join(dirname(input.directory), ".cli-stage-"))
  const windows = input.targets.some((target) => target.startsWith("windows-"))
  return Promise.allSettled(
    input.targets.map(async (target) => {
      const source = join(input.dist, `cli-${target}`)
      const incoming = prebuilt?.artifacts.find((entry) => entry.target === target)
      if (prebuilt && !incoming) throw new Error(`Owned CLI prebuilt artifact missing: ${target}`)
      const verified = input.prebuilt === undefined ? undefined : await verifyCliArtifact(input.prebuilt, target)
      const executable = target.startsWith("windows-") ? "orchestra.exe" : "orchestra"
      if (!prebuilt) {
        const metadata: unknown = JSON.parse(await readFile(join(source, "package.json"), "utf8"))
        if (!metadata || typeof metadata !== "object" || !("version" in metadata) || metadata.version !== input.version)
          throw new Error(`Owned CLI artifact version mismatch: ${target}`)
        if (
          !(await lstat(source)).isDirectory() ||
          !(await lstat(join(source, "bin"))).isDirectory() ||
          !(await lstat(join(source, "bin", executable))).isFile() ||
          (await realpath(join(source, "bin", executable))) !== join(await realpath(source), "bin", executable)
        )
          throw new Error(`Owned CLI output must be regular: ${target}`)
      }
      const file = `orchestra-${target}${target.startsWith("windows-") ? ".exe" : ""}`
      const path = join(staging, file)
      await copyFile(verified?.path ?? join(source, "bin", executable), path)
      // Check the copied bytes against the producer descriptor before signing;
      // verification of the source alone leaves a copy-time race.
      if (incoming && createHash("sha256").update(await readFile(path)).digest("hex") !== incoming.sha256)
        throw new Error(`Owned CLI prebuilt digest mismatch: ${target}`)
      if (!target.startsWith("windows-")) await chmod(path, 0o755)
      // A producer directory is itself a staged bundle, so its pair sits in omni-<target>/ rather than bin/.
      if (windows && target.startsWith("linux-")) {
        const pair = await requireOmniPair(
          input.prebuilt === undefined ? join(source, "bin") : join(input.prebuilt, `omni-${target}`),
          target,
        )
        await mkdir(join(staging, `omni-${target}`))
        await Promise.all(pair.map((file) => copyFile(file, join(staging, `omni-${target}`, basename(file)))))
        await chmod(join(staging, `omni-${target}`, omniCompanions[1]), 0o755)
      }
      await input.sign?.(path, target)
      return {
        target,
        file,
        sha256: createHash("sha256")
          .update(await readFile(path))
          .digest("hex"),
      }
    }),
  )
    .then(async (results) => {
      const failed = results.find((result) => result.status === "rejected")
      if (failed?.status === "rejected") throw failed.reason
      const artifacts = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
      const manifest: CliArtifactManifest = { schema: 1, version: input.version, artifacts }
      await writeFile(join(staging, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n")
      await Promise.all(artifacts.map((entry) => verifyCliArtifact(staging, entry.target)))
      // Validate all new bytes before replacing the previous resource tree.
      const previous = `${staging}-previous`
      const moved = await rename(input.directory, previous).then(
        () => true,
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return false
          throw error
        },
      )
      await rename(staging, input.directory).catch(async (error) => {
        if (moved) await rename(previous, input.directory)
        throw error
      })
      if (moved) await rm(previous, { recursive: true, force: true })
      return readCliManifest(input.directory)
    })
    .finally(() => rm(staging, { recursive: true, force: true }))
}

// Resolve existing ancestors too: a new destination may be nested under a
// symlinked parent, even though realpath cannot resolve the final directory yet.
async function canonicalDirectory(directory: string): Promise<string> {
  return realpath(directory).catch(async (error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT" || dirname(directory) === directory) throw error
    return join(await canonicalDirectory(dirname(directory)), basename(directory))
  })
}
