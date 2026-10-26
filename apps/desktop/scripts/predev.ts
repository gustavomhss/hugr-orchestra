import { $ } from "bun"
import { chmod, copyFile, mkdir } from "node:fs/promises"
import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { stageOmni } from "./stage-omni"
import { stageClaude } from "./stage-claude"
import { buildCliToResources } from "./utils"
import { installElectron } from "./install-electron"
import { ResourcePaths } from "./resource-paths"

const paths = ResourcePaths.make(import.meta.dir)

// The CLI build requires OMNI_ARTIFACTS, which a dev checkout rarely has: borrow this checkout's own omni build or,
// failing that, the installed app's. A CPU mismatch still fails in the build's own admission check.
const borrowed = process.env.OMNI_ARTIFACTS ? undefined : await borrowOmni()
if (borrowed) process.env.OMNI_ARTIFACTS = borrowed

await installElectron()

await $`bun ./scripts/copy-icons.ts ${process.env.ORCHESTRA_CHANNEL ?? "dev"}`

await stageClaude({
  directory: join(paths.desktop, "resources/claude-code"),
  sdk: dirname(createRequire(join(paths.claudeCode, "package.json")).resolve("@anthropic-ai/claude-agent-sdk")),
})
await stageOmni("dev")
await buildCliToResources()

async function borrowOmni() {
  const supervisor = `hugr-omni-supervisor${process.platform === "win32" ? ".exe" : ""}`
  const addon = ({ darwin: "libhugr_omni_node.dylib", win32: "hugr_omni_node.dll" } as Record<string, string>)[
    process.platform
  ] ?? "libhugr_omni_node.so"
  const found = [
    ...["release", "debug"].map((profile) => ({ directory: join(paths.omni, "target", profile), addon })),
    ...(process.platform === "darwin"
      ? [{ directory: "/Applications/HuGR Orchestra.app/Contents/Resources/omni", addon: "hugr_omni.node" }]
      : []),
  ].find((source) => existsSync(join(source.directory, source.addon)) && existsSync(join(source.directory, supervisor)))
  if (!found) return
  // The build refuses symlinks, so the files are copied under the <platform>-<arch> layout it reads.
  const artifacts = join(paths.desktop, "node_modules/.cache/omni-artifacts")
  const target = join(artifacts, `${process.platform}-${process.arch}`)
  await mkdir(target, { recursive: true })
  await copyFile(join(found.directory, found.addon), join(target, "hugr_omni.node"))
  await copyFile(join(found.directory, supervisor), join(target, supervisor))
  if (process.platform !== "win32") await chmod(join(target, supervisor), 0o755)
  console.log(`predev: omni from ${found.directory}`)
  return artifacts
}
