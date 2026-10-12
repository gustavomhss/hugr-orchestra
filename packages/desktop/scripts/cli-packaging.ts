import { join } from "node:path"
import { RipgrepBundle } from "@orchestra/core/ripgrep/bundle"
import { requireTreeSitterBundle } from "@orchestra/script/tree-sitter-prebuilds"
import {
  cliRipgrepKey,
  cliTreeSitterTarget,
  nativeCliTarget,
  readCliManifest,
  verifyCliArtifact,
} from "../src/main/cli-artifacts"
import { requireOmniPair } from "./cli-staging"

export async function verifyPackagedCli(directory: string, platform: string, arch: string, version: string) {
  const manifest = await readCliManifest(directory)
  if (manifest.version !== version) throw new Error("Desktop package version differs from owned CLI manifest")
  const guests = platform === "win32" ? ["linux-arm64", "linux-x64-baseline"] : []
  const targets = [nativeCliTarget(platform, arch), ...guests]
  await Promise.all(targets.map((target) => verifyCliArtifact(directory, target)))
  await Promise.all(guests.map((target) => requireOmniPair(join(directory, `omni-${target}`), target)))
  if (RipgrepBundle.enabled())
    await Promise.all(
      guests.map((target) => RipgrepBundle.verify(join(directory, `ripgrep-${target}`), cliRipgrepKey(target)!)),
    )
  targets.forEach((target) =>
    requireTreeSitterBundle(join(directory, `tree-sitter-${target}`), cliTreeSitterTarget(target)),
  )
}

/**
 * The desktop's own rg in Resources/ripgrep (scripts/utils.ts stages it): the pinned build for this package's platform
 * and architecture, with its license texts. `signed` accepts the bytes a macOS or Windows signature changed.
 */
export async function verifyPackagedRipgrep(directory: string, platform: string, arch: string, signed: boolean) {
  if (!RipgrepBundle.enabled()) return
  return RipgrepBundle.verify(directory, `${arch}-${platform === "mas" ? "darwin" : platform}`, { signed })
}
