import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261128054525_activity_suspension_ledger",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`activity_suspension_ledger\` (
          \`tree_id\` text PRIMARY KEY,
          \`generation\` text NOT NULL,
          \`mark_id\` text NOT NULL,
          \`phase\` text NOT NULL,
          \`suspended\` text NOT NULL,
          \`uncertain\` text NOT NULL,
          \`pending\` text,
          \`owner_incarnation\` text
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
