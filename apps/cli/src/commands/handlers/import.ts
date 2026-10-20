import { EOL } from "os"
import { Effect } from "effect"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Daemon } from "../../services/daemon"

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

    const created = yield* Effect.promise(() =>
      client.sessions.create({
        id: transcript.info!.id,
        location: { directory: transcript.info!.location?.directory ?? process.cwd() },
      }),
    )
    const sessionID = created.id
    const replayed: string[] = []
    for (const message of transcript.messages ?? []) {
      const text = message.text
      if (text === undefined) continue
      yield* Effect.promise(() => client.sessions.synthetic({ sessionID, text }))
      replayed.push(message.id ?? message.type ?? "message")
    }
    process.stdout.write(
      `Imported session: ${sessionID} (${replayed.length} text messages replayed; file-only and tool messages are skipped).` + EOL,
    )
  }),
)