export * as NeonVerifier from "./neon"

import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Effect, Option, Schema } from "effect"
import type { CapabilityVerifierContract } from "./contract"

// https://neon.com/api_spec/release/v2.json `AuthDetailsResponse`. `account_id` is the user UUID for a user key
// or the organization ID (`org-…`, pattern `^[a-z0-9-]{1,60}$`) for an org key. Only API-key methods are accepted.
const Auth = Schema.Struct({
  account_id: Schema.String.check(Schema.isPattern(/^[a-z0-9][a-z0-9-]{0,59}(?![\s\S])/)),
  auth_method: Schema.Literals(["api_key_user", "api_key_org"]),
})

export const descriptor: CapabilityVerifierContract.Descriptor = Object.freeze({
  provider: "neon",
  // Platform MCP URL: capability-assets/src/providers.ts (A16); host pinned in capability/mcp/index.ts `hosts`.
  endpoint: "https://mcp.neon.tech/mcp",
  integrationID: Integration.ID.make("capability.neon"),
  verification: "verified",
  origin: "https://console.neon.tech",
  authorization: (key: string) => `Bearer ${key}`,
  identify: (call: CapabilityVerifierContract.Call) => Effect.gen(function* () {
    const auth = Schema.decodeUnknownOption(Auth)(yield* call({ method: "GET", path: "/api/v2/auth" }))
    if (Option.isNone(auth)) return yield* new Capability.Failure({ code: "connection_unavailable",
      message: "Capability connection verification is unavailable" })
    return auth.value.account_id
  }),
})
