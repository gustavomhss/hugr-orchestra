import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261105093648_fabric_context",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`fabric_context\` (
          \`id\` text PRIMARY KEY,
          \`storage_id\` text NOT NULL,
          \`principal\` text NOT NULL,
          \`root\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`project_id\` text,
          \`project_directory\` text,
          \`generation\` integer DEFAULT 1 NOT NULL,
          \`state\` text NOT NULL,
          \`preparation_nonce\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
