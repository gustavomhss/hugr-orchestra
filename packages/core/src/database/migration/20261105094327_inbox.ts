import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261105094327_inbox",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`inbox_draft\` (
          \`list_id\` text PRIMARY KEY,
          \`text\` text NOT NULL,
          \`sent\` integer NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`inbox_egress\` (
          \`id\` text PRIMARY KEY,
          \`list_id\` text NOT NULL,
          \`text\` text NOT NULL,
          \`thread_id\` text NOT NULL
        );
      `)
      yield* tx.run(`
        CREATE TABLE \`inbox_row\` (
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
          CONSTRAINT \`inbox_row_pk\` PRIMARY KEY(\`source\`, \`external_id\`)
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
