import { expect, test } from "bun:test"
import { generateKeyPairSync, sign } from "node:crypto"
import { join } from "node:path"
import { Effect, Exit, Fiber, Layer, Schema } from "effect"
import { Siwc } from "@orchestra/core/auth/siwc"
import { Global } from "@orchestra/core/global"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { ProviderV2 } from "@orchestra/core/provider"
import { Auth } from "../../src/auth"
import { CodexAuthPlugin } from "../../src/plugin/openai/codex"
import { Plugin } from "../../src/plugin"
import { ProviderAuth } from "../../src/provider/auth"
import { InstanceStore } from "../../src/project/instance-store"
import { provideInstance, testInstanceStoreLayer, tmpdir } from "../fixture/fixture"
import { it } from "../lib/effect"
import { assertPrivateFile } from "../../../core/test/fixture/private-file"
import type { AuthOAuthResult, Hooks } from "@orchestra/plugin"

async function fixture() {
  const tmp = await tmpdir()
  const keys = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 })
  const grants = new Map<string, { nonce: string; subject: string; badSignature?: boolean; invalid?: boolean }>()
  const signed = (audience: string, grant: { nonce: string; subject: string; badSignature?: boolean }) => {
    const signing = [
      Buffer.from(JSON.stringify({ alg: "RS256", kid: "fixture" })).toString("base64url"),
      Buffer.from(JSON.stringify({ iss: Siwc.issuer, aud: audience, sub: grant.subject,
        nonce: grant.nonce, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url"),
    ].join(".")
    return `${signing}.${sign("RSA-SHA256", Buffer.from(signing), grant.badSignature ? other.privateKey : keys.privateKey).toString("base64url")}`
  }
  const protocol = { modelBearer: "", beforeExchange: async () => {}, refresh: async (_body: URLSearchParams): Promise<Response> => Response.json({
    access_token: "fixture-rotated", refresh_token: "fixture-rotated-refresh", token_type: "Bearer", expires_in: 3600, scope: Siwc.scopes,
  }) }
  const requests: Array<{ path: string; body: string; authorization: string | null }> = []
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0,
    async fetch(request) {
      const path = new URL(request.url).pathname
      const text = await request.text()
      requests.push({ path, body: text, authorization: request.headers.get("authorization") })
      if (path === "/jwks") return Response.json({ keys: [{ ...keys.publicKey.export({ format: "jwk" }), kid: "fixture", alg: "RS256" }] })
      if (path === "/api/accounts/oauth/token") {
        const body = new URLSearchParams(text)
        if (body.get("grant_type") === "refresh_token") return protocol.refresh(body)
        const grant = grants.get(body.get("code") ?? "")
        if (!grant || grant.invalid) return Response.json({ error: "invalid_grant" }, { status: 400 })
        await protocol.beforeExchange()
        const id_token = signed(body.get("client_id") ?? "", grant)
        return Response.json({ id_token, access_token: "fixture-access", refresh_token: "fixture-refresh",
          token_type: "Bearer", expires_in: 3600, scope: Siwc.scopes })
      }
      if (path === "/v1/models") {
        if (protocol.modelBearer && request.headers.get("authorization") !== `Bearer ${protocol.modelBearer}`)
          return new Response("Expired fixture credential", { status: 401 })
        return Response.json({ models: [{ slug: "fixture-model", display_name: "Fixture model", visibility: "list" }] })
      }
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
  const deliver = async (result: { url: string }, code: string, subject = "fixture-subject", badSignature = false) => {
    const url = new URL(result.url)
    grants.set(code, { nonce: url.searchParams.get("nonce") ?? "", subject, badSignature })
    const callback = new URL(url.searchParams.get("redirect_uri") ?? "")
    callback.search = new URLSearchParams({ state: url.searchParams.get("state") ?? "", code,
      client_id: url.searchParams.get("client_id") === "dynamic_agent_client" ? "fixture-issued-client" : url.searchParams.get("client_id") ?? "" }).toString()
    return fetch(callback)
  }
  return { tmp, server, grants, protocol, signed, requests, targets, plugin, begin, deliver,
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
  await assertPrivateFile(join(f.tmp.path, "siwc", "host-id"))
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

async function storedAuth() {
  const value = await Auth.runPromise((store) => store.get("openai"))
  if (!value) throw new Error("Fixture credential removed")
  return value
}

async function loaded(hook: Hooks, getAuth = storedAuth) {
  if (!hook.auth?.loader) throw new Error("Missing legacy loader")
  return hook.auth.loader(getAuth, {} as never)
}

const request = () => new Request(`${Siwc.resource}/responses`, { method: "POST",
  headers: { Authorization: "Bearer stale-sdk-key", "session-id": "fixture-session", originator: "opencode" },
  body: JSON.stringify({ model: "fixture-model", input: "fixture", tools: [{ type: "function", name: "fixture_tool", parameters: {} }],
    runtime_grants: { fixture: true }, store: false, stream: true }),
})

test("two legacy adapters share own-store lease; refresh keeps saved client and metadata, official inference body", async () => {
  await using f = await fixture()
  const first = await f.plugin()
  const initial = await f.begin(first)
  await f.deliver(initial, "initial")
  const saved = new Auth.Oauth({ ...await complete(initial), expires: 0 })
  await Auth.runPromise((store) => store.set("openai", saved))
  const second = await f.plugin()
  const started = Promise.withResolvers<void>()
  const release = Promise.withResolvers<void>()
  f.protocol.refresh = async (body) => {
    started.resolve()
    await release.promise
    expect(body.get("client_id")).toBe("fixture-issued-client")
    expect(body.get("resource")).toBe(Siwc.resource)
    expect(body.get("refresh_token")).toBe("fixture-refresh")
    return Response.json({ access_token: "fixture-rotated", refresh_token: "fixture-rotated-refresh", token_type: "Bearer",
      expires_in: 3600, scope: Siwc.scopes, id_token: f.signed("fixture-issued-client", {
        nonce: new URL(initial.url).searchParams.get("nonce") ?? "", subject: "fixture-subject",
      }) })
  }
  const one = await loaded(first)
  const two = await loaded(second)
  const previous = process.env.ORCHESTRA_OPENAI_CLIENT_ID
  process.env.ORCHESTRA_OPENAI_CLIENT_ID = "fixture-env-drift"
  using restore = { [Symbol.dispose]() {
    if (previous === undefined) delete process.env.ORCHESTRA_OPENAI_CLIENT_ID
    else process.env.ORCHESTRA_OPENAI_CLIENT_ID = previous
  } }
  const calls = [one.fetch(request()), two.fetch(request())]
  await started.promise
  expect(f.requests.filter((item) => new URLSearchParams(item.body).get("grant_type") === "refresh_token")).toHaveLength(1)
  release.resolve()
  await Promise.all(calls)
  expect(f.requests.filter((item) => new URLSearchParams(item.body).get("grant_type") === "refresh_token")).toHaveLength(1)
  const stored = await storedAuth()
  expect(stored).toMatchObject({ refresh: "fixture-rotated-refresh", access: "fixture-rotated", metadata: {
    clientId: "fixture-issued-client", subject: "fixture-subject", resource: Siwc.resource,
  } })
  await assertPrivateFile(join(Global.Path.data, "auth.json"))
  await assertPrivateFile(join(Global.Path.data, "auth-revisions.json"))
  const sent = f.requests.filter((item) => item.path === "/v1/responses")
  expect(sent).toHaveLength(2)
  expect(sent[0]?.authorization).toBe("Bearer fixture-rotated")
  expect(JSON.parse(sent[0]?.body ?? "")).toEqual(JSON.parse(await request().text()))
  expect(f.targets).toContain(`${Siwc.resource}/models`)
  expect(f.targets).toContain(`${Siwc.resource}/responses`)
})

test("disconnect during refresh cannot resurrect credential; signed refresh account change fails", async () => {
  await using f = await fixture()
  const hook = await f.plugin()
  const initial = await f.begin(hook)
  await f.deliver(initial, "initial")
  const saved = new Auth.Oauth({ ...await complete(initial), expires: 0 })
  await Auth.runPromise((store) => store.set("openai", saved))
  f.protocol.refresh = async (body) => Response.json({ access_token: "wrong", refresh_token: "wrong", token_type: "Bearer",
    expires_in: 3600, scope: Siwc.scopes, id_token: f.signed(body.get("client_id") ?? "", {
      nonce: new URL(initial.url).searchParams.get("nonce") ?? "", subject: "other-subject",
    }) })
  const transport = await loaded(hook)
  await expect(transport.fetch(request())).rejects.toThrow()
  expect(await storedAuth()).toEqual(saved)
  f.protocol.refresh = async () => {
    await Auth.runPromise((store) => store.remove("openai"))
    return Response.json({ access_token: "rotated", refresh_token: "rotated", token_type: "Bearer", expires_in: 3600, scope: Siwc.scopes })
  }
  await expect(transport.fetch(request())).rejects.toThrow("changed during refresh")
  expect(await Auth.runPromise((store) => store.get("openai"))).toBeUndefined()
  expect(f.requests.filter((item) => item.path === "/v1/responses")).toHaveLength(0)
})

test("inherited, switched accounts, missing plan scope and old backend fail before inference or token rotation", async () => {
  await using f = await fixture()
  const hook = await f.plugin({ readOnlyInheritGuard: async () => true })
  const initial = await f.begin(hook)
  await f.deliver(initial, "initial")
  const saved = new Auth.Oauth({ ...await complete(initial), expires: 0 })
  await Auth.runPromise((store) => store.set("openai", saved))
  const transport = await loaded(hook)
  const before = f.requests.length
  await expect(transport.fetch(request())).rejects.toThrow("Inherited")
  expect(f.requests).toHaveLength(before)
  expect(await storedAuth()).toEqual(saved)
  const own = await f.plugin()
  const foreign = await loaded(own, async () => new Auth.Oauth({ ...saved, refresh: "inherited-refresh" }))
  await expect(foreign.fetch(request())).rejects.toThrow("not owned by this store")
  expect(f.requests).toHaveLength(before)
  const ownTransport = await loaded(own)
  await Auth.runPromise((store) => store.set("openai", new Auth.Oauth({ ...saved,
    metadata: { ...saved.metadata, subject: "switched" } })))
  await expect(ownTransport.fetch(request())).rejects.toThrow("account changed")
  expect(f.requests).toHaveLength(before)
  await Auth.runPromise((store) => store.set("openai", new Auth.Oauth({ ...saved, expires: Date.now() + 3600000,
    metadata: { ...saved.metadata, scopes: ["openid"] } })))
  await expect(loaded(own)).rejects.toThrow("plan use is not authorized")
  await expect(transport.fetch("https://chatgpt.com/backend-api/codex/responses", { method: "POST" })).rejects.toThrow("endpoint")
  expect(f.requests).toHaveLength(before)
})

test("catalog uses saved permission; API key mode and explicit partner confirmation remain separate", async () => {
  await using f = await fixture()
  const previous = process.env.ORCHESTRA_OPENAI_CLIENT_ID
  process.env.ORCHESTRA_OPENAI_CLIENT_ID = "fixture-owned-partner"
  using restore = { [Symbol.dispose]() {
    if (previous === undefined) delete process.env.ORCHESTRA_OPENAI_CLIENT_ID
    else process.env.ORCHESTRA_OPENAI_CLIENT_ID = previous
  } }
  const hook = await f.plugin()
  expect(hook.auth?.methods.map((method) => method.label)).toEqual([
    "Continue with ChatGPT (Orchestra)", "Continue with ChatGPT (manual browser)", "Manually enter API Key",
  ])
  const api = await loaded(hook, async () => ({ type: "api", key: "fixture-key" }))
  expect(api.fetch).toBeUndefined()
  const partner = await f.plugin({ partnerGrantConfirmed: true })
  const method = partner.auth?.methods[2]
  if (method?.type !== "oauth") throw new Error("Missing confirmed partner method")
  expect(new URL((await method.authorize({ account: "new" })).url).searchParams.get("client_id")).toBe("fixture-owned-partner")
  const initial = await f.begin(hook)
  await f.deliver(initial, "initial")
  const saved = await complete(initial)
  expect(saved.metadata?.clientId).toBe("fixture-issued-client")
  await Auth.runPromise((store) => store.set("openai", saved))
  if (!hook.provider?.models) throw new Error("Missing model adapter")
  const provider = { models: {
    available: { id: "available", api: { id: "fixture-model", url: "old" }, name: "old", cost: { input: 5 } },
    unavailable: { id: "unavailable", api: { id: "unavailable" } },
  } }
  const models = await hook.provider.models(provider as never, { auth: saved })
  expect(Object.keys(models)).toEqual(["available"])
  expect(models.available?.api.url).toBe(Siwc.resource)
  expect(models.available?.cost.input).toBe(5)
})

test("catalog refreshes expired own credentials before HTTP; expired inherited and API-key init never rotate", async () => {
  await using f = await fixture()
  const hook = await f.plugin()
  const initial = await f.begin(hook)
  await f.deliver(initial, "catalog-seed")
  const saved = new Auth.Oauth({ ...await complete(initial), expires: 0 })
  await Auth.runPromise((store) => store.set("openai", saved))
  f.protocol.modelBearer = "fixture-rotated"
  expect((await fetch(new URL("/v1/models", f.server.url), { headers: { Authorization: `Bearer ${saved.access}` } })).status).toBe(401)
  const before = f.requests.length
  const provider = { models: { available: { id: "available", api: { id: "fixture-model" }, cost: { input: 5 } } } }
  if (!hook.provider?.models) throw new Error("Missing model adapter")
  expect(Object.keys(await hook.provider.models(provider as never, { auth: saved }))).toEqual(["available"])
  expect(f.requests.slice(before).map((item) => [item.path, item.authorization])).toEqual([
    ["/api/accounts/oauth/token", null], ["/v1/models", "Bearer fixture-rotated"],
  ])
  expect(await storedAuth()).toMatchObject({ access: "fixture-rotated", refresh: "fixture-rotated-refresh" })
  const readonly = await f.plugin({ readOnlyInheritGuard: async () => true })
  if (!readonly.provider?.models) throw new Error("Missing readonly model adapter")
  const after = f.requests.length
  await expect(readonly.provider.models(provider as never, { auth: saved })).rejects.toThrow("Inherited")
  expect(await hook.provider.models(provider as never, { auth: { type: "api", key: "fixture-api" } })).toBe(provider.models as never)
  expect(f.requests).toHaveLength(after)
})

function providerLayer(hook: Hooks) {
  // Only registry selection is injected: callbacks, persistence, leases and record are production implementations.
  return LayerNode.compile(LayerNode.group([ProviderAuth.node, Auth.node]), [[Plugin.node, Layer.mock(Plugin.Service)({
    list: () => Effect.succeed([hook]),
  })]])
}

it.live("ProviderAuth CAS preserves B/disconnect while saved A callback awaits signed token exchange", () => Effect.gen(function* () {
  const f = yield* Effect.acquireRelease(Effect.promise(fixture), (value) => Effect.promise(() => value[Symbol.asyncDispose]()))
  const hook = yield* Effect.promise(() => f.plugin())
  const seed = yield* Effect.promise(() => f.begin(hook))
  yield* Effect.promise(() => f.deliver(seed, "saved-seed"))
  const saved = yield* Effect.promise(() => complete(seed))
  yield* Effect.gen(function* () {
    const auth = yield* Auth.Service
    const provider = yield* ProviderAuth.Service
    const providerID = ProviderV2.ID.make("openai")
    yield* Effect.forEach(["switch", "disconnect"] as const, (change) => Effect.gen(function* () {
      yield* auth.set(providerID, saved)
      const authorization = yield* provider.authorize({ providerID, method: 0, inputs: { account: "saved" } })
      if (!authorization) return yield* Effect.die("Missing saved browser attempt")
      const started = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      f.protocol.beforeExchange = async () => { started.resolve(); await release.promise }
      yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
      const callback = yield* provider.callback({ providerID, method: 0 }).pipe(Effect.exit, Effect.forkChild)
      const response = yield* Effect.promise(() => f.deliver(authorization, `saved-${change}`)).pipe(Effect.forkChild)
      yield* Effect.promise(() => started.promise)
      const next = new Auth.Oauth({ ...saved, access: "B-access", refresh: "B-refresh", metadata: { ...saved.metadata, subject: "B-subject" } })
      if (change === "switch") yield* auth.set(providerID, next)
      if (change === "disconnect") yield* auth.remove(providerID)
      release.resolve()
      expect((yield* Fiber.join(response)).status).toBe(200)
      expect(Exit.isFailure(yield* Fiber.join(callback))).toBe(true)
      expect(yield* auth.get(providerID)).toEqual(change === "switch" ? next : undefined)
      const record = Schema.decodeUnknownSync(Schema.Record(Schema.String, Auth.Info))(
        yield* Effect.promise(() => Bun.file(join(Global.Path.data, "auth.json")).json()),
      )
      if (change === "switch") expect(record[providerID]).toEqual(next)
      if (change === "disconnect") expect(record[providerID]).toBeUndefined()
      yield* Effect.promise(() => assertPrivateFile(join(Global.Path.data, "auth.json")))
    }))
  }).pipe(Effect.provide(providerLayer(hook)), provideInstance(f.tmp.path), Effect.provide(testInstanceStoreLayer))
}))

it.live("ProviderAuth attempt replacement, disconnect and scope expiry reject stale absent-row callbacks", () => Effect.gen(function* () {
  const f = yield* Effect.acquireRelease(Effect.promise(fixture), (value) => Effect.promise(() => value[Symbol.asyncDispose]()))
  const unrelated = yield* Effect.acquireRelease(Effect.promise(() => tmpdir()), (value) => Effect.promise(() => value[Symbol.asyncDispose]()))
  const hook = yield* Effect.promise(() => f.plugin())
  yield* Effect.gen(function* () {
    const auth = yield* Auth.Service
    const provider = yield* ProviderAuth.Service
    const instances = yield* InstanceStore.Service
    const providerID = ProviderV2.ID.make("openai")
    yield* Effect.forEach(["replace", "cancel", "new-slot", "disconnect", "slot-aba", "scope"] as const, (change) => Effect.gen(function* () {
      yield* auth.remove(providerID)
      const authorization = yield* provider.authorize({ providerID, method: 0, inputs: { account: "new" } })
      if (!authorization) return yield* Effect.die("Missing new browser attempt")
      const started = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      f.protocol.beforeExchange = async () => { started.resolve(); await release.promise }
      yield* Effect.addFinalizer(() => Effect.sync(() => release.resolve()))
      const callback = yield* provider.callback({ providerID, method: 0 }).pipe(Effect.exit, Effect.forkChild)
      const response = yield* Effect.promise(() => f.deliver(authorization, `absent-${change}`)).pipe(Effect.forkChild)
      yield* Effect.promise(() => started.promise)
      const newer = change === "replace"
        ? yield* provider.authorize({ providerID, method: 0, inputs: { account: "new" } }) : undefined
      if (newer) {
        yield* instances.load({ directory: unrelated.path })
        yield* instances.disposeDirectory(unrelated.path)
      }
      if (change === "cancel") yield* provider.cancel({ providerID })
      const slot = new Auth.Api({ type: "api", key: "new-slot-B" })
      if (change === "new-slot") yield* auth.set(providerID, slot)
      if (change === "disconnect") yield* auth.remove(providerID)
      if (change === "slot-aba") yield* Effect.promise(async () => {
        const worker = Bun.spawn([process.execPath, "-e", `import { Auth } from ${JSON.stringify(new URL("../../src/auth/index.ts", import.meta.url).href)};
          await Auth.runPromise((store) => store.set("openai", new Auth.Api({ type: "api", key: "peer-account-B" })));
          await Auth.runPromise((store) => store.remove("openai"));
          process.exit(0);`], {
          cwd: join(import.meta.dir, "../.."),
          env: { ...process.env }, stdout: "pipe", stderr: "pipe", timeout: 30000,
        })
        const [code, stderr] = await Promise.all([worker.exited, new Response(worker.stderr).text()])
        if (code !== 0) throw new Error(`Auth ABA peer failed: ${stderr}`)
      })
      if (change === "scope") yield* instances.disposeDirectory(f.tmp.path)
      release.resolve()
      expect((yield* Fiber.join(response)).status).toBe(200)
      expect(Exit.isFailure(yield* Fiber.join(callback))).toBe(true)
      expect(yield* auth.get(providerID)).toEqual(change === "new-slot" ? slot : undefined)
      yield* Effect.promise(() => assertPrivateFile(join(Global.Path.data, "auth-revisions.json")))
      f.protocol.beforeExchange = async () => {}
      if (newer) {
        yield* Effect.promise(() => f.deliver(newer, "replacement-accepted"))
        yield* provider.callback({ providerID, method: 0 })
        expect(yield* auth.get(providerID)).toMatchObject({ access: "fixture-access", metadata: { subject: "fixture-subject" } })
        expect(Exit.isFailure(yield* provider.callback({ providerID, method: 0 }).pipe(Effect.exit))).toBe(true)
      }
    }))
  }).pipe(Effect.provide(providerLayer(hook)), provideInstance(f.tmp.path), Effect.provide(testInstanceStoreLayer))
}))
