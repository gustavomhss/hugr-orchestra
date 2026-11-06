import { expect, test } from "bun:test"
import { Effect } from "effect"
import { exportJWK, generateKeyPair, jwtVerify, SignJWT } from "jose"
import { FabricIdentityTokens } from "../src/identity-token"
import { instant, issuer, nonce, objectID, tenant, tokenFixture, tokenRefusal } from "./fixture/identity-token"

test("IDV01 real RSA signature emits only immutable verifier-local proof, never authority or token claims", async () => {
  const s = await tokenFixture()
  const control = await jwtVerify(s.input.token, s.pair.publicKey, { currentDate: new Date(instant) })
  expect(control.payload.oid).toBe(objectID)
  const proof = await Effect.runPromise(s.verifier.verify(s.input))
  expect(proof).toEqual({
    clientID: s.host.clientID,
    issuer,
    tenantID: tenant,
    objectID,
    subject: "synthetic-subject",
    expiresAt: instant + 3600000,
  })
  expect(Object.isFrozen(proof)).toBe(true)
  expect(s.verifier.owns(proof)).toBe(true)
  expect(s.verifier.owns({ ...proof })).toBe(false)
  expect(s.verifier.owns(JSON.parse(JSON.stringify(proof)))).toBe(false)
  const other = await Effect.runPromise(FabricIdentityTokens.make(s.options))
  expect(other.owns(proof)).toBe(false)
  expect(s.verifier.owns(null)).toBe(false)
  expect(JSON.stringify(proof)).not.toContain(nonce)
  expect(JSON.stringify(proof)).not.toContain(s.input.token)
})

test("IDV02 signature, key and protected-header attacks cannot produce a proof", async () => {
  const s = await tokenFixture()
  await Effect.runPromise(s.verifier.verify(s.input))
  const segments = s.input.token.split(".")
  const changed = { ...s.claims, sub: "tampered-subject" }
  const tampered = [segments[0], Buffer.from(JSON.stringify(changed)).toString("base64url"), segments[2]].join(".")
  await tokenRefusal(s.verifier.verify({ ...s.input, token: tampered }))
  const foreign = await generateKeyPair("RS256")
  const wrong = await new SignJWT(s.claims)
    .setProtectedHeader({ typ: "JWT", alg: "RS256", kid: s.key.kid })
    .sign(foreign.privateKey)
  await tokenRefusal(s.verifier.verify({ ...s.input, token: wrong }))
  const hmac = await new SignJWT(s.claims)
    .setProtectedHeader({ typ: "JWT", alg: "HS256", kid: s.key.kid })
    .sign(new Uint8Array(32).fill(9))
  const none = [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT", kid: s.key.kid })).toString("base64url"),
    segments[1],
    "",
  ].join(".")
  for (const token of [
    hmac,
    none,
    "not.a.jwt",
    s.input.token + ".extra",
    "x".repeat(65537),
    await s.sign({}, { alg: "RS256", kid: "unknown" }),
    await s.sign({}, { alg: "RS256", typ: "at+jwt" }),
    await s.sign({}, { alg: "RS256", jku: "https://keys.invalid/jwks" }),
    await s.sign({}, { alg: "RS256", x5u: "https://keys.invalid/cert" }),
    await s.sign({}, { alg: "RS256", jwk: await exportJWK(s.pair.publicKey) }),
  ])
    await tokenRefusal(s.verifier.verify({ ...s.input, token }))
  const noKid = await new SignJWT(s.claims).setProtectedHeader({ alg: "RS256", typ: "JWT" }).sign(s.pair.privateKey)
  await tokenRefusal(s.verifier.verify({ ...s.input, token: noKid }))
})

test("IDV03 signed nonce, audience, issuer, organizational identity and pinned account are mandatory", async () => {
  const s = await tokenFixture()
  await Effect.runPromise(s.verifier.verify({ ...s.input, tenantID: tenant, objectID }))
  for (const changes of [
    { nonce: "B".repeat(43) },
    { nonce: undefined },
    { aud: "other-client" },
    { aud: [s.host.clientID] },
    { iss: "https://evil.invalid/issuer" },
    { iss: issuer + "/" },
    { tid: "not-a-uuid" },
    {
      tid: "9188040d-6c67-4c5b-b112-36a304b66dad",
      iss: "https://login.microsoftonline.com/9188040d-6c67-4c5b-b112-36a304b66dad/v2.0",
    },
    { oid: "not-a-uuid" },
    { oid: undefined },
    { sub: "" },
    { sub: "s".repeat(1025) },
    { ver: "1.0" },
  ])
    await tokenRefusal(s.verifier.verify({ ...s.input, token: await s.sign(changes) }))
  await tokenRefusal(s.verifier.verify({ ...s.input, tenantID: objectID }))
  await tokenRefusal(s.verifier.verify({ ...s.input, objectID: tenant }))
  await tokenRefusal(s.verifier.verify({ ...s.input, nonce: "bad" }), "invalid-input")
  await tokenRefusal(s.verifier.verify({ ...s.input, tenantID: "bad" }), "invalid-input")
})

