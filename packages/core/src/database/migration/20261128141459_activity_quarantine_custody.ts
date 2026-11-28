import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261128141459_activity_quarantine_custody",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`activity_quarantine_custody\` (
          \`target_id\` text PRIMARY KEY,
          \`generation\` text NOT NULL,
          \`identity\` text NOT NULL UNIQUE,
          \`label\` text NOT NULL,
          \`owner\` text NOT NULL,
          \`original_path\` text NOT NULL,
          \`quarantine_path\` text NOT NULL UNIQUE,
          \`phase\` text NOT NULL,
          \`reservation_id\` text
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
