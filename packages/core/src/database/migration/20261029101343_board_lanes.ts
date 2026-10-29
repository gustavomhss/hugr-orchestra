import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261029101343_board_lanes",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`board_bundle\` ADD \`packages\` text;`)
      yield* tx.run(`ALTER TABLE \`board_issue\` ADD \`area\` text;`)
      yield* tx.run(`ALTER TABLE \`board_issue\` ADD \`order\` integer;`)
    })
  },
} satisfies DatabaseMigration.Migration
