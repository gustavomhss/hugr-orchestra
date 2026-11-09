import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261105235919_inbox-calendar",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`inbox_calendar\` (
          \`owner\` text NOT NULL,
          \`generation\` text NOT NULL,
          \`calendar\` text NOT NULL,
          \`events\` text NOT NULL,
          CONSTRAINT \`inbox_calendar_pk\` PRIMARY KEY(\`owner\`, \`generation\`, \`calendar\`)
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
