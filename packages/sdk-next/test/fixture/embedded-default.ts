import { stat } from "node:fs/promises"
import { Cause, Effect, Exit, Scope } from "effect"
import { AbsolutePath, Location, Orchestra } from "../../src"

// ORCHESTRA_DB is supplied at process birth, before Database.node captures its filename.
const filename = process.env.ORCHESTRA_DB
const directory = process.env.ORCHESTRA_TEST_HOME
if (!filename || !directory) throw new Error("Expected isolated database and home")

const result = await Effect.runPromise(
  Effect.scoped(
    Effect.gen(function* () {
      const firstScope = yield* Scope.make()
      const contenderScope = yield* Scope.make()
      yield* Effect.addFinalizer(() => Scope.close(firstScope, Exit.void))
      yield* Effect.addFinalizer(() => Scope.close(contenderScope, Exit.void))
      const first = yield* Orchestra.create().pipe(Effect.provideService(Scope.Scope, firstScope))
      const physical = yield* Effect.promise(() => stat(filename))
      const contender = yield* Orchestra.create().pipe(Effect.provideService(Scope.Scope, contenderScope), Effect.exit)
      yield* Scope.close(contenderScope, Exit.void)
      const session = yield* first.sessions.create({
        location: Location.Ref.make({ directory: AbsolutePath.make(directory) }),
      })
      const retained = yield* first.sessions.get({ sessionID: session.id })
      const cause = Exit.isFailure(contender) ? Cause.squash(contender.cause) : undefined
      const tag = cause && typeof cause === "object" && "_tag" in cause ? cause._tag : undefined
      return {
        defaultFileOpened: physical.isFile() && physical.size > 0,
        duplicateRejected: Exit.isFailure(contender),
        tag,
        firstSurvivedRejectedScope: retained.id === session.id,
      }
    }),
  ),
)
console.log(`embedded custody result: ${JSON.stringify(result)}`)
