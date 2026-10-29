import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261029071810_board_thread",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`board_note\` ADD \`kind\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
