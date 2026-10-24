export * as ClaudeCodeAccount from "./account"

import type { AccountInfo, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeAccount } from "@orchestra/core/claude-account"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { AppProcess } from "@orchestra/core/process"
import { Cause, Deferred, Effect, Fiber, Layer, Queue, Scope, Stream } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { ClaudeCodeExecutable } from "../executable"
import { ClaudeHostOptions } from "../host/options"
import { ClaudeCodeSDK } from "../sdk"

// Claude Code 2.1.289 `auth login` prints `If the browser didn't open, visit: <url>` (the manual flow's URL, inside an
// OSC 8 terminal hyperlink), opens the automatic flow's URL in the browser itself, then reads `code#state` lines on
// stdin for the manual flow. It prints `Login successful.` and exits 0 once either flow stores the login, and exits 1
// with the reason on stderr otherwise. Orchestra only relays the URL and the pasted code; the CLI owns the credential.
const VISIT = /If the browser didn't open, visit: (\S+)\r?\n/

/** Read the binary's documented account status without submitting a prompt or obtaining a credential. */
const readAccount = Effect.gen(function* () {
  const sdk = yield* ClaudeCodeSDK.Service
  const env = yield* ClaudeCodeSDK.Environment
  const abort = new AbortController()
  // An unavailable deployed or explicit executable throws here; it reads as signed out, like any failed status read.
  const lifetime = yield* Effect.try({
    try: () =>
      ClaudeCodeSDK.processLifetime({
        systemPrompt: { type: "preset", preset: "claude_code", append: "" },
        env: ClaudeHostOptions.environment(env),
        abortController: abort,
        settingSources: ["project"],
      }),
    catch: (cause) => cause,
  })
  return yield* Effect.acquireUseRelease(
    Effect.sync(() =>
      sdk.query({
        options: lifetime.options,
        prompt: (async function* (): AsyncGenerator<SDKUserMessage> {
          await new Promise<void>((resolve) => abort.signal.addEventListener("abort", () => resolve(), { once: true }))
        })(),
      }),
    ),
    (query) =>
      Effect.tryPromise(() => query.accountInfo()).pipe(
        Effect.map(
          (info): ClaudeAccount.Account =>
            authenticated(info)
              ? { signedIn: true, email: info.email, subscription: info.subscriptionType }
              : { signedIn: false },
        ),
        Effect.timeout("60 seconds"),
      ),
    (query) =>
      Effect.promise(async () => {
        abort.abort()
        query.close()
        await lifetime.join()
      }),
  )
}).pipe(
  Effect.provide(ClaudeCodeSDK.layer),
  Effect.catch(() => Effect.succeed<ClaudeAccount.Account>({ signedIn: false })),
)

function authenticated(account: AccountInfo) {
  return (
    (account.tokenSource !== undefined && account.tokenSource !== "none") ||
    (account.apiKeySource !== undefined && account.apiKeySource !== "none") ||
    // SDK 0.3.289's first-party login may report only the subscription and backend, with both sources absent.
    (account.tokenSource === undefined &&
      account.apiKeySource === undefined &&
      account.apiProvider === "firstParty" &&
      Boolean(account.subscriptionType))
  )
}

// Strip OSC 8 hyperlink wrappers (`ESC ] 8 ; params ; uri BEL|ST`) and SGR colors around the printed URL.
function plain(text: string) {
  return text.replace(/\x1b\]8;[^\x07\x1b]*(?:\x07|\x1b\\)/g, "").replace(/\x1b\[[0-9;]*m/g, "")
}

function loginError(cause: unknown) {
  return new ClaudeAccount.LoginError({ message: cause instanceof Error ? cause.message : String(cause) })
}

