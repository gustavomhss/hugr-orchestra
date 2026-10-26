export * as ClaudeCodeAccountV2 from "./account"

import type { AccountInfo, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { makeGlobalNode } from "@orchestra/core/effect/app-node"
import { AppProcess } from "@orchestra/core/process"
import { Effect, Exit, Layer, Scope } from "effect"
import { ClaudeCodeExecutable } from "../executable"
import { ClaudeHostOptions } from "../host/options"
import { ClaudeCodeSDK } from "../sdk"
import { ClaudeCodeLogin } from "./login"

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
  // Only the Claude mode settings evaluate this lazy check. A finished sign-in invalidates it so the next read sees
  // the new login at once.
  const [cached, refresh] = yield* Effect.cachedInvalidateWithTTL(read(sdk, env), "30 seconds")
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
        }),
      ),
      Effect.andThen(refresh),
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
    account: cached,
    startLogin,
    sendCode: (code) => Effect.suspend(() => login.current?.code(code) ?? Effect.succeed(false)),
  })
})

export const node = makeGlobalNode({
  service: ClaudeCodeAccount.Service,
  layer: Layer.effect(ClaudeCodeAccount.Service, make),
  deps: [ClaudeCodeSDK.node, AppProcess.node],
})

/** Read the binary's documented account status without submitting a prompt or obtaining a credential. */
function read(sdk: ClaudeCodeSDK.Interface, env: Parameters<typeof ClaudeHostOptions.environment>[0]) {
  return Effect.gen(function* () {
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
            (info): ClaudeCodeAccount.Account =>
              authenticated(info) ? { signedIn: true, email: info.email, subscription: info.subscriptionType } : { signedIn: false },
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
  }).pipe(Effect.catch(() => Effect.succeed<ClaudeCodeAccount.Account>({ signedIn: false })))
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
