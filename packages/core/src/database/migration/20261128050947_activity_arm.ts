import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261128050947_activity_arm",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`activity_arm\` (
          \`approval_id\` text NOT NULL,
          \`target_id\` text NOT NULL,
          \`generation\` text NOT NULL,
          \`approved_at\` integer NOT NULL,
          \`receipt\` text NOT NULL,
          \`snapshot\` text NOT NULL
        );
      `)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`activity_arm_target_generation_idx\` ON \`activity_arm\` (\`target_id\`,\`generation\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
