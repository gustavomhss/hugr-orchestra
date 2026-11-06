export * as FabricIdentityMaterial from "./identity-material"

import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import { Effect, Schema } from "effect"
import { createHash, randomBytes } from "node:crypto"
import { FabricIdentityAttemptAccess } from "./identity-attempt-access"
import type { FabricIdentityProfile } from "./identity-profile"

const opaque = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}(?![\s\S])/))
export const Material = Schema.Struct({
  correlationID: Schema.String.check(
    Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/i),
  ),
  state: opaque,
  nonce: opaque,
  challenge: opaque,
  verifier: Schema.String.check(Schema.isPattern(/^[A-Za-z0-9._~-]{43,128}(?![\s\S])/)),
})
export type Material = typeof Material.Type

/** Host-private material only. The caller owns current authorization and must never project this into a tool/DTO. */
export const create = () =>
  Effect.tryPromise({
    try: async () => {
      const { CryptoProvider } = await import("@azure/msal-node")
      const provider = new CryptoProvider()
      const codes = await provider.generatePkceCodes()
      return {
        correlationID: provider.createNewGuid(),
        state: randomBytes(32).toString("base64url"),
        nonce: randomBytes(32).toString("base64url"),
        verifier: codes.verifier,
        challenge: codes.challenge,
      }
    },
    catch: () => FabricIdentityAttemptAccess.failure("unavailable"),
  })

export function valid(material: Material) {
  return (
    material.state !== material.nonce &&
    material.challenge === createHash("sha256").update(material.verifier).digest("base64url")
  )
}

/** URL construction only, including server registrations. Confidential exchange still requires a real CCA credential. */
export function authorizationURL(
  profile: FabricIdentityProfile.Profile,
  scopes: FabricIdentityAttempt.Scopes,
  material: Material,
) {
  return Effect.tryPromise({
    try: async () => {
      const { PublicClientApplication } = await import("@azure/msal-node")
      const refuse = async () => {
        throw new Error("Fabric identity URL discovery is unavailable")
      }
      const app = new PublicClientApplication({
        auth: { clientId: profile.clientID, authority: "https://login.microsoftonline.com/organizations" },
        system: {
          disableInternalRetries: true,
          loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} },
          networkClient: { sendGetRequestAsync: refuse, sendPostRequestAsync: refuse },
        },
      })
      const result = await app.getAuthCodeUrl({
        correlationId: material.correlationID,
        redirectUri: profile.redirectUri,
        scopes: [...scopes],
        state: material.state,
        nonce: material.nonce,
        codeChallenge: material.challenge,
        codeChallengeMethod: "S256",
        prompt: "select_account",
      })
      const url = new URL(result)
      if (
        Buffer.byteLength(result) > 16 * 1024 ||
        url.origin !== "https://login.microsoftonline.com" ||
        url.pathname !== "/organizations/oauth2/v2.0/authorize" ||
        url.username ||
        url.password ||
        url.hash ||
        url.searchParams.get("redirect_uri") !== profile.redirectUri ||
        url.searchParams.get("state") !== material.state ||
        url.searchParams.get("nonce") !== material.nonce ||
        url.searchParams.get("code_challenge") !== material.challenge ||
        url.searchParams.get("code_challenge_method") !== "S256" ||
        url.searchParams.get("response_type") !== "code"
      )
        throw new Error("Fabric identity authorization URL is unavailable")
      return result
    },
    catch: () => FabricIdentityAttemptAccess.failure("unavailable"),
  })
}
