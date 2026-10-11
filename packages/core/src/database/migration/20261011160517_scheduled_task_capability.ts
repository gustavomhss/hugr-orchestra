import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261011160517_scheduled_task_capability",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`scheduled_task_run\` ADD \`revision\` integer DEFAULT 0 NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`scheduled_task_run\` ADD \`manual_key\` text;`)
      yield* tx.run(`ALTER TABLE \`scheduled_task\` ADD \`policy\` text DEFAULT 'legacy-browser' NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`scheduled_task\` ADD \`revision\` integer DEFAULT 0 NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`scheduled_task\` ADD \`owner\` text;`)
      yield* tx.run(`ALTER TABLE \`scheduled_task\` ADD \`interval_minutes\` integer;`)
      yield* tx.run(`ALTER TABLE \`scheduled_task\` ADD \`cron\` text;`)
      yield* tx.run(`ALTER TABLE \`scheduled_task\` ADD \`catch_up\` text;`)
      yield* tx.run(`ALTER TABLE \`scheduled_task\` ADD \`repeat_limit\` integer;`)
      yield* tx.run(`ALTER TABLE \`scheduled_task\` ADD \`skipped\` integer DEFAULT 0 NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`scheduled_task\` ADD \`disabled_reason\` text;`)
      // drizzle-kit does not regenerate an index whose column list changed; recreate it with the revision.
      yield* tx.run(`DROP INDEX IF EXISTS \`scheduled_task_run_slot_idx\`;`)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`scheduled_task_run_slot_idx\` ON \`scheduled_task_run\` (\`task_id\`,\`revision\`,\`slot\`);`,
      )
      yield* tx.run(
        `CREATE UNIQUE INDEX \`scheduled_task_run_manual_idx\` ON \`scheduled_task_run\` (\`task_id\`,\`manual_key\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
