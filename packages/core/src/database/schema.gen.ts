import { Effect } from "effect"
import type { DatabaseMigration } from "./migration"

export default {
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`workspace\` (
          \`id\` text PRIMARY KEY,
          \`type\` text NOT NULL,
          \`name\` text DEFAULT '' NOT NULL,
          \`branch\` text,
          \`directory\` text,
          \`extra\` text,
          \`project_id\` text NOT NULL,
          \`time_used\` integer NOT NULL,
          CONSTRAINT \`fk_workspace_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`data_migration\` (
          \`name\` text PRIMARY KEY,
          \`time_completed\` integer NOT NULL
        );
      `)
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
      yield* tx.run(`
        CREATE TABLE \`meeting_item\` (
          \`id\` text NOT NULL,
          \`revision\` integer NOT NULL,
          \`meeting_id\` text NOT NULL,
          \`kind\` text NOT NULL,
          \`text\` text NOT NULL,
          \`quote\` text DEFAULT '' NOT NULL,
          \`asserter\` text NOT NULL,
          \`start_ms\` integer,
          \`status\` text DEFAULT 'claimed' NOT NULL,
          \`sent_to_maestro\` integer DEFAULT false NOT NULL,
          \`owner\` text,
          \`counterparty\` text,
          \`due\` text,
          \`state\` text,
          \`for\` text,
          \`created_at\` integer NOT NULL,
          CONSTRAINT \`meeting_item_pk\` PRIMARY KEY(\`id\`, \`revision\`),
          CONSTRAINT \`fk_meeting_item_meeting_id_meeting_id_fk\` FOREIGN KEY (\`meeting_id\`) REFERENCES \`meeting\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`meeting_person\` (
          \`id\` text PRIMARY KEY,
          \`name\` text NOT NULL,
          \`aliases\` text DEFAULT '[]' NOT NULL,
          \`merged_into\` text,
          CONSTRAINT \`fk_meeting_person_merged_into_meeting_person_id_fk\` FOREIGN KEY (\`merged_into\`) REFERENCES \`meeting_person\`(\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`meeting_proposal\` (
          \`id\` text PRIMARY KEY,
          \`meeting_id\` text NOT NULL,
          \`name\` text NOT NULL,
          \`merge_with\` text,
          \`verdict\` text,
          CONSTRAINT \`fk_meeting_proposal_meeting_id_meeting_id_fk\` FOREIGN KEY (\`meeting_id\`) REFERENCES \`meeting\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_meeting_proposal_merge_with_meeting_person_id_fk\` FOREIGN KEY (\`merge_with\`) REFERENCES \`meeting_person\`(\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`meeting_segment\` (
          \`id\` text NOT NULL,
          \`meeting_id\` text NOT NULL,
          \`track\` text NOT NULL,
          \`text\` text NOT NULL,
          \`start_ms\` integer NOT NULL,
          \`end_ms\` integer NOT NULL,
          CONSTRAINT \`meeting_segment_pk\` PRIMARY KEY(\`meeting_id\`, \`id\`),
          CONSTRAINT \`fk_meeting_segment_meeting_id_meeting_id_fk\` FOREIGN KEY (\`meeting_id\`) REFERENCES \`meeting\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`meeting\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text,
          \`title\` text NOT NULL,
          \`time_started\` integer NOT NULL,
          \`time_ended\` integer,
          \`retention\` text DEFAULT 'kept' NOT NULL,
          \`consent\` text DEFAULT 'unknown' NOT NULL,
          \`card_status\` text DEFAULT 'pending' NOT NULL,
          \`card_error\` text,
          \`card_summary\` text DEFAULT '' NOT NULL,
          CONSTRAINT \`fk_meeting_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`account_state\` (
          \`id\` integer PRIMARY KEY,
          \`active_account_id\` text,
          \`active_org_id\` text,
          CONSTRAINT \`fk_account_state_active_account_id_account_id_fk\` FOREIGN KEY (\`active_account_id\`) REFERENCES \`account\`(\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`account\` (
          \`id\` text PRIMARY KEY,
          \`email\` text NOT NULL,
          \`url\` text NOT NULL,
          \`access_token\` text NOT NULL,
          \`refresh_token\` text NOT NULL,
          \`token_expiry\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`control_account\` (
          \`email\` text NOT NULL,
          \`url\` text NOT NULL,
          \`access_token\` text NOT NULL,
          \`refresh_token\` text NOT NULL,
          \`token_expiry\` integer,
          \`active\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`control_account_pk\` PRIMARY KEY(\`email\`, \`url\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`actions_operation\` (
          \`id\` text PRIMARY KEY,
          \`location_key\` text NOT NULL,
          \`project_id\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`workspace_id\` text,
          \`binding_id\` text NOT NULL,
          \`binding_revision\` integer NOT NULL,
          \`provider_kind\` text NOT NULL,
          \`provider_hostname\` text NOT NULL,
          \`provider_api_origin\` text NOT NULL,
          \`provider_project_id\` text NOT NULL,
          \`actor\` text NOT NULL,
          \`client_id\` text NOT NULL,
          \`kind\` text NOT NULL,
          \`target\` text NOT NULL,
          \`expected\` text,
          \`state\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_expires\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`result\` text,
          \`reason\` text
        );
      `)
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
          \`attempts\` integer DEFAULT 0 NOT NULL,
          \`crash_reason\` text,
          \`guardrail_rule\` text,
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
          \`kind\` text DEFAULT 'note' NOT NULL,
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
          \`ci_synced_at\` integer,
          \`next_issue_number\` integer NOT NULL,
          \`next_epic_number\` integer NOT NULL,
          \`forecast_late_streak\` integer DEFAULT 0 NOT NULL,
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
          \`kind\` text,
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
      yield* tx.run(`
        CREATE TABLE \`capability_artifact_pin\` (
          \`artifact_id\` text NOT NULL,
          \`revision\` integer NOT NULL,
          \`owner\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`capability_artifact_pin_pk\` PRIMARY KEY(\`artifact_id\`, \`revision\`, \`session_id\`),
          CONSTRAINT \`fk_capability_artifact_pin_artifact_id_revision_capability_artifact_id_revision_fk\` FOREIGN KEY (\`artifact_id\`,\`revision\`) REFERENCES \`capability_artifact\`(\`id\`,\`revision\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`capability_artifact_reference\` (
          \`artifact_id\` text NOT NULL,
          \`revision\` integer NOT NULL,
          \`session_id\` text NOT NULL,
          \`pinned\` integer DEFAULT false NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`capability_artifact_reference_pk\` PRIMARY KEY(\`artifact_id\`, \`revision\`, \`session_id\`),
          CONSTRAINT \`fk_capability_artifact_reference_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_capability_artifact_reference_artifact_id_revision_capability_artifact_id_revision_fk\` FOREIGN KEY (\`artifact_id\`,\`revision\`) REFERENCES \`capability_artifact\`(\`id\`,\`revision\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`capability_artifact\` (
          \`id\` text NOT NULL,
          \`revision\` integer NOT NULL,
          \`owner\` text NOT NULL,
          \`producer\` text NOT NULL,
          \`mime\` text NOT NULL,
          \`kind\` text NOT NULL,
          \`hash\` text NOT NULL,
          \`bytes\` integer NOT NULL,
          \`verification\` text NOT NULL,
          \`metadata\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`capability_artifact_pk\` PRIMARY KEY(\`id\`, \`revision\`)
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`capability_binding\` (
          \`target_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`agent_id\` text NOT NULL,
          \`actions\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`capability_binding_pk\` PRIMARY KEY(\`target_id\`, \`session_id\`, \`agent_id\`),
          CONSTRAINT \`fk_capability_binding_target_id_capability_target_id_fk\` FOREIGN KEY (\`target_id\`) REFERENCES \`capability_target\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_capability_binding_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`capability_child\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`agent_id\` text NOT NULL,
          \`assistant_message_id\` text NOT NULL,
          \`root_call_id\` text NOT NULL,
          \`root_tool_name\` text NOT NULL,
          \`parent_call_id\` text NOT NULL,
          \`ordinal\` integer NOT NULL,
          \`depth\` integer NOT NULL,
          \`tool_name\` text NOT NULL,
          \`request_hash\` text NOT NULL,
          \`state\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_capability_child_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`capability_connection\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`workspace_id\` text,
          \`provider\` text NOT NULL,
          \`label\` text DEFAULT '' NOT NULL,
          \`integration_id\` text NOT NULL,
          \`credential_id\` text,
          \`subject_id\` text NOT NULL,
          \`endpoint\` text NOT NULL,
          \`scope_hash\` text NOT NULL,
          \`generation\` integer DEFAULT 0 NOT NULL,
          \`state\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_capability_connection_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT \`fk_capability_connection_credential_id_credential_id_fk\` FOREIGN KEY (\`credential_id\`) REFERENCES \`credential\`(\`id\`) ON DELETE SET NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`capability_job\` (
          \`id\` text PRIMARY KEY,
          \`owner\` text NOT NULL,
          \`invocation\` text NOT NULL,
          \`kind\` text NOT NULL,
          \`operation\` text NOT NULL,
          \`creation_key\` text UNIQUE,
          \`request_hash\` text,
          \`state\` text NOT NULL,
          \`connection\` text,
          \`target\` text,
          \`provider_id\` text,
          \`observation\` text NOT NULL,
          \`generation\` integer DEFAULT 0 NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`capability_request\` (
          \`id\` text PRIMARY KEY,
          \`idempotency_hash\` text NOT NULL UNIQUE,
          \`principal\` text NOT NULL,
          \`origin\` text NOT NULL,
          \`scope_hash\` text NOT NULL,
          \`action\` text NOT NULL,
          \`target_hash\` text NOT NULL,
          \`payload_hash\` text NOT NULL,
          \`result\` text NOT NULL,
          \`time_created\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`capability_target\` (
          \`id\` text PRIMARY KEY,
          \`connection_id\` text NOT NULL,
          \`environment\` text NOT NULL,
          \`resource\` text NOT NULL,
          \`generation\` integer DEFAULT 0 NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_capability_target_connection_id_capability_connection_id_fk\` FOREIGN KEY (\`connection_id\`) REFERENCES \`capability_connection\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`credential\` (
          \`id\` text PRIMARY KEY,
          \`integration_id\` text,
          \`label\` text NOT NULL,
          \`value\` text NOT NULL,
          \`connector_id\` text,
          \`method_id\` text,
          \`active\` integer,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`event_sequence\` (
          \`aggregate_id\` text PRIMARY KEY,
          \`seq\` integer NOT NULL,
          \`owner_id\` text
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`event\` (
          \`id\` text PRIMARY KEY,
          \`aggregate_id\` text NOT NULL,
          \`seq\` integer NOT NULL,
          \`type\` text NOT NULL,
          \`data\` text NOT NULL,
          \`seal_version\` integer,
          \`seal_prev\` text,
          \`seal_hash\` text,
          CONSTRAINT \`fk_event_aggregate_id_event_sequence_aggregate_id_fk\` FOREIGN KEY (\`aggregate_id\`) REFERENCES \`event_sequence\`(\`aggregate_id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`permission\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`action\` text NOT NULL,
          \`resource\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_permission_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`project_directory\` (
          \`project_id\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`type\` text,
          \`strategy\` text,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`project_directory_pk\` PRIMARY KEY(\`project_id\`, \`directory\`),
          CONSTRAINT \`fk_project_directory_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`project\` (
          \`id\` text PRIMARY KEY,
          \`worktree\` text NOT NULL,
          \`vcs\` text,
          \`name\` text,
          \`icon_url\` text,
          \`icon_url_override\` text,
          \`icon_color\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`time_initialized\` integer,
          \`sandboxes\` text NOT NULL,
          \`commands\` text
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`scheduled_task_run\` (
          \`id\` text PRIMARY KEY,
          \`task_id\` text NOT NULL,
          \`slot\` integer,
          \`revision\` integer DEFAULT 0 NOT NULL,
          \`manual_key\` text,
          \`state\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`message_id\` text,
          \`prompt\` text,
          \`error\` text,
          \`owner\` text,
          \`time_claimed\` integer NOT NULL,
          \`time_settled\` integer,
          CONSTRAINT \`fk_scheduled_task_run_task_id_scheduled_task_id_fk\` FOREIGN KEY (\`task_id\`) REFERENCES \`scheduled_task\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`scheduled_task\` (
          \`id\` text PRIMARY KEY,
          \`directory\` text NOT NULL,
          \`name\` text NOT NULL,
          \`prompt\` text NOT NULL,
          \`cadence\` text NOT NULL,
          \`timezone\` text NOT NULL,
          \`minute\` integer NOT NULL,
          \`next\` integer NOT NULL,
          \`enabled\` integer NOT NULL,
          \`runs\` integer NOT NULL,
          \`missed\` integer,
          \`policy\` text DEFAULT 'legacy-browser' NOT NULL,
          \`revision\` integer DEFAULT 0 NOT NULL,
          \`owner\` text,
          \`interval_minutes\` integer,
          \`cron\` text,
          \`catch_up\` text,
          \`repeat_limit\` integer,
          \`skipped\` integer DEFAULT 0 NOT NULL,
          \`disabled_reason\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`message\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`fk_message_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`part\` (
          \`id\` text PRIMARY KEY,
          \`message_id\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`fk_part_message_id_message_id_fk\` FOREIGN KEY (\`message_id\`) REFERENCES \`message\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_context_epoch\` (
          \`session_id\` text PRIMARY KEY,
          \`baseline\` text NOT NULL,
          \`snapshot\` text NOT NULL,
          \`baseline_seq\` integer NOT NULL,
          CONSTRAINT \`fk_session_context_epoch_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_input\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`prompt\` text NOT NULL,
          \`prompt_context\` text,
          \`delivery\` text NOT NULL,
          \`admitted_seq\` integer NOT NULL,
          \`promoted_seq\` integer,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`fk_session_input_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_message\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`type\` text NOT NULL,
          \`seq\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`data\` text NOT NULL,
          CONSTRAINT \`fk_session_message_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`workspace_id\` text,
          \`parent_id\` text,
          \`slug\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`path\` text,
          \`title\` text NOT NULL,
          \`version\` text NOT NULL,
          \`share_url\` text,
          \`summary_additions\` integer,
          \`summary_deletions\` integer,
          \`summary_files\` integer,
          \`summary_diffs\` text,
          \`metadata\` text,
          \`cost\` real DEFAULT 0 NOT NULL,
          \`tokens_input\` integer DEFAULT 0 NOT NULL,
          \`tokens_output\` integer DEFAULT 0 NOT NULL,
          \`tokens_reasoning\` integer DEFAULT 0 NOT NULL,
          \`tokens_cache_read\` integer DEFAULT 0 NOT NULL,
          \`tokens_cache_write\` integer DEFAULT 0 NOT NULL,
          \`revert\` text,
          \`permission\` text,
          \`agent\` text,
          \`model\` text,
          \`subagent_models\` text,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          \`time_compacting\` integer,
          \`time_archived\` integer,
          CONSTRAINT \`fk_session_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`todo\` (
          \`session_id\` text NOT NULL,
          \`content\` text NOT NULL,
          \`status\` text NOT NULL,
          \`priority\` text NOT NULL,
          \`position\` integer NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`todo_pk\` PRIMARY KEY(\`session_id\`, \`position\`),
          CONSTRAINT \`fk_todo_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`session_share\` (
          \`session_id\` text PRIMARY KEY,
          \`id\` text NOT NULL,
          \`secret\` text NOT NULL,
          \`url\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL,
          CONSTRAINT \`fk_session_share_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`project_checkpoint_project_time_id_idx\` ON \`project_checkpoint\` (\`project_id\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(`CREATE INDEX \`meeting_item_meeting_idx\` ON \`meeting_item\` (\`meeting_id\`);`)
      yield* tx.run(`CREATE INDEX \`meeting_proposal_meeting_idx\` ON \`meeting_proposal\` (\`meeting_id\`);`)
      yield* tx.run(
        `CREATE INDEX \`meeting_segment_meeting_start_idx\` ON \`meeting_segment\` (\`meeting_id\`,\`start_ms\`);`,
      )
      yield* tx.run(`CREATE INDEX \`meeting_session_idx\` ON \`meeting\` (\`session_id\`);`)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`actions_operation_location_binding_client_idx\` ON \`actions_operation\` (\`location_key\`,\`binding_id\`,\`client_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`actions_operation_state_expires_idx\` ON \`actions_operation\` (\`state\`,\`time_expires\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`actions_operation_state_updated_idx\` ON \`actions_operation\` (\`state\`,\`time_updated\`);`,
      )
      yield* tx.run(`CREATE INDEX \`board_activity_project_idx\` ON \`board_activity\` (\`project_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`board_attachment_issue_idx\` ON \`board_attachment\` (\`issue_id\`);`)
      yield* tx.run(`CREATE INDEX \`board_ci_run_issue_idx\` ON \`board_ci_run\` (\`issue_id\`);`)
      yield* tx.run(
        `CREATE INDEX \`board_decision_project_idx\` ON \`board_decision\` (\`project_id\`,\`answered_at\`);`,
      )
      yield* tx.run(`CREATE UNIQUE INDEX \`board_epic_number_idx\` ON \`board_epic\` (\`project_id\`,\`number\`);`)
      yield* tx.run(`CREATE UNIQUE INDEX \`board_issue_number_idx\` ON \`board_issue\` (\`project_id\`,\`number\`);`)
      yield* tx.run(
        `CREATE INDEX \`board_issue_stage_idx\` ON \`board_issue\` (\`project_id\`,\`stage\`,\`position\`);`,
      )
      yield* tx.run(`CREATE INDEX \`board_note_issue_idx\` ON \`board_note\` (\`issue_id\`);`)
      yield* tx.run(`CREATE INDEX \`board_question_project_idx\` ON \`board_question\` (\`project_id\`,\`status\`);`)
      yield* tx.run(`CREATE INDEX \`board_step_issue_idx\` ON \`board_step\` (\`issue_id\`,\`position\`);`)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`capability_child_parent_ordinal\` ON \`capability_child\` (\`session_id\`,\`assistant_message_id\`,\`parent_call_id\`,\`ordinal\`);`,
      )
      yield* tx.run(`CREATE UNIQUE INDEX \`event_aggregate_seq_idx\` ON \`event\` (\`aggregate_id\`,\`seq\`);`)
      yield* tx.run(`CREATE INDEX \`event_aggregate_type_seq_idx\` ON \`event\` (\`aggregate_id\`,\`type\`,\`seq\`);`)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`permission_project_action_resource_idx\` ON \`permission\` (\`project_id\`,\`action\`,\`resource\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`scheduled_task_run_slot_idx\` ON \`scheduled_task_run\` (\`task_id\`,\`revision\`,\`slot\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`scheduled_task_run_manual_idx\` ON \`scheduled_task_run\` (\`task_id\`,\`manual_key\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`scheduled_task_run_state_idx\` ON \`scheduled_task_run\` (\`state\`,\`time_claimed\`);`,
      )
      yield* tx.run(`CREATE INDEX \`scheduled_task_directory_idx\` ON \`scheduled_task\` (\`directory\`);`)
      yield* tx.run(`CREATE INDEX \`scheduled_task_due_idx\` ON \`scheduled_task\` (\`enabled\`,\`next\`);`)
      yield* tx.run(
        `CREATE INDEX \`message_session_time_created_id_idx\` ON \`message\` (\`session_id\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(`CREATE INDEX \`part_message_id_id_idx\` ON \`part\` (\`message_id\`,\`id\`);`)
      yield* tx.run(`CREATE INDEX \`part_session_idx\` ON \`part\` (\`session_id\`);`)
      yield* tx.run(
        `CREATE INDEX \`session_input_session_pending_delivery_seq_idx\` ON \`session_input\` (\`session_id\`,\`promoted_seq\`,\`delivery\`,\`admitted_seq\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`session_input_session_admitted_seq_idx\` ON \`session_input\` (\`session_id\`,\`admitted_seq\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`session_input_session_promoted_seq_idx\` ON \`session_input\` (\`session_id\`,\`promoted_seq\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`session_message_session_seq_idx\` ON \`session_message\` (\`session_id\`,\`seq\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_message_session_type_seq_idx\` ON \`session_message\` (\`session_id\`,\`type\`,\`seq\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_message_session_time_created_id_idx\` ON \`session_message\` (\`session_id\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(`CREATE INDEX \`session_message_time_created_idx\` ON \`session_message\` (\`time_created\`);`)
      yield* tx.run(`CREATE INDEX \`session_project_idx\` ON \`session\` (\`project_id\`);`)
      yield* tx.run(`CREATE INDEX \`session_workspace_idx\` ON \`session\` (\`workspace_id\`);`)
      yield* tx.run(`CREATE INDEX \`session_parent_idx\` ON \`session\` (\`parent_id\`);`)
      yield* tx.run(
        `CREATE INDEX \`session_project_time_updated_idx\` ON \`session\` (\`project_id\`,\`time_updated\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_time_archived_time_updated_id_idx\` ON \`session\` (\`time_archived\`,\`time_updated\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_project_time_archived_time_created_id_idx\` ON \`session\` (\`project_id\`,\`time_archived\`,\`time_created\`,\`id\`);`,
      )
      yield* tx.run(`CREATE INDEX \`todo_session_idx\` ON \`todo\` (\`session_id\`);`)
    })
  },
} satisfies Omit<DatabaseMigration.Migration, "id">
