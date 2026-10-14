import { sql } from "drizzle-orm"
import { Effect } from "effect"
import { ActionsOperationTable } from "../../src/actions/operations/sql"
import { Database } from "../../src/database/database"
import { ProjectTable } from "../../src/project/sql"
import { SessionTable } from "../../src/session/sql"

const filename = process.argv[2]
if (!filename) throw new Error("Expected database filename")

const snapshot = await Effect.runPromise(
  Effect.gen(function* () {
    const database = yield* Database.Service
    return {
      journal: yield* database.db.all(sql`SELECT * FROM migration ORDER BY id`),
      actions: yield* database.db.select().from(ActionsOperationTable).orderBy(ActionsOperationTable.id).all(),
      projects: yield* database.db.select().from(ProjectTable).orderBy(ProjectTable.id).all(),
      sessions: yield* database.db.select().from(SessionTable).orderBy(SessionTable.id).all(),
    }
  }).pipe(Effect.provide(Database.layerFromPath(filename)), Effect.scoped),
)

console.log(JSON.stringify(snapshot))
