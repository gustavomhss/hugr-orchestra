import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261028204130_merge_queue",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`board_bundle_member\` (
          \`bundle_id\` text NOT NULL,
          \`issue_id\` text NOT NULL,
          \`head_sha\` text NOT NULL,
          \`position\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`board_bundle_member_pk\` PRIMARY KEY(\`bundle_id\`, \`issue_id\`),
          CONSTRAINT \`fk_board_bundle_member_bundle_id_board_bundle_id_fk\` FOREIGN KEY (\`bundle_id\`) REFERENCES \`board_bundle\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_board_bundle_member_issue_id_board_issue_id_fk\` FOREIGN KEY (\`issue_id\`) REFERENCES \`board_issue\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`board_bundle\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`n\` integer NOT NULL,
          \`branch\` text NOT NULL,
          \`pr_number\` integer,
          \`base_sha\` text NOT NULL,
          \`head_sha\` text NOT NULL,
          \`tree_sha\` text NOT NULL,
          \`status\` text NOT NULL,
          \`merged_on\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_board_bundle_project_id_board_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`board_project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`board_queue\` (
          \`issue_id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`head_sha\` text NOT NULL,
          \`urgent\` integer DEFAULT false NOT NULL,
          \`flush\` integer DEFAULT false NOT NULL,
          \`queued_at\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_board_queue_issue_id_board_issue_id_fk\` FOREIGN KEY (\`issue_id\`) REFERENCES \`board_issue\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_board_queue_project_id_board_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`board_project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`ALTER TABLE \`board_issue\` ADD \`record\` text;`)
      yield* tx.run(`CREATE UNIQUE INDEX \`board_bundle_number_idx\` ON \`board_bundle\` (\`project_id\`,\`n\`);`)
      yield* tx.run(`CREATE INDEX \`board_queue_project_idx\` ON \`board_queue\` (\`project_id\`,\`queued_at\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
