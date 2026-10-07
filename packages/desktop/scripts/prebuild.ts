#!/usr/bin/env bun
import { $ } from "bun"

import { stageOmni } from "./stage-omni"
import { downloadCliToResources, resolveChannel } from "./utils"

const channel = resolveChannel()
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

await $`cd ../opencode && bun script/build-node.ts`
await stageOmni(channel)
if (channel === "dev") await downloadCliToResources()
