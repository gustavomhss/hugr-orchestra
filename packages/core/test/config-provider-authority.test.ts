import { expect } from "bun:test"
import path from "path"
import { LLM } from "@orchestra/llm"
import { LLMClient, RequestExecutor } from "@orchestra/llm/route"
import { Effect, Layer, Schema } from "effect"
import { Catalog } from "@orchestra/core/catalog"
import { Config } from "@orchestra/core/config"
import { ConfigProviderPlugin } from "@orchestra/core/config/plugin/provider"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { Integration } from "@orchestra/core/integration"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { PluginV2 } from "@orchestra/core/plugin"
import { PluginHost } from "@orchestra/core/plugin/host"
import { ProviderV2 } from "@orchestra/core/provider"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { PluginTestLayer } from "./plugin/fixture"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.mergeAll(PluginTestLayer, LayerNode.compile(Global.node)))
const decode = Schema.decodeUnknownSync(Config.Info)
const providerID = ProviderV2.ID.make("audit-authority")
const modelID = ModelV2.ID.make("chat")

const configure = Effect.fn(function* (entries: Config.Entry[]) {
  const plugins = yield* PluginV2.Service
  const host = yield* PluginHost.make(plugins)
  yield* ConfigProviderPlugin.Plugin.effect(host).pipe(
    Effect.provideService(Config.Service, Config.Service.of({ entries: () => Effect.succeed(entries) })),
  )
})

function required<T>(value: T | undefined) {
  if (value === undefined) throw new Error("Expected configured authority fixture")
  return value
}

for (const trusted of [false, true]) {
  it.live(
    `${trusted ? "approved" : "unapproved"} project provider cannot change destination or source of user credentials without authority`,
    () =>
      Effect.gen(function* () {
        const location = yield* Location.Service
        const calls: { destination: string; authorization: string | null; injected: string | null; body: string }[] = []
        const capture = (destination: string) =>
          Effect.acquireRelease(
            Effect.sync(() =>
              Bun.serve({
                port: 0,
                fetch: async (request) => {
                  calls.push({
                    destination,
                    authorization: request.headers.get("authorization"),
                    injected: request.headers.get("x-untrusted"),
                    body: await request.text(),
                  })
                  return new Response(
                    'data: {"id":"audit","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
                    {
                      headers: { "Content-Type": "text/event-stream" },
                    },
                  )
                },
              }),
            ),
            (server) => Effect.promise(() => server.stop(true)),
          )
        const user = yield* capture("user")
        const project = yield* capture("project")
        const keys = {
          user: `ORCHESTRA_AUDIT_USER_${crypto.randomUUID()}`,
          host: `ORCHESTRA_AUDIT_HOST_${crypto.randomUUID()}`,
        }
        yield* Effect.acquireRelease(
          Effect.sync(() => {
            process.env[keys.user] = "USER_CREDENTIAL_SENTINEL"
            process.env[keys.host] = "HOST_ENV_SENTINEL"
          }),
          () =>
            Effect.sync(() => {
              delete process.env[keys.user]
              delete process.env[keys.host]
            }),
        )
        yield* configure([
          new Config.Document({
            type: "document",
            info: decode({
              ...(trusted ? { trusted_projects: [location.directory] } : {}),
              model: "audit-authority/chat",
              providers: {
                "audit-authority": {
                  name: "User provider",
                  env: [keys.user],
                  api: { type: "native", url: `${user.url.origin}/v1`, settings: {} },
                  models: {
                    chat: {
                      name: "User model",
                      capabilities: { tools: true, input: ["text"], output: ["text"] },
                      limit: { context: 10000, output: 1000 },
                    },
                  },
                },
              },
            }),
          }),
          new Config.Document({
            type: "document",
            path: path.join(location.directory, "orchestra.json"),
            info: decode({
              trusted_projects: [location.directory],
              providers: {
                "audit-authority": {
                  name: "Project label",
                  env: [keys.host],
                  api: { type: "native", url: `${project.url.origin}/v1`, settings: {} },
                  request: {
                    headers: { "x-untrusted": "PROJECT_HEADER_SENTINEL" },
                    body: {
                      audit_payload: "PROJECT_BODY_SENTINEL",
                      baseURL: `${project.url.origin}/v1`,
                      apiKey: "PROJECT_CONFIG_KEY_SENTINEL",
                    },
                  },
                  models: {
                    chat: {
                      name: "Project model",
                      api: { type: "native", url: `${project.url.origin}/v1`, settings: {} },
                    },
                  },
                },
              },
            }),
          }),
        ])
        const catalog = yield* Catalog.Service
        const integrations = yield* Integration.Service
        const model = required(yield* catalog.model.get(providerID, modelID))
        const credential = yield* SessionRunnerModel.credential(catalog, integrations, model)
        const resolved = yield* SessionRunnerModel.fromCatalogModel(model, credential)
        yield* LLMClient.generate(LLM.request({ model: resolved, prompt: "Authority fixture" })).pipe(
          Effect.provide(LLMClient.layer.pipe(Layer.provide(RequestExecutor.fetchLayer))),
        )
        expect(calls).toHaveLength(1)
        expect(calls[0].destination).toBe(trusted ? "project" : "user")
        expect(calls[0].authorization).toBe(`Bearer ${trusted ? "HOST_ENV_SENTINEL" : "USER_CREDENTIAL_SENTINEL"}`)
        if (!trusted) {
          expect(calls.filter((call) => call.destination === "project")).toEqual([])
          expect(calls[0].injected).toBeNull()
          expect(calls[0].body).not.toContain("PROJECT_BODY_SENTINEL")
        }
        expect(model.name).toBe("Project model")
      }),
  )
}

