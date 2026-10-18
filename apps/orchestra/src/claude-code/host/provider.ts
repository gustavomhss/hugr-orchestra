export * as ClaudeHostProvider from "./provider"

import { Effect } from "effect"
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk"
import { ClaudeCodeSDK } from "../sdk"
import { ClaudeHostOptions } from "./options"

/** Read the binary's documented account status without submitting a prompt or obtaining a credential. */
export const signedIn = Effect.gen(function* () {
  const sdk = yield* ClaudeCodeSDK.Service
  const env = yield* ClaudeCodeSDK.Environment
  const abort = new AbortController()
  const lifetime = ClaudeCodeSDK.processLifetime({
    systemPrompt: { type: "preset", preset: "claude_code", append: "" },
    env: ClaudeHostOptions.environment(env), abortController: abort, settingSources: ["project"],
  })
  return yield* Effect.acquireUseRelease(
    Effect.sync(() => sdk.query({ options: lifetime.options, prompt: (async function* (): AsyncGenerator<SDKUserMessage> {
      await new Promise<void>((resolve) => abort.signal.addEventListener("abort", () => resolve(), { once: true }))
    })() })),
    (query) => Effect.tryPromise(() => query.accountInfo()).pipe(
      Effect.map((account) => (account.tokenSource !== undefined && account.tokenSource !== "none") ||
        (account.apiKeySource !== undefined && account.apiKeySource !== "none") ||
        // SDK 0.3.289's first-party login may report only the subscription and backend, with both sources absent.
        (account.tokenSource === undefined && account.apiKeySource === undefined &&
          account.apiProvider === "firstParty" && Boolean(account.subscriptionType))),
      Effect.timeout("60 seconds"),
    ),
    (query) => Effect.promise(async () => { abort.abort(); query.close(); await lifetime.join() }),
  )
}).pipe(Effect.catch(() => Effect.succeed(false)))
