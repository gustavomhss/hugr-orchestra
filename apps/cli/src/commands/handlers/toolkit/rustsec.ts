import { Effect } from "effect"
import { ReviewRustsecRefresh } from "@orchestra/core/review-toolkit/rustsec-refresh"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Spawn } from "../../../services/process"

export default Runtime.handler(
  Commands.commands.toolkit.commands.rustsec,
  Effect.fn("cli.toolkit.rustsec")(function* () {
    const result = yield* ReviewRustsecRefresh.refresh((input) => Spawn.run(
      [input.argv[0] ?? "cargo-audit", ...input.argv.slice(1)],
      { cwd: input.cwd, env: input.env, extendEnv: false },
    ).pipe(
      Effect.map((ran) => ({ exitCode: ran.exitCode, stdout: ran.stdout })),
      Effect.timeout("5 minutes"),
      Effect.catch((error) => Effect.succeed({
        exitCode: null,
        failure: error instanceof Error ? error.message : "rustsec refresh failed",
      })),
    ))
    if (!result.ok) return yield* Effect.fail(new Error(result.reason))
    console.log(`RustSec database: ${result.state.revision}; committed: ${result.state.committedAt}; refreshed: ${result.state.refreshedAt}`)
  }),
)
