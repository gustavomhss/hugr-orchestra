import { expect, spyOn } from "bun:test"
import { stat } from "node:fs/promises"
import path from "node:path"
import { Effect, Schema } from "effect"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { OwnOAuthApp } from "@orchestra/core/auth/oauth-app"
import { Auth } from "../../src/auth"
import { DigitalOceanAuthPlugin } from "../../src/plugin/digitalocean"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(Auth.node))
const issued = "8927d6fd39836377289fc753b996b8bb7a9f71870f0a2b01ddf1f45d7d9bc3cb"

it.live("DigitalOcean PKCE, callback rejection, bound-ID rotation and inherited reads over local HTTP", () =>
  Effect.gen(function* () {
    const auth = yield* Auth.Service
    yield* Effect.promise(async () => {
      const previous = process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID
      const inherited = process.env.ORCHESTRA_AUTH_CONTENT
      delete process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID
      delete process.env.ORCHESTRA_AUTH_CONTENT
      using restore = { [Symbol.dispose]() {
        if (previous === undefined) delete process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID
        if (previous !== undefined) process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID = previous
        if (inherited === undefined) delete process.env.ORCHESTRA_AUTH_CONTENT
        if (inherited !== undefined) process.env.ORCHESTRA_AUTH_CONTENT = inherited
      } }
      expect(OwnOAuthApp.requireClientID("digitalocean")).toBe(issued)
      process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID = "fixture-owned-override"
      expect(OwnOAuthApp.requireClientID("digitalocean")).toBe("fixture-owned-override")
      process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID = "b1a6c5158156caac821fd1b30253ca8acb52454a48fa744420e41889cb589f82"
      expect(() => OwnOAuthApp.requireClientID("digitalocean")).toThrow(OwnOAuthApp.ThirdPartyRegistrationError)
      delete process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID
      const forms: URLSearchParams[] = []
      const bearers: Array<string | null> = []
      using server = Bun.serve({ port: 0, async fetch(request) {
        if (new URL(request.url).pathname.endsWith("/token")) {
          forms.push(new URLSearchParams(await request.text()))
          await Bun.sleep(10)
          return Response.json({ access_token: `fixture-access-${forms.length}`, refresh_token: `fixture-refresh-${forms.length}`, expires_in: 3600, scope: "genai:read" })
        }
        bearers.push(request.headers.get("authorization"))
        return Response.json({ model_routers: [] })
      } })
      const original = fetch
      // Fixed provider origins require this transport boundary; HTTP and Auth.set remain real.
      const transport = spyOn(globalThis, "fetch").mockImplementation(Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
        const url = new URL(input instanceof Request ? input.url : input.toString())
        if (!["https://cloud.digitalocean.com", "https://api.digitalocean.com", "https://inference.do-ai.run"].includes(url.origin)) throw new Error("Unexpected fixture origin")
        return original(new URL(url.pathname, server.url), init)
      }, { preconnect: original.preconnect }))
      using reset = { [Symbol.dispose]() { transport.mockRestore() } }
      const writes: Auth.Info[] = []
      const hooks = await DigitalOceanAuthPlugin({ client: { auth: { async set(input: { body: unknown }) {
        const value = Schema.decodeUnknownSync(Auth.Info)(input.body)
        writes.push(value)
        await Effect.runPromise(auth.set("digitalocean", value))
      } } } } as never)
      const method = hooks.auth?.methods.find((method) => method.type === "oauth")
      if (!method || method.type !== "oauth") throw new Error("Missing DigitalOcean OAuth method")
      const attempt = await method.authorize({})
      if (attempt.method !== "auto") throw new Error("Expected automatic callback")
      const url = new URL(attempt.url)
      expect(url.origin + url.pathname).toBe("https://cloud.digitalocean.com/v1/oauth/authorize")
      expect(url.searchParams.get("response_type")).toBe("code")
      expect(url.searchParams.get("client_id")).toBe(issued)
      expect(url.searchParams.get("code_challenge_method")).toBe("S256")
      expect(url.searchParams.get("scope")).toBe("genai:read inference:query")
      const redirect = url.searchParams.get("redirect_uri")!
      expect(redirect).toBe("http://127.0.0.1:1456/auth/callback")
      expect((await original(new URL("/auth/token", redirect), { method: "POST", body: "fixture-implicit-token" })).status).toBe(404)
      const callback = new URL(redirect)
      callback.searchParams.set("state", url.searchParams.get("state")!)
      callback.searchParams.set("code", "fixture-code")
      const resultPromise = attempt.callback()
      process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID = "fixture-changed-registration"
      expect((await original(callback)).status).toBe(200)
      const result = await resultPromise
      expect(result.type).toBe("success")
      const stored = Schema.decodeUnknownSync(Auth.Oauth)({ ...result, type: "oauth" })
      expect(stored.metadata).toMatchObject({ clientID: issued, scopes: "genai:read" })
      expect(forms[0].get("client_id")).toBe(issued)
      expect(forms[0].get("redirect_uri")).toBe(redirect)
      expect(forms[0].get("grant_type")).toBe("authorization_code")
      expect(forms[0].has("client_secret")).toBe(false)
      expect(Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(forms[0].get("code_verifier")!))).toString("base64url")).toBe(url.searchParams.get("code_challenge"))
      await Effect.runPromise(auth.set("digitalocean", { ...stored, expires: 1 }))
      const before = await stat(path.join(Global.Path.data, "auth.json"))
      const getAuth = async () => (await Effect.runPromise(auth.get("digitalocean")))!
      const loaded = await hooks.auth!.loader!(getAuth, {} as never)
      await Promise.all([loaded.fetch!("https://inference.do-ai.run/v1/chat/completions"), loaded.fetch!("https://inference.do-ai.run/v1/chat/completions")])
      expect(forms).toHaveLength(2)
      expect(forms[1].get("grant_type")).toBe("refresh_token")
      expect(forms[1].get("refresh_token")).toBe("fixture-refresh-1")
      expect(forms[1].get("client_id")).toBe(issued)
      expect(forms[1].has("client_secret")).toBe(false)
      expect(writes).toHaveLength(1)
      expect(await getAuth()).toMatchObject({ access: "fixture-access-2", refresh: "fixture-refresh-2", metadata: { clientID: issued, scopes: "genai:read" } })
      const after = await stat(path.join(Global.Path.data, "auth.json"))
      expect(after.mode & 0o777).toBe(0o600)
      expect(after.ino).not.toBe(before.ino)
      expect(bearers.slice(-2)).toEqual(["Bearer fixture-access-2", "Bearer fixture-access-2"])
      process.env.ORCHESTRA_AUTH_CONTENT = "{}"
      const inheritedRead = await hooks.auth!.loader!(async () => stored, {} as never)
      await inheritedRead.fetch!("https://inference.do-ai.run/v1/chat/completions")
      const inheritedLoader = await hooks.auth!.loader!(async () => ({ ...stored, expires: 1 }), {} as never)
      await expect(inheritedLoader.fetch!("https://inference.do-ai.run/v1/chat/completions")).rejects.toThrow("Inherited DigitalOcean OAuth")
      expect(forms).toHaveLength(2)
      delete process.env.ORCHESTRA_AUTH_CONTENT
      expect(await hooks.auth!.loader!(async () => ({ type: "api", key: "fixture-key" }), {} as never)).toEqual({})
      delete process.env.ORCHESTRA_DIGITALOCEAN_CLIENT_ID
      for (const query of [{ state: "wrong", code: "fixture-code" }, { error: "access_denied", code: "ignored" }, {}]) {
        const next = await method.authorize({})
        if (next.method !== "auto") throw new Error("Expected automatic callback")
        const nextURL = new URL(next.url)
        expect(nextURL.searchParams.get("state")).not.toBe(url.searchParams.get("state"))
        expect(nextURL.searchParams.get("code_challenge")).not.toBe(url.searchParams.get("code_challenge"))
        const target = new URL(nextURL.searchParams.get("redirect_uri")!)
        target.searchParams.set("state", nextURL.searchParams.get("state")!)
        Object.entries(query).forEach(([key, value]) => { if (value !== undefined) target.searchParams.set(key, value) })
        const failed = next.callback()
        expect((await original(target)).status).toBe(400)
        expect(await failed).toEqual({ type: "failed" })
        expect(forms).toHaveLength(2)
      }
      await hooks.dispose?.()
    })
  }),
)
