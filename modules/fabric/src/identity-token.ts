export * as FabricIdentityTokens from "./identity-token"

import { timingSafeEqual } from "node:crypto"
import { Effect, Option, Schema } from "effect"
import { FabricIdentityProfile } from "./identity-profile"
import type { FabricIdentityTokensContract } from "./identity-token-contract"

export class Failure extends Schema.TaggedErrorClass<Failure>()("FabricIdentityToken.Failure", {
  code: Schema.Literals(["invalid-input", "denied", "unavailable"]),
  message: Schema.String,
}) {}

const uuid = Schema.String.check(
  Schema.isPattern(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![\s\S])/),
)
const opaque = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9_-]{43}(?![\s\S])/))
const kid = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256))
const Key = Schema.Struct({
  kty: Schema.Literal("RSA"),
  kid,
  n: Schema.String.check(Schema.isMaxLength(684)),
  e: Schema.Literal("AQAB"),
  alg: Schema.optional(Schema.Literal("RS256")),
  use: Schema.optional(Schema.Literal("sig")),
  key_ops: Schema.optional(Schema.Array(Schema.Literal("verify")).check(Schema.isLengthBetween(1, 1))),
  issuer: Schema.optional(Schema.String.check(Schema.isMaxLength(256))),
  x5c: Schema.optional(
    Schema.Array(
      Schema.String.check(
        Schema.isMinLength(1),
        Schema.isMaxLength(8192),
        Schema.isPattern(/^[A-Za-z0-9+/]+={0,2}(?![\s\S])/),
      ),
    ).check(Schema.isLengthBetween(1, 5)),
  ),
  x5t: Schema.optional(Schema.String.check(Schema.isMaxLength(86), Schema.isPattern(/^[A-Za-z0-9_-]+(?![\s\S])/))),
  "x5t#S256": Schema.optional(
    Schema.String.check(Schema.isMaxLength(86), Schema.isPattern(/^[A-Za-z0-9_-]+(?![\s\S])/)),
  ),
})
const Keys = Schema.Struct({ keys: Schema.Array(Key).check(Schema.isLengthBetween(1, 32)) })
const Input = Schema.Struct({
  token: Schema.String,
  nonce: opaque,
  createdAt: Schema.Number,
  tenantID: Schema.optional(uuid),
  objectID: Schema.optional(uuid),
})
const Header = Schema.Struct({ alg: Schema.Literal("RS256"), typ: Schema.Literal("JWT"), kid })
const Claims = Schema.Struct({
  ver: Schema.Literal("2.0"),
  aud: Schema.String,
  tid: uuid,
  oid: uuid,
  iss: Schema.String,
  sub: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1024)),
  nonce: opaque,
  iat: Schema.Number,
  nbf: Schema.Number,
  exp: Schema.Number,
})
const consumer = "9188040d-6c67-4c5b-b112-36a304b66dad"

