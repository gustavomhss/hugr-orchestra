import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261026003504_meeting_record",
  up(tx) {
    return Effect.gen(function* () {
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
          \`session_id\` text NOT NULL,
          \`title\` text NOT NULL,
          \`time_started\` integer NOT NULL,
          \`time_ended\` integer,
          CONSTRAINT \`fk_meeting_session_id_session_id_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`session\`(\`id\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(
        `CREATE INDEX \`meeting_segment_meeting_start_idx\` ON \`meeting_segment\` (\`meeting_id\`,\`start_ms\`);`,
      )
      yield* tx.run(`CREATE INDEX \`meeting_session_idx\` ON \`meeting\` (\`session_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
