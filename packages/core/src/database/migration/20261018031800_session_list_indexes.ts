import { Effect } from "effect"
import type { DatabaseMigration } from "../migration"

export default {
  id: "20261018031800_session_list_indexes",
  up(tx) {
    return Effect.gen(function* () {
      yield* tx.run(
        `CREATE INDEX \`session_project_time_updated_idx\` ON \`session\` (\`project_id\`,\`time_updated\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_time_archived_time_updated_id_idx\` ON \`session\` (\`time_archived\`,\`time_updated\`,\`id\`);`,
      )
      yield* tx.run(
        `CREATE INDEX \`session_project_time_archived_time_created_id_idx\` ON \`session\` (\`project_id\`,\`time_archived\`,\`time_created\`,\`id\`);`,
      )
    })
  },
} satisfies DatabaseMigration.Migration
