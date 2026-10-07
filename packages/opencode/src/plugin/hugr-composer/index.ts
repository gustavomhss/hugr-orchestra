import type { Plugin } from "@opencode-ai/plugin"
import { Flag } from "@opencode-ai/core/flag/flag"
import { HugrComposerClient } from "./client"
import { createHuGRTools } from "./tools"

export const HuGRComposerPlugin: Plugin = async (input) => {
  if (Flag.OPENCODE_PURE) return {}
  const command = process.env.OPENCODE_HUGR_COMPOSER_COMMAND
  if (!command && process.env.OPENCODE_HUGR_COMPOSER !== "1") return {}
  const client = new HugrComposerClient(input.directory, input.worktree, {
    command,
    forwardAuth: process.env.OPENCODE_HUGR_COMPOSER_FORWARD_AUTH === "1",
  })
  return {
    tool: createHuGRTools(client),
    dispose: () => client.dispose(),
  }
}
