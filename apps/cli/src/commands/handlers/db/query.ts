import { EOL } from "os"
import { Effect } from "effect"
import { sql } from "drizzle-orm"
import { Database } from "@orchestra/core/database/database"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"

export default Runtime.handler(
  Commands.commands.db.commands.query,
  Effect.fn("cli.db.query")(function* (input) {
    const { db } = yield* Database.Service
    const result = yield* db.all<Record<string, unknown>>(sql.raw(input.sql.join(" "))).pipe(Effect.orDie)
    if (result.length === 0) return
    const keys = Object.keys(result[0])
    process.stdout.write(keys.join("\t") + EOL)
    for (const row of result) process.stdout.write(keys.map((key) => row[key]).join("\t") + EOL)
  },
  // Opening the database applies migrations, so only these commands do it.
  Effect.provide(Database.layerFromPath(Database.path())),
  ),
)
