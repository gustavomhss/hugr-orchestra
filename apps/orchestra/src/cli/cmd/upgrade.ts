import type { Argv } from "yargs"
import { UI } from "../ui"
import * as prompts from "@clack/prompts"
import { Installation } from "../../installation"

// Kept registered, with its original args, so `orchestra upgrade` still parses and explains why it does nothing.
export const UpgradeCommand = {
  command: "upgrade [target]",
  describe: "upgrade Orchestra to the latest or a specific version",
  builder: (yargs: Argv) => {
    return yargs
      .positional("target", {
        describe: "version to upgrade to, for ex '0.1.48' or 'v0.1.48'",
        type: "string",
      })
      .option("method", {
        alias: "m",
        describe: "installation method to use",
        type: "string",
        choices: ["curl", "npm", "pnpm", "bun", "brew", "choco", "scoop"],
      })
  },
  handler: async () => {
    UI.empty()
    UI.println(UI.logo("  "))
    UI.empty()
    prompts.intro("Upgrade")
    prompts.log.error(Installation.UPGRADE_DISABLED_MESSAGE)
    prompts.outro("Done")
    process.exitCode = 1
  },
}
