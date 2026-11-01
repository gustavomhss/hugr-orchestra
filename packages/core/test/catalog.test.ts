import { describe, expect } from "bun:test"
import { Effect, Fiber, Layer, Stream } from "effect"
import { Catalog } from "@orchestra/core/catalog"
import { Integration } from "@orchestra/core/integration"
import { Credential } from "@orchestra/core/credential"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { Policy } from "@orchestra/core/policy"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { location } from "./fixture/location"
import { testEffect } from "./lib/effect"

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected value")
  return value
}

const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(location({ directory: AbsolutePath.make("test") })),
)
const catalogLayer = AppNodeBuilder.build(
  LayerNode.group([Catalog.node, EventV2.node, Credential.node, Integration.node, Policy.node]),
  [[Location.node, locationLayer]],
)
const it = testEffect(catalogLayer)

describe("CatalogV2", () => {
  it.effect("API settings credentials use runner precedence and public never authenticates paid Zen", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const integrations = yield* Integration.Service
      const configured = { settings: "synthetic-settings-key", body: undefined as string | undefined }
      yield* integrations.transform((draft) => draft.update(Integration.ID.make("opencode"), () => {}))
      yield* catalog.transform((draft) => {
        draft.provider.update(ProviderV2.ID.opencode, (provider) => {
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            settings: { apiKey: configured.settings },
          }
          if (configured.body !== undefined) provider.request.body.apiKey = configured.body
        })
        draft.model.update(ProviderV2.ID.opencode, ModelV2.ID.make("paid"), (model) => {
          model.cost = [{ input: 1, output: 1, cache: { read: 0, write: 0 } }]
        })
        draft.model.update(ProviderV2.ID.opencode, ModelV2.ID.make("free"), (model) => {
          model.cost = [{ input: 0, output: 0, cache: { read: 0, write: 0 } }]
        })
        draft.model.default.set(ProviderV2.ID.opencode, ModelV2.ID.make("paid"))
      })
      expect((yield* catalog.model.available()).map((model) => model.id)).toContain(ModelV2.ID.make("paid"))
      expect((yield* catalog.model.default())?.id).toBe(ModelV2.ID.make("paid"))
      configured.body = "public"
      yield* catalog.reload()
      expect(yield* catalog.model.available()).toEqual([])
      configured.body = undefined
      configured.settings = "public"
      yield* catalog.reload()
      expect(yield* catalog.model.available()).toEqual([])
    }),
  )
  // Zen's free tier rejects every client but its own, so a zero-cost model is no reason to offer Zen without a key.
  it.effect("Zen without a credential exposes no models, not even free ones", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const integrations = yield* Integration.Service
      const credentials = yield* Credential.Service
      yield* integrations.transform((draft) => {
        draft.update(Integration.ID.make("opencode"), () => {})
        draft.update(Integration.ID.make("openai"), () => {})
      })
      yield* catalog.transform((draft) => {
        draft.provider.update(ProviderV2.ID.opencode, () => {})
        draft.provider.update(ProviderV2.ID.openai, () => {})
        for (const [id, costs, enabled] of [
          ["free", [{ input: 0, output: 0, cache: { read: 0, write: 0 } }], true],
          ["paid", [{ input: 1, output: 1, cache: { read: 0, write: 0 } }], true],
          ["output-paid", [{ input: 0, output: 1, cache: { read: 0, write: 0 } }], true],
          ["cache-paid", [{ input: 0, output: 0, cache: { read: 1, write: 0 } }], true],
          ["missing-price", [], true],
          ["disabled-free", [{ input: 0, output: 0, cache: { read: 0, write: 0 } }], false],
        ] as const) {
          draft.model.update(ProviderV2.ID.opencode, ModelV2.ID.make(id), (model) => {
            model.cost = [...costs]
            model.enabled = enabled
          })
        }
        draft.model.update(ProviderV2.ID.openai, ModelV2.ID.make("free"), (model) => {
          model.cost = [{ input: 0, output: 0, cache: { read: 0, write: 0 } }]
        })
        draft.model.default.set(ProviderV2.ID.opencode, ModelV2.ID.make("paid"))
      })
      expect(yield* catalog.provider.available()).toEqual([])
      expect(yield* catalog.model.available()).toEqual([])
      expect(yield* catalog.model.default()).toBeUndefined()
      expect(
        (yield* catalog.model.get(ProviderV2.ID.opencode, ModelV2.ID.make("free")))?.request.body.apiKey,
      ).toBeUndefined()

      const credential = yield* credentials.create({
        integrationID: Integration.ID.make("opencode"),
        value: Credential.Key.make({ type: "key", key: "synthetic-key" }),
      })
      expect((yield* catalog.model.available()).map((model) => model.id)).toContain(ModelV2.ID.make("paid"))
      expect((yield* catalog.model.default())?.id).toBe(ModelV2.ID.make("paid"))
      yield* credentials.remove(credential.id)
      expect(yield* catalog.model.available()).toEqual([])
      expect(yield* catalog.model.default()).toBeUndefined()
    }),
  )

  it.effect("configured Zen request auth respects disabled providers and policy", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const policy = yield* Policy.Service
      yield* catalog.transform((draft) => {
        draft.provider.update(ProviderV2.ID.opencode, (provider) => {
          provider.request.body.apiKey = "configured-key"
        })
        draft.model.update(ProviderV2.ID.opencode, ModelV2.ID.make("free"), (model) => {
          model.cost = [{ input: 0, output: 0, cache: { read: 0, write: 0 } }]
        })
      })
      expect((yield* catalog.model.default())?.request.body.apiKey).toBe("configured-key")
      const disabled = yield* catalog.transform((draft) => {
        draft.provider.update(ProviderV2.ID.opencode, (provider) => {
          provider.disabled = true
        })
      })
      expect(yield* catalog.model.available()).toEqual([])
      expect(yield* catalog.provider.available()).toEqual([])
      yield* disabled.dispose
      yield* policy.load([new Policy.Info({ effect: "deny", action: "provider.use", resource: "opencode" })])
      yield* catalog.reload()
      expect(yield* catalog.model.available()).toEqual([])
      expect(yield* catalog.provider.available()).toEqual([])
    }),
  )
  it.effect("publishes an updated event after catalog changes", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const events = yield* EventV2.Service
      const updated = yield* events
        .subscribe(Catalog.Event.Updated)
        .pipe(Stream.take(1), Stream.runCollect, Effect.forkScoped)
      yield* Effect.yieldNow

      yield* catalog.transform((editor) => editor.provider.update(ProviderV2.ID.make("test"), () => {}))

      expect((yield* Fiber.join(updated)).length).toBe(1)
    }),
  )

  it.effect("derives availability from active credentials without changing provider state", () => {
    const integrationID = Integration.ID.make("test")
    const providerID = ProviderV2.ID.make("test")
    const localCatalogLayer = Layer.fresh(
      AppNodeBuilder.build(LayerNode.group([Catalog.node, Credential.node]), [[Location.node, locationLayer]]),
    )

    return Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const credentials = yield* Credential.Service
      yield* catalog.transform((editor) => editor.provider.update(providerID, () => {}))
      const first = yield* credentials.create({
        integrationID,
        label: "First",
        value: Credential.Key.make({ type: "key", key: "first", metadata: { tenant: "one" } }),
      })
      const firstID = ProviderV2.ID.make(`${providerID}#${first.id}`)

      // Labeled credentials project virtual providers while the base remains.
      expect(new Set((yield* catalog.provider.available()).map((provider) => provider.id))).toEqual(
        new Set([providerID, firstID]),
      )
      expect(required(yield* catalog.provider.get(firstID)).name).toBe("test (First)")
      expect(required(yield* catalog.provider.get(providerID)).request.body).toEqual({})
      const second = yield* credentials.create({
        integrationID,
        label: "Second",
        value: Credential.Key.make({ type: "key", key: "second", metadata: { tenant: "two" } }),
      })
      const secondID = ProviderV2.ID.make(`${providerID}#${second.id}`)
      expect(new Set((yield* catalog.provider.available()).map((provider) => provider.id))).toEqual(
        new Set([providerID, firstID, secondID]),
      )
      expect(required(yield* catalog.provider.get(secondID)).name).toBe("test (Second)")
      expect(required(yield* catalog.provider.get(providerID)).request.body).toEqual({})
    }).pipe(Effect.provide(localCatalogLayer))
  })

  it.effect("shares one catalog credential read per availability request and keeps the projection", () => {
    const providerID = ProviderV2.ID.make("counted")
    const localCatalogLayer = Layer.fresh(
      AppNodeBuilder.build(LayerNode.group([Catalog.node, Credential.node]), [[Location.node, locationLayer]]),
    )

    return Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const credentials = yield* Credential.Service
      yield* catalog.transform((editor) => {
        editor.provider.update(providerID, () => {})
        editor.model.update(providerID, ModelV2.ID.make("m"), () => {})
      })
      const created = yield* credentials.create({
        integrationID: Integration.ID.make(providerID),
        label: "Work",
        value: Credential.Key.make({ type: "key", key: "k" }),
      })
      const virtualID = ProviderV2.ID.make(`${providerID}#${created.id}`)

      const read = credentials.all
      const reads = { count: 0 }
      Object.assign(credentials, {
        all: () => {
          reads.count += 1
          return read()
        },
      })

      // One read for the catalog's virtual entries and one inside Integration.list; it used to be three.
      const providers = yield* catalog.provider.available()
      expect(reads.count).toBe(2)
      expect(providers.map((provider) => provider.id)).toEqual([providerID, virtualID])

      reads.count = 0
      const models = yield* catalog.model.available()
      expect(reads.count).toBe(2)
      expect(models.map((model) => `${model.providerID}/${model.id}`).sort()).toEqual(
        [`${providerID}/m`, `${virtualID}/m`].sort(),
      )
      Object.assign(credentials, { all: read })
    }).pipe(Effect.provide(localCatalogLayer))
  })

  it.effect("derives availability from a provider's integration", () => {
    const integrationID = Integration.ID.make("gateway")
    const providerID = ProviderV2.ID.make("remote")
    const localCatalogLayer = Layer.fresh(
      AppNodeBuilder.build(LayerNode.group([Catalog.node, Credential.node, Integration.node]), [
        [Location.node, locationLayer],
      ]),
    )

    return Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      yield* (yield* Integration.Service).transform((editor) => editor.update(integrationID, () => {}))
      yield* catalog.transform((editor) =>
        editor.provider.update(providerID, (provider) => {
          provider.integrationID = integrationID
        }),
      )
      expect(yield* catalog.provider.available()).toEqual([])

      yield* (yield* Credential.Service).create({
        integrationID,
        value: Credential.Key.make({ type: "key", key: "secret" }),
      })

      expect((yield* catalog.provider.available()).map((provider) => provider.id)).toEqual([providerID])
    }).pipe(Effect.provide(localCatalogLayer))
  })

  it.effect("projects environment connections without a catalog plugin", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const previous = process.env.CATALOG_TEST_API_KEY
        process.env.CATALOG_TEST_API_KEY = "secret"
        return previous
      }),
      () =>
        Effect.gen(function* () {
          const catalog = yield* Catalog.Service
          const integrations = yield* Integration.Service
          const providerID = ProviderV2.ID.make("test")
          yield* integrations.transform((editor) =>
            editor.method.update({
              integrationID: Integration.ID.make(providerID),
              method: { type: "env", names: ["CATALOG_TEST_API_KEY"] },
            }),
          )
          yield* catalog.transform((editor) => editor.provider.update(providerID, () => {}))

          expect((yield* catalog.provider.available()).map((provider) => provider.id)).toContain(providerID)
        }),
      (previous) =>
        Effect.sync(() => {
          if (previous === undefined) delete process.env.CATALOG_TEST_API_KEY
          else process.env.CATALOG_TEST_API_KEY = previous
        }),
    ),
  )

  it.effect("normalizes provider baseURL into api url", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const providerID = ProviderV2.ID.make("test")
      yield* catalog.transform((catalog) =>
        catalog.provider.update(providerID, (provider) => {
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://default.example.com",
          }
          provider.request.body.baseURL = "https://override.example.com"
        }),
      )

      expect(required(yield* catalog.provider.get(providerID)).api).toEqual({
        type: "aisdk",
        package: "@ai-sdk/openai-compatible",
        url: "https://override.example.com",
      })
    }),
  )

  it.effect("normalizes model baseURL into api url", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const providerID = ProviderV2.ID.make("test")
      const modelID = ModelV2.ID.make("model")
      yield* catalog.transform((catalog) => {
        catalog.provider.update(providerID, (provider) => {
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://provider.example.com",
          }
        })
        catalog.model.update(providerID, modelID, (model) => {
          model.api = {
            id: modelID,
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://model.example.com",
          }
          model.request.body.baseURL = "https://override.example.com"
        })
      })

      expect(required(yield* catalog.model.get(providerID, modelID)).api).toEqual({
        id: modelID,
        type: "aisdk",
        package: "@ai-sdk/openai-compatible",
        url: "https://override.example.com",
        settings: {},
      })
    }),
  )

  it.effect("resolves default model api from provider api", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const providerID = ProviderV2.ID.make("test")
      const modelID = ModelV2.ID.make("model")
      yield* catalog.transform((catalog) => {
        catalog.provider.update(providerID, (provider) => {
          provider.api = {
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
            url: "https://provider.example.com",
          }
        })
        catalog.model.update(providerID, modelID, () => {})
      })

      expect(required(yield* catalog.model.get(providerID, modelID)).api).toEqual({
        id: modelID,
        type: "aisdk",
        package: "@ai-sdk/openai-compatible",
        url: "https://provider.example.com",
      })
    }),
  )

  it.effect("resolves provider and model request merges", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const providerID = ProviderV2.ID.make("test")
      const modelID = ModelV2.ID.make("model")
      yield* catalog.transform((catalog) => {
        catalog.provider.update(providerID, (provider) => {
          provider.request.headers.provider = "provider"
          provider.request.headers.shared = "provider"
          provider.request.body.provider = true
        })
        catalog.model.update(providerID, modelID, (model) => {
          model.request.headers.model = "model"
          model.request.headers.shared = "model"
          model.request.body.model = true
          model.request.body.request = true
          model.request.body.shared = "model"
        })
      })

      const model = required(yield* catalog.model.get(providerID, modelID))
      expect(model.request.headers).toEqual({ provider: "provider", shared: "model", model: "model" })
      expect(model.request.body).toEqual({ provider: true, model: true, request: true, shared: "model" })
    }),
  )

  it.effect("falls back to newest available model when no default is configured", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const providerID = ProviderV2.ID.make("test")
      yield* catalog.transform((catalog) => {
        catalog.provider.update(providerID, () => {})
        catalog.model.update(providerID, ModelV2.ID.make("old"), (model) => {
          model.time.released = 1000
        })
        catalog.model.update(providerID, ModelV2.ID.make("new"), (model) => {
          model.time.released = 2000
        })
      })

      expect((yield* catalog.model.default())?.id).toMatch("new")
    }),
  )

  it.effect("uses a transform-provided default model until that transform is replaced", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const providerID = ProviderV2.ID.make("test")
      const old = ModelV2.ID.make("old")
      const newest = ModelV2.ID.make("new")
      const models = (catalog: Catalog.Draft) => {
        catalog.provider.update(providerID, () => {})
        catalog.model.update(providerID, old, (model) => {
          model.time.released = 1000
        })
        catalog.model.update(providerID, newest, (model) => {
          model.time.released = 2000
        })
      }

      let configured = true
      yield* catalog.transform((catalog) => {
        models(catalog)
        if (configured) catalog.model.default.set(providerID, old)
      })
      expect((yield* catalog.model.default())?.id).toBe(old)

      configured = false
      yield* catalog.reload()
      expect((yield* catalog.model.default())?.id).toBe(newest)
    }),
  )

  it.effect("ignores a configured default on a disabled provider", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const disabledProvider = ProviderV2.ID.make("disabled")
      const enabledProvider = ProviderV2.ID.make("enabled")
      const disabledModel = ModelV2.ID.make("configured")
      const fallbackModel = ModelV2.ID.make("fallback")
      yield* catalog.transform((catalog) => {
        catalog.provider.update(disabledProvider, (provider) => {
          provider.disabled = true
        })
        catalog.model.update(disabledProvider, disabledModel, () => {})
        catalog.provider.update(enabledProvider, () => {})
        catalog.model.update(enabledProvider, fallbackModel, () => {})
        catalog.model.default.set(disabledProvider, disabledModel)
      })

      expect(yield* catalog.model.default()).toMatchObject({
        providerID: enabledProvider,
        id: fallbackModel,
      })
    }),
  )

  it.effect("small model prefers small keyword candidates before cost scoring", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const providerID = ProviderV2.ID.make("test")
      yield* catalog.transform((catalog) => {
        catalog.provider.update(providerID, () => {})
        catalog.model.update(providerID, ModelV2.ID.make("cheap-large"), (model) => {
          model.capabilities.input = ["text"]
          model.capabilities.output = ["text"]
          model.cost = [{ input: 1, output: 1, cache: { read: 0, write: 0 } }]
          model.time.released = Date.now()
        })
        catalog.model.update(providerID, ModelV2.ID.make("expensive-mini"), (model) => {
          model.capabilities.input = ["text"]
          model.capabilities.output = ["text"]
          model.cost = [{ input: 10, output: 10, cache: { read: 0, write: 0 } }]
          model.time.released = Date.now()
        })
      })

      expect((yield* catalog.model.small(providerID))?.id).toMatch("expensive-mini")
    }),
  )

  it.effect("removes providers denied by policy after loading", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const policy = yield* Policy.Service
      const providerID = ProviderV2.ID.make("blocked")
      yield* policy.load([new Policy.Info({ effect: "deny", action: "provider.use", resource: "blocked" })])
      yield* catalog.transform((catalog) => {
        catalog.provider.update(providerID, () => {})
        catalog.model.update(providerID, ModelV2.ID.make("model"), () => {})
      })

      expect(yield* catalog.provider.all()).toEqual([])
      expect(yield* catalog.model.all()).toEqual([])
      expect(yield* catalog.provider.get(providerID)).toBeUndefined()
    }),
  )
})
