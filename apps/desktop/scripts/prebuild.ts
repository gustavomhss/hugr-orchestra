#!/usr/bin/env bun
import { $ } from "bun"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"

import { stageOmni } from "./stage-omni"
import { stageClaude } from "./stage-claude"
import { buildCliToResources, resolveChannel } from "./utils"
import { ResourcePaths } from "./resource-paths"

const paths = ResourcePaths.make(import.meta.dir)

const channel = resolveChannel()
await $`bun ./scripts/copy-icons.ts ${channel}`
await $`bun ./scripts/copy-metainfo.ts ${channel}`

await stageClaude({
  directory: join(paths.desktop, "resources/claude-code"),
  sdk: dirname(createRequire(join(paths.claudeCode, "package.json")).resolve("@anthropic-ai/claude-agent-sdk")),
})
await stageOmni(channel)
await buildCliToResources()
