import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261128044106_activity_action_ledger",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`activity_action_ledger\` (
          \`target_id\` text PRIMARY KEY,
          \`generation\` text NOT NULL,
          \`observation\` text NOT NULL
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
