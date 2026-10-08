import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261008025417_prompt_context",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session_input\` ADD \`prompt_context\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
