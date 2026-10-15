import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261002195730_event_seals",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`event\` ADD \`seal_version\` integer;`)
      yield* tx.run(`ALTER TABLE \`event\` ADD \`seal_prev\` text;`)
      yield* tx.run(`ALTER TABLE \`event\` ADD \`seal_hash\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
