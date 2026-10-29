import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261029070552_board_base_fix",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`board_bundle\` ADD \`culprit\` text;`)
      yield* tx.run(`ALTER TABLE \`board_bundle\` ADD \`failing\` text;`)
      yield* tx.run(`ALTER TABLE \`board_bundle\` ADD \`fix_issue_id\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
