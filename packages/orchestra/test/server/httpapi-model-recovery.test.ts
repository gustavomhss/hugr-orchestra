import { afterAll, expect, test } from "bun:test"
import { Context, Effect, ManagedRuntime } from "effect"
import { Credential } from "@orchestra/core/credential"
import { Integration } from "@orchestra/core/integration"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { memoMap } from "@orchestra/core/effect/memo-map"
import { HttpApiApp } from "../../src/server/routes/instance/httpapi/server"
import { tmpdir } from "../fixture/fixture"

const context = Context.empty() as Context.Context<unknown>
const config = {
  formatter: false as const,
  lsp: false as const,
  model: "opencode/ux-paid",
  enabled_providers: ["opencode"],
  provider: {
    opencode: {
      env: [],
      npm: "@ai-sdk/openai-compatible",
      api: "http://127.0.0.1:1/v1",
      models: {
        "ux-free": { name: "UX Free", cost: { input: 0, output: 0 }, limit: { context: 1000, output: 100 } },
        "ux-paid": { name: "UX Paid", cost: { input: 1, output: 1 }, limit: { context: 1000, output: 100 } },
      },
    },
  },
}

afterAll(() => HttpApiApp.webHandler().dispose())

test("fresh Location HTTP catalog exposes free Zen; key exposes paid; HTTP removal restores free", async () => {
  await using tmp = await tmpdir({ git: true, config })
  const consoleServer = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => Response.json({ config: {} }) })
  const credentials = ManagedRuntime.make(LayerNode.compile(Credential.node), { memoMap })
  const request = (route: string, init?: RequestInit) => {
    const url = new URL(route, "http://localhost")
    url.searchParams.set("location[directory]", tmp.path)
    return HttpApiApp.webHandler().handler(new Request(url, init), context)
  }
  const models = async () => {
    const response = await request("/api/model")
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    return (
      (await response.json()) as {
        data: Array<{ id: string; providerID: string; request: { body: { apiKey?: string } } }>
      }
    ).data
  }
  const preferred = async () => {
    const response = await request("/api/model/default")
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    return ((await response.json()) as { data: { id: string } | null }).data
  }
  try {
    const initial = await models()
    const initialDefault = await preferred()
    const providers = await request("/api/provider")
    expect(initial.find((model) => model.id === "ux-free")?.request.body.apiKey).toBe("public")
    expect(initial.some((model) => model.id === "ux-paid")).toBe(false)
    expect(initialDefault?.id).not.toBe("ux-paid")
    expect(providers.status).toBe(200)
    expect(((await providers.json()) as { data: Array<{ id: string }> }).data.map((provider) => provider.id)).toContain(
      "opencode",
    )

    // Seed a synthetic credential through the real Core service, without initiating Console network I/O.
    const credential = await credentials.runPromise(
      Effect.gen(function* () {
        const credentials = yield* Credential.Service
        return yield* credentials.create({
          integrationID: Integration.ID.make("opencode"),
          value: Credential.Key.make({
            type: "key",
            key: "synthetic-model-recovery-key",
            metadata: { server: consoleServer.url.origin },
          }),
        })
      }),
    )
    const paid = await models()
    const paidDefault = await preferred()
    expect(paid.some((model) => model.id === "ux-paid")).toBe(true)
    expect(paidDefault?.id).toBe("ux-paid")
    expect((await request(`/api/credential/${credential.id}`, { method: "DELETE" })).status).toBe(204)
    const free = await models()
    const freeDefault = await preferred()
    expect(free.some((model) => model.id === "ux-free")).toBe(true)
    expect(free.some((model) => model.id === "ux-paid")).toBe(false)
    expect(freeDefault?.id).not.toBe("ux-paid")
  } finally {
    await consoleServer.stop(true)
    await credentials.dispose()
  }
}, 60_000)

test("HTTP default is null when provider is explicitly disabled", async () => {
  await using tmp = await tmpdir({ git: true, config: { ...config, disabled_providers: ["opencode"] } })
  for (const route of ["/api/provider", "/api/model", "/api/model/default"]) {
    const response = await HttpApiApp.webHandler().handler(
      new Request(`http://localhost${route}?location[directory]=${encodeURIComponent(tmp.path)}`),
      context,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(((await response.json()) as { data: unknown }).data).toEqual(route.endsWith("default") ? null : [])
  }
}, 30_000)

test("HTTP provider policy keeps anonymous OpenCode out and returns a null default", async () => {
  await using tmp = await tmpdir({
    git: true,
    config: {
      ...config,
      experimental: { policies: [{ action: "provider.use", effect: "deny", resource: "opencode" }] },
    },
  })
  for (const route of ["/api/provider", "/api/model", "/api/model/default"]) {
    const response = await HttpApiApp.webHandler().handler(
      new Request(`http://localhost${route}?location[directory]=${encodeURIComponent(tmp.path)}`),
      context,
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(((await response.json()) as { data: unknown }).data).toEqual(route.endsWith("default") ? null : [])
  }
}, 30_000)

test("an empty legacy provider allowlist suppresses anonymous models on HTTP", async () => {
  await using tmp = await tmpdir({ git: true, config: { ...config, enabled_providers: [] } })
  for (const route of ["/api/provider", "/api/model", "/api/model/default"]) {
    const response = await HttpApiApp.webHandler().handler(
      new Request(`http://localhost${route}?location[directory]=${encodeURIComponent(tmp.path)}`),
      context,
    )
    expect(response.status).toBe(200)
    expect(((await response.json()) as { data: unknown }).data).toEqual(route.endsWith("default") ? null : [])
  }
}, 30_000)
