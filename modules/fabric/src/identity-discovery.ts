export * as FabricIdentityDiscovery from "./identity-discovery"

import { Effect, Option, Schema } from "effect"
import { FabricIdentityProfile } from "./identity-profile"
import { FabricIdentityTokens } from "./identity-token"
import { FabricIdentityHttps } from "./identity-https"
import type { FabricIdentityDiscoveryContract } from "./identity-discovery-contract"

const Metadata = Schema.Struct({
  issuer: Schema.Literal("https://login.microsoftonline.com/{tenantid}/v2.0"),
  jwks_uri: Schema.Literal(FabricIdentityHttps.endpoints.keys),
  authorization_endpoint: Schema.Literal("https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize"),
  token_endpoint: Schema.Literal("https://login.microsoftonline.com/organizations/oauth2/v2.0/token"),
  id_token_signing_alg_values_supported: Schema.Array(Schema.String),
})
const RemoteKeys = Schema.Struct({
  keys: Schema.Array(
    Schema.Struct({
      cloud_instance_name: Schema.optional(Schema.Literal("microsoftonline.com")),
      issuer: Schema.String.check(
        Schema.isPattern(
          /^https:\/\/login\.microsoftonline\.com\/(?:\{tenantid\}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/v2\.0(?![\s\S])/,
        ),
      ),
    }),
  ).check(Schema.isLengthBetween(1, 32)),
})
const json = Schema.decodeUnknownOption(Schema.UnknownFromJsonString)

/** Local host composition only. A loaded verifier is neither operator authority nor Fabric access. */
export const make: FabricIdentityDiscoveryContract.Factory = (options) => {
  const profile = options.profile
  const network = options.network ? { ...options.network } : undefined
  const timeoutMs = options.timeoutMs ?? 10000
  return Effect.gen(function* () {
    if (
      !FabricIdentityProfile.isAdmitted(profile) ||
      !Number.isSafeInteger(timeoutMs) ||
      timeoutMs < 100 ||
      timeoutMs > 10000 ||
      (network !== undefined && !FabricIdentityHttps.validNetwork(network))
    )
      return yield* failure("invalid-input")
    const load: FabricIdentityDiscoveryContract.Interface["load"] = () =>
      Effect.gen(function* () {
        const text = yield* FabricIdentityHttps.read("metadata", { network, timeoutMs })
        const parsed = json(text)
        const metadata = Option.isSome(parsed) ? Schema.decodeUnknownOption(Metadata)(parsed.value) : Option.none()
        if (Option.isNone(metadata) || !metadata.value.id_token_signing_alg_values_supported.includes("RS256"))
          return yield* failure("denied")
        // Use the compiled endpoint, never metadata to choose a request target, even after validation.
        const keys = json(yield* FabricIdentityHttps.read("keys", { network, timeoutMs }))
        if (Option.isNone(keys) || !Schema.is(RemoteKeys)(keys.value)) return yield* failure("denied")
        // One documented public-cloud hint is discarded; retain every other field so IDV still rejects private/unknown data.
        const normalized = {
          ...keys.value,
          keys: keys.value.keys.map((key) =>
            Object.fromEntries(Object.entries(key).filter(([name]) => name !== "cloud_instance_name")),
          ),
        }
        return yield* FabricIdentityTokens.make({ profile, keys: normalized }).pipe(
          Effect.mapError(() => failure("denied")),
        )
      })
    return Object.freeze({ load }) satisfies FabricIdentityDiscoveryContract.Interface
  })
}

function failure(code: "invalid-input" | "denied") {
  return new FabricIdentityTokens.Failure({
    code,
    message:
      code === "invalid-input" ? "Fabric identity discovery input is invalid" : "Fabric identity discovery is denied",
  })
}
