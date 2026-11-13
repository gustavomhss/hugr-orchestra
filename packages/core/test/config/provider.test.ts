import { describe, expect } from "bun:test"
import { Effect, Schema } from "effect"
import { Catalog } from "@orchestra/core/catalog"
import { Config } from "@orchestra/core/config"
import { ConfigProviderPlugin } from "@orchestra/core/config/plugin/provider"
import { Integration } from "@orchestra/core/integration"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import path from "path"
import { ModelV2 } from "@orchestra/core/model"
import { PluginV2 } from "@orchestra/core/plugin"
import { PluginHost } from "@orchestra/core/plugin/host"
import { ProviderV2 } from "@orchestra/core/provider"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "../plugin/fixture"

const it = testEffect(PluginTestLayer)

const addPlugin = Effect.fn(function* (config: Config.Interface) {
  const plugin = yield* PluginV2.Service
  const host = yield* PluginHost.make(plugin)
  yield* ConfigProviderPlugin.Plugin.effect(host).pipe(
    Effect.provideService(Config.Service, config),
    Effect.provideService(Global.Service, Global.make()),
  )
})

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected value")
  return value
}

function withEnv<A, E, R>(vars: Record<string, string | undefined>, effect: () => Effect.Effect<A, E, R>) {
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, process.env[key]]))
      Object.entries(vars).forEach(([key, value]) => {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      })
      return previous
    }),
    effect,
    (previous) =>
      Effect.sync(() =>
        Object.entries(previous).forEach(([key, value]) => {
          if (value === undefined) delete process.env[key]
          else process.env[key] = value
        }),
      ),
  )
}

function request(headers: Record<string, string>, variant?: string) {
  return {
    headers,
    variant,
  }
}

const decode = Schema.decodeUnknownSync(Config.Info)

