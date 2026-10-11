export * as OpenAIVerifier from "./openai"

import { Capability } from "@orchestra/schema/capability"
import { Integration } from "@orchestra/schema/integration"
import { Effect, Option, Schema } from "effect"
import type { CapabilityVerifierContract } from "./contract"

const Models = Schema.Struct({ data: Schema.Array(Schema.Unknown) })

const failure = (code: Capability.ErrorCode) => new Capability.Failure({ code,
  message: "Capability connection verification is unavailable" })

/**
 * OpenAI project key. The stored endpoint is `CapabilityMedia` endpoints.openai exactly.
 * Credential-only: standard keys have no identity route, so `GET /v1/models` proves validity only.
 * `identify` returns the literal `"key"`; the dispatcher (`verify.ts`) appends `:` + sha256(key)[0..16]
 * for every credential-only descriptor, so the subject is never derived from provider fields or the key itself.
 */
export const descriptor: CapabilityVerifierContract.Descriptor = Object.freeze({
  provider: "openai",
  endpoint: "https://api.openai.com/v1",
  integrationID: Integration.ID.make("capability.openai"),
  verification: "credential-only",
  origin: "https://api.openai.com",
  authorization: (key: string) => `Bearer ${key}`,
  identify: (call: CapabilityVerifierContract.Call) => Effect.gen(function* () {
    if (Option.isNone(Schema.decodeUnknownOption(Models)(yield* call({ method: "GET", path: "/v1/models" }))))
      return yield* failure("connection_unavailable")
    return "key"
  }),
})