/** Host-owned local keys only. No OIDC/JWKS transport, access token validation, operator authority or Fabric permission. */
export const make: FabricIdentityTokensContract.Factory = (options) => {
  const profile = options.profile
  const now = options.now ?? Date.now
  // Capture config now, not when this reusable Effect is eventually scheduled by its caller.
  const decoded = Schema.decodeUnknownOption(Keys)(options.keys, { onExcessProperty: "error" })
  const keys = Option.isSome(decoded)
    ? decoded.value.keys.map((key) => ({
        ...key,
        x5c: key.x5c ? [...key.x5c] : undefined,
        key_ops: key.key_ops ? [...key.key_ops] : undefined,
      }))
    : undefined
  return Effect.gen(function* () {
    if (
      !FabricIdentityProfile.isAdmitted(profile) ||
      !keys ||
      Buffer.byteLength(JSON.stringify(keys)) > 262144 ||
      new Set(keys.map((key) => key.kid)).size !== keys.length ||
      keys.some((key) => !validModulus(key.n))
    )
      return yield* failure("invalid-input")
    const { importJWK, decodeProtectedHeader, jwtVerify } = yield* Effect.tryPromise({
      try: () => import("jose"),
      catch: () => failure("unavailable"),
    })
    const imported = yield* Effect.tryPromise({
      try: () =>
        Promise.all(
          keys.map(async (key) => ({
            kid: key.kid,
            issuer: key.issuer,
            key: await importJWK({ kty: "RSA", n: key.n, e: key.e, alg: "RS256" }, "RS256"),
          })),
        ),
      catch: () => failure("invalid-input"),
    })
    const proofs = new WeakSet<FabricIdentityTokensContract.Proof>()
    const verify: FabricIdentityTokensContract.Interface["verify"] = (supplied) => {
      const decoded = Schema.decodeUnknownOption(Input)(supplied, { onExcessProperty: "error" })
      const input = Option.isSome(decoded) ? { ...decoded.value } : undefined
      return Effect.gen(function* () {
        if (!input || !timestamp(input.createdAt) || !canonicalNonce(input.nonce))
          return yield* failure("invalid-input")
        const at = yield* Effect.try({ try: now, catch: () => failure("unavailable") })
        if (!timestamp(at)) return yield* failure("unavailable")
        if (input.createdAt > at) return yield* failure("invalid-input")
        if (
          Buffer.byteLength(input.token) > 65536 ||
          !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?![\s\S])/.test(input.token)
        )
          return yield* failure("denied")
        const header = yield* Effect.try({
          try: () =>
            Schema.decodeUnknownOption(Header)(decodeProtectedHeader(input.token), { onExcessProperty: "error" }),
          catch: () => failure("denied"),
        })
        if (Option.isNone(header)) return yield* failure("denied")
        const key = imported.find((key) => key.kid === header.value.kid)
        if (!key) return yield* failure("denied")
        const verified = yield* Effect.tryPromise({
          try: () =>
            jwtVerify(input.token, key.key, {
              algorithms: ["RS256"],
              currentDate: new Date(at),
              clockTolerance: 60,
            }),
          catch: () => failure("denied"),
        })
        // Display/distributed claims are ignored, never fetched or copied into a proof.
        const claims = Schema.decodeUnknownOption(Claims)(verified.payload)
        if (Option.isNone(claims)) return yield* failure("denied")
        const value = claims.value
        const issuer = `https://login.microsoftonline.com/${value.tid}/v2.0`
        if (
          value.aud !== profile.clientID ||
          value.tid === consumer ||
          value.iss !== issuer ||
          (key.issuer !== undefined &&
            key.issuer !== issuer &&
            key.issuer !== "https://login.microsoftonline.com/{tenantid}/v2.0") ||
          (input.tenantID !== undefined && input.tenantID !== value.tid) ||
          (input.objectID !== undefined && input.objectID !== value.oid) ||
          !timingSafeEqual(Buffer.from(input.nonce), Buffer.from(value.nonce))
        )
          return yield* failure("denied")
        if (
          ![value.iat, value.nbf, value.exp].every((time) => Number.isSafeInteger(time) && timestamp(time * 1000)) ||
          value.exp * 1000 <= at ||
          value.exp <= value.iat ||
          value.exp <= value.nbf ||
          value.iat * 1000 > at + 60000 ||
          value.nbf * 1000 > at + 60000 ||
          value.iat * 1000 < input.createdAt - 60000
        )
          return yield* failure("denied")
        const proof = Object.freeze({
          clientID: profile.clientID,
          issuer,
          tenantID: value.tid,
          objectID: value.oid,
          subject: value.sub,
          expiresAt: value.exp * 1000,
        })
        proofs.add(proof)
        return proof
      })
    }
    return Object.freeze({
      verify,
      owns: (input: unknown): input is FabricIdentityTokensContract.Proof =>
        typeof input === "object" && input !== null && proofs.has(input as FabricIdentityTokensContract.Proof),
    })
  })
}

function validModulus(value: string) {
  if (!/^[A-Za-z0-9_-]+(?![\s\S])/.test(value)) return false
  const bytes = Buffer.from(value, "base64url")
  if (!bytes[0] || bytes.toString("base64url") !== value) return false
  const bits = bytes.length * 8 - Math.clz32(bytes[0]) + 24
  return bits >= 2048 && bits <= 4096
}

function canonicalNonce(value: string) {
  const bytes = Buffer.from(value, "base64url")
  return bytes.length === 32 && bytes.toString("base64url") === value
}

function timestamp(value: number) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 8640000000000000
}

function failure(code: Failure["code"]) {
  return new Failure({
    code,
    message:
      code === "denied"
        ? "Fabric identity token verification is denied"
        : code === "invalid-input"
          ? "Fabric identity token input is invalid"
          : "Fabric identity token verification is unavailable",
  })
}
