import { describe, expect, setSystemTime } from "bun:test"
import type { Auth, Model, Provider } from "@orchestra/sdk/v2"
import { Effect, Layer } from "effect"
import { CodexAuthPlugin } from "../../src/plugin/openai/codex"
import { LegacyCodexReadonlyPlugin } from "../../src/plugin/openai/legacy-codex-readonly"
import { OAUTH_DUMMY_KEY } from "../../src/auth"
import { testEffect } from "../lib/effect"

// R1 supplies the production plugin. This file supplies transport observation only,
// not credential admission, URL rewriting, model filtering, or a second consumer.
const it = testEffect(Layer.empty)
const NOW = 1_900_000_000_000
const MINUTE = 60_000
const SOURCE = "https://api.openai.com/v1/responses"
const BACKEND = "https://chatgpt.com/backend-api/codex/responses"
const BODY = '{"model":"gpt-6.1-sol","input":[],"stream":true}'
const REPLY = "event: response.completed\ndata: {\"id\":\"synthetic-response\"}\n\n"

function credential(extra: Record<string, unknown> = {}) {
  return { type: "oauth" as const, access: "synthetic-legacy-access", refresh: "synthetic-never-refresh",
    expires: NOW + 30 * MINUTE, accountId: "synthetic-account-exact", ...extra }
}

function provider(pro = false) {
  const model = (id: string) => ({
    id, providerID: "openai", name: id, family: "test", status: "active", release_date: "2026-01-01",
    api: { id, url: "https://api.openai.com/v1", npm: "@ai-sdk/openai" }, headers: {}, options: {},
    cost: { input: 1, output: 2, cache: { read: 1, write: 1 } }, limit: { context: 128_000, output: 16_384 },
    capabilities: { temperature: true, reasoning: true, attachment: false, toolcall: true,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false }, interleaved: false },
  } satisfies Model)
  return { id: "openai", name: "OpenAI", source: "api", env: [], options: {},
    models: Object.fromEntries<Model>([
      ...["gpt-6.1-sol", "gpt-4.1", "o3", "unrelated-test-model"].map((id) => [id, model(id)] as const),
      ...(pro ? [["gpt-6.1-sol-pro", { ...model("gpt-6.1-sol-pro"), options: { reasoningMode: "pro" } }] as const] : []),
    ]) } satisfies Provider
}

const fixture = (auth: ReturnType<typeof credential>, options: {
  inherited?: boolean
  response?: (request: Request) => Response | Promise<Response>
} = {}) => Effect.gen(function* () {
  yield* Effect.acquireRelease(Effect.sync(() => {
    const previous = process.env.ORCHESTRA_AUTH_CONTENT
    setSystemTime(NOW)
    if (options.inherited === false) delete process.env.ORCHESTRA_AUTH_CONTENT
    if (options.inherited !== false) process.env.ORCHESTRA_AUTH_CONTENT = JSON.stringify({ openai: auth })
    return previous
  }), (previous) => Effect.sync(() => {
    if (previous === undefined) delete process.env.ORCHESTRA_AUTH_CONTENT
    if (previous !== undefined) process.env.ORCHESTRA_AUTH_CONTENT = previous
    setSystemTime()
  }))
  const observed = {
    attempts: [] as Array<{ url: string; redirect: RequestRedirect; signal: AbortSignal }>,
    requests: [] as Array<{ path: string; method: string; authorization: string | null; account: string | null; body: string }>,
  }
  const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ hostname: "127.0.0.1", port: 0,
    async fetch(request) {
      observed.requests.push({ path: new URL(request.url).pathname, method: request.method,
        authorization: request.headers.get("authorization"), account: request.headers.get("chatgpt-account-id"),
        body: await request.text() })
      return options.response ? options.response(request) : new Response(REPLY, {
        status: 201, headers: { "content-type": "text/event-stream", "x-loopback-proof": "received" },
      })
    },
  })), (server) => Effect.sync(() => server.stop(true)))
  const send: typeof fetch = Object.assign(async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const request = new Request(input, init)
    observed.attempts.push({ url: request.url, redirect: request.redirect, signal: request.signal })
    // A wrong/refused destination cannot escape to the Internet, nor count as a gate rejection.
    expect(request.url).toBe(BACKEND)
    expect(request.redirect).toBe("error")
    return fetch(new Request(new URL("/receive", server.url), request))
  }, { preconnect: fetch.preconnect })
  const hooks = yield* Effect.promise(() => LegacyCodexReadonlyPlugin({} as never, send))
  expect(hooks.auth?.provider).toBe("openai")
  expect(hooks.auth?.methods).toEqual([])
  const load = async (getAuth: () => Promise<Auth> = async () => auth as Auth) => {
    if (!hooks.auth?.loader) throw new Error("Actual legacy read-only auth.loader missing")
    const config: Record<string, unknown> = await hooks.auth.loader(getAuth, provider() as never)
    expect(config.apiKey).toBe(OAUTH_DUMMY_KEY)
    expect(config.apiKey).not.toBe(auth.access)
    expect(config.apiKey).not.toBe(auth.refresh)
    if (typeof config.fetch !== "function") throw new Error("Actual legacy read-only fetch wrapper missing")
    return config.fetch as typeof fetch
  }
  const models = async (catalog = provider()) => {
    if (!hooks.provider?.models) throw new Error("Actual legacy read-only provider.models missing")
    return hooks.provider.models(catalog, { auth: auth as Auth })
  }
  return { auth, hooks, send, load, models, observed }
})

