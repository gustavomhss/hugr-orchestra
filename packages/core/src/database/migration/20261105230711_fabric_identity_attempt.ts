import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261105230711_fabric_identity_attempt",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`fabric_identity_attempt\` (
          \`id\` text PRIMARY KEY,
          \`revision\` integer NOT NULL,
          \`state\` text NOT NULL,
          \`storage_id\` text NOT NULL,
          \`principal\` text NOT NULL,
          \`context_id\` text NOT NULL,
          \`context_generation\` integer NOT NULL,
          \`directory\` text NOT NULL,
          \`project_id\` text NOT NULL,
          \`project_directory\` text NOT NULL,
          \`profile_hash\` text NOT NULL,
          \`scopes\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`expires_at\` integer NOT NULL
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`fabric_identity_attempt_context\` ON \`fabric_identity_attempt\` (\`storage_id\`,\`context_id\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
