export * as FabricIdentityMsal from "./identity-msal"

import { createPrivateKey, createPublicKey, timingSafeEqual, X509Certificate } from "node:crypto"
import { Effect, Option, Schema } from "effect"
import type { INetworkModule, NetworkRequestOptions, NetworkResponse } from "@azure/msal-node"
import { FabricIdentityProfile } from "./identity-profile"
import { FabricIdentityMaterial } from "./identity-material"
import { FabricIdentityTokens } from "./identity-token"
import { FabricIdentityAttempt } from "@orchestra/schema/fabric-identity-attempt"
import { FabricIdentityHttps } from "./identity-https"
import type { FabricIdentityMsalContract } from "./identity-msal-contract"

const uuid = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/),
)
const Material = Schema.Struct({
  verifier: FabricIdentityMaterial.Material.fields.verifier,
  nonce: FabricIdentityMaterial.Material.fields.nonce,
  correlationID: FabricIdentityMaterial.Material.fields.correlationID,
  scopes: FabricIdentityAttempt.Scopes,
  redirectUri: Schema.String,
  createdAt: Schema.Number,
  expiresAt: Schema.Number,
})
const Input = Schema.Struct({
  code: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8192)),
  material: Material,
  tenantID: Schema.optional(uuid),
  objectID: Schema.optional(uuid),
})
const Token = Schema.Struct({
  token_type: Schema.Literal("Bearer"),
  scope: Schema.String,
  expires_in: Schema.Number,
  access_token: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(65536)),
  id_token: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(65536)),
})

/** Isolated MSAL producer. The future contextual host owns ticket consumption, authority and durable cache publication. */
export const make: FabricIdentityMsalContract.Factory = (options) => {
  const profile = options.profile
  const verifier = options.verifier
  const transport = Object.freeze({ ...options.transport })
  const certificate = options.certificate ? { ...options.certificate } : undefined
  const now = options.now ?? Date.now
  return Effect.gen(function* () {
    if (!FabricIdentityProfile.isAdmitted(profile) || (profile.deployment === "server") !== !!certificate)
      return yield* failure("invalid-input")
    const initial = yield* Effect.try({ try: now, catch: () => failure("unavailable") })
    if (!Number.isSafeInteger(initial) || initial < 0 || initial > 8640000000000000)
      return yield* failure("unavailable")
    const credential = certificate
      ? yield* Effect.try({ try: () => admitCertificate(certificate, initial), catch: () => failure("invalid-input") })
      : undefined
    const { PublicClientApplication, ConfidentialClientApplication } = yield* Effect.tryPromise({
      try: () => import("@azure/msal-node"),
      catch: () => failure("unavailable"),
    })
    const exchange: FabricIdentityMsalContract.Interface["exchange"] = (supplied) => {
      const decoded = Schema.decodeUnknownOption(Input)(supplied, { onExcessProperty: "error" })
      const input = Option.isSome(decoded) ? structuredClone(decoded.value) : undefined
      const state = { started: false }
      return Effect.gen(function* () {
        if (state.started) return yield* failure("unavailable")
        state.started = true
        if (
          !input ||
          Buffer.byteLength(input.code) > 8192 ||
          /[\u0000-\u001f\u007f]/.test(input.code) ||
          input.material.redirectUri !== profile.redirectUri
        )
          return yield* failure("invalid-input")
        const at = yield* Effect.try({ try: now, catch: () => failure("unavailable") })
        if (!Number.isSafeInteger(at) || at < 0 || at > 8640000000000000) return yield* failure("unavailable")
        if (credential && (at < credential.validFrom || at >= credential.validUntil))
          return yield* failure("invalid-input")
        if (
          !Number.isSafeInteger(input.material.createdAt) ||
          input.material.createdAt < 0 ||
          !Number.isSafeInteger(input.material.expiresAt) ||
          input.material.createdAt > at ||
          input.material.expiresAt !== input.material.createdAt + 600000 ||
          at >= input.material.expiresAt
        )
          return yield* failure("invalid-input")
        const abort = yield* Effect.acquireRelease(
          Effect.sync(() => new AbortController()),
          (abort) => Effect.sync(() => abort.abort()),
        )
        const bound = transport.bind(abort.signal)
        const delivery = { sent: false, error: undefined as FabricIdentityTokens.Failure | undefined, active: true }
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => {
            delivery.active = false
          }),
        )
        const networkClient: INetworkModule = {
          sendGetRequestAsync: async () => {
            delivery.error = failure("unavailable")
            throw delivery.error
          },
          sendPostRequestAsync: async <T>(
            url: string,
            request?: NetworkRequestOptions,
          ): Promise<NetworkResponse<T>> => {
            if (
              !delivery.active ||
              delivery.sent ||
              url !== FabricIdentityHttps.tokenEndpoint + "?client-request-id=" + input.material.correlationID
            ) {
              delivery.error = failure("unavailable")
              throw delivery.error
            }
            delivery.sent = true
            const response = await bound.sendPostRequestAsync<T>(url, request).catch(() => {
              delivery.error = failure("unavailable")
              throw delivery.error
            })
            if (!delivery.active) {
              delivery.error = failure("unavailable")
              throw delivery.error
            }
            if (response.status !== 200) {
              delivery.error = failure("denied")
              throw delivery.error
            }
            const token = Schema.decodeUnknownOption(Token)(response.body)
            if (
              Option.isNone(token) ||
              !Number.isSafeInteger(token.value.expires_in) ||
              token.value.expires_in <= 0 ||
              token.value.scope.length > 4096 ||
              input.material.scopes.some((scope) => !token.value.scope.split(" ").includes(scope)) ||
              token.value.scope
                .split(" ")
                .some(
                  (scope) =>
                    ![...input.material.scopes, "openid", "profile", "offline_access", "email"].includes(scope),
                )
            ) {
              delivery.error = failure("denied")
              throw delivery.error
            }
            return response
          },
        }
        const config = {
          auth: { clientId: profile.clientID, authority: "https://login.microsoftonline.com/organizations" },
          system: {
            networkClient,
            disableInternalRetries: true,
            loggerOptions: { piiLoggingEnabled: false, loggerCallback: () => {} },
          },
        }
        const app = credential
          ? new ConfidentialClientApplication({ ...config, auth: { ...config.auth, clientCertificate: credential } })
          : new PublicClientApplication(config)
        const result = yield* Effect.tryPromise({
          try: () =>
            app.acquireTokenByCode({
              code: input.code,
              codeVerifier: input.material.verifier,
              nonce: input.material.nonce,
              redirectUri: profile.redirectUri,
              scopes: [...input.material.scopes],
              correlationId: input.material.correlationID,
            }),
          catch: (error) =>
            delivery.error ??
            (error instanceof Error && "errorCode" in error && error.errorCode === "nonce_mismatch"
              ? failure("denied")
              : failure("unavailable")),
        })
        const proof = yield* verifier.verify({
          token: result.idToken,
          nonce: input.material.nonce,
          createdAt: input.material.createdAt,
          tenantID: input.tenantID,
          objectID: input.objectID,
        })
        const after = yield* Effect.try({ try: now, catch: () => failure("unavailable") })
        if (!Number.isSafeInteger(after) || after < at || after > 8640000000000000) return yield* failure("unavailable")
        if (
          !delivery.active ||
          !verifier.owns(proof) ||
          proof.clientID !== profile.clientID ||
          !result.account ||
          result.tenantId !== proof.tenantID ||
          result.uniqueId !== proof.objectID ||
          result.account.tenantId !== proof.tenantID ||
          result.account.localAccountId !== proof.objectID ||
          !["login.microsoftonline.com", "login.windows.net"].includes(result.account.environment) ||
          !/^[A-Za-z0-9._-]{1,512}(?![\s\S])/.test(result.account.homeAccountId) ||
          result.tokenType !== "Bearer" ||
          !result.expiresOn ||
          !Number.isSafeInteger(result.expiresOn.getTime()) ||
          result.expiresOn.getTime() <= after ||
          input.material.scopes.some((scope) => !result.scopes.includes(scope)) ||
          after >= input.material.expiresAt ||
          (credential && after >= credential.validUntil)
        )
          return yield* failure("denied")
        const serialized = yield* Effect.try({
          try: () => app.getTokenCache().serialize(),
          catch: () => failure("unavailable"),
        })
        if (!serialized || Buffer.byteLength(serialized) > 1048576) return yield* failure("unavailable")
        return Object.freeze({
          proof,
          account: Object.freeze({
            homeAccountID: result.account.homeAccountId,
            tenantID: proof.tenantID,
            objectID: proof.objectID,
            environment: "login.microsoftonline.com" as const,
          }),
          cache: Object.freeze({ format: "msal-node" as const, version: 1 as const, serialized }),
        })
      }).pipe(Effect.scoped)
    }
    return Object.freeze({ exchange }) satisfies FabricIdentityMsalContract.Interface
  })
}

