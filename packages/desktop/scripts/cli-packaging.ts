import { join } from "node:path"
import { nativeCliTarget, readCliManifest, verifyCliArtifact } from "../src/main/cli-artifacts"
import { requireOmniPair } from "./cli-staging"

export async function verifyPackagedCli(directory: string, platform: string, arch: string, version: string) {
  const manifest = await readCliManifest(directory)
  if (manifest.version !== version) throw new Error("Desktop package version differs from owned CLI manifest")
  const guests = platform === "win32" ? ["linux-arm64", "linux-x64-baseline"] : []
  await Promise.all([nativeCliTarget(platform, arch), ...guests].map((target) => verifyCliArtifact(directory, target)))
  await Promise.all(guests.map((target) => requireOmniPair(join(directory, `omni-${target}`), target)))
}
