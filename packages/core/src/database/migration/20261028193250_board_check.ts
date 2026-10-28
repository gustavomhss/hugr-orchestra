import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261028193250_board_check",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`board_check\` (
          \`id\` text PRIMARY KEY,
          \`issue_id\` text NOT NULL,
          \`attempt\` integer NOT NULL,
          \`kind\` text NOT NULL,
          \`command\` text NOT NULL,
          \`tree_sha\` text NOT NULL,
          \`commit_sha\` text,
          \`outcome\` text NOT NULL,
          \`url\` text,
          \`failing\` text NOT NULL,
          \`started_at\` integer NOT NULL,
          \`ended_at\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_board_check_issue_id_board_issue_id_fk\` FOREIGN KEY (\`issue_id\`) REFERENCES \`board_issue\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`board_check_issue_tree_idx\` ON \`board_check\` (\`issue_id\`,\`tree_sha\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
