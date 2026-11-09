import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261105220530_inbox-work-sync",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`inbox_account\` (
          \`owner\` text NOT NULL,
          \`source\` text NOT NULL,
          \`state\` text NOT NULL,
          \`checked_at\` integer NOT NULL,
          \`retry_at\` integer,
          CONSTRAINT \`inbox_account_pk\` PRIMARY KEY(\`owner\`, \`source\`)
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
