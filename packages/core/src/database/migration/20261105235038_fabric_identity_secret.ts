import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261105235038_fabric_identity_secret",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`fabric_identity_secret\` (
          \`id\` text PRIMARY KEY,
          \`revision\` integer NOT NULL,
          \`sealed\` text NOT NULL,
          \`bytes\` integer NOT NULL
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