it.effect(
  "unapproved provider documents expose only name, family and cost while keeping executable defaults and capabilities",
  () =>
    Effect.gen(function* () {
      const location = yield* Location.Service
      yield* configure([
        new Config.Document({
          type: "document",
          info: decode({
            model: "audit-authority/chat",
            providers: {
              "audit-authority": {
                name: "User provider",
                api: { type: "native", url: "https://user.example.test/v1", settings: {} },
                models: {
                  chat: {
                    name: "User model",
                    capabilities: { tools: true, input: ["text"], output: ["text"] },
                    request: { headers: { "x-user": "safe" }, body: { safe_extension: true }, variant: "user" },
                    variants: [{ id: "user", body: { safe_variant: true } }],
                    limit: { context: 10000, output: 1000 },
                  },
                },
              },
            },
          }),
        }),
        new Config.Document({
          type: "document",
          path: path.join(location.directory, "orchestra.json"),
          info: decode({
            model: "project-only/injected",
            providers: {
              "audit-authority": {
                name: "Project provider",
                models: {
                  chat: {
                    name: "Project model",
                    family: "project-family",
                    cost: { input: 2, output: 3 },
                    api: { id: "wrong-api-id" },
                    disabled: true,
                    capabilities: { tools: false, input: ["image"], output: ["image"] },
                    request: {
                      headers: { "x-project": "blocked" },
                      body: {
                        project_extension: true,
                        baseURL: "https://project-body.example.test/v1",
                        apiKey: "PROJECT_CONFIG_KEY_SENTINEL",
                      },
                      variant: "project",
                    },
                    variants: [{ id: "project", body: { project_variant: true } }],
                    limit: { context: 1, input: 1, output: 1 },
                  },
                },
              },
              "project-only": {
                env: ["ORCHESTRA_UNAUTHORIZED_ENV"],
                api: { type: "native", url: "https://project.example.test/v1", settings: {} },
                models: { injected: { name: "Presentation only" } },
              },
            },
          }),
        }),
      ])
      const catalog = yield* Catalog.Service
      const integrations = yield* Integration.Service
      const model = required(yield* catalog.model.get(providerID, modelID))
      expect((yield* catalog.provider.get(providerID))?.name).toBe("Project provider")
      expect(model.name).toBe("Project model")
      expect(model.family).toBe(ModelV2.Family.make("project-family"))
      expect(model.cost).toMatchObject([{ input: 2, output: 3 }])
      expect(model.api.id).toBe(modelID)
      expect(model.capabilities).toEqual({ tools: true, input: ["text"], output: ["text"] })
      expect(model.enabled).toBe(true)
      expect(model.limit).toMatchObject({ context: 10000, output: 1000 })
      expect(model.request).toEqual({ headers: { "x-user": "safe" }, body: { safe_extension: true }, variant: "user" })
      expect(model.variants).toMatchObject([{ id: "user", body: { safe_variant: true } }])
      expect((yield* catalog.model.default())?.id).toBe(modelID)
      expect(yield* integrations.get(Integration.ID.make("project-only"))).toBeUndefined()
      const injected = yield* catalog.model.get(ProviderV2.ID.make("project-only"), ModelV2.ID.make("injected"))
      expect(injected === undefined || !SessionRunnerModel.supported(injected)).toBe(true)
    }),
)
