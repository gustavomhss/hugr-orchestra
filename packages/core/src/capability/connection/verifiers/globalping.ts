export * as GlobalpingVerifier from "./globalping"

import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Effect, Option, Schema } from "effect"
import type { CapabilityVerifierContract } from "./contract"

// `/v1/limits` also answers anonymously (type "ip"); only a "user" limit proves the token was accepted.
const Limits = Schema.Struct({ rateLimit: Schema.Struct({ measurements: Schema.Struct({
  create: Schema.Struct({ type: Schema.Literal("user") }),
}) }) })

const failure = (code: Capability.ErrorCode) => new Capability.Failure({ code,
  message: "Capability connection verification is unavailable" })

/**
 * Globalping API token. The stored endpoint is the hosted MCP URL the platform leaf resolves
 * (`mcp/index.ts` hosts.globalping, assets A20). Credential-only: no identity route exists.
 * `identify` returns the literal `"key"`; the dispatcher (`verify.ts`) appends `:` + sha256(key)[0..16]
 * for every credential-only descriptor, so the subject is never derived from provider fields or the key itself.
 */
export const descriptor: CapabilityVerifierContract.Descriptor = Object.freeze({
  provider: "globalping",
  endpoint: "https://mcp.globalping.dev/mcp",
  integrationID: Integration.ID.make("capability.globalping"),
  verification: "credential-only",
  origin: "https://api.globalping.io",
  authorization: (key: string) => `Bearer ${key}`,
  identify: (call: CapabilityVerifierContract.Call) => Effect.gen(function* () {
    if (Option.isNone(Schema.decodeUnknownOption(Limits)(yield* call({ method: "GET", path: "/v1/limits" }))))
      return yield* failure("connection_unavailable")
    return "key"
  }),
})
