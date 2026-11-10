import { Effect } from "effect"
import { FabricIdentityMaterial } from "../../src/identity-material"
import { FabricIdentityMsal } from "../../src/identity-msal"
import { FabricIdentityProfile } from "../../src/identity-profile"
import { FabricIdentityTokenHttp } from "../../src/identity-token-http"
import { FabricIdentityTokens } from "../../src/identity-token"
import { scopes } from "./identity-attempt"
import { discoveryFixture } from "./identity-discovery"
import { objectID, tenant, tokenFixture } from "./identity-token"

export function msalSetup(server = false, timeoutMs?: number) {
  return Effect.gen(function* () {
    const signing = yield* Effect.promise(tokenFixture)
    const admitted = server
      ? FabricIdentityProfile.admit({
          deployment: "server",
          clientID: signing.host.clientID,
          origin: "https://orchestra.example.test",
          redirectUri: "https://orchestra.example.test/api/fabric/oauth/callback",
        })
      : undefined
    if (admitted && !admitted.ok) throw new Error("Server profile control must be admitted")
    const profile = admitted?.ok ? admitted.value : signing.host
    const clock = { value: Date.now() }
    const pkce = yield* FabricIdentityMaterial.create()
    const material = Object.freeze({
      verifier: pkce.verifier,
      nonce: pkce.nonce,
      correlationID: pkce.correlationID,
      scopes,
      redirectUri: profile.redirectUri,
      createdAt: clock.value,
      expiresAt: clock.value + 600000,
    })
    const state = {
      claims: {} as Record<string, unknown>,
      response: {} as Record<string, unknown>,
      homeUID: objectID,
      homeTenant: tenant,
    }
    const f = yield* discoveryFixture(
      { keys: [signing.key] },
      {
        token: async () => ({
          token_type: "Bearer",
          scope: scopes.join(" "),
          expires_in: 3600,
          ext_expires_in: 3600,
          access_token: "SYNTHETIC_MXC_ACCESS_TOKEN",
          refresh_token: "SYNTHETIC_MXC_REFRESH_TOKEN",
          id_token: await signing.sign({
            nonce: material.nonce,
            iat: Math.floor(clock.value / 1000),
            nbf: Math.floor(clock.value / 1000),
            exp: Math.floor(clock.value / 1000) + 3600,
            ...state.claims,
          }),
          client_info: Buffer.from(JSON.stringify({ uid: state.homeUID, utid: state.homeTenant })).toString(
            "base64url",
          ),
          ...state.response,
        }),
      },
    )
    clock.value = Date.now()
    const verifier = yield* FabricIdentityTokens.make({
      profile,
      keys: { keys: [signing.key] },
      now: () => clock.value,
    })
    const transport = yield* FabricIdentityTokenHttp.make({ network: f.network, timeoutMs })
    const options = {
      profile,
      verifier,
      transport,
      ...(server ? { certificate: f.hostCertificate } : {}),
      now: () => clock.value,
    }
    const client = yield* FabricIdentityMsal.make(options)
    const input = { code: "SYNTHETIC_MXC_AUTHORIZATION_CODE", material }
    return { signing, profile, clock, material, state, f, verifier, transport, options, client, input }
  })
}
