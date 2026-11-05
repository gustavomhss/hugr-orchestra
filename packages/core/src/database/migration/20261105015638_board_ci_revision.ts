import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261105015638_board_ci_revision",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`board_issue\` ADD \`ci_pr_revision\` integer DEFAULT 0 NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`board_issue\` ADD \`ci_scanned_revision\` integer;`)
    })
  },
} satisfies DatabaseMigration.Migration
