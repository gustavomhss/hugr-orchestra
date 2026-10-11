export * as StripeVerifier from "./stripe"

import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Effect, Option, Schema } from "effect"
import type { CapabilityVerifierContract } from "./contract"

const Account = Schema.Struct({ id: Schema.String.check(Schema.isPattern(/^acct_[A-Za-z0-9]{1,64}(?![\s\S])/)) })

const failure = (code: Capability.ErrorCode) => new Capability.Failure({ code,
  message: "Capability connection verification is unavailable" })

/**
 * Stripe Agent restricted key. The stored endpoint is the hosted MCP URL the platform leaf resolves
 * (`mcp/index.ts` hosts.stripe, assets A22). `GET /v1/account` without an ID returns the key's own account.
 * Subject: the `acct_…` ID.
 */
export const descriptor: CapabilityVerifierContract.Descriptor = Object.freeze({
  provider: "stripe",
  endpoint: "https://mcp.stripe.com",
  integrationID: Integration.ID.make("capability.stripe"),
  verification: "verified",
  origin: "https://api.stripe.com",
  authorization: (key: string) => `Bearer ${key}`,
  // Only restricted keys (Agent keys are restricted): full-access sk_ keys are refused, and from
  // 2026-10-31 the Stripe MCP rejects every non-Agent key.
  keyPattern: /^rk_(live|test)_[A-Za-z0-9]{10,}(?![\s\S])/,
  identify: (call: CapabilityVerifierContract.Call) => Effect.gen(function* () {
    const account = Schema.decodeUnknownOption(Account)(yield* call({ method: "GET", path: "/v1/account" }))
    if (Option.isNone(account)) return yield* failure("connection_unavailable")
    return account.value.id
  }),
})
