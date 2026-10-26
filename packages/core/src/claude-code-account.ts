export * as ClaudeCodeAccount from "./claude-code-account"

import { Context, Effect, Layer, Schema } from "effect"
import { makeGlobalNode } from "./effect/app-node"

/** What a client may know about the Claude Code binary's sign-in: no token, key or credential source. */
export type Account = { readonly signedIn: boolean; readonly email?: string; readonly subscription?: string }

/** Claude Code stopped, or could not start, its own sign-in. The message is the binary's own reason. */
export class LoginError extends Schema.TaggedErrorClass<LoginError>()("ClaudeCodeAccount.LoginError", {
  message: Schema.String,
}) {}

export interface Interface {
  /** Whether the Claude Code binary Claude mode runs is signed in. Sends no model prompt. */
  readonly account: Effect.Effect<Account>
  /**
   * Starts `claude auth login --claudeai` and returns its manual fallback URL; the CLI opens the browser itself. One
   * sign-in runs per process, and a new one replaces an unfinished one. The result shows in `account` once it ends.
   */
  readonly startLogin: Effect.Effect<{ readonly url: string }, LoginError>
  /** Hands the code the fallback page shows to the running sign-in; false when none is running. */
  readonly sendCode: (code: string) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/v2/ClaudeCodeAccount") {}

/** Default: no Claude Code engine is registered, so nothing is signed in and no sign-in can start. */
export const layer = Layer.succeed(
  Service,
  Service.of({
    account: Effect.succeed({ signedIn: false }),
    startLogin: Effect.fail(new LoginError({ message: "Claude Code is not available on this server" })),
    sendCode: () => Effect.succeed(false),
  }),
)

/** A product registers the engine by replacing this node (Host.Contribution.replacements). */
export const node = makeGlobalNode({ service: Service, layer, deps: [] })