const layer = Layer.effect(
  ClaudeAccount.Service,
  Effect.gen(function* () {
    const processes = yield* AppProcess.Service
    const scope = yield* Scope.Scope
    // A finished sign-in invalidates the cached status so the account route sees the new login at once.
    const [account, refresh] = yield* Effect.cachedInvalidateWithTTL(readAccount, "30 seconds")
    // One `claude auth login` per server process: a new sign-in replaces an unfinished one.
    const running: { current?: { fiber: Fiber.Fiber<unknown>; codes: Queue.Queue<Uint8Array, Cause.Done> } } = {}

    const stop = Effect.gen(function* () {
      const previous = running.current
      running.current = undefined
      if (previous) yield* Fiber.interrupt(previous.fiber)
    })

    // Owns the child for the sign-in's lifetime: interrupting the fiber closes the scope, which stops the process.
    const run = (
      executable: string,
      env: Record<string, string | undefined>,
      url: Deferred.Deferred<string, ClaudeAccount.LoginError>,
      codes: Queue.Queue<Uint8Array, Cause.Done>,
    ) =>
      Effect.scoped(
        Effect.gen(function* () {
          const child = yield* processes.spawn(
            ChildProcess.make(executable, ["auth", "login", "--claudeai"], {
              env,
              stdin: "pipe",
              forceKillAfter: "2 seconds",
            }),
          )
          yield* Stream.fromQueue(codes).pipe(Stream.run(child.stdin), Effect.forkScoped)
          const errors: string[] = []
          yield* Stream.runForEach(Stream.decodeText(child.stderr), (chunk) => Effect.sync(() => void errors.push(chunk))).pipe(
            Effect.forkScoped,
          )
          const output: string[] = []
          yield* Stream.runForEach(Stream.decodeText(child.stdout), (chunk) => {
            output.push(chunk)
            const found = VISIT.exec(plain(output.join("")))
            return found ? Deferred.succeed(url, found[1]) : Effect.void
          }).pipe(Effect.forkScoped)
          const code = yield* child.exitCode
          // A no-op once the URL arrived; otherwise the caller learns why the CLI stopped before printing one.
          yield* Deferred.fail(
            url,
            new ClaudeAccount.LoginError({
              message: errors.join("").trim() || `Claude Code sign-in exited with code ${code}`,
            }),
          )
        }),
      ).pipe(Effect.catch((cause) => Deferred.fail(url, loginError(cause))))

    const login = Effect.gen(function* () {
      yield* stop
      const env = ClaudeHostOptions.environment(yield* ClaudeCodeSDK.Environment)
      const executable = yield* Effect.try({ try: () => ClaudeCodeExecutable.command(env), catch: loginError })
      const url = yield* Deferred.make<string, ClaudeAccount.LoginError>()
      const codes = yield* Queue.make<Uint8Array, Cause.Done>()
      const fiber = yield* run(executable, env, url, codes).pipe(
        // Refresh the status when this sign-in ends, whatever the outcome; a replaced sign-in leaves the slot alone.
        Effect.ensuring(
          Effect.suspend(() => {
            if (running.current?.codes === codes) running.current = undefined
            return refresh
          }),
        ),
        Effect.forkIn(scope),
      )
      running.current = { fiber, codes }
      return yield* Deferred.await(url).pipe(
        Effect.timeoutOrElse({
          duration: "30 seconds",
          orElse: () => Effect.fail(new ClaudeAccount.LoginError({ message: "Claude Code did not print a sign-in URL" })),
        }),
        Effect.tapError(() => stop),
        Effect.map((found) => ({ url: found })),
      )
    })

    const loginCode = (code: string) =>
      Effect.gen(function* () {
        const current = running.current
        if (!current) return false
        return yield* Queue.offer(current.codes, new TextEncoder().encode(`${code.trim()}\n`))
      })

    return ClaudeAccount.Service.of({ account, login, loginCode })
  }),
)

/** Replaces the unavailable default: the sign-in of the Claude Code binary this server hosts. */
export const node = makeGlobalNode({ service: ClaudeAccount.Service, layer, deps: [AppProcess.node] })
