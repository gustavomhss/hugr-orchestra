import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261028234541_board_held",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`board_bundle\` ADD \`rebuilds\` integer DEFAULT 0 NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`board_queue\` ADD \`hold\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
