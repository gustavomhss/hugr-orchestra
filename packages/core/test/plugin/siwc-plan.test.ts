import { expect, test } from "bun:test"
import { exportJWK, generateKeyPair, SignJWT } from "jose"
import { Siwc } from "../../src/auth/siwc"

const redirect = "http://127.0.0.1:1455/auth/callback"
const hostId = "urn:uuid:82028e8c-e534-4562-a7a7-1b9e563fa691"
const issued = "oaiapp_test_orchestra"
const callback = (attempt: Siwc.Attempt, state = attempt.state) =>
  new URL(`${redirect}?${new URLSearchParams({ code: "code", state, client_id: issued })}`)

test("new plan consent exchanges with the issued registration and lists only entitled visible models", async () => {
  const attempt = Siwc.begin({ hostId, redirect })
  const authorization = new URL(attempt.url)
  expect(authorization.origin + authorization.pathname).toBe(`${Siwc.issuer}/api/accounts/authorize`)
  expect(authorization.searchParams.get("client_id")).toBe("dynamic_agent_client")
  expect(authorization.searchParams.get("agent_name_hint")).toBe("Orchestra")
  expect(authorization.searchParams.get("resource")).toBe(Siwc.resource)
  const keys = await generateKeyPair("ES256")
  const jwk = { ...(await exportJWK(keys.publicKey)), kid: "key", alg: "ES256" }
  const jwks = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ keys: [jwk] }) })
  const signed = await new SignJWT({ nonce: attempt.nonce })
    .setProtectedHeader({ alg: "ES256", kid: "key" })
    .setIssuer(Siwc.issuer)
    .setAudience(issued)
    .setSubject("owner")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(keys.privateKey)
  const transport = async (url: string, options: RequestInit) => {
    if (url === `${Siwc.issuer}/api/accounts/oauth/token`) {
      const form = options.body as URLSearchParams
      expect(form.get("client_id")).toBe(issued)
      expect(form.get("code_verifier")).toBe(attempt.verifier)
      expect(form.get("redirect_uri")).toBe(redirect)
      return Response.json({
        id_token: signed,
        access_token: "access",
        refresh_token: "refresh",
        token_type: "Bearer",
        expires_in: 300,
        scope: Siwc.scopes,
      })
    }
    expect(url).toBe(`${Siwc.resource}/models`)
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer access")
    return Response.json({
      models: [
        { slug: "gpt-6.2-sol", visibility: "list" },
        { slug: "unlisted", visibility: "hidden" },
      ],
    })
  }
  try {
    expect(() => Siwc.callback(attempt, callback(attempt, "wrong"))).toThrow("Invalid OAuth state")
    const credential = await Siwc.exchange(attempt, callback(attempt), Siwc.methodID, transport, jwks.url)
    expect(credential.methodID).toBe(Siwc.methodID)
    expect(Siwc.permits(credential, "gpt-6.2-sol")).toBe(true)
    expect(Siwc.permits(credential, "unlisted")).toBe(false)
    expect(Siwc.permits({ ...credential, expires: Date.now() - 1 }, "gpt-6.2-sol")).toBe(false)
    expect(() => Siwc.callback(attempt, callback(attempt))).toThrow("already consumed")
  } finally {
    await jwks.stop(true)
  }
})
