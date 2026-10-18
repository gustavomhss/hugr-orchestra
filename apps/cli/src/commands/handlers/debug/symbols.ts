import { EOL, tmpdir } from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"

export default Runtime.handler(
  Commands.commands.debug.commands.symbols,
  Effect.fn("cli.debug.symbols")(function* (input) {
    const file = path.resolve(input.file)
    const result = yield* Effect.promise(async () => {
      const { loadArsenal } = await import("@orchestra/core/tool/maestro-arsenal-omni")
      const arsenal = await loadArsenal()
      // The only process extraction may launch is arsenal's own fixed parser-worker, in a checkout without a binding.
      return arsenal.extractSymbols(file, await Bun.file(file).text(), {
        directory: process.cwd(),
        stateDirectory: tmpdir(),
        projectID: "debug-symbols",
        authorize: async () => {},
      })
    })
    process.stdout.write(JSON.stringify(result, null, 2) + EOL)
  }),
)
