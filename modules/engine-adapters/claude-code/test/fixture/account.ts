export * as ClaudeCodeAccountFixture from "./account"

import { ClaudeCodeAccount } from "@orchestra/core/claude-code-account"
import { Effect, Layer } from "effect"

export const layer = Layer.succeed(
  ClaudeCodeAccount.Service,
  ClaudeCodeAccount.Service.of({
    account: Effect.succeed({ signedIn: true }),
    startLogin: Effect.never,
    sendCode: () => Effect.succeed(false),
  }),
)
