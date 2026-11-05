import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261105001717_board_ci_discovery",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`board_ci_run\` ADD \`discovered_pr\` integer;`)
    })
  },
} satisfies DatabaseMigration.Migration
