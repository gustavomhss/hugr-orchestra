import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261104225657_board_ci_measurement",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`board_ci_run\` ADD \`billing_known\` integer DEFAULT false NOT NULL;`)
    })
  },
} satisfies DatabaseMigration.Migration
