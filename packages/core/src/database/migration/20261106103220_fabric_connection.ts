import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261106103220_fabric_connection",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`fabric_connection\` (
          \`id\` text PRIMARY KEY,
          \`generation\` integer NOT NULL,
          \`storage_id\` text NOT NULL,
          \`principal\` text NOT NULL,
          \`context_id\` text NOT NULL,
          \`context_generation\` integer NOT NULL,
          \`directory\` text NOT NULL,
          \`project_id\` text NOT NULL,
          \`project_directory\` text NOT NULL,
          \`profile_hash\` text NOT NULL,
          \`credential_id\` text NOT NULL,
          \`sealed\` text NOT NULL,
          \`bytes\` integer NOT NULL,
          \`time_created\` integer NOT NULL
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`fabric_connection_context\` ON \`fabric_connection\` (\`storage_id\`,\`context_id\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
