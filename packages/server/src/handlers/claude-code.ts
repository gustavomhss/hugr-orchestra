import { ClaudeAccount } from "@orchestra/core/claude-account"
import { ClaudeCodeLoginError } from "@orchestra/protocol/groups/claude-code"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"

export const ClaudeCodeHandler = HttpApiBuilder.group(Api, "server.claudeCode", (handlers) =>
  Effect.gen(function* () {
    const claude = yield* ClaudeAccount.Service
    return handlers
      .handle("claudeCode.account", () => claude.account)
      .handle("claudeCode.login", () =>
        claude.login.pipe(Effect.mapError((error) => new ClaudeCodeLoginError({ message: error.message }))),
      )
      .handle("claudeCode.loginCode", (ctx) => claude.loginCode(ctx.payload.code))
  }),
)
