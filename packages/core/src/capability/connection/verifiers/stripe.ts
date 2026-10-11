export * as StripeVerifier from "./stripe"

import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Effect, Option, Schema } from "effect"
import type { CapabilityVerifierContract } from "./contract"

const Account = Schema.Struct({ id: Schema.String.check(Schema.isPattern(/^acct_[A-Za-z0-9]{1,64}(?![\s\S])/)) })

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
  identify: (call: CapabilityVerifierContract.Call) => Effect.gen(function* () {
    const account = Schema.decodeUnknownOption(Account)(yield* call({ method: "GET", path: "/v1/account" }))
    if (Option.isNone(account)) return yield* new Capability.Failure({ code: "connection_unavailable",
      message: "Capability connection verification is unavailable" })
    return account.value.id
  }),
})
