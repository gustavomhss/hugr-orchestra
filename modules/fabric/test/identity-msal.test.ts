import { expect, test } from "bun:test"
import { X509Certificate } from "node:crypto"
import { AppProcess } from "@orchestra/core/process"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { Effect, Exit } from "effect"
import { importJWK, jwtVerify } from "jose"
import { PublicClientApplication } from "@azure/msal-node"
import { FabricIdentityMsal } from "../src/identity-msal"
import { msalSetup } from "./fixture/identity-msal"
import { objectID, tenant, tokenFixture, tokenRefusal } from "./fixture/identity-token"

const layer = LayerNode.compile(LayerNode.group([AppProcess.node]))

test("MXC01 real PCA sends the protected form over TLS and emits verified identity plus a roundtrippable opaque cache candidate", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* msalSetup()
        const candidate = yield* s.client.exchange(s.input)
        expect(s.verifier.owns(candidate.proof)).toBe(true)
        expect(candidate.proof.objectID).toBe(objectID)
        expect(candidate.account).toEqual({
          homeAccountID: objectID + "." + tenant,
          tenantID: tenant,
          objectID,
          environment: "login.microsoftonline.com",
        })
        expect(Object.isFrozen(candidate)).toBe(true)
        expect(s.f.observed).toHaveLength(1)
        const request = s.f.observed[0]!
        expect(request.method).toBe("POST")
        expect(request.path).toBe("/organizations/oauth2/v2.0/token")
        const form = new URLSearchParams(request.body)
        expect(form.get("code")).toBe(s.input.code)
        expect(form.get("code_verifier")).toBe(s.material.verifier)
        expect(form.get("redirect_uri")).toBe(s.profile.redirectUri)
        expect(form.get("client_id")).toBe(s.profile.clientID)
        expect(form.get("grant_type")).toBe("authorization_code")
        expect(form.get("scope")?.split(" ")).toContain(s.material.scopes[0])
        expect(form.has("client_secret")).toBe(false)
        expect(form.has("client_assertion")).toBe(false)
        expect(request.headers.authorization).toBeUndefined()
        expect(request.headers.cookie).toBeUndefined()
        expect(request.clientCertificate).toBe(false)
        expect(candidate.cache.format).toBe("msal-node")
        expect(candidate.cache.version).toBe(1)
        expect(candidate.cache.serialized).toContain("SYNTHETIC_MXC_REFRESH_TOKEN")
        const cache = new PublicClientApplication({
          auth: { clientId: s.profile.clientID },
          system: {
            networkClient: s.transport,
            loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} },
          },
        }).getTokenCache()
        cache.deserialize(candidate.cache.serialized)
        expect(cache.serialize()).toBe(candidate.cache.serialized)
        expect((yield* Effect.promise(() => cache.getAllAccounts())).map((account) => account.localAccountId)).toEqual([
          objectID,
        ])
        expect(JSON.stringify({ proof: candidate.proof, account: candidate.account })).not.toContain("SYNTHETIC_MXC_")
      }),
    ).pipe(Effect.provide(layer)),
  )
})

test("MXC02 real CCA signs an assertion with the host certificate; public profile never admits confidential credentials", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* msalSetup(true)
        yield* s.client.exchange(s.input)
        expect(s.f.observed).toHaveLength(1)
        const form = new URLSearchParams(s.f.observed[0]!.body)
        const assertion = form.get("client_assertion")
        if (!assertion) throw new Error("Real confidential MSAL exchange must send a signed assertion")
        const publicKey = yield* Effect.promise(() =>
          importJWK(new X509Certificate(s.f.hostCertificate.certificate).publicKey.export({ format: "jwk" }), "RS256"),
        )
        const signed = yield* Effect.promise(() =>
          jwtVerify(assertion, publicKey, {
            audience: "https://login.microsoftonline.com/organizations/oauth2/v2.0/token",
          }),
        )
        expect(signed.payload.iss).toBe(s.profile.clientID)
        expect(signed.payload.sub).toBe(s.profile.clientID)
        expect(s.f.observed[0]!.body).not.toContain("PRIVATE KEY")
        expect(s.f.observed[0]!.clientCertificate).toBe(false)
        const desktop = s.signing.host
        yield* Effect.promise(() =>
          tokenRefusal(FabricIdentityMsal.make({ ...s.options, profile: desktop }), "invalid-input"),
        )
        yield* Effect.promise(() =>
          tokenRefusal(FabricIdentityMsal.make({ ...s.options, certificate: undefined }), "invalid-input"),
        )
      }),
    ).pipe(Effect.provide(layer)),
  )
})

