import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261008233008_capability_request_identity",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`capability_job\` ADD \`request_hash\` text;`)
    })
  },
} satisfies DatabaseMigration.Migration
