import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261028202742_conflict_notices",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`board_attempt\` ADD \`conflict_base\` text;`)
      yield* tx.run(`ALTER TABLE \`board_attempt\` ADD \`conflict_files\` text;`)
      yield* tx.run(`ALTER TABLE \`board_project\` ADD \`base_sha\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
