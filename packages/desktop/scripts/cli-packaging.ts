import { nativeCliTarget, readCliManifest, verifyCliArtifact } from "../src/main/cli-artifacts"

export async function verifyPackagedCli(directory: string, platform: string, arch: string, version: string) {
  const manifest = await readCliManifest(directory)
  if (manifest.version !== version) throw new Error("Desktop package version differs from owned CLI manifest")
  await Promise.all(
    [nativeCliTarget(platform, arch), ...(platform === "win32" ? ["linux-arm64", "linux-x64-baseline"] : [])].map(
      (target) => verifyCliArtifact(directory, target),
    ),
  )
}
