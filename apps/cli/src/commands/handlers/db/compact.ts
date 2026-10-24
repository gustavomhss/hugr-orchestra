import { EOL } from "os"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"

export default Runtime.handler(
  Commands.commands.db.commands.compact,
  Effect.fn("cli.db.compact")(function* () {
    const { db } = yield* Database.Service
    if (yield* EventV2.hasCompactedSnapshotEvents(db)) {
      return yield* Effect.fail(
        new Error(
          "db compact is permanently disabled after snapshot compaction: enabling workspace sync could not reconstruct deleted sequence gaps.",
        ),
      )
    }
    const result = yield* EventV2.compactSnapshotEvents(db).pipe(Effect.orDie)
    process.stdout.write(
      `Removed ${result.removed} redundant snapshot events (${(result.bytes / 1024 / 1024).toFixed(1)} MiB of JSON payload).` + EOL,
    )
    const before = yield* db.all<Record<string, unknown>>(sql.raw(`PRAGMA page_count;`)).pipe(Effect.orDie)
    yield* db.run(sql.raw(`VACUUM;`)).pipe(Effect.orDie)
    const after = yield* db.all<Record<string, unknown>>(sql.raw(`PRAGMA page_count;`)).pipe(Effect.orDie)
    const pagesBefore = Number(before[0]?.page_count)
    const pagesAfter = Number(after[0]?.page_count)
    if (Number.isFinite(pagesBefore) && Number.isFinite(pagesAfter) && pagesBefore > 0 && pagesAfter > 0) {
      process.stdout.write(
        `DB pages: ${pagesBefore.toLocaleString()} -> ${pagesAfter.toLocaleString()} (-${(100 * (1 - pagesAfter / Math.max(pagesBefore, 1))).toFixed(1)}%)` + EOL,
      )
    }
  },
  // Opening the database applies migrations, so only these commands do it.
  Effect.provide(Database.layerFromPath(Database.path())),
  ),
)
