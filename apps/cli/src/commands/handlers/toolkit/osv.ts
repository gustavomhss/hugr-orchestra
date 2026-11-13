import { Effect } from "effect"
import { ReviewOsvRefresh } from "@orchestra/core/review-toolkit/osv-refresh"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Spawn } from "../../../services/process"

export default Runtime.handler(
  Commands.commands.toolkit.commands.osv,
  Effect.fn("cli.toolkit.osv")(function* () {
    const result = yield* ReviewOsvRefresh.refresh((input) => Spawn.run(tuple(input.argv), {
      cwd: input.cwd,
      env: input.env,
      extendEnv: false,
    }).pipe(
      Effect.map((ran) => ({ exitCode: Number(ran.exitCode) })),
      Effect.timeout("30 minutes"),
      Effect.catch((error) => Effect.succeed({ exitCode: null, failure: error instanceof Error ? error.message : "refresh failed" })),
    ))
    if (!result.ok) return yield* Effect.fail(new Error(result.reason))
  }),
)

function tuple(argv: readonly string[]): [string, ...string[]] {
  const [bin, ...args] = argv
  return [bin ?? "osv-scanner", ...args]
}
