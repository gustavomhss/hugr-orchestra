import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261105202635_inbox-location",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`inbox_draft\` ADD \`owner\` text DEFAULT '' NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`inbox_egress\` ADD \`owner\` text DEFAULT '' NOT NULL;`)
      yield* tx.run(`ALTER TABLE \`inbox_row\` ADD \`owner\` text DEFAULT '' NOT NULL;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_inbox_draft\` (
          \`owner\` text DEFAULT '' NOT NULL,
          \`list_id\` text NOT NULL,
          \`text\` text NOT NULL,
          \`sent\` integer NOT NULL,
          CONSTRAINT \`inbox_draft_pk\` PRIMARY KEY(\`owner\`, \`list_id\`)
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_inbox_draft\`(\`list_id\`, \`text\`, \`sent\`) SELECT \`list_id\`, \`text\`, \`sent\` FROM \`inbox_draft\`;`,
      )
      yield* tx.run(`DROP TABLE \`inbox_draft\`;`) // guardrail-ignore: migration-destructive all drafts copied into __new_inbox_draft above; location-migration.test.ts verifies retained text and sent state
      yield* tx.run(`ALTER TABLE \`__new_inbox_draft\` RENAME TO \`inbox_draft\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_inbox_egress\` (
          \`owner\` text DEFAULT '' NOT NULL,
          \`id\` text NOT NULL,
          \`list_id\` text NOT NULL,
          \`text\` text NOT NULL,
          \`thread_id\` text NOT NULL,
          CONSTRAINT \`inbox_egress_pk\` PRIMARY KEY(\`owner\`, \`id\`)
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_inbox_egress\`(\`id\`, \`list_id\`, \`text\`, \`thread_id\`) SELECT \`id\`, \`list_id\`, \`text\`, \`thread_id\` FROM \`inbox_egress\`;`,
      )
      yield* tx.run(`DROP TABLE \`inbox_egress\`;`) // guardrail-ignore: migration-destructive all egress copied into __new_inbox_egress above; location-migration.test.ts verifies retained destination and text
      yield* tx.run(`ALTER TABLE \`__new_inbox_egress\` RENAME TO \`inbox_egress\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_inbox_row\` (
          \`owner\` text DEFAULT '' NOT NULL,
          \`source\` text NOT NULL,
          \`external_id\` text NOT NULL,
          \`list_id\` text NOT NULL,
          \`actor\` text NOT NULL,
          \`snippet\` text NOT NULL,
          \`thread_id\` text NOT NULL,
          \`reply\` integer NOT NULL,
          \`deep_link\` text,
          \`person_id\` text,
          \`commitment_id\` text,
          \`open\` integer NOT NULL,
          \`reveal_at\` integer,
          CONSTRAINT \`inbox_row_pk\` PRIMARY KEY(\`owner\`, \`source\`, \`external_id\`)
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_inbox_row\`(\`source\`, \`external_id\`, \`list_id\`, \`actor\`, \`snippet\`, \`thread_id\`, \`reply\`, \`deep_link\`, \`person_id\`, \`commitment_id\`, \`open\`, \`reveal_at\`) SELECT \`source\`, \`external_id\`, \`list_id\`, \`actor\`, \`snippet\`, \`thread_id\`, \`reply\`, \`deep_link\`, \`person_id\`, \`commitment_id\`, \`open\`, \`reveal_at\` FROM \`inbox_row\`;`,
      )
      yield* tx.run(`DROP TABLE \`inbox_row\`;`) // guardrail-ignore: migration-destructive all messages copied into __new_inbox_row above; location-migration.test.ts verifies unassigned ownership and retained content
      yield* tx.run(`ALTER TABLE \`__new_inbox_row\` RENAME TO \`inbox_row\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
    })
  },
} satisfies DatabaseMigration.Migration
