import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261010135215_project_checkpoints",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`project_checkpoint\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`fork_id\` text NOT NULL,
          \`boundary\` text NOT NULL,
          \`attempt\` integer NOT NULL,
          \`directory\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`digest\` text NOT NULL,
          \`payload\` text NOT NULL,
          CONSTRAINT \`fk_project_checkpoint_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT "project_checkpoint_attempt_check" CHECK("attempt" in (0, 1))
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`project_checkpoint_project_time_id_idx\` ON \`project_checkpoint\` (\`project_id\`,\`time_created\`,\`id\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
