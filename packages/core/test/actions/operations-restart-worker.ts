import { Actions } from "@orchestra/schema/actions"
import { Effect, Schema } from "effect"
import { ActionsOperations } from "../../src/actions/operations"
import { Database } from "../../src/database/database"

const binding = Schema.decodeUnknownSync(Schema.fromJsonString(Actions.Binding))(process.argv[3])
const id = Actions.OperationID.make(process.argv[4])

await Effect.runPromise(Effect.gen(function* () {
  const operations = yield* ActionsOperations.make({ directory: binding.directory, projectID: "core-project" })
  yield* operations.execute(binding, { id, input: {} }, () => Effect.sync(() => {
    // Abrupt process loss after the committed claim bypasses Effect finalizers.
    process.stdout.write(JSON.stringify({ id, pid: process.pid }))
    process.exit(0)
  }))
}).pipe(Effect.provide(Database.layerFromPath(process.argv[2])), Effect.scoped))
