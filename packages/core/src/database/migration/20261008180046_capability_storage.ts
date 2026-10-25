import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261008180046_capability_storage",
  up(tx) {
    return Effect.gen(function* () {
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
        CREATE TABLE \`capability_connection\` (
          \`id\` text PRIMARY KEY,
          \`project_id\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`workspace_id\` text,
          \`provider\` text NOT NULL,
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
    })
  },
} satisfies DatabaseMigration.Migration
