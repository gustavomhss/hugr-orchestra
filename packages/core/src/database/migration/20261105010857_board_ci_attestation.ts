import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261105010857_board_ci_attestation",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`board_ci_run\` ADD \`observed_pr\` integer;`)
      yield* tx.run(`ALTER TABLE \`board_issue\` ADD \`ci_scanned_pr\` integer;`)
    })
  },
} satisfies DatabaseMigration.Migration
