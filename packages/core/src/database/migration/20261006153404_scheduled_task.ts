import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261006153404_scheduled_task",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`scheduled_task_run\` (
          \`id\` text PRIMARY KEY,
          \`task_id\` text NOT NULL,
          \`slot\` integer,
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
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(
        `CREATE UNIQUE INDEX \`scheduled_task_run_slot_idx\` ON \`scheduled_task_run\` (\`task_id\`,\`slot\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`scheduled_task_run_state_idx\` ON \`scheduled_task_run\` (\`state\`,\`time_claimed\`);`,
      )
      yield* tx.run(`CREATE INDEX \`scheduled_task_directory_idx\` ON \`scheduled_task\` (\`directory\`);`)
      yield* tx.run(`CREATE INDEX \`scheduled_task_due_idx\` ON \`scheduled_task\` (\`enabled\`,\`next\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
