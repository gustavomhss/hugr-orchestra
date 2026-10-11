export * as CloudflareVerifier from "./cloudflare"

import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Effect, Option, Schema } from "effect"
import type { CapabilityVerifierContract } from "./contract"

// https://developers.cloudflare.com/api/resources/user/subresources/tokens/methods/verify/
// `result.id` is the 32-hex token tag; it names the token, not the account.
const Verified = Schema.Struct({ success: Schema.Literal(true), result: Schema.Struct({
  id: Schema.String.check(Schema.isPattern(/^[0-9a-f]{32}(?![\s\S])/)), status: Schema.Literal("active") }) })
const Inactive = Schema.Struct({ success: Schema.Literal(true),
  result: Schema.Struct({ status: Schema.Literals(["disabled", "expired"]) }) })
const failure = (code: Capability.ErrorCode) => new Capability.Failure({ code,
  message: "Capability connection verification is unavailable" })

export const descriptor: CapabilityVerifierContract.Descriptor = Object.freeze({
  provider: "cloudflare",
  // Platform MCP URL: capability-assets/src/providers.ts (A13); host pinned in capability/mcp/index.ts `hosts`.
  endpoint: "https://mcp.cloudflare.com/mcp?codemode=false",
  integrationID: Integration.ID.make("capability.cloudflare"),
  verification: "verified",
  origin: "https://api.cloudflare.com",
  authorization: (key: string) => `Bearer ${key}`,
  identify: (call: CapabilityVerifierContract.Call) => Effect.gen(function* () {
    const value = yield* call({ method: "GET", path: "/client/v4/user/tokens/verify" })
    // A disabled or expired token is a rejected key even when Cloudflare answers 200.
    if (Option.isSome(Schema.decodeUnknownOption(Inactive)(value))) return yield* failure("authentication_required")
    const verified = Schema.decodeUnknownOption(Verified)(value)
    if (Option.isNone(verified)) return yield* failure("connection_unavailable")
    return `token:${verified.value.result.id}`
  }),
})
