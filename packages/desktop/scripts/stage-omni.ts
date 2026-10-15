// Stages hugr-omni's addon and supervisor in resources/omni (D-L8); electron-builder ships that directory as
// Resources/omni (extraResources), where core's loader finds it in the packaged app. Sources, in this order:
//   1. OMNI_ARTIFACTS: a directory holding both files, directly or under <platform>-<arch>/ (release builds, CI);
//   2. dev channel only: this checkout's packages/omni/target/{release,debug} (`bun run omni:build`).
// A beta or prod build without them fails, unless OMNI_ENABLED=false declares a target omni has no build for yet
// (D-L9); the app then runs legacy only, and the flag fails loudly there.
import { chmod, copyFile, mkdir, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import type { Channel } from "./utils"

const SUPERVISOR = `hugr-omni-supervisor${process.platform === "win32" ? ".exe" : ""}`
// The shipped name, then the name Cargo gives the addon.
const ADDONS = [
  "hugr_omni.node",
  ({ darwin: "libhugr_omni_node.dylib", win32: "hugr_omni_node.dll" } as Record<string, string>)[process.platform] ??
    "libhugr_omni_node.so",
]
const destination = resolve(import.meta.dir, "..", "resources", "omni")

export async function stageOmni(channel: Channel) {
  await rm(destination, { recursive: true, force: true })
  if (process.env.OMNI_ENABLED === "false") return console.warn("stage-omni: OMNI_ENABLED=false, nothing staged")
  const found = locate(channel)
  if (!found) return console.warn("stage-omni: no omni build in packages/omni/target; run `bun run omni:build`")
  await mkdir(destination, { recursive: true })
  await copyFile(found.addon, join(destination, "hugr_omni.node"))
  await copyFile(found.supervisor, join(destination, SUPERVISOR))
  if (process.platform !== "win32") await chmod(join(destination, SUPERVISOR), 0o755)
  console.log(`stage-omni: ${found.addon} + ${found.supervisor} -> ${destination}`)
}

function locate(channel: Channel) {
  const artifacts = process.env.OMNI_ARTIFACTS
  if (artifacts) {
    const found = pair([join(artifacts, `${process.platform}-${process.arch}`), artifacts])
    if (found) return found
    throw new Error(`stage-omni: OMNI_ARTIFACTS=${artifacts} has no ${ADDONS.join(" or ")} next to ${SUPERVISOR}`)
  }
  if (channel !== "dev")
    throw new Error(
      `stage-omni: a ${channel} build needs OMNI_ARTIFACTS (or OMNI_ENABLED=false for a target omni lacks)`,
    )
  const target = resolve(import.meta.dir, "..", "..", "omni", "target")
  return pair(["release", "debug"].map((profile) => join(target, profile)))
}

// A directory counts only when it holds both files, so a release addon never pairs a debug supervisor.
function pair(directories: string[]) {
  for (const directory of directories) {
    const addon = ADDONS.map((name) => join(directory, name)).find((file) => existsSync(file))
    const supervisor = join(directory, SUPERVISOR)
    if (addon && existsSync(supervisor)) return { addon, supervisor }
  }
}
