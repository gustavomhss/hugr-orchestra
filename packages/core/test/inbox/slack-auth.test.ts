import { describe, expect } from "bun:test"
import { createHash } from "node:crypto"
import { sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { AppNodeBuilder } from "../../src/effect/app-node-builder"
import { LayerNode } from "../../src/effect/layer-node"
import { Database } from "../../src/database/database"
import { Credential } from "../../src/credential"
import { Location } from "../../src/location"
import { ProjectV2 } from "../../src/project"
import { AbsolutePath } from "../../src/schema"
import { clientID, make, scopes } from "../../src/inbox/slack-auth"
import { testEffect } from "../lib/effect"

const directory = AbsolutePath.make("/project")
const it = testEffect(AppNodeBuilder.build(LayerNode.group([Database.node, Credential.node]), [
  [Location.node, Layer.succeed(Location.Service, { directory, project: { id: ProjectV2.ID.global, directory } })],
]))

async function fixture(
  credentials: Credential.Interface,
  run: (input: {
    auth: ReturnType<typeof make>
    calls: { path: string; form: URLSearchParams; authorization: string | null }[]
    provider: { deny: boolean; wrongUser: boolean; bot: boolean; holdExchange: boolean }
    exchanging: PromiseWithResolvers<void>
    release: PromiseWithResolvers<void>
  }) => Promise<void>,
  options: { ttlMs?: number } = {},
) {
  const calls: { path: string; form: URLSearchParams; authorization: string | null }[] = []
  const provider = { deny: false, wrongUser: false, bot: false, holdExchange: false }
  const exchanging = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  const server = Bun.serve({
    hostname: "127.0.0.1", port: 0,
    async fetch(req) {
      const path = new URL(req.url).pathname
      const form = new URLSearchParams(await req.text())
      calls.push({ path, form, authorization: req.headers.get("authorization") })
      if (provider.deny) return Response.json({ ok: false, error: "invalid_code", error_description: "secret-provider-detail" })
      if (path === "/api/auth.test") return Response.json({
        ok: true, team_id: "T123", user_id: provider.wrongUser ? "U999" : "U123", team: "Test workspace", user: "ada",
      })
      if (path !== "/api/oauth.v2.access") return Response.json({ ok: false, error: "unexpected_endpoint" })
      if (provider.holdExchange) {
        exchanging.resolve()
        await release.promise
      }
      const value = {
        token_type: provider.bot ? "bot" : "user", scope: scopes.join(","),
        access_token: form.get("grant_type") === "refresh_token" ? "rotated-access-secret" : "access-secret",
        refresh_token: form.get("grant_type") === "refresh_token" ? "rotated-refresh-secret" : "refresh-secret",
        expires_in: 43200, id: "U123",
      }
      return Response.json(form.get("grant_type") === "refresh_token"
        ? { ok: true, ...value }
        : { ok: true, authed_user: value, team: { id: "T123" } })
    },
  })
  const auth = make(credentials, { port: 0, fixtureOrigin: server.url.origin, ...options })
  try {
    await run({ auth, calls, provider, exchanging, release })
  } finally {
    release.resolve()
    await auth.close()
    await server.stop(true)
  }
}

async function callback(challenge: { url: string }, params: Record<string, string> = {}) {
  const url = new URL(challenge.url)
  const target = new URL(url.searchParams.get("redirect_uri")!)
  target.searchParams.set("state", url.searchParams.get("state")!)
  target.searchParams.set("code", "code-secret")
  Object.entries(params).forEach(([key, value]) => target.searchParams.set(key, value))
  return fetch(target)
}

function authTest(name: string, body: Parameters<typeof fixture>[1], options?: { ttlMs?: number }) {
  it.effect(name, () => Effect.gen(function* () {
    const credentials = yield* Credential.Service
    yield* Effect.promise(() => fixture(credentials, body, options))
  }))
}

describe("Slack local PKCE", () => {
  authTest("S1 exchanges directly with PKCE and stores only a verified user grant", async ({ auth, calls }) => {
    const challenge = await Effect.runPromise(auth.start("owner-a"))
    const url = new URL(challenge.url)
    expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize")
    expect(url.searchParams.get("client_id")).toBe(clientID)
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("user_scope")?.split(",")).toEqual([...scopes])
    expect(url.searchParams.get("scope")).toBe("")
    expect(url.searchParams.has("client_secret")).toBe(false)
    expect(calls).toHaveLength(0)
    const response = await callback(challenge)
    expect(response.status).toBe(200)
    const form = calls[0]!.form
    expect(calls.map((call) => call.path)).toEqual(["/api/oauth.v2.access", "/api/auth.test"])
    expect(form.get("code")).toBe("code-secret")
    expect(form.get("redirect_uri")).toBe(url.searchParams.get("redirect_uri"))
    expect(form.has("client_secret")).toBe(false)
    expect(calls[0]?.authorization).toBeNull()
    expect(createHash("sha256").update(form.get("code_verifier")!).digest("base64url"))
      .toBe(url.searchParams.get("code_challenge")!)
    expect(await Effect.runPromise(auth.status("owner-a", challenge.id))).toEqual({
      connected: true, team: "Test workspace", user: "ada", state: "connected",
    })
    expect(await Effect.runPromise(auth.access("owner-a"))).toBe("access-secret")
    expect(await response.text()).not.toContain("access-secret")
    expect(JSON.stringify(await Effect.runPromise(auth.status("owner-a", challenge.id)))).not.toContain("secret")
  })

  authTest("S2 invalid state does not exchange, consume or disclose the valid pending flow", async ({ auth, calls }) => {
    const challenge = await Effect.runPromise(auth.start("owner-a"))
    expect((await callback(challenge, { state: "unknown-state" })).status).toBe(400)
    expect(calls).toHaveLength(0)
    expect((await Effect.runPromise(auth.status("owner-a", challenge.id))).state).toBe("pending")
    expect((await callback(challenge)).status).toBe(200)
    expect(calls).toHaveLength(2)
  })

  authTest("S3 cancel settles the flow and cannot persist a credential", async ({ auth, calls }) => {
    const challenge = await Effect.runPromise(auth.start("owner-a"))
    await Effect.runPromise(auth.cancel("owner-a", challenge.id))
    expect(await Effect.runPromise(auth.status("owner-a", challenge.id))).toEqual({ connected: false, state: "cancelled" })
    expect(calls).toHaveLength(0)
  })

  authTest("S4 denial is sanitized and does not create a grant", async ({ auth, calls }) => {
    const challenge = await Effect.runPromise(auth.start("owner-a"))
    const response = await callback(challenge, { error: "access_denied", error_description: "<script>secret-provider-detail</script>" })
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain("secret-provider-detail")
    expect((await Effect.runPromise(auth.status("owner-a", challenge.id))).state).toBe("failed")
    expect(calls).toHaveLength(0)
  })

  authTest("S5 owner isolation applies to receipts, cancellation and stored grants", async ({ auth }) => {
    const challenge = await Effect.runPromise(auth.start("owner-a"))
    await Effect.runPromise(auth.cancel("owner-b", challenge.id))
    expect(await Effect.runPromise(auth.status("owner-b", challenge.id))).toEqual({ connected: false, state: "expired" })
    expect((await Effect.runPromise(auth.status("owner-a", challenge.id))).state).toBe("pending")
    await callback(challenge)
    expect(await Effect.runPromise(auth.status("owner-b"))).toEqual({ connected: false, state: "idle" })
    expect(await Effect.runPromise(auth.access("owner-b").pipe(Effect.flip))).toMatchObject({ reason: "unavailable" })
  })

  authTest("S6 rejects a second active flow instead of replacing its listener", async ({ auth }) => {
    const challenge = await Effect.runPromise(auth.start("owner-a"))
    expect(await Effect.runPromise(auth.start("owner-b").pipe(Effect.flip))).toMatchObject({ reason: "busy" })
    expect((await callback(challenge)).status).toBe(200)
  })

  authTest("S7 rejects methods, hosts, paths and duplicate callback parameters", async ({ auth, calls }) => {
    const challenge = await Effect.runPromise(auth.start("owner-a"))
    const redirect = new URL(new URL(challenge.url).searchParams.get("redirect_uri")!)
    expect((await fetch(redirect, { method: "POST" })).status).toBe(405)
    expect((await fetch(redirect, { headers: { host: "evil.example" } })).status).toBe(400)
    expect((await fetch(new URL("/wrong-path", redirect))).status).toBe(404)
    const state = new URL(challenge.url).searchParams.get("state")!
    expect((await fetch(`${redirect}?state=${state}&state=${state}&code=secret`)).status).toBe(400)
    expect(calls).toHaveLength(0)
    expect((await callback(challenge)).status).toBe(200)
  })

  authTest("S8 token exchange errors do not expose provider text or claim connection", async ({ auth, provider }) => {
    const challenge = await Effect.runPromise(auth.start("owner-a"))
    provider.deny = true
    const response = await callback(challenge)
    expect(response.status).toBe(400)
    expect(await response.text()).not.toContain("secret-provider-detail")
    expect(await Effect.runPromise(auth.status("owner-a", challenge.id))).toEqual({ connected: false, state: "failed" })
  })

  authTest("S9 rejects bot tokens in the personal user flow", async ({ auth, provider }) => {
    provider.bot = true
    const challenge = await Effect.runPromise(auth.start("owner-a"))
    expect((await callback(challenge)).status).toBe(400)
    expect((await Effect.runPromise(auth.status("owner-a"))).connected).toBe(false)
  })

  authTest("S10 rejects a different authenticated principal", async ({ auth, provider }) => {
    provider.wrongUser = true
    const challenge = await Effect.runPromise(auth.start("owner-a"))
    expect((await callback(challenge)).status).toBe(400)
    expect((await Effect.runPromise(auth.status("owner-a"))).connected).toBe(false)
  })

  authTest("S11 disconnect removes only this owner's local connection, not provider authorization", async ({ auth, calls }) => {
    await callback(await Effect.runPromise(auth.start("owner-a")))
    await callback(await Effect.runPromise(auth.start("owner-b")))
    await Effect.runPromise(auth.disconnect("owner-a"))
    expect((await Effect.runPromise(auth.status("owner-a"))).connected).toBe(false)
    expect((await Effect.runPromise(auth.status("owner-b"))).connected).toBe(true)
    expect(calls.every((call) => ["/api/oauth.v2.access", "/api/auth.test"].includes(call.path))).toBe(true)
  })

  it.effect("S12 refresh is serialized and rotates the stored token without a client secret", () => Effect.gen(function* () {
    const credentials = yield* Credential.Service
    yield* Effect.promise(() => fixture(credentials, async ({ auth, calls }) => {
      await callback(await Effect.runPromise(auth.start("owner-a")))
      const row = (await Effect.runPromise(credentials.all())).find((row) => row.value.metadata?.owner === "owner-a")!
      if (row.value.type !== "oauth") throw new Error("expected oauth credential")
      await Effect.runPromise(credentials.update(row.id, { value: { ...row.value, expires: 0 } }))
      expect(await Promise.all([Effect.runPromise(auth.access("owner-a")), Effect.runPromise(auth.access("owner-a"))]))
        .toEqual(["rotated-access-secret", "rotated-access-secret"])
      const refreshes = calls.filter((call) => call.form.get("grant_type") === "refresh_token")
      expect(refreshes).toHaveLength(1)
      expect(refreshes[0]?.form.get("refresh_token")).toBe("refresh-secret")
      expect(refreshes[0]?.form.has("client_secret")).toBe(false)
      const saved = await Effect.runPromise(credentials.get(row.id))
      expect(saved?.value.type === "oauth" && saved.value.refresh).toBe("rotated-refresh-secret")
    }))
  }))

  it.effect("S13 occupied callback port is not stopped or stolen", () => Effect.gen(function* () {
    const credentials = yield* Credential.Service
    yield* Effect.promise(async () => {
      const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("other-owner") })
      const auth = make(credentials, { port: server.port! })
      try {
        expect(await Effect.runPromise(auth.start("owner-a").pipe(Effect.flip))).toMatchObject({ reason: "unavailable" })
        expect(await (await fetch(server.url)).text()).toBe("other-owner")
      } finally {
        await auth.close()
        await server.stop(true)
      }
    })
  }))

  authTest("S14 concurrent callback replay exchanges the code only once", async ({ auth, calls }) => {
    const challenge = await Effect.runPromise(auth.start("owner-a"))
    const statuses = await Promise.all([callback(challenge), callback(challenge)]).then((responses) => responses.map((response) => response.status).sort())
    expect(statuses).toEqual([200, 400])
    expect(calls.filter((call) => call.path === "/api/oauth.v2.access")).toHaveLength(1)
  })

  authTest("S15 expiration releases the listener and cannot exchange a late code", async ({ auth, calls }) => {
    const challenge = await Effect.runPromise(auth.start("owner-a"))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(await Effect.runPromise(auth.status("owner-a", challenge.id))).toEqual({ connected: false, state: "expired" })
    await callback(challenge).catch(() => undefined)
    expect(calls).toHaveLength(0)
    const next = await Effect.runPromise(auth.start("owner-a"))
    expect(next.id).not.toBe(challenge.id)
  }, { ttlMs: 10 })

  it.effect("S16 real SQLite write failure cannot claim a successful login", () => Effect.gen(function* () {
    const credentials = yield* Credential.Service
    const database = yield* Database.Service
    yield* database.db.run(sql.raw("CREATE TRIGGER reject_slack_credential BEFORE INSERT ON credential BEGIN SELECT RAISE(ABORT, 'storage failure probe'); END"))
    yield* Effect.promise(() => fixture(credentials, async ({ auth }) => {
      const challenge = await Effect.runPromise(auth.start("owner-a"))
      const response = await callback(challenge)
      expect(response.status).toBe(400)
      expect(await response.text()).not.toContain("storage failure probe")
      expect(await Effect.runPromise(auth.status("owner-a", challenge.id))).toEqual({ connected: false, state: "failed" })
      expect(await Effect.runPromise(credentials.all())).toHaveLength(0)
    }))
  }))

  it.effect("S17 failed refresh retains the stored credential and asks for reconnection", () => Effect.gen(function* () {
    const credentials = yield* Credential.Service
    yield* Effect.promise(() => fixture(credentials, async ({ auth, provider }) => {
      await callback(await Effect.runPromise(auth.start("owner-a")))
      const row = (await Effect.runPromise(credentials.all())).find((row) => row.value.metadata?.owner === "owner-a")!
      if (row.value.type !== "oauth") throw new Error("expected oauth credential")
      await Effect.runPromise(credentials.update(row.id, { value: { ...row.value, expires: 0 } }))
      provider.deny = true
      expect((await Effect.runPromise(auth.status("owner-a"))).connected).toBe(false)
      const saved = await Effect.runPromise(credentials.get(row.id))
      expect(saved?.value.type === "oauth" && saved.value.refresh).toBe("refresh-secret")
    }))
  }))

  authTest("S18 failed reconnect preserves the previously verified account", async ({ auth, provider }) => {
    await callback(await Effect.runPromise(auth.start("owner-a")))
    provider.deny = true
    const challenge = await Effect.runPromise(auth.start("owner-a"))
    expect((await callback(challenge)).status).toBe(400)
    expect(await Effect.runPromise(auth.status("owner-a", challenge.id))).toMatchObject({ connected: true, state: "failed" })
  })

  authTest("S19 cancellation during the HTTP exchange cannot persist the late grant", async ({ auth, provider, exchanging, release }) => {
    provider.holdExchange = true
    const challenge = await Effect.runPromise(auth.start("owner-a"))
    const response = callback(challenge)
    await exchanging.promise
    await Effect.runPromise(auth.cancel("owner-a", challenge.id))
    release.resolve()
    expect((await response).status).toBe(400)
    expect(await Effect.runPromise(auth.status("owner-a", challenge.id))).toEqual({ connected: false, state: "cancelled" })
  })
})
