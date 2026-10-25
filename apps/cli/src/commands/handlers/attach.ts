import path from "path"
import * as Effect from "effect/Effect"
import { Option } from "effect"
import { Orchestra } from "@orchestra/client"
import { ServerAuth } from "@orchestra/server/auth"
import { Commands } from "../commands"
import { Runtime } from "../../framework/runtime"

export default Runtime.handler(
  Commands.commands.attach,
  Effect.fn("cli.attach")(function* (input) {
    const target = yield* Effect.tryPromise({
      try: () =>
        prepare({
          url: input.url,
          dir: Option.getOrUndefined(input.dir),
          continue: input.continue,
          session: Option.getOrUndefined(input.session),
          fork: input.fork,
          password: Option.getOrUndefined(input.password),
          username: Option.getOrUndefined(input.username),
          mini: input.mini,
        }),
      catch: (cause) => (cause instanceof Error ? cause : new Error(String(cause))),
    })
    const { runTui } = yield* Effect.promise(() => import("../../tui"))
    yield* runTui(target.transport, { args: target.args, directory: target.directory })
  }),
)

/** Validates the attach request against the remote server and returns what the TUI needs to connect. */
export async function prepare(input: {
  readonly url: string
  readonly dir?: string
  readonly continue: boolean
  readonly session?: string
  readonly fork: boolean
  readonly password?: string
  readonly username?: string
  readonly mini?: boolean
}) {
  if (input.fork && !input.continue && !input.session) throw new Error("--fork requires --continue or --session")
  const headers = ServerAuth.headers({ password: input.password, username: input.username })
  if (input.session) {
    // A missing session is reported here instead of as a blank TUI.
    await Orchestra.make({ baseUrl: input.url, headers })
      .sessions.get({ sessionID: input.session })
      .catch(() => {
        throw new Error(`Session not found: ${input.session}`)
      })
  }
  return {
    transport: { url: input.url, headers },
    args: { continue: input.continue, sessionID: input.session, fork: input.fork, ...(input.mini ? { mini: true } : {}) },
    // The directory may exist only on the remote server, so a path that is not local passes through unchanged.
    directory: input.dir ? ((await Bun.file(input.dir).stat().catch(() => undefined))?.isDirectory() ? path.resolve(input.dir) : input.dir) : undefined,
  }
}
