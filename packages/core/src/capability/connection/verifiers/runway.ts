export * as RunwayVerifier from "./runway"

import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Effect, Option, Schema } from "effect"
import type { CapabilityVerifierContract } from "./contract"

const Organization = Schema.Struct({ creditBalance: Schema.Number })

const failure = (code: Capability.ErrorCode) => new Capability.Failure({ code,
  message: "Capability connection verification is unavailable" })

/**
 * Runway API secret. The stored endpoint is `CapabilityMedia` endpoints.runway exactly, with the same
 * `X-Runway-Version`. Credential-only: `GET /v1/organization` returns no org/user ID, so it proves validity only.
 * `identify` returns the literal `"key"`; the dispatcher (`verify.ts`) appends `:` + sha256(key)[0..16]
 * for every credential-only descriptor, so the subject is never derived from provider fields or the key itself.
 */
export const descriptor: CapabilityVerifierContract.Descriptor = Object.freeze({
  provider: "runway",
  endpoint: "https://api.dev.runwayml.com",
  integrationID: Integration.ID.make("capability.runway"),
  verification: "credential-only",
  origin: "https://api.dev.runwayml.com",
  authorization: (key: string) => `Bearer ${key}`,
  headers: Object.freeze({ "X-Runway-Version": "2024-11-06" }),
  identify: (call: CapabilityVerifierContract.Call) => Effect.gen(function* () {
    if (Option.isNone(Schema.decodeUnknownOption(Organization)(yield* call({ method: "GET", path: "/v1/organization" }))))
      return yield* failure("connection_unavailable")
    return "key"
  }),
})
