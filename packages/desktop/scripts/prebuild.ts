#!/usr/bin/env bun
import { $ } from "bun"

import { stageOmni } from "./stage-omni"
import { stageClaude } from "./stage-claude"
import { buildCliToResources, resolveChannel } from "./utils"

const channel = resolveChannel()
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

await stageClaude()
await $`cd ../orchestra && bun script/build-node.ts`
await stageOmni(channel)
await buildCliToResources()
