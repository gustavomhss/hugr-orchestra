import { expect } from "bun:test"
import { CapabilitySetup } from "@orchestra/schema/capability-setup"
import { createHash } from "node:crypto"
import { Integration } from "@orchestra/schema/integration"
import { Effect, Schema } from "effect"
import { CapabilityConnectionSetup } from "../src/capability/connection/setup"
import { CapabilityConnectionVerification } from "../src/capability/connection/verify"
import type { CapabilityVerifierContract } from "../src/capability/connection/verifiers/contract"
import { CapabilityVerifiers } from "../src/capability/connection/verifiers/index"
import { CapabilityConnectionSetupFixture } from "./fixture/capability-connection-setup"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionSetupFixture.layer)
const placement = CapabilityConnectionSetupFixture.placement
const key = "fixture-only-descriptor-secret"
const vendor = (request: Request) => {
  const path = new URL(request.url).pathname
  if (path === "/api/v2/auth") return Response.json({ account_id: "acct-neon-1", auth_method: "api_key_user", secret: key })
  if (path === "/v1/models") return Response.json({ object: "list", data: [{ id: key }] })
  if (path === "/v1/organization") return Response.json({ tier: {}, creditBalance: 1 })
  return Response.json({ secret: key }, { status: 401 })
}

function fixture(response: (request: Request) => Response = vendor) {
  return Effect.gen(function* () {
    const seen: { path: string; authorization: string | null; version: string | null }[] = []
    const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0,
      fetch(request) {
        seen.push({ path: new URL(request.url).pathname, authorization: request.headers.get("authorization"),
          version: request.headers.get("x-runway-version") })
        return response(request)
      } })), (server) => Effect.promise(() => server.stop(true)))
    return { seen, verifier: yield* CapabilityConnectionVerification.make({ fixtureOrigin: server.url.origin }) }
  })
}

it.effect("registry is exhaustive, self-keyed and bound to fixed https origins", () => Effect.sync(() => {
  expect(Object.keys(CapabilityVerifiers.descriptors).sort()).toEqual([...CapabilitySetup.Provider.literals].sort())
  Object.entries<CapabilityVerifierContract.Descriptor>(CapabilityVerifiers.descriptors).forEach(([provider, descriptor]) => {
    expect<string>(descriptor.provider).toBe(provider)
    expect(CapabilityVerifiers.descriptor(descriptor.provider)).toBe(descriptor)
    expect<string>(descriptor.integrationID).toBe(`capability.${provider}`)
    expect(new URL(descriptor.origin).origin).toBe(descriptor.origin)
    expect(descriptor.origin.startsWith("https://")).toBe(true)
    expect(Object.isFrozen(descriptor)).toBe(true)
    if (descriptor.keyPattern) expect(descriptor.keyPattern.source).toMatch(/^\^.*(\$|\(\?!\[\\s\\S\]\))$/)
  })
}))

it.live("verified and credential-only proofs bind descriptor endpoint, fixed headers and keyless subjects", () => Effect.gen(function* () {
  const f = yield* fixture()
  const neon = yield* f.verifier.verify({ provider: "neon", key })
  expect(neon).toMatchObject({ provider: "neon", endpoint: "https://mcp.neon.tech/mcp", subjectID: "acct-neon-1",
    integrationID: "capability.neon" })
  const openai = yield* f.verifier.verify({ provider: "openai", key })
  const fingerprint = `key:${createHash("sha256").update(key).digest("hex").slice(0, 16)}`
  expect(openai).toMatchObject({ provider: "openai", endpoint: "https://api.openai.com/v1", subjectID: fingerprint })
  expect(openai.scopeHash).toBe(createHash("sha256").update(JSON.stringify(["openai", "https://api.openai.com/v1",
    fingerprint, createHash("sha256").update(key).digest("hex")])).digest("hex"))
  const other = yield* f.verifier.verify({ provider: "openai", key: key + "-other" })
  expect(other.subjectID).not.toBe(openai.subjectID)
  yield* f.verifier.verify({ provider: "runway", key })
  ;[neon, openai, other].forEach((proof) => expect(JSON.stringify(proof)).not.toContain(key))
  expect(f.seen).toEqual([
    { path: "/api/v2/auth", authorization: `Bearer ${key}`, version: null },
    { path: "/v1/models", authorization: `Bearer ${key}`, version: null },
    { path: "/v1/models", authorization: `Bearer ${key}-other`, version: null },
    { path: "/v1/organization", authorization: `Bearer ${key}`, version: "2024-11-06" },
  ])
}))

