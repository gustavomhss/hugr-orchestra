import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261008133630_v1_prompt_admission",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`session_v1_prompt_admission\` (
          \`id\` text PRIMARY KEY,
          \`session_id\` text NOT NULL,
          \`identity_version\` integer DEFAULT 1 NOT NULL,
          \`identity\` text NOT NULL,
          \`snapshot\` text NOT NULL,
          CONSTRAINT \`fk_session_v1_prompt_admission_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
