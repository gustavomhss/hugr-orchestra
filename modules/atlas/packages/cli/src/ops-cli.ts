// @atlas/cli — src/ops-cli.ts  (the ownership/operations commands' table: R4 territory, R7 own-export, R9 repair)
//
// Same contract as `review-cli.ts`: `main` (cli.ts) looks a command up here before its own interceptors, so these
// commands add no line to cli.ts. A name that is not yet in `COMMANDS` (map.ts) is unreachable — `parse` refuses it.

import type { CommandTable } from "./cli-dispatch.js"
import { emitCli } from "./cli-verdict.js"
import { runTerritory, territoryPorts } from "./territory-cli.js"
import { ownExportPorts, runOwnExport } from "./own-export-cli.js"

export const OPS_COMMANDS: CommandTable = {
  territory: (input) => emitCli(runTerritory(territoryPorts(), input.positionals, input.flags)),
  "own-export": (input) => emitCli(runOwnExport(ownExportPorts(input.deps), input.positionals, input.flags)),
}