test("IDV04 strict expiry, bounded skew and issuance linked to host attempt reject stale signed tokens", async () => {
  const s = await tokenFixture()
  const seconds = instant / 1000
  await Effect.runPromise(
    s.verifier.verify({ ...s.input, token: await s.sign({ iat: seconds - 60, nbf: seconds + 60 }) }),
  )
  for (const changes of [
    { exp: seconds },
    { exp: seconds - 1 },
    { exp: seconds + 0.5 },
    { exp: undefined },
    { iat: seconds - 61 },
    { iat: seconds + 61 },
    { iat: undefined },
    { iat: "not-a-number" },
    { nbf: seconds + 61 },
    { nbf: undefined },
    { nbf: seconds + 0.5 },
    { iat: seconds + 60, exp: seconds + 60 },
    { nbf: seconds + 60, exp: seconds + 60 },
  ])
    await tokenRefusal(s.verifier.verify({ ...s.input, token: await s.sign(changes) }))
  await tokenRefusal(s.verifier.verify({ ...s.input, createdAt: instant + 1 }), "invalid-input")
  await tokenRefusal(s.verifier.verify({ ...s.input, createdAt: Number.NaN }), "invalid-input")
  const clock = { value: instant }
  const service = await Effect.runPromise(FabricIdentityTokens.make({ ...s.options, now: () => clock.value }))
  await Effect.runPromise(service.verify(s.input))
  clock.value = Number.NaN
  await tokenRefusal(service.verify(s.input), "unavailable")
  const throwing = await Effect.runPromise(
    FabricIdentityTokens.make({
      ...s.options,
      now: () => {
        throw new Error("PRIVATE_CLOCK_DETAIL")
      },
    }),
  )
  await tokenRefusal(throwing.verify(s.input), "unavailable")
})

test("IDV05 finite public JWKS, RSA strength and per-key issuer exclude unsafe or ambiguous configurations", async () => {
  const s = await tokenFixture()
  const exact = await Effect.runPromise(
    FabricIdentityTokens.make({ ...s.options, keys: { keys: [{ ...s.key, issuer }] } }),
  )
  await Effect.runPromise(exact.verify(s.input))
  const template = await Effect.runPromise(
    FabricIdentityTokens.make({
      ...s.options,
      keys: { keys: [{ ...s.key, issuer: "https://login.microsoftonline.com/{tenantid}/v2.0" }] },
    }),
  )
  await Effect.runPromise(template.verify(s.input))
  const foreign = await Effect.runPromise(
    FabricIdentityTokens.make({
      ...s.options,
      keys: { keys: [{ ...s.key, issuer: `https://login.microsoftonline.com/${objectID}/v2.0` }] },
    }),
  )
  await tokenRefusal(foreign.verify(s.input))
  const privateKey = await exportJWK(s.pair.privateKey)
  for (const keys of [
    null,
    {},
    { keys: [] },
    { keys: Array.from({ length: 33 }, (_, index) => ({ ...s.key, kid: String(index) })) },
    { keys: [s.key, s.key] },
    { keys: [{ ...s.key, ...privateKey }] },
    { keys: [{ ...s.key, kid: "" }] },
    { keys: [{ ...s.key, n: "AQAB" }] },
    { keys: [{ ...s.key, n: "A".repeat(684) }] },
    { keys: [{ ...s.key, e: "Aw" }] },
    { keys: [{ ...s.key, use: "enc" }] },
    { keys: [{ ...s.key, alg: "RS512" }] },
    { keys: [{ ...s.key, kty: "oct" }] },
    { keys: [{ ...s.key, key_ops: ["sign"] }] },
    { keys: [{ ...s.key, x5u: "https://keys.invalid" }] },
    { keys: [{ ...s.key, x5c: ["x".repeat(262145)] }] },
    { keys: [{ ...s.key, unexpected: "field" }] },
  ])
    await tokenRefusal(FabricIdentityTokens.make({ ...s.options, keys }), "invalid-input")
})

test("IDV06 config and expectations are captured; errors redact secrets; display and distributed claims confer nothing", async () => {
  const s = await tokenFixture()
  const options = { ...s.options, keys: { keys: [{ ...s.key }] } }
  const scheduled = FabricIdentityTokens.make(options)
  options.keys.keys[0]!.n = "AQAB"
  const verifier = await Effect.runPromise(scheduled)
  const input = { ...s.input }
  const verify = verifier.verify(input)
  input.nonce = "B".repeat(43)
  input.token = "PRIVATE_CHANGED_TOKEN"
  const proof = await Effect.runPromise(verify)
  expect(verifier.owns(proof)).toBe(true)
  const display = await s.sign({
    name: "PRIVATE_DISPLAY_NAME",
    email: "PRIVATE_EMAIL",
    roles: ["Fabric.Admin"],
    auth_time: 1,
    _claim_names: { groups: "src1" },
    _claim_sources: { src1: { endpoint: "https://never-fetch.invalid", access_token: "PRIVATE_CLAIM_TOKEN" } },
  })
  expect(await Effect.runPromise(verifier.verify({ ...s.input, token: display }))).toEqual(proof)
  const denied = await tokenRefusal(verifier.verify({ ...s.input, token: await s.sign({ nonce: "B".repeat(43) }) }))
  const other = await tokenRefusal(verifier.verify({ ...s.input, token: "PRIVATE_MALFORMED_TOKEN" }))
  expect(denied.message).toBe(other.message)
  for (const secret of [s.input.token, nonce, "PRIVATE", "synthetic-signing-key"])
    expect(JSON.stringify(denied) + JSON.stringify(other)).not.toContain(secret)
})
