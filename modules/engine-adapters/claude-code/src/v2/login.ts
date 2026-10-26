export * as ClaudeCodeLogin from "./login"

import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { AppProcess } from "@orchestra/core/process"
import { Cause, Deferred, Effect, Exit, Fiber, Queue, Scope, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"

// Claude Code 2.1.289 `auth login` prints `If the browser didn't open, visit: <url>` (the manual flow's URL, inside an
// OSC 8 terminal hyperlink), opens the automatic flow's URL in the browser itself, then reads `code#state` lines on
// stdin for the manual flow. It prints `Login successful.` and exits 0 once either flow stores the login, and exits 1
// with the reason on stderr otherwise. Orchestra only relays the URL and the pasted code; the CLI owns the credential.
const VISIT = /If the browser didn't open, visit: (\S+)\r?\n/

/**
 * One running `claude auth login --claudeai` (subscription sign-in) with the given executable and environment. The
 * process lives in the caller's Scope; closing that Scope, or calling `stop`, ends the CLI.
 */
export const start = Effect.fn("ClaudeCodeLogin.start")(function* (input: {
  readonly executable: string
  readonly env: Record<string, string | undefined>
}) {
  const scope = yield* Scope.Scope
  const processes = yield* AppProcess.Service
  const child = yield* processes
    .spawn(
      ChildProcess.make(input.executable, ["auth", "login", "--claudeai"], {
        env: input.env,
        extendEnv: false,
        stdin: "pipe",
        forceKillAfter: "2 seconds",
      }),
    )
    .pipe(Effect.mapError((error) => new ClaudeCodeAccount.LoginError({ message: error.message })))
  const stdin = yield* Queue.make<Uint8Array, Cause.Done>()
  yield* Stream.fromQueue(stdin).pipe(Stream.run(child.stdin), Effect.ignore, Effect.forkScoped)
  const url = yield* Deferred.make<string, ClaudeCodeAccount.LoginError>()
  const exited = yield* Deferred.make<boolean>()
  // A stop settles both waiters as a failed sign-in. It can interrupt the exit watcher before that fiber first ran,
  // and an interrupted fiber that never started runs none of its own cleanup, so the Scope settles them instead.
  yield* Effect.addFinalizer(() =>
    Deferred.fail(url, new ClaudeCodeAccount.LoginError({ message: "Claude Code sign-in was stopped" })).pipe(
      Effect.andThen(Deferred.succeed(exited, false)),
    ),
  )
  const output = { text: "" }
  const errors = { text: "" }
  const reading = yield* child.stdout.pipe(
    Stream.decodeText(),
    Stream.runForEach((chunk) =>
      Effect.suspend(() => {
        output.text += chunk
        const found = VISIT.exec(plain(output.text))
        return found ? Deferred.succeed(url, found[1]) : Effect.void
      }),
    ),
    Effect.ignore,
    Effect.forkScoped,
  )
  const failing = yield* child.stderr.pipe(
    Stream.decodeText(),
    Stream.runForEach((chunk) => Effect.sync(() => void (errors.text += chunk))),
    Effect.ignore,
    Effect.forkScoped,
  )
  yield* child.exitCode.pipe(
    Effect.map((code) => Number(code) === 0),
    Effect.orElseSucceed(() => false),
    Effect.flatMap((ok) =>
      Effect.gen(function* () {
        yield* Fiber.join(reading)
        yield* Fiber.join(failing)
        // A no-op once the URL arrived; otherwise the caller learns why the CLI stopped before printing one.
        yield* Deferred.fail(
          url,
          new ClaudeCodeAccount.LoginError({
            message: errors.text.trim() || `Claude Code sign-in exited with ${ok ? "code 0" : "an error"}`,
          }),
        )
        yield* Deferred.succeed(exited, ok)
      }),
    ),
    Effect.forkScoped,
  )
  return {
    url: Deferred.await(url),
    /** True when the CLI stored a login and exited 0. */
    exited: Deferred.await(exited),
    /** Hand the CLI the `code#state` text the manual flow's page shows. */
    code: (text: string) => Queue.offer(stdin, new TextEncoder().encode(`${text.trim()}\n`)),
    stop: Scope.close(scope, Exit.void),
  }
})

export type Login = Effect.Success<ReturnType<typeof start>>

// Strip OSC 8 hyperlink wrappers (`ESC ] 8 ; params ; uri BEL|ST`) and SGR colors around the printed URL.
function plain(text: string) {
  return text.replace(/\x1b\]8;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-9;]*m/g, "")
}
