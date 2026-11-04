import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261104203356_board_note_attempt",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`board_note\` ADD \`attempt\` integer;`)
      yield* tx.run(`ALTER TABLE \`board_note\` ADD \`session_id\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
