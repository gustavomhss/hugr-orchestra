import { expect, test } from "bun:test"
import { ConfidentialClientApplication } from "@azure/msal-node"
import { Effect } from "effect"
import { FabricIdentityAttempts } from "../src/identity-attempt"
import { FabricIdentityPreparation } from "../src/identity-preparation"
import { FabricIdentityProfile } from "../src/identity-profile"
import { fixtures } from "./fixture/context"
import { setup } from "./fixture/identity-attempt"
import { layers } from "./fixture/identity-preparation"

const cases = fixtures()

test("PKP09 server URL matches the real confidential builder's public parameters without a runtime client secret", () => {
  const f = cases.box()
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* setup(f.root)
        const admitted = FabricIdentityProfile.admit({
          deployment: "server",
          clientID: s.host.clientID,
          origin: "https://orchestra.example.test",
          redirectUri: "https://orchestra.example.test/api/fabric/oauth/callback",
        })
        if (!admitted.ok) throw new Error("Confidential profile control was refused")
        const options = { operators: s.operators, root: f.root, profile: admitted.value }
        const attempts = yield* FabricIdentityAttempts.make(options)
        const attempt = yield* s.run(attempts.begin(s.input))
        const service = yield* FabricIdentityPreparation.make(options)
        const ready = yield* s.run(service.prepare({ context: s.input.context, attempt }))
        const actual = new URL(ready.authorizationURL)
        const calls: string[] = []
        const client = new ConfidentialClientApplication({
          auth: {
            clientId: admitted.value.clientID,
            authority: "https://login.microsoftonline.com/organizations",
            clientSecret: "SYNTHETIC_CCA_TEST_ONLY_NOT_RUNTIME",
          },
          system: {
            disableInternalRetries: true,
            loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} },
            networkClient: {
              sendGetRequestAsync: async (url) => {
                calls.push(url)
                throw new Error("PKP_NETWORK_BLOCKED")
              },
              sendPostRequestAsync: async (url) => {
                calls.push(url)
                throw new Error("PKP_NETWORK_BLOCKED")
              },
            },
          },
        })
        const reference = new URL(
          yield* Effect.tryPromise(() =>
            client.getAuthCodeUrl({
              scopes: [...s.input.scopes],
              redirectUri: admitted.value.redirectUri,
              state: actual.searchParams.get("state")!,
              nonce: actual.searchParams.get("nonce")!,
              codeChallenge: actual.searchParams.get("code_challenge")!,
              codeChallengeMethod: "S256",
              prompt: "select_account",
            }),
          ),
        )
        expect(actual.origin + actual.pathname).toBe(reference.origin + reference.pathname)
        for (const key of [
          "client_id",
          "redirect_uri",
          "state",
          "nonce",
          "code_challenge",
          "code_challenge_method",
          "response_type",
          "response_mode",
          "prompt",
        ])
          expect(actual.searchParams.get(key)).toBe(reference.searchParams.get(key))
        expect(actual.searchParams.get("scope")?.split(" ").sort()).toEqual(
          reference.searchParams.get("scope")?.split(" ").sort(),
        )
        expect(ready.authorizationURL).not.toContain("SYNTHETIC_CCA")
        expect(calls).toEqual([])
      }),
    ).pipe(Effect.provide(layers(f.filename))),
  )
})
