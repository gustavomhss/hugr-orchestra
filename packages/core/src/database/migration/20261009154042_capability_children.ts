import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261009154042_capability_children",
  up(tx) {
    return Effect.gen(function* () {
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
      yield* tx.run(
        `CREATE UNIQUE INDEX \`capability_child_parent_ordinal\` ON \`capability_child\` (\`session_id\`,\`assistant_message_id\`,\`parent_call_id\`,\`ordinal\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
