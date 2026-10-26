import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261026213955_board_spend",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`board_ci_run\` (
          \`run_id\` integer PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`issue_id\` text NOT NULL,
          \`name\` text NOT NULL,
          \`attempt\` integer NOT NULL,
          \`billable_ms\` integer NOT NULL,
          \`cost_usd\` real NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_board_ci_run_project_id_board_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`board_project\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_board_ci_run_issue_id_board_issue_id_fk\` FOREIGN KEY (\`issue_id\`) REFERENCES \`board_issue\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`board_decision\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`issue_id\` text,
          \`epic_id\` text,
          \`question_id\` text NOT NULL,
          \`question\` text NOT NULL,
          \`options\` text NOT NULL,
          \`recommended\` text NOT NULL,
          \`chosen\` text NOT NULL,
          \`chosen_text\` text,
          \`answered_by\` text NOT NULL,
          \`answered_at\` integer NOT NULL,
          \`outcome\` text,
          \`outcome_at\` integer,
          \`supersedes_id\` text,
          \`overturned_by_id\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_board_decision_project_id_board_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`board_project\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_board_decision_issue_id_board_issue_id_fk\` FOREIGN KEY (\`issue_id\`) REFERENCES \`board_issue\`(\`id\`) ON DELETE SET NULL,
          CONSTRAINT \`fk_board_decision_epic_id_board_epic_id_fk\` FOREIGN KEY (\`epic_id\`) REFERENCES \`board_epic\`(\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`ALTER TABLE \`board_issue\` ADD \`attempts\` integer DEFAULT 0 NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`board_issue\` ADD \`crash_reason\` text;`)
      yield* tx.run(`ALTER TABLE \`board_issue\` ADD \`guardrail_rule\` text;`)
      yield* tx.run(`ALTER TABLE \`board_project\` ADD \`ci_synced_at\` integer;`)
      yield* tx.run(`ALTER TABLE \`board_question\` ADD \`kind\` text;`)
      yield* tx.run(`CREATE INDEX \`board_ci_run_issue_idx\` ON \`board_ci_run\` (\`issue_id\`);`)
      yield* tx.run(
        `CREATE INDEX \`board_decision_project_idx\` ON \`board_decision\` (\`project_id\`,\`answered_at\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