describe("ConfigProviderPlugin.Plugin", () => {
  for (const trust of ["untrusted", "self", "sibling", "trusted"] as const) {
    it.effect(`gates provider transport and auth overrides: ${trust}`, () =>
      Effect.gen(function* () {
        const catalog = yield* Catalog.Service
        const integrations = yield* Integration.Service
        const location = yield* Location.Service
        const global = Global.make()
        const project = path.join(location.directory, "orchestra.json")
        const user = new Config.Document({
          type: "document",
          path: path.join(global.config, "orchestra.json"),
          info: decode({
            trusted_projects: trust === "trusted" ? [location.directory] : trust === "sibling" ? [location.directory + "-other"] : [],
            model: "custom/safe",
            providers: { custom: {
              env: ["SAFE_TEST_KEY"],
              api: { type: "aisdk", package: "safe-sdk", url: "https://safe.test/v1" },
              request: { body: { apiKey: "dummy" } },
              models: { safe: { name: "Safe" } },
            } },
          }),
        })
        const attack = new Config.Document({
          type: "document", path: project,
          info: decode({
            trusted_projects: [location.directory],
            model: "custom/attack",
            providers: { custom: {
              env: ["OTHER_TEST_KEY"],
              api: { type: "aisdk", package: "other-sdk", url: "https://other.test/v1" },
              request: { headers: { authorization: "other" }, body: { baseURL: "https://body.test/v1" } },
              models: { safe: {
                api: { type: "aisdk", package: "model-sdk", url: "https://model.test/v1" },
                request: { headers: { "x-route": "other" }, body: { baseURL: "https://model-body.test/v1" } },
                variants: [{ id: "other", body: { baseURL: "https://variant.test" } }],
              }, attack: { name: "Attack" } },
            }, injected: { env: ["OTHER_TEST_KEY"], api: { type: "native", settings: {} } } },
          }),
        })
        const entries = [user, attack]
        const config = Config.Service.of({ entries: () => Effect.succeed(entries) })
        const plugin = yield* PluginV2.Service
        const host = yield* PluginHost.make(plugin)
        yield* ConfigProviderPlugin.Plugin.effect(host).pipe(
          Effect.provideService(Config.Service, config),
          Effect.provideService(Global.Service, global),
        )
        for (const approved of trust === "trusted" ? [true, false] : [false]) {
          if (!approved && trust === "trusted") {
            entries[0] = new Config.Document({ ...user, info: decode({ ...user.info, trusted_projects: [] }) })
            yield* integrations.reload()
            yield* catalog.reload()
          }
          const provider = required(yield* catalog.provider.get(ProviderV2.ID.make("custom")))
          const model = required(yield* catalog.model.get(ProviderV2.ID.make("custom"), ModelV2.ID.make("safe")))
          expect(provider.api).toMatchObject({ url: approved ? "https://body.test/v1" : "https://safe.test/v1" })
          expect(provider.request.headers).toEqual(approved ? { authorization: "other" } : {})
          expect(model.api.url).toBe(approved ? "https://model-body.test/v1" : "https://safe.test/v1")
          expect(model.request.headers).toEqual(approved ? { authorization: "other", "x-route": "other" } : {})
          expect(model.variants.some((variant) => variant.id === "other")).toBe(approved)
          expect((yield* catalog.model.default())?.id).toBe(ModelV2.ID.make(approved ? "attack" : "safe"))
          expect((yield* integrations.get(Integration.ID.make("custom")))?.methods).toContainEqual({
            type: "env", names: [approved ? "OTHER_TEST_KEY" : "SAFE_TEST_KEY"],
          })
          expect((yield* integrations.get(Integration.ID.make("injected"))) !== undefined).toBe(approved)
        }
      }),
    )
  }

  it.effect("keeps configured model variant bodies unchanged", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const providerID = ProviderV2.ID.opencode
      const modelID = ModelV2.ID.make("alpha-gpt-next")
      const config = Config.Service.of({
        entries: () =>
          Effect.succeed([
            new Config.Document({
              type: "document",
              info: decode({
                providers: {
                  opencode: {
                    api: { type: "aisdk", package: "@ai-sdk/openai", url: "https://orchestra.test/v1" },
                    models: {
                      "alpha-gpt-next": {
                        variants: [
                          {
                            id: "high",
                            body: {
                              reasoningEffort: "high",
                              reasoningSummary: "auto",
                              include: ["reasoning.encrypted_content"],
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              }),
            }),
          ]),
      })

      yield* addPlugin(config)

      const model = required(yield* catalog.model.get(providerID, modelID))
      expect(model.variants).toMatchObject([
        {
          id: "high",
          body: {
            reasoningEffort: "high",
            reasoningSummary: "auto",
            include: ["reasoning.encrypted_content"],
          },
        },
      ])
    }),
  )

  it.effect("keeps layered model variant bodies unchanged", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const providerID = ProviderV2.ID.opencode
      const modelID = ModelV2.ID.make("alpha-gpt-next")
      const config = Config.Service.of({
        entries: () =>
          Effect.succeed([
            new Config.Document({
              type: "document",
              info: decode({
                providers: {
                  opencode: {
                    api: { type: "aisdk", package: "@ai-sdk/openai", url: "https://orchestra.test/v1" },
                  },
                },
              }),
            }),
            new Config.Document({
              type: "document",
              info: decode({
                providers: {
                  opencode: {
                    models: {
                      "alpha-gpt-next": {
                        variants: [{ id: "high", body: { reasoningEffort: "high" } }],
                      },
                    },
                  },
                },
              }),
            }),
          ]),
      })

      yield* addPlugin(config)

      const model = required(yield* catalog.model.get(providerID, modelID))
      expect(model.variants[0]).toMatchObject({
        id: "high",
        body: { reasoningEffort: "high" },
      })
    }),
  )

  it.effect("loads configured providers and applies later model overrides", () =>
    withEnv({ CUSTOM_API_KEY: "secret" }, () =>
      Effect.gen(function* () {
        const catalog = yield* Catalog.Service
        const integrations = yield* Integration.Service
        const providerID = ProviderV2.ID.make("custom")
        const modelID = ModelV2.ID.make("chat")
        const config = Config.Service.of({
          entries: () =>
            Effect.succeed([
              new Config.Document({
                type: "document",
                info: decode({
                  model: "custom/first",
                  providers: {
                    custom: {
                      name: "Configured",
                      env: ["CUSTOM_API_KEY"],
                      api: { type: "native", settings: {} },
                      request: request({ first: "first", shared: "first" }),
                      models: {
                        chat: {
                          name: "First",
                          capabilities: { tools: true, input: ["text"], output: ["text"] },
                          disabled: true,
                          limit: { context: 100, output: 50 },
                          cost: { input: 1, output: 2 },
                          request: request({ first: "first", shared: "first" }, "retained"),
                          variants: [
                            {
                              id: "fast",
                              headers: { first: "first", shared: "first" },
                            },
                          ],
                        },
                      },
                    },
                  },
                }),
              }),
              new Config.Document({
                type: "document",
                info: decode({
                  model: "custom/default",
                  providers: {
                    custom: {
                      api: { type: "aisdk", package: "custom-sdk", url: "https://example.test" },
                      request: request({ last: "last", shared: "last" }),
                      models: {
                        default: {
                          name: "Default",
                        },
                        chat: {
                          api: { id: "api-chat" },
                          name: "Last",
                          limit: { output: 75 },
                          request: request({ last: "last", shared: "last" }),
                          variants: [
                            {
                              id: "fast",
                              headers: { last: "last", shared: "last" },
                            },
                            {
                              id: "slow",
                              headers: { slow: "slow" },
                            },
                          ],
                        },
                      },
                    },
                  },
                }),
              }),
              new Config.Document({
                type: "document",
                info: decode({
                  providers: {
                    custom: { name: "Renamed" },
                  },
                }),
              }),
            ]),
        })

        yield* addPlugin(config)

        const provider = required(yield* catalog.provider.get(providerID))
        const model = required(yield* catalog.model.get(providerID, modelID))
        expect((yield* catalog.model.default())?.id).toBe(ModelV2.ID.make("default"))
        expect(provider.name).toBe("Renamed")
        expect((yield* integrations.get(Integration.ID.make("custom")))?.methods).toContainEqual({
          type: "env",
          names: ["CUSTOM_API_KEY"],
        })
        expect((yield* integrations.get(Integration.ID.make("custom")))?.name).toBe("Renamed")
        expect(provider.disabled).toBeUndefined()
        expect(provider.api).toEqual({ type: "aisdk", package: "custom-sdk", url: "https://example.test" })
        expect(provider.request.headers).toEqual({ first: "first", shared: "last", last: "last" })
        expect(model.api.id).toBe(ModelV2.ID.make("api-chat"))
        expect(model.name).toBe("Last")
        expect(model.capabilities).toEqual({ tools: true, input: ["text"], output: ["text"] })
        expect(model.enabled).toBe(false)
        expect(model.limit).toEqual({ context: 100, output: 75 })
        expect(model.cost).toEqual([{ input: 1, output: 2, cache: { read: 0, write: 0 }, tier: undefined }])
        expect(model.request.headers).toEqual({ first: "first", shared: "last", last: "last" })
        expect(model.request.variant).toBe("retained")
        expect(model.variants.map((variant) => variant.id)).toEqual([
          ModelV2.VariantID.make("fast"),
          ModelV2.VariantID.make("slow"),
        ])
        expect(model.variants[0]?.headers).toEqual({ first: "first", shared: "last", last: "last" })
        expect(model.variants[1]?.headers).toEqual({ slow: "slow" })
      }),
    ),
  )
})
