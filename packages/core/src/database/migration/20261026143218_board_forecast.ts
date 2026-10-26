import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261026143218_board_forecast",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`ALTER TABLE \`board_project\` ADD \`forecast_late_streak\` integer DEFAULT 0 NOT NULL;`)
    })
  },
} satisfies DatabaseMigration.Migration
