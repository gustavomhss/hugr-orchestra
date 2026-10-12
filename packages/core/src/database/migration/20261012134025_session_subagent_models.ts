import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261012134025_session_subagent_models",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`session\` ADD \`subagent_models\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
