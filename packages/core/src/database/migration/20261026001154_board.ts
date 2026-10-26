import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261026001154_board",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`board_activity\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`issue_id\` text,
          \`actor\` text NOT NULL,
          \`action\` text NOT NULL,
          \`reason\` text,
          \`before\` text,
          \`after\` text,
          \`undoes\` text,
          \`undone_by\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_board_activity_project_id_board_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`board_project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`board_attachment\` (
          \`id\` text PRIMARY KEY,
          \`issue_id\` text NOT NULL,
          \`kind\` text NOT NULL,
          \`name\` text NOT NULL,
          \`mime\` text,
          \`size\` integer,
          \`path\` text,
          \`credential_id\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_board_attachment_issue_id_board_issue_id_fk\` FOREIGN KEY (\`issue_id\`) REFERENCES \`board_issue\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_board_attachment_credential_id_credential_id_fk\` FOREIGN KEY (\`credential_id\`) REFERENCES \`credential\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`board_dependency\` (
          \`issue_id\` text NOT NULL,
          \`depends_on_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`board_dependency_pk\` PRIMARY KEY(\`issue_id\`, \`depends_on_id\`),
          CONSTRAINT \`fk_board_dependency_issue_id_board_issue_id_fk\` FOREIGN KEY (\`issue_id\`) REFERENCES \`board_issue\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_board_dependency_depends_on_id_board_issue_id_fk\` FOREIGN KEY (\`depends_on_id\`) REFERENCES \`board_issue\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`board_epic\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`number\` integer NOT NULL,
          \`title\` text NOT NULL,
          \`goal\` text NOT NULL,
          \`position\` real NOT NULL,
          \`status\` text NOT NULL,
          \`github_milestone\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_board_epic_project_id_board_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`board_project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`board_issue\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`epic_id\` text,
          \`number\` integer NOT NULL,
          \`title\` text NOT NULL,
          \`body\` text NOT NULL,
          \`type\` text NOT NULL,
          \`stage\` text NOT NULL,
          \`position\` real NOT NULL,
          \`estimate\` text,
          \`seat\` text,
          \`session_id\` text,
          \`branch\` text,
          \`pr_number\` integer,
          \`hold_before_merge\` integer DEFAULT false NOT NULL,
          \`paused\` integer DEFAULT false NOT NULL,
          \`stage_entered_at\` integer NOT NULL,
          \`github_number\` integer,
          \`github_node_id\` text,
          \`github_dirty\` integer DEFAULT false NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_board_issue_project_id_board_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`board_project\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_board_issue_epic_id_board_epic_id_fk\` FOREIGN KEY (\`epic_id\`) REFERENCES \`board_epic\`(\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`board_note\` (
          \`id\` text PRIMARY KEY,
          \`issue_id\` text NOT NULL,
          \`author\` text NOT NULL,
          \`body\` text NOT NULL,
          \`github_comment_id\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_board_note_issue_id_board_issue_id_fk\` FOREIGN KEY (\`issue_id\`) REFERENCES \`board_issue\`(\`id\`) ON DELETE CASCADE
        );
      `)
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
          \`next_issue_number\` integer NOT NULL,
          \`next_epic_number\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_board_project_repo_project_id_project_id_fk\` FOREIGN KEY (\`repo_project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`board_question\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`issue_id\` text,
          \`epic_id\` text,
          \`text\` text NOT NULL,
          \`options\` text NOT NULL,
          \`recommended\` text NOT NULL,
          \`cost_of_waiting\` text,
          \`blocking\` integer NOT NULL,
          \`status\` text NOT NULL,
          \`answer_option\` text,
          \`answer_text\` text,
          \`answered_at\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_board_question_project_id_board_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`board_project\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_board_question_issue_id_board_issue_id_fk\` FOREIGN KEY (\`issue_id\`) REFERENCES \`board_issue\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_board_question_epic_id_board_epic_id_fk\` FOREIGN KEY (\`epic_id\`) REFERENCES \`board_epic\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`board_step\` (
          \`id\` text PRIMARY KEY,
          \`issue_id\` text NOT NULL,
          \`position\` integer NOT NULL,
          \`title\` text NOT NULL,
          \`status\` text NOT NULL,
          \`now\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_board_step_issue_id_board_issue_id_fk\` FOREIGN KEY (\`issue_id\`) REFERENCES \`board_issue\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`CREATE INDEX \`board_activity_project_idx\` ON \`board_activity\` (\`project_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`board_attachment_issue_idx\` ON \`board_attachment\` (\`issue_id\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`board_epic_number_idx\` ON \`board_epic\` (\`project_id\`,\`number\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`board_issue_number_idx\` ON \`board_issue\` (\`project_id\`,\`number\`);`)
      yield* tx.run(
        `CREATE INDEX \`board_issue_stage_idx\` ON \`board_issue\` (\`project_id\`,\`stage\`,\`position\`);`,
      )
      yield* tx.run(`CREATE INDEX \`board_note_issue_idx\` ON \`board_note\` (\`issue_id\`);`)
      yield* tx.run(`CREATE INDEX \`board_question_project_idx\` ON \`board_question\` (\`project_id\`,\`status\`);`)
      yield* tx.run(`CREATE INDEX \`board_step_issue_idx\` ON \`board_step\` (\`issue_id\`,\`position\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
