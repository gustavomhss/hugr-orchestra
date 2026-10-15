#!/usr/bin/env bun
import { $ } from "bun"

import { stageOmni } from "./stage-omni"
import { buildCliToResources, resolveChannel } from "./utils"
import { ResourcePaths } from "./resource-paths"

const paths = ResourcePaths.make(import.meta.dir)

const channel = resolveChannel()
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

await $`bun script/build-node.ts`.cwd(paths.orchestra)
await stageOmni(channel)
await buildCliToResources()