it.live("keyPattern must match the whole key and refuses other shapes before any network call", () => Effect.gen(function* () {
  const seen: string[] = []
  const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0,
    fetch(request) { seen.push(new URL(request.url).pathname); return Response.json({ id: "acct_1" }) } })),
  (server) => Effect.promise(() => server.stop(true)))
  // Test-only descriptor: unanchored and global, so only prove's whole-key, stateless evaluation can refuse these.
  const loose = { provider: "stripe", endpoint: "https://mcp.stripe.com", origin: "https://api.stripe.com",
    integrationID: Integration.ID.make("capability.stripe"), verification: "verified", keyPattern: /rk_[A-Za-z0-9_]+/g,
    authorization: (value: string) => `Bearer ${value}`,
    identify: (call) => call({ method: "GET", path: "/v1/account" }).pipe(Effect.map(() => "acct_1")),
  } satisfies CapabilityVerifierContract.Descriptor
  const options = { fixtureOrigin: server.url.origin }
  yield* Effect.forEach(["sk_live_secret", "rk_", "xrk_test_1", "rk_test_1-x"], (value) =>
    CapabilityConnectionVerification.prove(loose, value, options).pipe(Effect.exit, Effect.tap((exit) => Effect.sync(() =>
      CapabilityConnectionSetupFixture.expectCode(exit, "unsupported_operation", [value])))))
  CapabilityConnectionSetupFixture.expectCode(yield* CapabilityConnectionVerification.prove(loose, "rk_a\r\nx: y", options)
    .pipe(Effect.exit), "unsupported_schema", ["rk_a"])
  expect(seen).toEqual([])
  yield* Effect.forEach(["rk_test_1", "rk_test_2"], (value) => CapabilityConnectionVerification.prove(loose, value, options))
  expect(seen).toEqual(["/v1/account", "/v1/account"])
  // Registered Stripe descriptor through the real verifier: full-access keys never reach the vendor.
  const verifier = yield* CapabilityConnectionVerification.make(options)
  CapabilityConnectionSetupFixture.expectCode(yield* verifier.verify({ provider: "stripe", key: "sk_live_0123456789abcdef" })
    .pipe(Effect.exit), "unsupported_operation", ["sk_live_0123456789abcdef"])
  expect(seen).toHaveLength(2)
  expect((yield* verifier.verify({ provider: "stripe", key: "rk_test_0123456789ab" })).subjectID).toBe("acct_1")
  expect(seen).toHaveLength(3)
}))

it.live("rejected keys and keyed subjects fail without proof", () => Effect.gen(function* () {
  const f = yield* fixture(() => Response.json({ secret: key }, { status: 403 }))
  yield* Effect.forEach(["neon", "openai", "linear"] as const, (provider) => f.verifier.verify({ provider, key }).pipe(Effect.exit,
    Effect.tap((exit) => Effect.sync(() => CapabilityConnectionSetupFixture.expectCode(exit, "authentication_required", [key])))))
  const echo = yield* fixture(() => Response.json({ account_id: "acct-neon-1", auth_method: "api_key_user" }))
  CapabilityConnectionSetupFixture.expectCode(yield* echo.verifier.verify({ provider: "neon", key: "neon-1" }).pipe(Effect.exit),
    "connection_unavailable", ["neon-1"])
}))

it.live("setup stores descriptor verification and rejects a credential-only proof without the key fingerprint", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionSetupFixture.fixture({ response: vendor })
  const verification = (data: Schema.Json) => Schema.decodeUnknownSync(CapabilitySetup.Result)(data).verification
  expect(verification((yield* f.run(f.setup.connect(placement, { provider: "neon", key }))).data)).toBe("verified")
  expect(verification((yield* f.run(f.setup.connect(placement, { provider: "openai", key }))).data)).toBe("credential-only")
  const rows = yield* f.rows
  expect(rows.connections.map((row) => [row.provider, row.endpoint, row.subject_id, row.integration_id])).toEqual([
    ["neon", "https://mcp.neon.tech/mcp", "acct-neon-1", "capability.neon"],
    ["openai", "https://api.openai.com/v1", CapabilityVerifiers.fingerprint(key), "capability.openai"],
  ])
  // Forged proofs carry a self-consistent scope hash, so only the registry checks can refuse them.
  const forged = (change: { subjectID?: string; endpoint?: string }) => CapabilityConnectionSetup.make({ operators: f.operators,
    ledger: f.ledger, verifier: { verify: (value) => f.verifier.verify(value).pipe(Effect.map((proof) => {
      const next = { ...proof, ...change }
      return { ...next, scopeHash: createHash("sha256").update(JSON.stringify([next.provider, next.endpoint, next.subjectID,
        createHash("sha256").update(value.key).digest("hex")])).digest("hex") }
    })) } })
  yield* Effect.forEach([{ subjectID: "key" }, { subjectID: "acct-1" }, { endpoint: "https://api.openai.com/v2" }],
    (change, index) => forged(change).pipe(Effect.flatMap((setup) => f.run(setup.connect(placement,
      { provider: "openai", key: `${key}-${index}` }))), Effect.exit, Effect.tap((exit) => Effect.sync(() =>
      CapabilityConnectionSetupFixture.expectCode(exit, "connection_unavailable", [key])))))
  expect(yield* f.rows).toEqual(rows)
}))
