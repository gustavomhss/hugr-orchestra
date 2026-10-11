import { describe, expect, test } from "bun:test"
import { Siwc } from "@orchestra/core/auth/siwc"
import { LegacyCodexReadonlyPlugin } from "../../src/plugin/openai/legacy-codex-readonly"
import {
  CodexAuthPlugin,
  parseJwtClaims,
  extractAccountIdFromClaims,
  extractAccountId,
  extractResidency,
  renderOAuthError,
  type IdTokenClaims,
} from "../../src/plugin/openai/codex"

function createTestJwt(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return `${header}.${body}.sig`
}

// The issued registration that signed ChatGPT sign-in persists with plan credentials.
const registration = {
  clientId: "fixture-issued-client",
  hostId: "fixture-host",
  issuer: Siwc.issuer,
  subject: "fixture-subject",
  idToken: "fixture-id-token",
  scopes: Siwc.scopes.split(" "),
}

describe("plugin.codex", () => {
  test("escapes provider errors in callback HTML", () => {
    const error = `</div><script>alert("xss" & 'more')</script>`
    const html = renderOAuthError(error)

    expect(html).toContain("&lt;/div&gt;&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;more&#39;)&lt;/script&gt;")
    expect(html).not.toContain(error)
  })

  describe("parseJwtClaims", () => {
    test("parses valid JWT with claims", () => {
      const payload = { email: "test@example.com", chatgpt_account_id: "acc-123" }
      const jwt = createTestJwt(payload)
      const claims = parseJwtClaims(jwt)
      expect(claims).toEqual(payload)
    })

    test("returns undefined for JWT with less than 3 parts", () => {
      expect(parseJwtClaims("invalid")).toBeUndefined()
      expect(parseJwtClaims("only.two")).toBeUndefined()
    })

    test("returns undefined for invalid base64", () => {
      expect(parseJwtClaims("a.!!!invalid!!!.b")).toBeUndefined()
    })

    test("returns undefined for invalid JSON payload", () => {
      const header = Buffer.from("{}").toString("base64url")
      const invalidJson = Buffer.from("not json").toString("base64url")
      expect(parseJwtClaims(`${header}.${invalidJson}.sig`)).toBeUndefined()
    })
  })

  describe("extractAccountIdFromClaims", () => {
    test("extracts chatgpt_account_id from root", () => {
      const claims: IdTokenClaims = { chatgpt_account_id: "acc-root" }
      expect(extractAccountIdFromClaims(claims)).toBe("acc-root")
    })

    test("extracts chatgpt_account_id from nested https://api.openai.com/auth", () => {
      const claims: IdTokenClaims = {
        "https://api.openai.com/auth": { chatgpt_account_id: "acc-nested" },
      }
      expect(extractAccountIdFromClaims(claims)).toBe("acc-nested")
    })

    test("prefers root over nested", () => {
      const claims: IdTokenClaims = {
        chatgpt_account_id: "acc-root",
        "https://api.openai.com/auth": { chatgpt_account_id: "acc-nested" },
      }
      expect(extractAccountIdFromClaims(claims)).toBe("acc-root")
    })

    test("extracts from organizations array as fallback", () => {
      const claims: IdTokenClaims = {
        organizations: [{ id: "org-123" }, { id: "org-456" }],
      }
      expect(extractAccountIdFromClaims(claims)).toBe("org-123")
    })

    test("returns undefined when no accountId found", () => {
      const claims: IdTokenClaims = { email: "test@example.com" }
      expect(extractAccountIdFromClaims(claims)).toBeUndefined()
    })
  })

  describe("extractAccountId", () => {
    test("extracts from id_token first", () => {
      const idToken = createTestJwt({ chatgpt_account_id: "from-id-token" })
      const accessToken = createTestJwt({ chatgpt_account_id: "from-access-token" })
      expect(
        extractAccountId({
          id_token: idToken,
          access_token: accessToken,
          refresh_token: "rt",
        }),
      ).toBe("from-id-token")
    })

    test("falls back to access_token when id_token has no accountId", () => {
      const idToken = createTestJwt({ email: "test@example.com" })
      const accessToken = createTestJwt({
        "https://api.openai.com/auth": { chatgpt_account_id: "from-access" },
      })
      expect(
        extractAccountId({
          id_token: idToken,
          access_token: accessToken,
          refresh_token: "rt",
        }),
      ).toBe("from-access")
    })

    test("returns undefined when no tokens have accountId", () => {
      const token = createTestJwt({ email: "test@example.com" })
      expect(
        extractAccountId({
          id_token: token,
          access_token: token,
          refresh_token: "rt",
        }),
      ).toBeUndefined()
    })

    test("handles missing id_token", () => {
      const accessToken = createTestJwt({ chatgpt_account_id: "acc-123" })
      expect(
        extractAccountId({
          id_token: "",
          access_token: accessToken,
          refresh_token: "rt",
        }),
      ).toBe("acc-123")
    })
  })

  describe("extractResidency", () => {
    test("extracts compute residency from the namespaced auth claims", () => {
      expect(
        extractResidency(
          createTestJwt({
            "https://api.openai.com/auth": { chatgpt_compute_residency: "eu" },
          }),
        ),
      ).toBe("eu")
    })

    test("falls back to a root compute residency claim", () => {
      expect(extractResidency(createTestJwt({ chatgpt_compute_residency: "us" }))).toBe("us")
    })

    test("supports compute residency values without maintaining a region list", () => {
      expect(
        extractResidency(
          createTestJwt({
            "https://api.openai.com/auth": { chatgpt_compute_residency: "ae" },
          }),
        ),
      ).toBe("ae")
      expect(
        extractResidency(
          createTestJwt({
            "https://api.openai.com/auth": { chatgpt_compute_residency: "future-region_1" },
          }),
        ),
      ).toBe("future-region_1")
    })

    test("ignores unconstrained and data residency values", () => {
      expect(
        extractResidency(
          createTestJwt({
            "https://api.openai.com/auth": { chatgpt_compute_residency: "no_constraint" },
          }),
        ),
      ).toBeUndefined()
      expect(
        extractResidency(
          createTestJwt({
            "https://api.openai.com/auth": { chatgpt_data_residency: "gb" },
          }),
        ),
      ).toBeUndefined()
      expect(extractResidency(createTestJwt({ chatgpt_compute_residency: "" }))).toBeUndefined()
      expect(extractResidency("not-a-jwt")).toBeUndefined()
    })

    test("prefers a namespaced unconstrained value over a root residency", () => {
      expect(
        extractResidency(
          createTestJwt({
            chatgpt_compute_residency: "eu",
            "https://api.openai.com/auth": { chatgpt_compute_residency: "no_constraint" },
          }),
        ),
      ).toBeUndefined()
    })
  })

  test("installs websocket transport only when experimental websockets are enabled", async () => {
    const disabled = await CodexAuthPlugin({} as never)
    const enabled = await CodexAuthPlugin({} as never, { experimentalWebSockets: true })

    const disabledOptions = await disabled.auth!.loader!(
      async () => ({ type: "api", key: "sk-test" }) as never,
      {} as never,
    )
    const enabledOptions = await enabled.auth!.loader!(
      async () => ({ type: "api", key: "sk-test" }) as never,
      {} as never,
    )

    expect(disabledOptions.fetch).toBeUndefined()
    expect(enabledOptions.fetch).toBeFunction()
    await enabled.dispose?.()
  })

  test("plan credentials ignore the deprecated Codex endpoint override", async () => {
    const backend: string[] = []
    using server = Bun.serve({
      port: 0,
      fetch(request) {
        backend.push(new URL(request.url).pathname)
        return new Response("{}")
      },
    })
    const sent: Array<{ url: string; authorization: string | null }> = []
    const hooks = await CodexAuthPlugin({} as never, {
      codexApiEndpoint: new URL("/backend-api/codex/responses", server.url).toString(),
      send: async (request) => {
        sent.push({ url: request.url, authorization: request.headers.get("authorization") })
        if (request.url === `${Siwc.resource}/models`)
          return Response.json({ models: [{ slug: "gpt-5.5", display_name: "GPT-5.5", visibility: "list" }] })
        return new Response("{}")
      },
    })
    const loaded = await hooks.auth!.loader!(
      async () =>
        ({
          type: "oauth",
          refresh: "refresh",
          access: "plan-access",
          expires: Date.now() + 60 * 60_000,
          metadata: registration,
        }) as never,
      {} as never,
    )

    await loaded.fetch!(`${Siwc.resource}/responses`, {
      method: "POST",
      body: JSON.stringify({ model: "gpt-5.5", input: "hi" }),
    })
    await expect(
      loaded.fetch!(new URL("/backend-api/codex/responses", server.url), { method: "POST", body: "{}" }),
    ).rejects.toThrow("Unsupported ChatGPT plan endpoint")

    expect(backend).toEqual([])
    expect(sent).toEqual([
      { url: `${Siwc.resource}/models`, authorization: "Bearer plan-access" },
      { url: `${Siwc.resource}/responses`, authorization: "Bearer plan-access" },
    ])
  })

  test("the explicit legacy Codex consumer filters unsupported modes for OAuth GPT models", async () => {
    const auth = { type: "oauth", refresh: "refresh", access: "legacy-access", expires: Date.now() + 60 * 60_000 }
    const previous = process.env.ORCHESTRA_AUTH_CONTENT
    process.env.ORCHESTRA_AUTH_CONTENT = JSON.stringify({ openai: auth })
    using restore = { [Symbol.dispose]() {
      if (previous === undefined) delete process.env.ORCHESTRA_AUTH_CONTENT
      else process.env.ORCHESTRA_AUTH_CONTENT = previous
    } }
    const hooks = await LegacyCodexReadonlyPlugin({} as never)
    const limit = { context: 1_050_000, input: 922_000, output: 128_000 }
    const provider = {
      models: {
        ...Object.fromEntries(
          [
            "gpt-5.4",
            "gpt-5.5",
            "gpt-5.6-sol",
            "gpt-5.6-terra",
            "gpt-5.6-luna",
            "gpt-5.7-pro",
            "gpt-6",
            "gpt-6-luna",
            "gpt-6.1-sol",
            "gpt-10-mini",
            "gpt-5",
            "gpt-5.3",
            "gpt-5.4-large",
            "gpt-5.5-pro",
            "gpt-5.6",
            "gpt-6invalid",
            "gpt-6.1invalid",
            "o3",
          ].map((id) => [id, { id, api: { id }, limit, cost: {}, options: {} }]),
        ),
        "gpt-5.4-pro": { id: "gpt-5.4-pro", api: { id: "gpt-5.4" }, limit, cost: {}, options: { reasoningMode: "pro" } },
        "gpt-6-luna-pro": {
          id: "gpt-6-luna-pro",
          api: { id: "gpt-6-luna" },
          limit,
          cost: {},
          options: { reasoningMode: "pro" },
        },
      },
    }

    const models = await hooks.provider!.models!(provider as never, { auth } as never)

    // The legacy consumer owns the pinned compiled-source policy, including excluding the gpt-5.6 family.
    ;["gpt-5.4", "gpt-5.5", "gpt-5.7-pro", "gpt-6", "gpt-6-luna", "gpt-6.1-sol", "gpt-10-mini"].forEach((id) => {
      expect(models[id]?.limit).toEqual(limit)
      expect(models[id]?.api.id).toBe(id)
    })
    ;[
      "gpt-5.4-pro",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "gpt-5",
      "gpt-5.3",
      "gpt-5.4-large",
      "gpt-5.5-pro",
      "gpt-5.6",
      "gpt-6invalid",
      "gpt-6.1invalid",
      "gpt-6-luna-pro",
      "o3",
    ].forEach((id) => expect(models[id]).toBeUndefined())
    expect(Object.keys(models)).toHaveLength(7)
  })
})
