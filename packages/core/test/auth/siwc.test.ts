import { describe, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { exportJWK, generateKeyPair, SignJWT } from "jose"
import { IntegrationMethodID } from "@orchestra/schema/integration-id"
import { Siwc } from "../../src/auth/siwc"
import { SiwcHost } from "../../src/auth/siwc-host"

const methodID = IntegrationMethodID.make("chatgpt-browser")
const hostId = "urn:uuid:fixture-host"
const redirect = "http://127.0.0.1:54321/auth/callback"
const saved = { clientId: "fixture-issued-client", hostId, issuer: Siwc.issuer, subject: "fixture-subject",
  idToken: "fixture-retained-hint", scopes: Siwc.scopes.split(" ") } as const
function returned(attempt: Siwc.Attempt, values: Record<string, string> = {}) {
  const url = new URL(attempt.redirect)
  url.search = new URLSearchParams({ state: attempt.state, code: "fixture-code", client_id: saved.clientId, ...values }).toString()
  return url
}

describe("ChatGPT OSS registration scaffold", () => {
  test("persists one owner-only host ID across concurrent starts and rejects corruption", async () => {
    const directory = await mkdtemp(join(tmpdir(), "siwc-host-test-"))
    const filename = join(directory, "host-id")
    try {
      const ids = await Promise.all(Array.from({ length: 8 }, () => SiwcHost.load(filename)))
      expect(new Set(ids).size).toBe(1)
      expect(await SiwcHost.load(filename)).toBe(ids[0])
      expect((await stat(filename)).mode & 0o777).toBe(0o600)
      await writeFile(filename, "corrupt")
      await expect(SiwcHost.load(filename)).rejects.toThrow("Invalid persisted")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
  test("builds Orchestra dynamic registration with fresh state, nonce and S256", async () => {
    const first = await Siwc.begin({ hostId, redirect })
    const second = await Siwc.begin({ hostId, redirect })
    const url = new URL(first.url)
    expect(url.origin + url.pathname).toBe(`${Siwc.issuer}/api/accounts/authorize`)
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ client_id: "dynamic_agent_client",
      agent_name_hint: "Orchestra", ext_agent_host_id: hostId, scope: Siwc.scopes, resource: Siwc.resource,
      redirect_uri: redirect, response_type: "code", state: first.state, nonce: first.nonce, code_challenge_method: "S256" })
    expect(url.searchParams.get("code_challenge")).toBe(createHash("sha256").update(first.verifier).digest("base64url"))
    expect(first.verifier).toMatch(/^[\w-]{43}$/)
    expect([second.state, second.nonce, second.verifier].every((value) => ![first.state, first.nonce, first.verifier].includes(value))).toBe(true)
    const returning = await Siwc.begin({ hostId, redirect, registration: saved })
    expect(new URL(returning.url).searchParams.get("id_token_hint")).toBe(saved.idToken)
    expect(new URL(returning.url).searchParams.has("agent_name_hint")).toBe(false)
    const callback = returned(returning)
    callback.searchParams.delete("client_id")
    expect(Siwc.callback(returning, callback).clientId).toBe(saved.clientId)
    expect(() => Siwc.callback(returning, callback)).toThrow("already consumed")
  })

  test("rejects wrong loopback placement and host reuse", async () => {
    for (const uri of ["http://localhost:1455/auth/callback", "http://127.0.0.1:1455/callback", "https://127.0.0.1:1455/auth/callback"])
      expect(() => Siwc.begin({ hostId, redirect: uri })).toThrow("loopback")
    expect(() => Siwc.begin({ hostId: "other-host", redirect, registration: saved })).toThrow("another host")
  })

  test("checks exact state before error, error before code/client; rejects incomplete or changed registration", async () => {
    const pending = Siwc.begin({ hostId, redirect })
    for (const unrelated of [returned(pending, { state: "wrong" }), new URL("http://127.0.0.1:54321/unrelated")])
      expect(() => Siwc.callback(pending, unrelated)).toThrow("Invalid OAuth state")
    expect(Siwc.callback(pending, returned(pending)).clientId).toBe(saved.clientId)
    const declined = Siwc.begin({ hostId, redirect })
    expect(() => Siwc.callback(declined, returned(declined, { error: "access_denied" }))).toThrow("denied")
    expect(() => Siwc.callback(declined, returned(declined))).toThrow("already consumed")
    const cases: Array<{ values: Record<string, string>; message: string }> = [
      { values: { state: "wrong", error: "access_denied" }, message: "Invalid OAuth state" },
      { values: { error: "access_denied", client_id: "" }, message: "authorization denied" },
      { values: { client_id: "" }, message: "Missing issued" },
      { values: { client_id: "dynamic_agent_client" }, message: "Missing issued" },
      { values: { client_id: "app_EMoamEEZ73f0CkXaXp7hrann" }, message: "Missing issued" },
      { values: { code: "" }, message: "authorization code" },
    ]
    for (const item of cases) {
      const attempt = await Siwc.begin({ hostId, redirect })
      expect(() => Siwc.callback(attempt, returned(attempt, item.values))).toThrow(item.message)
    }
    const attempt = await Siwc.begin({ hostId, redirect, registration: saved })
    expect(() => Siwc.callback(attempt, returned(attempt, { client_id: "another-client" }))).toThrow("registration changed")
  })

  test("invalid_grant retains issued client and returning identity for fresh reauthorization", async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ error: "invalid_grant" }, { status: 400 }) })
    try {
      for (const registration of [undefined, saved]) {
        const attempt = Siwc.begin({ hostId, redirect, registration })
        const error = await Siwc.exchange(attempt, returned(attempt), methodID,
          (_url, init) => fetch(server.url, init)).catch((cause: unknown) => cause)
        expect(error).toBeInstanceOf(Siwc.InvalidGrantError)
        if (!(error instanceof Siwc.InvalidGrantError)) throw new Error("Expected invalid_grant context")
        const retry = Siwc.begin({ ...error.context, redirect })
        expect(new URL(retry.url).searchParams.get("client_id")).toBe(saved.clientId)
        expect(new URL(retry.url).searchParams.has("agent_name_hint")).toBe(false)
        expect(retry.state).not.toBe(attempt.state)
        expect(retry.nonce).not.toBe(attempt.nonce)
        expect(retry.verifier).not.toBe(attempt.verifier)
        expect(retry.saved?.subject).toBe(registration?.subject)
      }
    } finally { server.stop(true) }
  })

  test("exchanges over HTTP, verifies real JWKS signatures and rejects invalid identities before producing credentials", async () => {
    const key = await generateKeyPair("RS256", { extractable: true })
    const alien = await generateKeyPair("RS256")
    const bodies: Array<Record<string, string>> = []
    const jwk = { ...await exportJWK(key.publicKey), kid: "fixture-key", alg: "RS256", use: "sig" }
    const current: { token: string; scope: string; status: number } = { token: "", scope: Siwc.scopes, status: 200 }
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
      if (new URL(request.url).pathname === "/jwks") return Response.json({ keys: [jwk] })
      expect(request.method).toBe("POST")
      expect(request.headers.get("content-type")).toBe("application/x-www-form-urlencoded")
      bodies.push(Object.fromEntries(new URLSearchParams(await request.text())))
      return Response.json({ access_token: "fixture-access", refresh_token: "fixture-refresh", id_token: current.token,
        token_type: "Bearer", expires_in: 3600, scope: current.scope }, { status: current.status })
    } })
    const transport = (url: string, init: RequestInit) => {
      expect(url).toBe(`${Siwc.issuer}/api/accounts/oauth/token`)
      return fetch(new URL("/token", server.url), init)
    }
    try {
      const attempt = await Siwc.begin({ hostId, redirect })
      const sign = (nonce: string, changes: Record<string, unknown> = {}, badKey = false) => new SignJWT({
        iss: Siwc.issuer, sub: saved.subject, aud: saved.clientId, iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600, nonce, ...changes,
      }).setProtectedHeader({ alg: "RS256", kid: "fixture-key" }).sign(badKey ? alien.privateKey : key.privateKey)
      current.token = await sign(attempt.nonce)
      const credential = await Siwc.exchange(attempt, returned(attempt), methodID, transport, new URL("/jwks", server.url))
      expect(bodies[0]).toEqual({ grant_type: "authorization_code", client_id: saved.clientId, code: "fixture-code",
        code_verifier: attempt.verifier, redirect_uri: redirect, resource: Siwc.resource })
      expect(credential).toMatchObject({ access: "fixture-access", refresh: "fixture-refresh", methodID,
        metadata: { ...saved, idToken: current.token } })
      expect(credential.expires).toBeGreaterThan(Date.now())
      expect(Object.fromEntries(Siwc.refreshBody(credential))).toEqual({ grant_type: "refresh_token",
        client_id: saved.clientId, refresh_token: "fixture-refresh", resource: Siwc.resource })
      Siwc.requirePlanUsage(credential)
      const registration = Siwc.registration(credential.metadata)
      const invalid = [
        { changes: {}, badKey: true }, { changes: { iss: "https://invalid.example" } },
        { changes: { aud: "another-client" } }, { changes: { exp: 1 } }, { changes: { nonce: "wrong" } },
        { changes: { sub: "another-subject" } }, { changes: { sub: "" } },
        { changes: { aud: [saved.clientId, "other"], azp: "other" } },
      ]
      for (const item of invalid) {
        const next = await Siwc.begin({ hostId, redirect, registration })
        current.token = await sign(next.nonce, item.changes, item.badKey)
        await expect(Siwc.exchange(next, returned(next), methodID, transport, new URL("/jwks", server.url))).rejects.toThrow()
      }
      const identityOnly = await Siwc.begin({ hostId, redirect, registration })
      current.token = await sign(identityOnly.nonce)
      current.scope = "openid profile email"
      const limited = await Siwc.exchange(identityOnly, returned(identityOnly), methodID, transport, new URL("/jwks", server.url))
      expect(() => Siwc.requirePlanUsage(limited)).toThrow("plan use is not authorized")
      const denied = await Siwc.begin({ hostId, redirect })
      const before = bodies.length
      await expect(Siwc.exchange(denied, returned(denied, { error: "access_denied" }), methodID, transport)).rejects.toThrow("denied")
      expect(bodies.length).toBe(before)
      expect(() => Siwc.refreshBody({ refresh: "fixture", metadata: { clientId: "dynamic_agent_client" } })).toThrow("registration")
    } finally {
      server.stop(true)
    }
  })
})
