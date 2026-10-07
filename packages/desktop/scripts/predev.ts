import { $ } from "bun"
import { buildCliToResources } from "./utils"
import { installElectron } from "./install-electron"

await installElectron()

await $`bun ./scripts/copy-icons.ts ${process.env.ORCHESTRA_CHANNEL ?? "dev"}`

await $`cd ../orchestra && bun script/build-node.ts`
await buildCliToResources()
