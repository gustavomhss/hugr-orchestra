import { expect, test } from "bun:test"
import { generateKeyPairSync, sign } from "node:crypto"
import { join } from "node:path"
import { Effect, Schema } from "effect"
import { Siwc } from "@orchestra/core/auth/siwc"
import { Auth } from "../../src/auth"
import { CodexAuthPlugin } from "../../src/plugin/openai/codex"
import { tmpdir } from "../fixture/fixture"
import type { AuthOAuthResult, Hooks } from "@orchestra/plugin"

async function fixture() {
  const tmp = await tmpdir()
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const grants = new Map<string, { nonce: string; subject: string; badSignature?: boolean; invalid?: boolean }>()
  const requests: Array<{ path: string; body: string; authorization: string | null }> = []
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname
      const text = await request.text()
      requests.push({ path, body: text, authorization: request.headers.get("authorization") })
      if (path === "/jwks") return Response.json({ keys: [{ ...keys.publicKey.export({ format: "jwk" }), kid: "fixture", alg: "RS256" }] })
      if (path === "/api/accounts/oauth/token") {
        const body = new URLSearchParams(text)
        const grant = grants.get(body.get("code") ?? "")
        if (!grant || grant.invalid) return Response.json({ error: "invalid_grant" }, { status: 400 })
        const signing = [
          Buffer.from(JSON.stringify({ alg: "RS256", kid: "fixture" })).toString("base64url"),
          Buffer.from(JSON.stringify({ iss: Siwc.issuer, aud: body.get("client_id"), sub: grant.subject,
            nonce: grant.nonce, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"),
        ].join(".")
        const id_token = `${signing}.${sign("RSA-SHA256", Buffer.from(signing), grant.badSignature ? other.privateKey : keys.privateKey).toString("base64url")}`
        return Response.json({ id_token, access_token: "fixture-access", refresh_token: "fixture-refresh",
          token_type: "Bearer", expires_in: 3600, scope: Siwc.scopes })
      }
      if (path === "/v1/models") return Response.json({ models: [{ slug: "fixture-model", display_name: "Fixture model", visibility: "list" }] })
      if (path === "/v1/responses") return Response.json({ id: "fixture-response" })
      return new Response("Unexpected fixture endpoint", { status: 500 })
    },
  })
  const hooks: Hooks[] = []
  const targets: string[] = []
  const plugin = async (extra: Parameters<typeof CodexAuthPlugin>[1] = {}) => {
    const value = await CodexAuthPlugin({} as never, {
      hostFile: join(tmp.path, "siwc", "host-id"), port: 0, jwksURL: new URL("/jwks", server.url),
      transport: (url, init) => {
        targets.push(url)
        return fetch(new URL(new URL(url).pathname, server.url), init)
      },
      send: (request) => {
        targets.push(request.url)
        return fetch(new Request(new URL(new URL(request.url).pathname, server.url), request))
      }, ...extra,
    })
    hooks.push(value)
    return value
  }
  const begin = async (hook: Hooks, account = "new") => {
    const method = hook.auth?.methods[0]
    if (method?.type !== "oauth") throw new Error("Missing browser method")
    return method.authorize({ account })
  }
  const deliver = async (result: AuthOAuthResult, code: string, subject = "fixture-subject", badSignature = false) => {
    const url = new URL(result.url)
    grants.set(code, { nonce: url.searchParams.get("nonce") ?? "", subject, badSignature })
    const callback = new URL(url.searchParams.get("redirect_uri") ?? "")
    callback.search = new URLSearchParams({ state: url.searchParams.get("state") ?? "", code,
      client_id: url.searchParams.get("client_id") === "dynamic_agent_client" ? "fixture-issued-client" : url.searchParams.get("client_id") ?? "" }).toString()
    return fetch(callback)
  }
  return { tmp, server, grants, requests, targets, plugin, begin, deliver,
    async [Symbol.asyncDispose]() {
      await Promise.all(hooks.map((hook) => hook.dispose?.()))
      server.stop(true)
      await Auth.runPromise((store) => store.remove("openai"))
      await tmp[Symbol.asyncDispose]()
    },
  }
}

async function complete(result: AuthOAuthResult) {
  if (result.method !== "auto") throw new Error("Expected loopback browser")
  const value = await result.callback()
  if (value.type !== "success") throw new Error("Sign-in failed")
  return Schema.decodeUnknownSync(Auth.Oauth)({ ...value, type: "oauth" })
}

