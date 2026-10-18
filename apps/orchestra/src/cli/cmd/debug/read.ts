import { Effect } from "effect"
import { effectCmd } from "../../effect-cmd"
import { debugRead } from "./read-handler"

export const ReadCommand = effectCmd({
  command: "read",
  describe: "invoke the legacy read tool directly (benchmark harness)",
  builder: (yargs) =>
    yargs
      .option("params", {
        type: "string",
        description:
          'Tool params as JSON (e.g. {"filePath":"...","symbol":"foo"}) — or an array of param objects for warm LSP runs',
      })
      .option("meta-only", {
        type: "boolean",
        default: false,
        describe: "omit the read output from envelopes (benchmark-safe for huge reads); emits output_chars instead",
      }),
  handler: (args) => debugRead(args),
})
