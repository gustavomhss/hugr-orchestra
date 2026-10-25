import { EOL } from "os"
import * as Effect from "effect/Effect"
import { ConfigPluginFile } from "@orchestra/core/config/plugin-file"
import { Global } from "@orchestra/core/global"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"

export default Runtime.handler(
  Commands.commands.plugin,
  Effect.fn("cli.plugin")(function* (input) {
    const module = input.module.trim()
    if (!module) return yield* Effect.fail(new Error("module is required"))
    const directory = input.global ? Global.Path.config : process.cwd()
    const result = yield* Effect.tryPromise({
      try: () => ConfigPluginFile.add(directory, module, { force: input.force }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    })
    const outcome = { add: "Added to", replace: "Replaced in", noop: "Already configured in" }[result.mode]
    process.stdout.write(`${outcome} ${result.file}` + EOL)
    process.stdout.write(`Scope: ${input.global ? "global" : "local"} (${directory})` + EOL)
  }),
)
