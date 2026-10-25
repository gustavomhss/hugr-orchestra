import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261009225521_capability_operator_requests",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`
        CREATE TABLE \`capability_request\` (
          \`id\` text PRIMARY KEY,
          \`idempotency_hash\` text NOT NULL UNIQUE,
          \`principal\` text NOT NULL,
          \`origin\` text NOT NULL,
          \`scope_hash\` text NOT NULL,
          \`action\` text NOT NULL,
          \`target_hash\` text NOT NULL,
          \`payload_hash\` text NOT NULL,
          \`result\` text NOT NULL,
          \`time_created\` integer NOT NULL
        );
      `)
    })
  },
} satisfies DatabaseMigration.Migration
