import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261008192938_capability_lifecycle",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`capability_artifact_pin\` (
          \`artifact_id\` text NOT NULL,
          \`revision\` integer NOT NULL,
          \`owner\` text NOT NULL,
          \`session_id\` text NOT NULL,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`capability_artifact_pin_pk\` PRIMARY KEY(\`artifact_id\`, \`revision\`, \`session_id\`),
          CONSTRAINT \`fk_capability_artifact_pin_artifact_id_revision_capability_artifact_id_revision_fk\` FOREIGN KEY (\`artifact_id\`,\`revision\`) REFERENCES \`capability_artifact\`(\`id\`,\`revision\`) ON DELETE CASCADE
        );
      `)
      yield* tx.run(`ALTER TABLE \`capability_job\` ADD \`creation_key\` text;`)
      yield* tx.run(`PRAGMA foreign_keys=OFF;`)
      yield* tx.run(`
        CREATE TABLE \`__new_capability_job\` (
          \`id\` text PRIMARY KEY,
          \`owner\` text NOT NULL,
          \`invocation\` text NOT NULL,
          \`kind\` text NOT NULL,
          \`operation\` text NOT NULL,
          \`creation_key\` text UNIQUE,
          \`state\` text NOT NULL,
          \`connection\` text,
          \`target\` text,
          \`provider_id\` text,
          \`observation\` text NOT NULL,
          \`generation\` integer DEFAULT 0 NOT NULL,
          \`time_created\` integer NOT NULL,
          \`time_updated\` integer NOT NULL
        );
      `)
      yield* tx.run(
        `INSERT INTO \`__new_capability_job\`(\`id\`, \`owner\`, \`invocation\`, \`kind\`, \`operation\`, \`state\`, \`connection\`, \`target\`, \`provider_id\`, \`observation\`, \`generation\`, \`time_created\`, \`time_updated\`) SELECT \`id\`, \`owner\`, \`invocation\`, \`kind\`, \`operation\`, \`state\`, \`connection\`, \`target\`, \`provider_id\`, \`observation\`, \`generation\`, \`time_created\`, \`time_updated\` FROM \`capability_job\`;`,
      )
      yield* tx.run(`DROP TABLE \`capability_job\`;`)
      yield* tx.run(`ALTER TABLE \`__new_capability_job\` RENAME TO \`capability_job\`;`)
      yield* tx.run(`PRAGMA foreign_keys=ON;`)
    })
  },
} satisfies DatabaseMigration.Migration
