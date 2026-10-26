import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

// Durable rows written by the retired legacy session lifecycle and transcript events. No schema decodes them any
// more, so a durable read would fail on them. Their state already lives in the `session`, `message` and `part`
// tables, which the legacy transcript import reads, so the rows are deleted rather than rewritten: rewriting would
// need new seal hashes, and that would forge the tamper-evident chain. Deleting leaves sequence gaps, so the
// snapshot compaction marker is recorded, which makes seal verification report the history as compacted and makes
// workspace sync refuse to replay it.
const types = [
  "session.created.1",
  "session.updated.1",
  "session.deleted.1",
  "message.updated.1",
  "message.removed.1",
  "message.part.updated.1",
  "message.part.removed.1",
]

export default {
  id: "20261026013700_retire_legacy_session_events",
  up(tx) {
    return Effect.gen(function* () {
      const list = types.map((type) => `'${type}'`).join(", ")
      const found = yield* tx.all<{ id: string }>(`SELECT \`id\` FROM \`event\` WHERE \`type\` IN (${list}) LIMIT 1`)
      if (found.length === 0) return
      yield* tx.run(`DELETE FROM \`event\` WHERE \`type\` IN (${list})`)
      yield* tx.run(
        `INSERT OR REPLACE INTO \`data_migration\` (\`name\`, \`time_completed\`) VALUES ('event_snapshot_compaction', ${Date.now()})`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
