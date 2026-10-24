import { EOL } from "os"
import { Effect } from "effect"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Daemon } from "../../services/daemon"
import { isSessionNotFound } from "./client-errors"

type ExportedTranscript = {
  readonly info?: { readonly id?: string; readonly title?: string; readonly location?: { readonly directory?: string } }
  readonly messages?: ReadonlyArray<{ readonly id?: string; readonly type?: string; readonly text?: string }>
}

export default Runtime.handler(
  Commands.commands.import,
  Effect.fn("cli.import")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const transcript = (yield* Effect.promise(() => Bun.file(input.file).json())) as ExportedTranscript
    if (transcript.info?.id === undefined) return yield* Effect.fail(new Error(`No session id in ${input.file}`))

    // Creating a session with an existing id adopts that session, which would append the replay to a live transcript.
    const sessionID = transcript.info.id
    const existing = yield* Effect.tryPromise({
      try: () => client.sessions.get({ sessionID }),
      catch: (cause) => cause,
    }).pipe(
      Effect.as(true),
      Effect.catchIf(isSessionNotFound, () => Effect.succeed(false)),
    )
    if (existing)
      return yield* Effect.fail(new Error(`Session ${sessionID} already exists; refusing to import into it`))
    const created = yield* Effect.promise(() =>
      client.sessions.create({
        id: sessionID,
        location: { directory: transcript.info!.location?.directory ?? process.cwd() },
      }),
    )
    const replayed: string[] = []
    for (const message of transcript.messages ?? []) {
      const text = message.text
      if (text === undefined) continue
      yield* Effect.promise(() => client.sessions.synthetic({ sessionID: created.id, text }))
      replayed.push(message.id ?? message.type ?? "message")
    }
    process.stdout.write(
      `Imported session: ${created.id} (${replayed.length} text messages replayed; file-only and tool messages are skipped).` + EOL,
    )
  }),
)