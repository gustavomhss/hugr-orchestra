import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261110115233_giant_terror",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`economy_attempt\` ADD \`completion_body\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
