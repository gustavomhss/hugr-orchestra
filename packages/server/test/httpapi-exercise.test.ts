// Runs the HttpApi exercise gate (`bun run test:httpapi`) under bun test so `test:ci` can run it on Actions.
import { describe, test } from "bun:test"
import { Effect } from "effect"
import { main } from "./httpapi-exercise"

describe("httpapi exercise", () => {
  for (const mode of ["coverage", "auth", "effect"])
    test(
      `${mode} mode passes with every route covered and no skips`,
      () => Effect.runPromise(main(["--mode", mode, "--fail-on-missing", "--fail-on-skip"])),
      20 * 60_000,
    )
})
