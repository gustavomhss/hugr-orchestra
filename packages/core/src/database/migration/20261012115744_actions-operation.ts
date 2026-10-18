import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261012115744_actions-operation",
  up(tx) {
    return Effect.gen(function* () {
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
      yield* tx.run(
        `CREATE UNIQUE INDEX \`actions_operation_location_binding_client_idx\` ON \`actions_operation\` (\`location_key\`,\`binding_id\`,\`client_id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`actions_operation_state_expires_idx\` ON \`actions_operation\` (\`state\`,\`time_expires\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`actions_operation_state_updated_idx\` ON \`actions_operation\` (\`state\`,\`time_updated\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
