import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261026013755_drop_prompt_admission",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`DROP TABLE \`session_v1_prompt_admission\`;`)
    })
  },
} satisfies DatabaseMigration.Migration