function admitCertificate(
  input: NonNullable<Parameters<FabricIdentityMsalContract.Factory>[0]["certificate"]>,
  at: number,
) {
  if (
    typeof input.certificate !== "string" ||
    typeof input.privateKey !== "string" ||
    Buffer.byteLength(input.certificate) > 16384 ||
    Buffer.byteLength(input.privateKey) > 16384 ||
    !Number.isSafeInteger(at)
  )
    throw failure("invalid-input")
  const certificate = new X509Certificate(input.certificate)
  const privateKey = createPrivateKey(input.privateKey)
  const publicKey = createPublicKey(privateKey).export({ format: "der", type: "spki" })
  const expected = certificate.publicKey.export({ format: "der", type: "spki" })
  const from = Date.parse(certificate.validFrom)
  const until = Date.parse(certificate.validTo)
  if (
    privateKey.asymmetricKeyType !== "rsa" ||
    !privateKey.asymmetricKeyDetails?.modulusLength ||
    privateKey.asymmetricKeyDetails.modulusLength < 2048 ||
    privateKey.asymmetricKeyDetails.modulusLength > 4096 ||
    !Number.isSafeInteger(from) ||
    !Number.isSafeInteger(until) ||
    from > at ||
    until <= at ||
    publicKey.length !== expected.length ||
    !timingSafeEqual(publicKey, expected)
  )
    throw failure("invalid-input")
  return {
    thumbprintSha256: certificate.fingerprint256.replaceAll(":", ""),
    privateKey: input.privateKey,
    validFrom: from,
    validUntil: until,
  }
}

function failure(code: FabricIdentityTokens.Failure["code"]) {
  return new FabricIdentityTokens.Failure({
    code,
    message:
      code === "denied"
        ? "Fabric identity exchange is denied"
        : code === "invalid-input"
          ? "Fabric identity exchange input is invalid"
          : "Fabric identity exchange is unavailable",
  })
}
