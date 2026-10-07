import { createHash } from "node:crypto"
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { nativeCliTarget, readCliManifest, verifyCliArtifact } from "../src/main/cli-artifacts"
import type { CliArtifactManifest } from "../src/main/cli-artifacts"

export function desktopCliTargets(platform: string, arch: string) {
  return [nativeCliTarget(platform, arch), ...(platform === "win32" ? ["linux-arm64", "linux-x64-baseline"] : [])]
}

export async function stageCliArtifacts(input: {
  dist: string
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
  await mkdir(dirname(input.directory), { recursive: true })
  const staging = await mkdtemp(join(dirname(input.directory), ".cli-stage-"))
  return Promise.allSettled(
    input.targets.map(async (target) => {
      const source = join(input.dist, `cli-${target}`)
      const metadata: unknown = JSON.parse(await readFile(join(source, "package.json"), "utf8"))
      if (!metadata || typeof metadata !== "object" || !("version" in metadata) || metadata.version !== input.version)
        throw new Error(`Owned CLI artifact version mismatch: ${target}`)
      const executable = target.startsWith("windows-") ? "orchestra.exe" : "orchestra"
      if (!(await lstat(join(source, "bin", executable))).isFile())
        throw new Error(`Owned CLI output must be regular: ${target}`)
      const file = `orchestra-${target}${target.startsWith("windows-") ? ".exe" : ""}`
      const path = join(staging, file)
      await copyFile(join(source, "bin", executable), path)
      if (!target.startsWith("windows-")) await chmod(path, 0o755)
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
