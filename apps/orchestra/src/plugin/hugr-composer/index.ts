import type { Plugin } from "@orchestra/plugin"
import { Flag } from "@orchestra/core/flag/flag"
import { HugrComposerClient } from "./client"
import { createHuGRTools } from "./tools"

export const HuGRComposerPlugin: Plugin = async (input) => {
  if (Flag.ORCHESTRA_PURE) return {}
  const command = process.env.ORCHESTRA_HUGR_COMPOSER_COMMAND
  if (!command && process.env.ORCHESTRA_HUGR_COMPOSER !== "1") return {}
  const client = new HugrComposerClient(input.directory, input.worktree, {
    command,
    forwardAuth: process.env.ORCHESTRA_HUGR_COMPOSER_FORWARD_AUTH === "1",
  })
  return {
    tool: createHuGRTools(client),
    dispose: () => client.dispose(),
  }
}