test("legacy browser uses own host, dynamic Orchestra hint and signed metadata; wrong state survives", async () => {
  await using f = await fixture()
  const hook = await f.plugin()
  const first = await f.begin(hook)
  const url = new URL(first.url)
  expect(url.origin + url.pathname).toBe(`${Siwc.issuer}/api/accounts/authorize`)
  expect(url.searchParams.get("agent_name_hint")).toBe("Orchestra")
  expect(url.searchParams.get("client_id")).toBe("dynamic_agent_client")
  expect(url.searchParams.get("originator")).toBe("opencode")
  expect(url.searchParams.get("resource")).toBe(Siwc.resource)
  expect(url.searchParams.get("code_challenge_method")).toBe("S256")
  expect(url.searchParams.get("nonce")).toBeTruthy()
  const redirect = new URL(url.searchParams.get("redirect_uri") ?? "")
  expect(redirect.hostname).toBe("127.0.0.1")
  redirect.search = "state=wrong&code=stray&client_id=fixture-issued-client"
  expect((await fetch(redirect)).status).toBe(400)
  expect((await f.deliver(first, "valid")).status).toBe(200)
  const value = await complete(first)
  expect(value.metadata).toMatchObject({ clientId: "fixture-issued-client", subject: "fixture-subject",
    issuer: Siwc.issuer, resource: Siwc.resource, scopes: Siwc.scopes.split(" ") })
  expect(value.metadata?.idToken).toMatch(/^ey/)
  const body = new URLSearchParams(f.requests.find((item) => item.path.endsWith("/token"))?.body)
  expect(body.get("client_id")).toBe("fixture-issued-client")
  expect(body.get("code_verifier")).toBeTruthy()
  expect(f.targets).toEqual([`${Siwc.issuer}/api/accounts/oauth/token`])
  const second = await f.begin(hook)
  expect(new URL(second.url).searchParams.get("ext_agent_host_id")).toBe(url.searchParams.get("ext_agent_host_id"))
  console.info(JSON.stringify({ bind: redirect.origin, jwks: new URL("/jwks", f.server.url).href,
    targets: f.targets, memory: process.memoryUsage() }))
})

test("fresh pending grant leaves saved account intact; saved sign-in rejects another signed subject", async () => {
  await using f = await fixture()
  const hook = await f.plugin()
  const first = await f.begin(hook)
  await f.deliver(first, "initial")
  const saved = await complete(first)
  await Auth.runPromise((store) => store.set("openai", saved))
  const fresh = await f.begin(hook)
  expect(new URL(fresh.url).searchParams.has("id_token_hint")).toBe(false)
  expect(await Auth.runPromise((store) => store.get("openai"))).toEqual(saved)
  const returning = await f.begin(hook, "saved")
  expect(new URL(returning.url).searchParams.get("client_id")).toBe(Siwc.registration(saved.metadata).clientId)
  expect(new URL(returning.url).searchParams.get("id_token_hint")).toBe(Siwc.registration(saved.metadata).idToken)
  expect((await f.deliver(returning, "changed", "another-subject")).status).toBe(400)
  await expect(complete(returning)).rejects.toThrow("ChatGPT account changed")
  expect(await Auth.runPromise((store) => store.get("openai"))).toEqual(saved)
})

test("forged signature fails; invalid_grant retry retains issued client and host", async () => {
  await using f = await fixture()
  const hook = await f.plugin()
  const forged = await f.begin(hook)
  expect((await f.deliver(forged, "forged", "fixture-subject", true)).status).toBe(400)
  await expect(complete(forged)).rejects.toThrow()
  const initial = await f.begin(hook)
  const url = new URL(initial.url)
  const callback = new URL(url.searchParams.get("redirect_uri") ?? "")
  callback.search = new URLSearchParams({ state: url.searchParams.get("state") ?? "", code: "expired", client_id: "fixture-issued-client" }).toString()
  const response = await fetch(callback)
  expect(response.status).toBe(400)
  const html = await response.text()
  const href = html.match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&")
  if (!href) throw new Error("Missing validated retry link")
  const retry = new URL(href)
  expect(retry.searchParams.get("client_id")).toBe("fixture-issued-client")
  expect(retry.searchParams.get("ext_agent_host_id")).toBe(url.searchParams.get("ext_agent_host_id"))
  expect(retry.searchParams.get("state")).not.toBe(url.searchParams.get("state"))
  expect((await f.deliver({ ...initial, url: href }, "retried")).status).toBe(200)
  expect((await complete(initial)).metadata?.clientId).toBe("fixture-issued-client")
})
