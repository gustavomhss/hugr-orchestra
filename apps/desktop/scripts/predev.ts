import { $ } from "bun"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { stageOmni } from "./stage-omni"
import { stageClaude } from "./stage-claude"
import { buildCliToResources } from "./utils"
import { installElectron } from "./install-electron"
import { ResourcePaths } from "./resource-paths"

const paths = ResourcePaths.make(import.meta.dir)

await installElectron()

await $`bun ./scripts/copy-icons.ts ${process.env.ORCHESTRA_CHANNEL ?? "dev"}`

await stageClaude({
  directory: join(paths.desktop, "resources/claude-code"),
  sdk: dirname(createRequire(join(paths.claudeCode, "package.json")).resolve("@anthropic-ai/claude-agent-sdk")),
})
await stageOmni("dev")
await buildCliToResources()
