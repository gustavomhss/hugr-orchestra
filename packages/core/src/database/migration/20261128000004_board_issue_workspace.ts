import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261128000004_board_issue_workspace",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`board_ci_run\` ADD \`billing_known\` integer DEFAULT false NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`board_ci_run\` ADD \`discovered_pr\` integer;`)
      yield* tx.run(`ALTER TABLE \`board_ci_run\` ADD \`observed_pr\` integer;`)
      yield* tx.run(`ALTER TABLE \`board_issue\` ADD \`ci_scanned_pr\` integer;`)
      yield* tx.run(`ALTER TABLE \`board_issue\` ADD \`ci_pr_revision\` integer DEFAULT 0 NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`board_issue\` ADD \`ci_scanned_revision\` integer;`)
      yield* tx.run(`ALTER TABLE \`board_note\` ADD \`attempt\` integer;`)
      yield* tx.run(`ALTER TABLE \`board_note\` ADD \`session_id\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
