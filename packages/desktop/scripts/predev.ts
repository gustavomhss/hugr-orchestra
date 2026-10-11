import { $ } from "bun"
import { stageOmni } from "./stage-omni"
import { buildCliToResources } from "./utils"
import { installElectron } from "./install-electron"

await installElectron()

await $`bun ./scripts/copy-icons.ts ${process.env.ORCHESTRA_CHANNEL ?? "dev"}`

await $`cd ../orchestra && bun script/build-node.ts`
await stageOmni("dev")
await buildCliToResources()
