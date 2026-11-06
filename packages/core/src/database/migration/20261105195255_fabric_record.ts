import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261105195255_fabric_record",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`fabric_record\` (
          \`id\` text PRIMARY KEY,
          \`storage_id\` text NOT NULL,
          \`principal\` text NOT NULL,
          \`context_id\` text NOT NULL,
          \`context_generation\` integer NOT NULL,
          \`kind\` text NOT NULL,
          \`revision\` integer NOT NULL,
          \`sealed\` text,
          \`bytes\` integer NOT NULL,
          \`deleted\` integer DEFAULT false NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(`CREATE INDEX \`fabric_record_context\` ON \`fabric_record\` (\`storage_id\`,\`context_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
