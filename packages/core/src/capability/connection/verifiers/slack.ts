export * as CapabilitySlackVerifier from "./slack"

import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Effect, Option, Schema } from "effect"
import { CapabilitySlack } from "../../providers/slack"
import type { CapabilityVerifierContract } from "./contract"

const Team = Schema.String.check(Schema.isPattern(/^T[A-Z0-9]{1,63}(?![\s\S])/))
const User = Schema.String.check(Schema.isPattern(/^[UW][A-Z0-9]{1,63}(?![\s\S])/))
const Bot = Schema.String.check(Schema.isPattern(/^B[A-Z0-9]{1,63}(?![\s\S])/))
const Identity = Schema.Struct({ ok: Schema.Literal(true), team_id: Team, user_id: User, bot_id: Schema.optionalKey(Bot) })
const Rejection = Schema.Struct({ ok: Schema.Literal(false), error: Schema.String })
const Subject = Schema.Tuple([Team, User, Schema.NullOr(Bot)])
const rejected = new Set(["invalid_auth", "token_revoked", "token_expired", "not_authed", "account_inactive"])

export const descriptor = Object.freeze({
  provider: "slack",
  endpoint: CapabilitySlack.endpoint,
  integrationID: Integration.ID.make("capability.slack"),
  verification: "verified",
  origin: "https://slack.com",
  authorization: (key) => `Bearer ${key}`,
  // Slack reports rejected tokens as HTTP 200 `ok: false`; only the closed auth vocabulary means a bad key.
  identify: (call) => call({ method: "POST", path: "/api/auth.test", body: {} }).pipe(Effect.flatMap((value) => {
    const rejection = Schema.decodeUnknownOption(Rejection)(value)
    if (Option.isSome(rejection))
      return failure(rejected.has(rejection.value.error) ? "authentication_required" : "connection_unavailable")
    const identity = Schema.decodeUnknownOption(Identity)(value)
    if (Option.isNone(identity)) return failure("connection_unavailable")
    return Effect.succeed(JSON.stringify([identity.value.team_id, identity.value.user_id, identity.value.bot_id ?? null]))
  })),
} satisfies CapabilityVerifierContract.Descriptor)

/** Stored subject is the canonical `[team, user, bot|null]` JSON tuple. */
export function subject(value: string) {
  const decoded = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)(value).pipe(
    Option.flatMap(Schema.decodeUnknownOption(Subject)))
  return Option.isSome(decoded) && JSON.stringify(decoded.value) === value
}

function failure(code: Capability.ErrorCode) {
  return Effect.fail(new Capability.Failure({ code, message: "Capability connection verification is unavailable" }))
}
