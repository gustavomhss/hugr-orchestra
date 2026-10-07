#!/usr/bin/env bun
import { $ } from "bun"

import { buildCliToResources, resolveChannel } from "./utils"

const channel = resolveChannel()
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

await $`cd ../orchestra && bun script/build-node.ts`
await buildCliToResources()
