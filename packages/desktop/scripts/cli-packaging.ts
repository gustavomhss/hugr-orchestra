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

/**
 * Checks a packaged CLI bundle: the manifest's version, each target's bytes, the WSL guests' omni pairs, every target's
 * tree-sitter, and the pinned rg each target ships in ripgrep-<target>/ (RIPGREP_BUNDLED=false, Nix, ships none). A
 * signed rg must pass `signature`; `signing` names the targets whose rg must be signed.
 */
export async function verifyPackagedCli(
  directory: string,
  platform: string,
  arch: string,
  version: string,
  ripgrep: {
    signature?: (file: string, target: string) => Promise<boolean>
    signing?: (target: string) => "required" | undefined
  } = {},
) {
  const manifest = await readCliManifest(directory)
  if (manifest.version !== version) throw new Error("Desktop package version differs from owned CLI manifest")
  const guests = platform === "win32" ? ["linux-arm64", "linux-x64-baseline"] : []
  const targets = [nativeCliTarget(platform, arch), ...guests]
  await Promise.all(targets.map((target) => verifyCliArtifact(directory, target)))
  await Promise.all(guests.map((target) => requireOmniPair(join(directory, `omni-${target}`), target)))
  if (RipgrepBundle.enabled())
    await Promise.all(
      targets.map((target) =>
        RipgrepBundle.verify(join(directory, `ripgrep-${target}`), cliRipgrepKey(target)!, {
          signature: ripgrep.signature && ((file) => ripgrep.signature!(file, target)),
          signed: ripgrep.signing?.(target),
        }),
      ),
    )
  targets.forEach((target) =>
    requireTreeSitterBundle(join(directory, `tree-sitter-${target}`), cliTreeSitterTarget(target)),
  )
}
