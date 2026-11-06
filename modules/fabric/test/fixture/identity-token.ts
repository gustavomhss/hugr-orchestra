import { expect } from "bun:test"
import { Effect, Exit } from "effect"
import { CompactSign, exportJWK, generateKeyPair } from "jose"
import type { JWTHeaderParameters } from "jose"
import { FabricIdentityTokens } from "../../src/identity-token"
import { profile } from "./identity-attempt"

export const tenant = "22222222-3333-4444-8555-666666666666"
export const objectID = "33333333-4444-4555-8666-777777777777"
export const issuer = `https://login.microsoftonline.com/${tenant}/v2.0`
export const nonce = "A".repeat(43)
export const instant = 1800000000000

export async function tokenFixture() {
  const pair = await generateKeyPair("RS256", { extractable: true })
  const key = { ...(await exportJWK(pair.publicKey)), kid: "synthetic-signing-key", alg: "RS256", use: "sig" }
  const host = profile()
  const claims = {
    ver: "2.0",
    aud: host.clientID,
    tid: tenant,
    oid: objectID,
    sub: "synthetic-subject",
    iss: issuer,
    nonce,
    iat: instant / 1000,
    nbf: instant / 1000,
    exp: instant / 1000 + 3600,
  }
  const sign = (changes: Record<string, unknown> = {}, header: JWTHeaderParameters = { alg: "RS256" }) =>
    new CompactSign(new TextEncoder().encode(JSON.stringify({ ...claims, ...changes })))
      .setProtectedHeader({ typ: "JWT", kid: key.kid, ...header })
      .sign(pair.privateKey)
  const options = { profile: host, keys: { keys: [key] }, now: () => instant }
  const verifier = await Effect.runPromise(FabricIdentityTokens.make(options))
  const input = { token: await sign(), nonce, createdAt: instant }
  return { pair, key, host, claims, sign, options, verifier, input }
}

export async function tokenRefusal<A>(
  operation: Effect.Effect<A, FabricIdentityTokens.Failure>,
  code: FabricIdentityTokens.Failure["code"] = "denied",
) {
  const exit = await Effect.runPromise(Effect.exit(operation))
  expect(Exit.isFailure(exit)).toBe(true)
  if (!Exit.isFailure(exit)) throw new Error("Expected typed token refusal, not successful verification")
  const reason = exit.cause.reasons[0]
  if (reason?._tag !== "Fail") throw new Error("Expected token failure, not defect or interruption")
  expect(reason.error).toBeInstanceOf(FabricIdentityTokens.Failure)
  expect(reason.error.code).toBe(code)
  return reason.error
}
