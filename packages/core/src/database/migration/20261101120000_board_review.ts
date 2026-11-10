import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261101120000_board_review",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`board_project\` ADD \`review_tier\` text;`)
      yield* tx.run(`ALTER TABLE \`board_project\` ADD \`review_accepted_unavailable\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