describe("plugin.legacy-codex-readonly actual hooks / loopback HTTP", () => {
  it.live("absent metadata works in the explicit legacy plugin, not the normal issued-registration plugin", () => Effect.gen(function* () {
    const f = yield* fixture(credential())
    const normal = yield* Effect.promise(() => CodexAuthPlugin({} as never, { send: (request) => f.send(request) }))
    expect(normal.auth?.loader).toBeFunction()
    expect(normal.auth?.methods.some((method) => method.type === "oauth")).toBe(true)
    expect(normal.provider?.models).toBeFunction()
    yield* Effect.promise(async () => {
      await expect(normal.auth!.loader!(async () => f.auth as Auth, provider() as never)).rejects.toThrow("Missing validated ChatGPT registration")
      await expect(normal.provider!.models!(provider(), { auth: f.auth as Auth })).rejects.toThrow("Missing validated ChatGPT registration")
      const wrapper = await f.load()
      const response = await wrapper(SOURCE, { method: "POST", body: BODY })
      expect(response.status).toBe(201)
      expect(response.headers.get("x-loopback-proof")).toBe("received")
      expect(await response.text()).toBe(REPLY)
    })
    expect(f.observed.attempts).toHaveLength(1)
    expect(f.observed.requests).toEqual([{ path: "/receive", method: "POST", authorization: `Bearer ${f.auth.access}`,
      account: f.auth.accountId, body: BODY }])
  }))

  const invalidMetadata = [
    { name: "explicit undefined", metadata: undefined },
    { name: "null", metadata: null },
    { name: "empty", metadata: {} },
    { name: "partial issued registration", metadata: { clientId: "synthetic-issued-client" } },
    { name: "invalid issued client", metadata: { clientId: "dynamic_agent_client", hostId: "synthetic-host",
      issuer: "https://auth.openai.com", subject: "synthetic-subject", idToken: "synthetic-invalid-id-token",
      scopes: ["chatgpt.tokens.use.direct"] } },
  ]
  invalidMetadata.forEach((entry) => it.live(`refuses ${entry.name} metadata before loader or models send`, () => Effect.gen(function* () {
    const f = yield* fixture(credential({ metadata: entry.metadata }))
    expect(Object.hasOwn(f.auth, "metadata")).toBe(true)
    if (entry.metadata === undefined) expect(JSON.stringify(f.auth)).not.toContain('"metadata"')
    yield* Effect.promise(async () => {
      await expect(f.load()).rejects.toThrow("LEGACY_CODEX_METADATA_MUST_BE_ABSENT")
      await expect(f.models()).rejects.toThrow("LEGACY_CODEX_METADATA_MUST_BE_ABSENT")
    })
    expect(f.observed.attempts).toHaveLength(0)
    expect(f.observed.requests).toHaveLength(0)
  })))

  it.live("requires inherited scope even with a fresh synthetic OAuth record", () => Effect.gen(function* () {
    const f = yield* fixture(credential(), { inherited: false })
    yield* Effect.promise(async () => {
      await expect(f.load()).rejects.toThrow()
      await expect(f.models()).rejects.toThrow()
    })
    expect(f.observed.attempts).toHaveLength(0)
    expect(f.observed.requests).toHaveLength(0)
  }))

  it.live("loader refuses below fifteen minutes; accepts above without refreshing or discovery HTTP", () => Effect.gen(function* () {
    const f = yield* fixture(credential({ expires: NOW + 15 * MINUTE + 1_000 }))
    yield* Effect.promise(async () => { expect(await f.load()).toBeFunction() })
    setSystemTime(NOW + 2_000)
    yield* Effect.promise(async () => { await expect(f.load()).rejects.toThrow() })
    expect(f.observed.attempts).toHaveLength(0)
    expect(f.observed.requests).toHaveLength(0)
  }))

  it.live("send accepts above five minutes; refuses below with unchanged getAuth identity", () => Effect.gen(function* () {
    const f = yield* fixture(credential({ expires: NOW + 16 * MINUTE }))
    const wrapper = yield* Effect.promise(() => f.load())
    setSystemTime(NOW + 11 * MINUTE - 1_000)
    yield* Effect.promise(async () => { expect(await (await wrapper(SOURCE, { method: "POST", body: BODY,
      headers: { "chatgpt-account-id": "synthetic-source-account" } })).text()).toBe(REPLY) })
    setSystemTime(NOW + 11 * MINUTE + 1_000)
    yield* Effect.promise(async () => { await expect(wrapper(SOURCE, { method: "POST", body: BODY })).rejects.toThrow() })
    expect(f.observed.attempts).toHaveLength(1)
    expect(f.observed.requests).toHaveLength(1)
    expect(f.observed.requests[0].authorization).toBe(`Bearer ${f.auth.access}`)
  }))

  const changed = [
    { name: "access", change: { access: "synthetic-replaced-access" } },
    { name: "refresh", change: { refresh: "synthetic-replaced-refresh" } },
    { name: "account", change: { accountId: "synthetic-other-account" } },
    { name: "type", change: { type: "api", key: "synthetic-api-key" } },
    { name: "metadata", change: { metadata: { clientId: "synthetic-new-registration" } } },
  ]
  changed.forEach((entry) => it.live(`getAuth ${entry.name} changes refuse before send`, () => Effect.gen(function* () {
    const f = yield* fixture(credential())
    const selected = { value: f.auth as Auth }
    const wrapper = yield* Effect.promise(() => f.load(async () => selected.value))
    yield* Effect.promise(async () => { expect(await (await wrapper(SOURCE, { method: "POST", body: BODY })).text()).toBe(REPLY) })
    selected.value = { ...f.auth, ...entry.change } as Auth
    yield* Effect.promise(async () => { await expect(wrapper(SOURCE, { method: "POST", body: BODY })).rejects.toThrow() })
    expect(f.observed.attempts).toHaveLength(1)
    expect(f.observed.requests).toHaveLength(1)
  })))

  it.live("replaces source Authorization and API key; transmits the exact optional account", () => Effect.gen(function* () {
    const f = yield* fixture(credential())
    const wrapper = yield* Effect.promise(() => f.load())
    yield* Effect.promise(async () => {
      const response = await wrapper(new Request(SOURCE, { method: "POST", body: BODY,
        headers: { Authorization: "Bearer synthetic-source-api-key", "chatgpt-account-id": "synthetic-source-account" } }))
      expect(await response.text()).toBe(REPLY)
    })
    expect(f.observed.requests).toHaveLength(1)
    expect(f.observed.requests[0].authorization).toBe(`Bearer ${f.auth.access}`)
    expect(f.observed.requests[0].account).toBe("synthetic-account-exact")
    expect(f.observed.requests[0].body).toBe(BODY)
  }))

  it.live("omits account header when stored accountId is absent", () => Effect.gen(function* () {
    const f = yield* fixture(credential({ accountId: undefined }))
    const wrapper = yield* Effect.promise(() => f.load())
    yield* Effect.promise(async () => { expect(await (await wrapper(SOURCE, { method: "POST", body: BODY,
      headers: { "chatgpt-account-id": "synthetic-source-account" } })).text()).toBe(REPLY) })
    expect(f.observed.requests).toHaveLength(1)
    expect(f.observed.requests[0].account).toBeNull()
  }))

  const forbidden = ["http://api.openai.com/v1/responses", "https://api.openai.com.evil.invalid/v1/responses",
    "https://synthetic:secret@api.openai.com/v1/responses", "https://api.openai.com:444/v1/responses",
    "https://api.openai.com/v1/models", "https://api.openai.com/v1/responses?redirect=elsewhere",
    "https://api.openai.com/v1/responses#fragment", "https://auth.openai.com/oauth/token"]
  forbidden.forEach((url) => it.live(`URL allowlist refuses ${url}`, () => Effect.gen(function* () {
    const f = yield* fixture(credential())
    const wrapper = yield* Effect.promise(() => f.load())
    yield* Effect.promise(async () => { await expect(wrapper(url, { method: "POST", body: BODY })).rejects.toThrow() })
    expect(f.observed.attempts).toHaveLength(0)
    expect(f.observed.requests).toHaveLength(0)
  })))

  it.live("redirect error overrides caller follow; actual HTTP cannot hit redirect target", () => Effect.gen(function* () {
    const f = yield* fixture(credential(), { response: (request) => Response.redirect(new URL("/must-not-be-requested", request.url), 307) })
    const wrapper = yield* Effect.promise(() => f.load())
    yield* Effect.promise(async () => { await expect(wrapper(SOURCE, { method: "POST", body: BODY, redirect: "follow" })).rejects.toThrow() })
    expect(f.observed.attempts).toHaveLength(1)
    expect(f.observed.attempts[0].redirect).toBe("error")
    expect(f.observed.requests.map((request) => request.path)).toEqual(["/receive"])
  }))

  it.live("caller AbortSignal reaches an in-flight real HTTP response stream", () => Effect.gen(function* () {
    const f = yield* fixture(credential(), { response: () => new Response(new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("first-chunk")) },
    }), { headers: { "content-type": "text/event-stream" } }) })
    const wrapper = yield* Effect.promise(() => f.load())
    const abort = new AbortController()
    yield* Effect.promise(async () => {
      const response = await wrapper(SOURCE, { method: "POST", body: BODY, signal: abort.signal })
      expect(response.body).not.toBeNull()
      const reader = response.body!.getReader()
      const first = await reader.read()
      expect(first.done).toBe(false)
      expect(new TextDecoder().decode(first.value)).toBe("first-chunk")
      abort.abort(new Error("synthetic-caller-abort"))
      await expect(reader.read()).rejects.toThrow()
    })
    expect(f.observed.attempts).toHaveLength(1)
    expect(f.observed.attempts[0].signal.aborted).toBe(true)
    expect(f.observed.requests).toHaveLength(1)
  }), 10_000)

  it.live("model policy is local compiled-source filtering with a strict positive and excluded sentinels", () => Effect.gen(function* () {
    const f = yield* fixture(credential())
    const original = provider()
    const models = yield* Effect.promise(() => f.models())
    expect(Object.keys(original.models)).toHaveLength(4)
    expect(Object.keys(models).length).toBeGreaterThan(0)
    expect(models["gpt-6.1-sol"]).toBeDefined()
    expect(models["gpt-4.1"]).toBeUndefined()
    expect(models.o3).toBeUndefined()
    expect(models["unrelated-test-model"]).toBeUndefined()
    expect(Object.keys(models)).toEqual(["gpt-6.1-sol"])
    expect(models["gpt-6.1-sol"].api.npm).toBe("@ai-sdk/openai")
    expect(f.observed.attempts).toHaveLength(0)
    expect(f.observed.requests).toHaveLength(0)
  }))

  it.live("installed model policy rejects pro reasoning without losing the allowed Sol model", () => Effect.gen(function* () {
    const f = yield* fixture(credential())
    const catalog = provider(true)
    expect(Object.keys(catalog.models)).toHaveLength(5)
    expect(catalog.models["gpt-6.1-sol-pro"].options.reasoningMode).toBe("pro")
    const models = yield* Effect.promise(() => f.models(catalog))
    expect(Object.keys(models)).toEqual(["gpt-6.1-sol"])
    expect(models["gpt-6.1-sol"]).toBeDefined()
    expect(models["gpt-6.1-sol-pro"]).toBeUndefined()
    expect(f.observed.attempts).toHaveLength(0)
    expect(f.observed.requests).toHaveLength(0)
  }))
})
