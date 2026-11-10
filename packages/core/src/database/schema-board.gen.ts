import { Effect } from "effect"
import type { DatabaseMigration } from "./migration"

export default {
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`board_project\` (
          \`id\` text PRIMARY KEY,
          \`key\` text NOT NULL UNIQUE,
          \`name\` text NOT NULL,
          \`goal\` text NOT NULL,
          \`target_date\` integer,
          \`budget_usd\` real,
          \`repo_project_id\` text,
          \`github_repo\` text,
          \`status\` text NOT NULL,
          \`paused_reason\` text,
          \`auto_accept_intake\` integer DEFAULT false NOT NULL,
          \`github_state\` text NOT NULL,
          \`github_error\` text,
          \`github_issues_etag\` text,
          \`github_comments_etag\` text,
          \`github_since\` integer,
          \`github_synced_at\` integer,
          \`ci_synced_at\` integer,
          \`next_issue_number\` integer NOT NULL,
          \`next_epic_number\` integer NOT NULL,
          \`forecast_late_streak\` integer DEFAULT 0 NOT NULL,
          \`base_sha\` text,
          \`review_tier\` text,
          \`review_accepted_unavailable\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_board_project_repo_project_id_project_id_fk\` FOREIGN KEY (\`repo_project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE SET NULL
        );
      `)
    })
  },
} satisfies Omit<DatabaseMigration.Migration, "id">
