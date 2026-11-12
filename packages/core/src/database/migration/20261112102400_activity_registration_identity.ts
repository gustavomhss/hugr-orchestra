import { Effect } from "effect"
import { sql } from "drizzle-orm"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261112102400_activity_registration_identity",
  up(tx) {
    return Effect.gen(function* () {
      // Existing rows need their own tokens before the nonnull constraint can be installed.
      const rows = yield* tx.all<{
        project_id: string
        directory: string
      }>(`SELECT project_id, directory FROM project_directory`)
      yield* tx.run(`
        CREATE TABLE \`__new_project_directory\` (
          \`project_id\` text NOT NULL,
          \`directory\` text NOT NULL,
          \`registration_id\` text NOT NULL UNIQUE,
          \`type\` text,
          \`strategy\` text,
          \`time_created\` integer NOT NULL,
          CONSTRAINT \`project_directory_pk\` PRIMARY KEY(\`project_id\`, \`directory\`),
          CONSTRAINT \`fk_project_directory_project_id_project_id_fk\` FOREIGN KEY (\`project_id\`) REFERENCES \`project\`(\`id\`) ON DELETE CASCADE,
          CONSTRAINT "project_directory_registration_id_nonempty" CHECK(length("registration_id") > 0)
        );
      `)
      yield* Effect.forEach(rows, (row) =>
        tx.run(sql`INSERT INTO __new_project_directory
          (project_id, directory, registration_id, type, strategy, time_created)
          SELECT project_id, directory, ${crypto.randomUUID()}, type, strategy, time_created
          FROM project_directory WHERE project_id = ${row.project_id} AND directory = ${row.directory}`),
      )
      yield* tx.run(`DROP TABLE \`project_directory\`;`) // guardrail-ignore: migration-destructive G01 verifies every field copied above inside this transaction
      yield* tx.run(`ALTER TABLE \`__new_project_directory\` RENAME TO \`project_directory\`;`)
    })
  },
} satisfies DatabaseMigration.Migration
