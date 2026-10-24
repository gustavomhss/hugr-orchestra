import { EOL } from "os"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import type { Orchestra } from "@orchestra/client"
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
    const messages = yield* Effect.promise(() => readMessages(client, sessionID))
    process.stdout.write(JSON.stringify({ info, messages }, null, 2) + EOL)
  }),
)

const PAGE_SIZE = 200

// The server pages the timeline; a transcript is every page, not the first one. Later pages take only the cursor.
async function readMessages(client: ReturnType<typeof Orchestra.make>, sessionID: string) {
  const messages: Awaited<ReturnType<typeof client.messages.list>>["data"][number][] = []
  let cursor: string | undefined
  do {
    const page = await client.messages.list(
      cursor ? { sessionID, limit: PAGE_SIZE, cursor } : { sessionID, limit: PAGE_SIZE, order: "asc" },
    )
    messages.push(...page.data)
    cursor = page.data.length < PAGE_SIZE ? undefined : (page.cursor.next ?? undefined)
  } while (cursor)
  return messages
}