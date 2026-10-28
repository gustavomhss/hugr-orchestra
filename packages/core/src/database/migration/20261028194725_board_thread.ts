import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261028194725_board_thread",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`board_note\` ADD \`kind\` text DEFAULT 'note' NOT NULL;`)
    })
  },
} satisfies DatabaseMigration.Migration
