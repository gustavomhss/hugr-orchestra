import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Commands } from "../../commands"
import { Runtime } from "../../../framework/runtime"
import { Daemon } from "../../../services/daemon"
import { isSessionNotFound } from "../client-errors"

export default Runtime.handler(
  Commands.commands.session.commands.delete,
  Effect.fn("cli.session.delete")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    yield* Effect.tryPromise({
      try: () => client.sessions.remove({ sessionID: input.sessionID }),
      catch: (cause) => cause,
    }).pipe(
      Effect.catchIf(isSessionNotFound, () => Effect.fail(new Error(`Session not found: ${input.sessionID}`))),
    )
    process.stdout.write(`Session ${input.sessionID} deleted` + EOL)
  }),
)