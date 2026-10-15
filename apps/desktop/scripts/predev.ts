import { $ } from "bun"
import { stageOmni } from "./stage-omni"
import { buildCliToResources } from "./utils"
import { installElectron } from "./install-electron"
import { ResourcePaths } from "./resource-paths"

const paths = ResourcePaths.make(import.meta.dir)

await installElectron()

await $`bun ./scripts/copy-icons.ts ${process.env.ORCHESTRA_CHANNEL ?? "dev"}`

await $`bun script/build-node.ts`.cwd(paths.orchestra)
await stageOmni("dev")
await buildCliToResources()
