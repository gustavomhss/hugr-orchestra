import { join } from "node:path"
import { nativeCliTarget } from "./cli-artifacts"

// A packaged desktop ships rg with its CLI in Resources/cli/ripgrep-<target>/ and never downloads one. Its server is a
// utilityProcess, which does not resolve Resources itself, so main names that directory in the variable every packaged
// build sets (RipgrepBinary.DIRECTORY in packages/core/src/ripgrep/binary.ts, named here so main does not load core's
// runtime). A checkout run sets nothing and keeps the bounded download.
export function ripgrepEnv(packaged: boolean, resources: string, platform = process.platform, arch = process.arch) {
  if (!packaged) return {}
  return { ORCHESTRA_RIPGREP_DIR: join(resources, "cli", `ripgrep-${nativeCliTarget(platform, arch)}`) }
}
