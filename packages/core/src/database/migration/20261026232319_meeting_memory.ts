import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261026232319_meeting_memory",
  up(tx) {
    return Effect.gen(function* () {
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
      yield* tx.run(`ALTER TABLE \`meeting\` ADD \`retention\` text DEFAULT 'kept' NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`meeting\` ADD \`consent\` text DEFAULT 'unknown' NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`meeting\` ADD \`card_status\` text DEFAULT 'pending' NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`meeting\` ADD \`card_error\` text;`)
      yield* tx.run(`ALTER TABLE \`meeting\` ADD \`card_summary\` text DEFAULT '' NOT NULL;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_meeting\` (
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
      yield* tx.run(
        `INSERT INTO \`__new_meeting\`(\`id\`, \`session_id\`, \`title\`, \`time_started\`, \`time_ended\`) SELECT \`id\`, \`session_id\`, \`title\`, \`time_started\`, \`time_ended\` FROM \`meeting\`;`,
      )
      yield* tx.run(`DROP TABLE \`meeting\`;`)
      yield* tx.run(`ALTER TABLE \`__new_meeting\` RENAME TO \`meeting\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`CREATE INDEX \`meeting_session_idx\` ON \`meeting\` (\`session_id\`);`)
      yield* tx.run(`CREATE INDEX \`meeting_item_meeting_idx\` ON \`meeting_item\` (\`meeting_id\`);`)
      yield* tx.run(`CREATE INDEX \`meeting_proposal_meeting_idx\` ON \`meeting_proposal\` (\`meeting_id\`);`)
    })
  },
} satisfies DatabaseMigration.Migration
