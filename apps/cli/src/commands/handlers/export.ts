import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Daemon } from "../../services/daemon"
import { isSessionNotFound } from "./client-errors"

export default Runtime.handler(
  Commands.commands.export,
  Effect.fn("cli.export")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()

    let sessionID = Option.getOrUndefined(input.sessionID)
    if (sessionID === undefined) {
      const latest = yield* Effect.promise(() => client.sessions.list({ limit: 1, order: "desc" }))
      const found = latest.data[0]
      if (found === undefined) return yield* Effect.fail(new Error("No sessions found"))
      sessionID = found.id
    }

    const info = yield* Effect.tryPromise({
      try: () => client.sessions.get({ sessionID }),
      catch: (cause) => cause,
    }).pipe(Effect.catchIf(isSessionNotFound, () => Effect.fail(new Error(`Session not found: ${sessionID}`))))
    const messages = yield* Effect.promise(() => client.messages.list({ sessionID, limit: 200, order: "asc" }))
    process.stdout.write(JSON.stringify({ info, messages: messages.data }, null, 2) + EOL)
  }),
)