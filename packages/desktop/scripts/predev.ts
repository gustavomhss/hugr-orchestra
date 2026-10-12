import { $ } from "bun"
import { stageOmni } from "./stage-omni"
import { stageClaude } from "./stage-claude"
import { buildCliToResources } from "./utils"
import { installElectron } from "./install-electron"

await installElectron()

await $`bun ./scripts/copy-icons.ts ${process.env.ORCHESTRA_CHANNEL ?? "dev"}`

await stageClaude()
await $`cd ../orchestra && bun script/build-node.ts`
await stageOmni("dev")
await buildCliToResources()
