import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261105234041_inbox-feeds",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`inbox_feed\` (
          \`owner\` text NOT NULL,
          \`id\` text NOT NULL,
          \`source\` text NOT NULL,
          \`url\` text NOT NULL,
          \`name\` text NOT NULL,
          \`initialized\` integer NOT NULL,
          \`seen\` text NOT NULL,
          \`etag\` text,
          \`modified\` text,
          \`state\` text NOT NULL,
          \`checked_at\` integer,
          \`retry_at\` integer,
          CONSTRAINT \`inbox_feed_pk\` PRIMARY KEY(\`owner\`, \`id\`)
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
