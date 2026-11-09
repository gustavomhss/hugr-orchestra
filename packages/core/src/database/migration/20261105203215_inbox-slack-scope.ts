import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261105203215_inbox-slack-scope",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`inbox_slack\` (
          \`owner\` text PRIMARY KEY,
          \`value\` text NOT NULL
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
