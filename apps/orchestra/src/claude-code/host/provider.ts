export * as ClaudeHostProvider from "./provider"

import { Effect } from "effect"
import type { AccountInfo, SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeCodeSDK } from "../sdk"
import { ClaudeHostOptions } from "./options"

/** What the app may show about the binary's sign-in: no token, key or credential source. */
export type Account = { signedIn: boolean; email?: string; subscription?: string }

/** Read the binary's documented account status without submitting a prompt or obtaining a credential. */
export const account = Effect.gen(function* () {
  const sdk = yield* ClaudeCodeSDK.Service
  const env = yield* ClaudeCodeSDK.Environment
  const abort = new AbortController()
  // An unavailable deployed or explicit executable throws here; it reads as signed out, like any failed status read.
  const lifetime = yield* Effect.try({
    try: () => ClaudeCodeSDK.processLifetime({
      systemPrompt: { type: "preset", preset: "claude_code", append: "" },
      env: ClaudeHostOptions.environment(env), abortController: abort, settingSources: ["project"],
    }),
    catch: (cause) => cause,
  })
  return yield* Effect.acquireUseRelease(
    Effect.sync(() => sdk.query({ options: lifetime.options, prompt: (async function* (): AsyncGenerator<SDKUserMessage> {
      await new Promise<void>((resolve) => abort.signal.addEventListener("abort", () => resolve(), { once: true }))
    })() })),
    (query) => Effect.tryPromise(() => query.accountInfo()).pipe(
      Effect.map((info): Account =>
        authenticated(info) ? { signedIn: true, email: info.email, subscription: info.subscriptionType } : { signedIn: false }),
      Effect.timeout("60 seconds"),
    ),
    (query) => Effect.promise(async () => { abort.abort(); query.close(); await lifetime.join() }),
  )
}).pipe(Effect.catch(() => Effect.succeed<Account>({ signedIn: false })))

export const signedIn = account.pipe(Effect.map((info) => info.signedIn))

/** Start `claude auth login` on the deployed executable with the environment every Claude-mode run gets. */
export const startLogin = Effect.gen(function* () {
  const { ClaudeCodeLogin } = yield* Effect.promise(() => import("../login"))
  const { ClaudeCodeExecutable } = yield* Effect.promise(() => import("../executable"))
  const env = ClaudeHostOptions.environment(yield* ClaudeCodeSDK.Environment)
  return yield* Effect.try({
    try: () => ClaudeCodeLogin.start({ executable: ClaudeCodeExecutable.command(env), env }),
    catch: (cause) => cause,
  })
})

function authenticated(account: AccountInfo) {
  return (account.tokenSource !== undefined && account.tokenSource !== "none") ||
    (account.apiKeySource !== undefined && account.apiKeySource !== "none") ||
    // SDK 0.3.289's first-party login may report only the subscription and backend, with both sources absent.
    (account.tokenSource === undefined && account.apiKeySource === undefined &&
      account.apiProvider === "firstParty" && Boolean(account.subscriptionType))
}
