import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261010044121_capability_connection_labels",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`capability_connection\` ADD \`label\` text DEFAULT '' NOT NULL;`)
    })
  },
} satisfies DatabaseMigration.Migration
