export * as CapabilityConnectionVerification from "./verify"

import { Capability } from "@orchestra/schema/capability"
import { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { Integration } from "@orchestra/schema/integration"
import { Cause, Context, Effect, Option, Schema } from "effect"
import { createHash } from "node:crypto"
import { types } from "node:util"
import { Failure, request, validateOptions, type Options } from "../channel/http"
import { CapabilityOperatorScope } from "../operator/scope"
import { CapabilityDiscord } from "../providers/discord"
import { CapabilitySlack } from "../providers/slack"
import type { CapabilityConnectionSetupContract } from "./setup-contract"
import type { CapabilityConnectionStoreContract } from "./store-contract"

export type { Options } from "../channel/http"

const SlackIdentity = Schema.Struct({ ok: Schema.Literal(true),
  team_id: Schema.String.check(Schema.isPattern(/^T[A-Z0-9]{1,63}(?![\s\S])/)),
  user_id: Schema.String.check(Schema.isPattern(/^[UW][A-Z0-9]{1,63}(?![\s\S])/)),
  bot_id: Schema.optionalKey(Schema.String.check(Schema.isPattern(/^B[A-Z0-9]{1,63}(?![\s\S])/))),
})
const DiscordIdentity = Schema.Struct({ id: Schema.String.check(Schema.isPattern(/^[0-9]{1,20}(?![\s\S])/)),
  bot: Schema.optionalKey(Schema.Literal(true)),
})
const SlackRejection = Schema.Struct({ ok: Schema.Literal(false), error: Schema.String })
const failure = (code: Capability.ErrorCode) => new Capability.Failure({ code,
  message: "Capability connection verification is unavailable" })

/** Identity only. The setup facade checks its own operator before calling this verifier. */
export const make = (options: Options = {}) => {
  const transport = capture(options, ["fixtureOrigin", "timeoutMs", "maxResponseBytes"], (value) => {
    const decoded = Schema.decodeUnknownOption(Schema.Struct({ fixtureOrigin: Schema.optionalKey(Schema.NonEmptyString),
      timeoutMs: Schema.optionalKey(Schema.Number), maxResponseBytes: Schema.optionalKey(Schema.Number),
    }))(value)
    if (Option.isNone(decoded) || !validateOptions(decoded.value)) throw new Error("Invalid verification options")
    return Object.freeze(decoded.value)
  })
  return Effect.gen(function* () {
    if (!transport.ok) return yield* failure("unsupported_schema")
    const verify: CapabilityConnectionSetupContract.Verifier["verify"] = (input) => {
      // Capture at call time, before scheduling any effects; only this flat data shape is accepted.
      const captured = capture(input, ["provider", "key", "label"], (value) => {
        const decoded = Schema.decodeUnknownOption(CapabilitySetup.Input)(value)
        if (Option.isNone(decoded) || decoded.value.key !== decoded.value.key.trim() || /[\r\n]/.test(decoded.value.key))
          throw new Error("Invalid verification input")
        return Object.freeze(decoded.value)
      })
      return Effect.gen(function* () {
        if (!captured.ok) return yield* failure("unsupported_schema")
        const selected = captured.value
        const endpoint = selected.provider === "slack" ? CapabilitySlack.endpoint : CapabilityDiscord.endpoint
        const value = yield* request(endpoint, `${selected.provider === "slack" ? "Bearer" : "Bot"} ${selected.key}`,
          selected.provider === "slack" ? { method: "POST", path: "/auth.test", body: {} }
            : { method: "GET", path: "/users/@me" }, transport.value).pipe(
          // Map the whole Cause without dropping other failures, defects, interrupts or annotations.
          Effect.catchCause((cause) => Effect.failCause(transportCause(cause))),
        )
        const rejected = selected.provider === "slack" ? Schema.decodeUnknownOption(SlackRejection)(value) : Option.none()
        if (Option.isSome(rejected)) return yield* failure(
          ["invalid_auth", "token_revoked", "token_expired", "not_authed", "account_inactive"].includes(rejected.value.error)
            ? "authentication_required" : "connection_unavailable",
        )
        const identity = selected.provider === "slack" ? Schema.decodeUnknownOption(SlackIdentity)(value).pipe(
          Option.map((auth) => JSON.stringify([auth.team_id, auth.user_id, auth.bot_id ?? null])),
        ) : Schema.decodeUnknownOption(DiscordIdentity)(value).pipe(Option.map((auth) => auth.id))
        if (Option.isNone(identity)) return yield* failure("connection_unavailable")
        const subjectID = identity.value
        if (subjectID.includes(selected.key)) return yield* failure("connection_unavailable")
        // This fingerprint binds identity and exact key, not vendor action entitlement.
        return Object.freeze({ provider: selected.provider, endpoint, subjectID,
          integrationID: Integration.ID.make(`capability.${selected.provider}`),
          scopeHash: createHash("sha256").update(JSON.stringify([selected.provider, endpoint, subjectID,
            createHash("sha256").update(selected.key).digest("hex")])).digest("hex"),
        }) satisfies CapabilityConnectionSetupContract.Proof
      })
    }
    return Object.freeze({ verify }) satisfies CapabilityConnectionSetupContract.Verifier
  })
}

/** Pure projection: mixed errors retain identity; repeated reasons and annotations survive normalization. */
export function transportCause(cause: Cause.Cause<CapabilityConnectionStoreContract.Error | Failure>) {
  return Cause.fromReasons<CapabilityConnectionStoreContract.Error>(cause.reasons.map((reason) => reason._tag === "Fail"
    ? Cause.makeFailReason(reason.error instanceof Failure ? failure(
      reason.error.reason === "http" && (reason.error.status === 401 || reason.error.status === 403)
        ? "authentication_required" : "connection_unavailable",
    ) : reason.error).annotate(Context.makeUnsafe(new Map(reason.annotations))) : reason))
}

/** Reject proxies before reflection, and nested objects before the shared descriptor copier visits them. */
function capture<A>(input: unknown, allowed: readonly string[], parse: (value: unknown) => A) {
  if (!input || typeof input !== "object" || types.isProxy(input)) return { ok: false } as const
  const keys = Reflect.ownKeys(input)
  if (keys.length > allowed.length || keys.some((key) => {
    if (typeof key !== "string" || !allowed.includes(key)) return true
    const descriptor = Object.getOwnPropertyDescriptor(input, key)
    return !descriptor || !("value" in descriptor) || !descriptor.enumerable ||
      (descriptor.value !== null && ["object", "function", "symbol", "bigint"].includes(typeof descriptor.value))
  })) return { ok: false } as const
  return CapabilityOperatorScope.capture(input, parse)
}
