import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261028201629_board_attempt",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`board_attempt\` (
          \`issue_id\` text NOT NULL,
          \`n\` integer NOT NULL,
          \`seat\` text,
          \`session_id\` text,
          \`worktree\` text,
          \`branch\` text,
          \`pr_number\` integer,
          \`write_paths\` text NOT NULL,
          \`snapshot_sha\` text,
          \`snapshot_tree\` text,
          \`snapshot_at\` integer,
          \`snapshot_blocked\` text,
          \`cause\` text,
          \`outcome\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`board_attempt_pk\` PRIMARY KEY(\`issue_id\`, \`n\`),
          CONSTRAINT \`fk_board_attempt_issue_id_board_issue_id_fk\` FOREIGN KEY (\`issue_id\`) REFERENCES \`board_issue\`(\`id\`) ON DELETE CASCADE
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
