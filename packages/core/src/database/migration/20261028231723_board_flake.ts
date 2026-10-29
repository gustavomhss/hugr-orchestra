import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261028231723_board_flake",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`board_flake\` (
          \`project_id\` text NOT NULL,
          \`test\` text NOT NULL,
          \`bundle_id\` text NOT NULL,
          \`first_seen\` integer NOT NULL,
          \`count\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`board_flake_pk\` PRIMARY KEY(\`project_id\`, \`test\`),
          CONSTRAINT \`fk_board_flake_project_id_board_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`board_project\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_board_flake_bundle_id_board_bundle_id_fk\` FOREIGN KEY (\`bundle_id\`) REFERENCES \`board_bundle\`(\`id\`) ON DELETE CASCADE
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
