import { $ } from "bun"
import { stageOmni } from "./stage-omni"
import { downloadCliToResources } from "./utils"

await $`bun run install-electron`

await $`bun ./scripts/copy-icons.ts ${process.env.ORCHESTRA_CHANNEL ?? "dev"}`

await $`cd ../orchestra && bun script/build-node.ts`
await stageOmni("dev")
await downloadCliToResources()
