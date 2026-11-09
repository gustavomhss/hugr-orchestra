import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261105222639_inbox-work-revision",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`inbox_row\` ADD \`revision\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
