export * as ClaudeAccount from "./claude-account"

import { Context, Effect, Layer, Schema } from "effect"
import { makeGlobalNode } from "./effect/app-node"

export class LoginError extends Schema.TaggedErrorClass<LoginError>()("ClaudeAccount.LoginError", {
  message: Schema.String,
}) {}

/** What the app may show about the Claude Code sign-in: no token, key or credential source. */
export interface Account {
  readonly signedIn: boolean
  readonly email?: string
  readonly subscription?: string
}

export interface Interface {
  /** Whether the Claude Code binary Claude mode runs is signed in. */
  readonly account: Effect.Effect<Account>
  /** Starts `claude auth login`, replacing an unfinished one. The URL is the manual fallback of the sign-in. */
  readonly login: Effect.Effect<{ readonly url: string }, LoginError>
  /** Hands the code the fallback page shows to the running sign-in; false when none is running. */
  readonly loginCode: (code: string) => Effect.Effect<boolean>
}

export class Service extends Context.Service<Service, Interface>()("@orchestra/ClaudeAccount") {}

/** The default: a server that hosts no Claude Code reports signed out and cannot start a sign-in. */
export const unavailable = Service.of({
  account: Effect.succeed({ signedIn: false }),
  login: Effect.fail(new LoginError({ message: "Claude Code is not available on this server" })),
  loginCode: () => Effect.succeed(false),
})

/** The engine module replaces this node with the Claude Code sign-in (a Host contribution). */
export const node = makeGlobalNode({ service: Service, layer: Layer.succeed(Service, unavailable), deps: [] })
