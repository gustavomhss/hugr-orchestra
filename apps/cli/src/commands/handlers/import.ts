import { EOL } from "os"
import { Effect, Schema } from "effect"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"
import { Daemon } from "../../services/daemon"
import { isSessionNotFound } from "./client-errors"

const TextParts = Schema.Array(Schema.Struct({ type: Schema.String, text: Schema.optional(Schema.String) }))

const Transcript = Schema.Struct({
  info: Schema.Struct({
    id: Schema.String.check(Schema.isMinLength(1)),
    location: Schema.optional(Schema.Struct({ directory: Schema.optional(Schema.String) })),
  }),
  messages: Schema.Array(
    Schema.Union([
      Schema.Struct({
        id: Schema.optional(Schema.String),
        type: Schema.String,
        text: Schema.optional(Schema.String),
        content: Schema.optional(TextParts),
      }),
      Schema.Struct({
        info: Schema.Struct({ id: Schema.String }),
        parts: TextParts,
      }),
    ]),
  ),
})

export default Runtime.handler(
  Commands.commands.import,
  Effect.fn("cli.import")(function* (input) {
    const daemon = yield* Daemon.Service
    const client = yield* daemon.client()
    const transcript = yield* Schema.decodeUnknownEffect(Transcript)(
      yield* Effect.promise(() => Bun.file(input.file).json()),
    )
    // Validate the entire replay before creating the Session; a bad later message must not leave a partial import.
    const messages = yield* Effect.try({
      try: () =>
        transcript.messages.flatMap((message) => {
          if ("text" in message && message.text !== undefined) return [message.text]
          const parts = "parts" in message ? message.parts : (message.content ?? [])
          const texts = parts
            .filter((part) => part.type === "text")
            .map((part) => {
              if (part.text === undefined) throw new Error("Transcript text part is missing text")
              return part.text
            })
          return texts.length ? [texts.join("")] : []
        }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    })

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
        location: { directory: transcript.info.location?.directory ?? process.cwd() },
      }),
    )
    for (const text of messages) {
      yield* Effect.promise(() => client.sessions.synthetic({ sessionID: created.id, text, resume: false }))
    }
    process.stdout.write(
      `Imported session: ${created.id} (${messages.length} text messages replayed; file-only and tool messages are skipped).` +
        EOL,
    )
  }),
)