test("MXC03 real signed response inconsistencies or forged signatures do not yield identity/cache candidates", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* msalSetup()
        yield* s.client.exchange(s.input)
        for (const claims of [
          { nonce: "B".repeat(43) },
          { aud: "other-client" },
          { iss: "https://evil.invalid" },
          { oid: undefined },
        ]) {
          s.state.claims = claims
          yield* Effect.promise(() => tokenRefusal(s.client.exchange(s.input), "denied"))
        }
        s.state.claims = {}
        const other = yield* Effect.promise(tokenFixture)
        s.state.response = {
          id_token: yield* Effect.promise(() =>
            other.sign({
              nonce: s.material.nonce,
              iat: Math.floor(s.clock.value / 1000),
              nbf: Math.floor(s.clock.value / 1000),
              exp: Math.floor(s.clock.value / 1000) + 3600,
            }),
          ),
        }
        yield* Effect.promise(() => tokenRefusal(s.client.exchange(s.input), "denied"))
        for (const response of [
          { scope: "https://graph.microsoft.com/Mail.Read" },
          { token_type: "Unknown" },
          { expires_in: -1 },
        ]) {
          s.state.response = response
          yield* Effect.promise(() => tokenRefusal(s.client.exchange(s.input), "denied"))
        }
      }),
    ).pipe(Effect.provide(layer)),
  )
})

test("MXC04 HTTP failure or redirect never retries the authorization code and errors redact sensitive material", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* msalSetup()
        yield* s.client.exchange(s.input)
        for (const mode of ["status", "redirect", "partial", "overflow"]) {
          s.f.state.mode = mode
          const before = s.f.observed.length
          const failure = yield* Effect.promise(() => tokenRefusal(s.client.exchange(s.input), "unavailable"))
          expect(s.f.observed.length - before).toBe(1)
          for (const secret of [s.input.code, s.material.verifier, s.material.nonce, "SYNTHETIC_MXC_REFRESH_TOKEN"])
            expect(JSON.stringify(failure)).not.toContain(secret)
        }
      }),
    ).pipe(Effect.provide(layer)),
  )
})

test("MXC05 operation values are captured and repeating the same Effect cannot send a second provider request", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* msalSetup()
        const input = { ...s.input, material: { ...s.material } }
        const operation = s.client.exchange(input)
        input.code = "PRIVATE_RETARGETED_CODE"
        input.material.nonce = "B".repeat(43)
        yield* operation
        expect(new URLSearchParams(s.f.observed[0]!.body).get("code")).toBe(s.input.code)
        const before = s.f.observed.length
        const again = yield* Effect.exit(operation)
        expect(Exit.isFailure(again)).toBe(true)
        expect(s.f.observed).toHaveLength(before)
        const get = yield* Effect.exit(
          Effect.tryPromise(() => s.transport.sendGetRequestAsync("https://never-follow.invalid/discovery")),
        )
        expect(Exit.isFailure(get)).toBe(true)
        expect(s.f.observed).toHaveLength(before)
      }),
    ).pipe(Effect.provide(layer)),
  )
})

test("MXC06 a guest's opaque home identity is not substituted for the signed resource tenant/object identity", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const s = yield* msalSetup()
        s.state.homeUID = "44444444-5555-4666-8777-888888888888"
        s.state.homeTenant = "55555555-6666-4777-8888-999999999999"
        s.state.claims = { preferred_username: "PRIVATE_MUTABLE_LABEL", name: "PRIVATE_NAME", roles: ["Fabric.Admin"] }
        const candidate = yield* s.client.exchange(s.input)
        expect(candidate.account.homeAccountID).toBe(s.state.homeUID + "." + s.state.homeTenant)
        expect(candidate.account.tenantID).toBe(tenant)
        expect(candidate.account.objectID).toBe(objectID)
        expect(candidate.proof.tenantID).toBe(tenant)
        expect(candidate.proof.objectID).toBe(objectID)
        expect(JSON.stringify({ proof: candidate.proof, account: candidate.account })).not.toContain("PRIVATE_")
      }),
    ).pipe(Effect.provide(layer)),
  )
})
