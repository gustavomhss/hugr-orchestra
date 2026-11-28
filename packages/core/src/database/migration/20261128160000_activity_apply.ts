import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261128160000_activity_apply",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(`CREATE TABLE activity_apply (preview_id text PRIMARY KEY NOT NULL, approval_id text NOT NULL, target_id text NOT NULL, generation text NOT NULL, confirmed_at integer NOT NULL, source text NOT NULL, destination text NOT NULL, identity text, outcome text NOT NULL);`)
      yield* tx.run(`CREATE UNIQUE INDEX activity_apply_target_generation_idx ON activity_apply (target_id, generation);`)
    })
  },
} satisfies DatabaseMigration.Migration
