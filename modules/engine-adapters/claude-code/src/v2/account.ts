export * as ClaudeCodeAccountV2 from "./account"

import type { AccountInfo, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { AppProcess } from "@orchestra/core/process"
import { Cause, Clock, Duration, Effect, Exit, Layer, Scope, Semaphore } from "effect"
import { ClaudeCodeExecutable } from "../executable"
import { ClaudeHostOptions } from "../host/options"
import { ClaudeCodeSDK } from "../sdk"
import { ClaudeCodeLogin } from "./login"

/** How long a signed-in status is trusted before another Claude Code process is started to read it. */
const SIGNED_IN_TTL = Duration.toMillis(Duration.minutes(10))
const RETRY_TTL = Duration.toMillis(Duration.seconds(30))

/**
 * Claude Code's own sign-in, behind the server's account routes. The status is read from the binary's documented
 * account call without a prompt or a credential, and a sign-in runs the binary's own `claude auth login`: Claude Code
 * stores the login, Orchestra only relays the URL and the pasted code.
 */
export const make = Effect.gen(function* () {
  const sdk = yield* ClaudeCodeSDK.Service
  const env = yield* ClaudeCodeSDK.Environment
  const processes = yield* AppProcess.Service
  const layerScope = yield* Scope.Scope
  let cached: { status: ClaudeCodeAccount.Account; expiresAt: number } | undefined
  let generation = 0
  // Start one status process at a time. When its caller cancels, the next waiter can probe after cleanup.
  const account = Semaphore.makeUnsafe(1).withPermit(Effect.gen(function* () {
    while (true) {
      const now = yield* Clock.currentTimeMillis
      if (cached && now < cached.expiresAt) return cached.status
      const started = generation
      const observed = yield* read(sdk, env)
      const checkedAt = yield* Clock.currentTimeMillis
      // A login that completed during this read invalidated the observation.
      if (started !== generation) continue
      // Keep the last signed-in status on a failed read and probe again on the short interval.
      const status = observed ?? cached?.status ?? { signedIn: false }
      cached = { status, expiresAt: checkedAt + (observed?.signedIn ? SIGNED_IN_TTL : RETRY_TTL) }
      return status
    }
  }))
  // One `claude auth login` per process: a new sign-in replaces an unfinished one.
  const login: { current?: ClaudeCodeLogin.Login } = {}
  yield* Effect.addFinalizer(() => Effect.suspend(() => login.current?.stop ?? Effect.void))

  const startLogin = Effect.gen(function* () {
    yield* Effect.suspend(() => login.current?.stop ?? Effect.void)
    const scope = yield* Scope.fork(layerScope)
    const started = yield* ClaudeCodeLogin.start({
      executable: ClaudeCodeExecutable.command(ClaudeHostOptions.environment(env)),
      env: ClaudeHostOptions.environment(env),
    }).pipe(
      Effect.provideService(Scope.Scope, scope),
      Effect.provideService(AppProcess.Service, processes),
      Effect.tapError(() => Scope.close(scope, Exit.void)),
    )
    login.current = started
    // Refresh the status when this sign-in ends, whatever the outcome; a replaced sign-in leaves the slot alone.
    yield* started.exited.pipe(
      Effect.andThen(
        Effect.sync(() => {
          if (login.current === started) login.current = undefined
          cached = undefined
          generation++
        }),
      ),
      Effect.forkIn(layerScope),
    )
    const url = yield* started.url.pipe(
      Effect.timeoutOrElse({
        duration: "30 seconds",
        orElse: () => Effect.fail(new ClaudeCodeAccount.LoginError({ message: "Claude Code did not print a sign-in URL" })),
      }),
      Effect.tapError(() => started.stop),
    )
    return { url }
  })

  return ClaudeCodeAccount.Service.of({
    account,
    startLogin,
    sendCode: (code) => Effect.suspend(() => login.current?.code(code) ?? Effect.succeed(false)),
  })
})

export const node = makeGlobalNode({
  service: ClaudeCodeAccount.Service,
  layer: Layer.effect(ClaudeCodeAccount.Service, make),
  deps: [ClaudeCodeSDK.node, AppProcess.node],
})

/**
 * Read the binary's documented account status without submitting a prompt or obtaining a credential. Undefined when the
 * read itself failed, which is no answer about the sign-in.
 */
function read(sdk: ClaudeCodeSDK.Interface, env: Parameters<typeof ClaudeHostOptions.environment>[0]) {
  return Effect.scoped(Effect.gen(function* () {
    const abort = new AbortController()
    const lifetime = ClaudeCodeSDK.processLifetime({
      systemPrompt: { type: "preset", preset: "claude_code", append: "" },
      env: ClaudeHostOptions.environment(env),
      abortController: abort,
      settingSources: ["project"],
    })
    let query: ReturnType<ClaudeCodeSDK.Interface["query"]> | undefined
    // The SDK can start a process before query() throws. Register cleanup first.
    yield* Effect.addFinalizer(() => Effect.promise(async () => {
      abort.abort()
      try {
        query?.close()
      } finally {
        await lifetime.join()
      }
    }))
    const active = sdk.query({
      options: lifetime.options,
      prompt: (async function* (): AsyncGenerator<SDKUserMessage> {
        if (!abort.signal.aborted)
          await new Promise<void>((resolve) => abort.signal.addEventListener("abort", () => resolve(), { once: true }))
      })(),
    })
    query = active
    return yield* Effect.tryPromise(() => active.accountInfo()).pipe(
      Effect.map(
        (info): ClaudeCodeAccount.Account =>
          authenticated(info) ? { signedIn: true, email: info.email, subscription: info.subscriptionType } : { signedIn: false },
      ),
      Effect.timeout("60 seconds"),
    )
  })).pipe(
    Effect.catchCause((cause) => Cause.hasInterrupts(cause)
      ? Effect.failCause(cause).pipe(Effect.orDie)
      : Effect.succeed(undefined)),
  )
}

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
