// Runs the V2 HttpApi exercise: `bun run script/httpapi-exercise.ts --mode coverage|auth|effect [--fail-on-missing] ...`.
import { Effect } from "effect"
import { main } from "../test/httpapi-exercise"
import { message } from "../test/httpapi-exercise/assertions"

await Effect.runPromise(main(Bun.argv.slice(2))).then(
  () => process.exit(0),
  (error: unknown) => {
    console.error(message(error))
    process.exit(1)
  },
)
