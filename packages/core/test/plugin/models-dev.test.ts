import path from "path"
import { describe, expect, test } from "bun:test"
import { Effect, Layer, Option, Schema } from "effect"
import { Catalog } from "@orchestra/core/catalog"
import { Integration } from "@orchestra/core/integration"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { Flag } from "@orchestra/core/flag/flag"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { ModelsDev } from "@orchestra/core/models-dev"
import { ModelsDevPlugin } from "@orchestra/core/plugin/models-dev"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { location } from "../fixture/location"
import { testEffect } from "../lib/effect"
import { catalogHost, host, integrationHost } from "./host"
import snapshot from "./fixtures/models-dev-public.json"

// Verbatim provider/model excerpts, with only provider model maps trimmed:
// https://models.dev/api.json, fetched 2026-10-13T11:31:28.929Z
// SHA-256: 3d3b2438e0f641bdee01d8a58a9c676a3bbe90d51778d662caf0ccf9c00d4b78
const snapshotPath = path.join(import.meta.dir, "fixtures", "models-dev-public.json")
const catalogSchema = Schema.Record(Schema.String, ModelsDev.Provider)

const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(location({ directory: AbsolutePath.make(import.meta.dir) })),
)
const layer = AppNodeBuilder.build(LayerNode.group([Catalog.node, Integration.node, EventV2.node]), [
  [Location.node, locationLayer],
])
const it = testEffect(layer)

describe("ModelsDev public schema", () => {
  test("preserves known true/false temperature and absent pricing", () => {
    expect(Schema.decodeUnknownSync(ModelsDev.Model)(snapshot.deepinfra.models["tencent/Hy3"]).temperature).toBe(true)
    const unknown = Schema.decodeUnknownSync(ModelsDev.Model)(snapshot.poe.models["cerebras/qwen3-32b-cs"])
    expect(unknown.temperature).toBe(false)
    expect(unknown.cost).toBeUndefined()
  })

  test("decodes raw public JSON without inventing temperature or retaining unknown schema fields", async () => {
    const data = Schema.decodeUnknownSync(catalogSchema)(
      Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(await Bun.file(snapshotPath).text()),
    )
    expect(Object.keys(data)).toEqual(["deepinfra", "poe", "opencode"])
    expect(Object.values(data).flatMap((provider) => Object.keys(provider.models))).toHaveLength(4)
    const model = data.deepinfra.models["meta-llama/Llama-3.3-70B-Instruct-Turbo"]
    expect(Object.hasOwn(model, "temperature")).toBe(false)
    expect(model.cost).toEqual({ input: 0.1, output: 0.32 })
    expect(Object.hasOwn(model, "description")).toBe(false)
    expect(Object.hasOwn(data.deepinfra, "doc")).toBe(false)
  })

  test("rejects malformed temperature, required booleans, limits and present pricing", () => {
    const model = snapshot.deepinfra.models["tencent/Hy3"]
    const decode = Schema.decodeUnknownOption(ModelsDev.Model)
    expect(Option.isSome(decode(model))).toBe(true)
    ;[null, "false", 0].forEach((temperature) => {
      expect(Option.isNone(decode({ ...model, temperature }))).toBe(true)
    })
    ;["attachment", "reasoning", "tool_call"].forEach((field) => {
      expect(Option.isNone(decode(Object.fromEntries(Object.entries(model).filter(([key]) => key !== field))))).toBe(
        true,
      )
      expect(Option.isNone(decode({ ...model, [field]: "false" }))).toBe(true)
    })
    expect(Option.isNone(decode({ ...model, limit: { context: "131072", output: 16384 } }))).toBe(true)
    ;[null, {}, { input: 0 }, { input: "0", output: 0 }, { input: Infinity, output: 0 }].forEach((cost) => {
      expect(Option.isNone(decode({ ...model, cost }))).toBe(true)
    })
  })
})

describe("ModelsDevPlugin", () => {
  it.live("loads a fresh public snapshot through ModelsDev.get and populates the catalog", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const previous = { path: Flag.ORCHESTRA_MODELS_PATH, disabled: Flag.ORCHESTRA_DISABLE_MODELS_FETCH }
        Flag.ORCHESTRA_MODELS_PATH = snapshotPath
        Flag.ORCHESTRA_DISABLE_MODELS_FETCH = true
        return previous
      }),
      () =>
        Effect.gen(function* () {
          const models = yield* ModelsDev.Service
          const integrations = yield* Integration.Service
          const catalog = yield* Catalog.Service
          const data = yield* models.get()
          expect<unknown>(data).toEqual(snapshot)
          // get preserves raw external fields; schema consumers intentionally strip them.
          expect(
            Schema.decodeUnknownSync(catalogSchema)(data).deepinfra.models["meta-llama/Llama-3.3-70B-Instruct-Turbo"]
              .temperature,
          ).toBeUndefined()
          yield* ModelsDevPlugin.effect(
            host({ catalog: catalogHost(catalog), integration: integrationHost(integrations) }),
          )
          expect((yield* catalog.provider.all()).map((provider) => provider.id)).toEqual([
            ProviderV2.ID.make("deepinfra"),
            ProviderV2.ID.make("poe"),
            ProviderV2.ID.opencode,
          ])
          expect(yield* catalog.model.all()).toHaveLength(4)
          expect(
            yield* catalog.model.get(
              ProviderV2.ID.make("deepinfra"),
              ModelV2.ID.make("meta-llama/Llama-3.3-70B-Instruct-Turbo"),
            ),
          ).toMatchObject({
            name: "Llama 3.3 70B Turbo",
            capabilities: { tools: true, input: ["text"], output: ["text"] },
            cost: [{ input: 0.1, output: 0.32, cache: { read: 0, write: 0 } }],
            limit: { context: 131072, output: 16384 },
          })
          const unknown = yield* catalog.model.get(ProviderV2.ID.make("poe"), ModelV2.ID.make("cerebras/qwen3-32b-cs"))
          expect(unknown?.cost).toEqual([])
          expect(unknown?.request.body.apiKey).toBeUndefined()
          const free = yield* catalog.model.get(ProviderV2.ID.opencode, ModelV2.ID.make("ling-3.0-flash-fin-free"))
          expect(free?.cost).toEqual([{ input: 0, output: 0, cache: { read: 0, write: 0 } }])
          expect(free?.request.body.apiKey).toBe("public")
        }).pipe(Effect.provide(AppNodeBuilder.build(ModelsDev.node))),
      (previous) =>
        Effect.sync(() => {
          Flag.ORCHESTRA_MODELS_PATH = previous.path
          Flag.ORCHESTRA_DISABLE_MODELS_FETCH = previous.disabled
        }),
    ),
  )

  it.effect("imported missing pricing cannot grant anonymous OpenCode access", () =>
    Effect.gen(function* () {
      const integrations = yield* Integration.Service
      const catalog = yield* Catalog.Service
      const models = ModelsDev.Service.of({
        get: () =>
          Effect.succeed({
            opencode: {
              id: "opencode",
              name: "OpenCode",
              env: ["MODEL_IMPORT_MISSING_KEY"],
              npm: "@ai-sdk/openai-compatible",
              models: Object.fromEntries(
                [
                  ["unknown", undefined],
                  ["free", { input: 0, output: 0 }],
                  ["paid", { input: 1, output: 2 }],
                ].map(([id, cost]) => [
                  String(id),
                  {
                    id: String(id),
                    name: String(id),
                    release_date: "2026-01-01",
                    attachment: false,
                    reasoning: false,
                    temperature: false,
                    tool_call: true,
                    cost,
                    limit: { context: 1000, output: 100 },
                  },
                ]),
              ) as Record<string, ModelsDev.Model>,
            },
          }),
        refresh: () => Effect.void,
      })
      yield* ModelsDevPlugin.effect(
        host({ catalog: catalogHost(catalog), integration: integrationHost(integrations) }),
      ).pipe(Effect.provideService(ModelsDev.Service, models))
      expect((yield* catalog.model.get(ProviderV2.ID.opencode, ModelV2.ID.make("unknown")))?.cost).toEqual([])
      expect(
        (yield* catalog.model.get(ProviderV2.ID.opencode, ModelV2.ID.make("unknown")))?.request.body.apiKey,
      ).toBeUndefined()
      expect((yield* catalog.model.available()).map((model) => model.id)).toEqual([ModelV2.ID.make("free")])
      expect((yield* catalog.model.default())?.request.body.apiKey).toBe("public")
    }),
  )
  it.effect("projects models.dev modes as separate models instead of variants", () =>
    Effect.gen(function* () {
      const integrations = yield* Integration.Service
      const catalog = yield* Catalog.Service
      const models = ModelsDev.Service.of({
        get: () =>
          Effect.succeed({
            acme: {
              id: "acme",
              name: "Acme",
              env: [],
              npm: "@ai-sdk/openai-compatible",
              api: "https://api.acme.test/v1",
              models: {
                "gpt-5.4": {
                  id: "gpt-5.4",
                  name: "GPT-5.4",
                  family: "gpt",
                  release_date: "2026-01-01",
                  attachment: false,
                  reasoning: true,
                  temperature: true,
                  tool_call: true,
                  cost: {
                    input: 2.5,
                    output: 15,
                    tiers: [
                      {
                        tier: { type: "context", size: 272_000 },
                        input: 3,
                        output: 18,
                        cache_read: 0.25,
                      },
                    ],
                    context_over_200k: { input: 5, output: 22.5, cache_read: 0.5 },
                  },
                  limit: { context: 1_050_000, input: 922_000, output: 128_000 },
                  experimental: {
                    modes: {
                      fast: {
                        cost: { input: 5, output: 30, cache_read: 0.5 },
                        provider: {
                          headers: { "x-mode": "fast" },
                          body: { service_tier: "priority" },
                        },
                      },
                    },
                  },
                },
              },
            },
          } satisfies Record<string, ModelsDev.Provider>),
        refresh: () => Effect.void,
      })

      yield* ModelsDevPlugin.effect(
        host({
          catalog: catalogHost(catalog),
          integration: integrationHost(integrations),
        }),
      ).pipe(Effect.provideService(ModelsDev.Service, models))

      const providerID = ProviderV2.ID.make("acme")
      const base = yield* catalog.model.get(providerID, ModelV2.ID.make("gpt-5.4"))
      const fast = yield* catalog.model.get(providerID, ModelV2.ID.make("gpt-5.4-fast"))

      expect(base?.variants).toEqual([])
      expect(base?.request.body).toEqual({})
      expect(fast).toMatchObject({
        id: "gpt-5.4-fast",
        providerID: "acme",
        name: "GPT-5.4 Fast",
        api: { id: "gpt-5.4" },
        request: {
          headers: { "x-mode": "fast" },
          body: { service_tier: "priority" },
        },
        variants: [],
      })
      expect(fast?.cost).toEqual([
        { input: 5, output: 30, cache: { read: 0.5, write: 0 } },
        {
          tier: { type: "context", size: 272_000 },
          input: 3,
          output: 18,
          cache: { read: 0.25, write: 0 },
        },
        {
          tier: { type: "context", size: 200_000 },
          input: 5,
          output: 22.5,
          cache: { read: 0.5, write: 0 },
        },
      ])
    }),
  )

  it.effect("registers key methods for providers with environment variables", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const previous = {
          path: Flag.ORCHESTRA_MODELS_PATH,
          disabled: Flag.ORCHESTRA_DISABLE_MODELS_FETCH,
        }
        Flag.ORCHESTRA_MODELS_PATH = path.join(import.meta.dir, "fixtures", "models-dev.json")
        Flag.ORCHESTRA_DISABLE_MODELS_FETCH = true
        return previous
      }),
      () =>
        Effect.gen(function* () {
          const integrations = yield* Integration.Service
          const catalog = yield* Catalog.Service
          yield* ModelsDevPlugin.effect(
            host({
              catalog: catalogHost(catalog),
              integration: integrationHost(integrations),
            }),
          )
          expect(yield* integrations.list()).toEqual([
            new Integration.Info({
              id: Integration.ID.make("acme"),
              name: "Acme",
              methods: [
                { type: "key" },
                {
                  type: "env",
                  names: ["ACME_API_KEY"],
                },
              ],
              connections: [],
            }),
          ])
        }).pipe(Effect.provide(AppNodeBuilder.build(ModelsDev.node))),
      (previous) =>
        Effect.sync(() => {
          Flag.ORCHESTRA_MODELS_PATH = previous.path
          Flag.ORCHESTRA_DISABLE_MODELS_FETCH = previous.disabled
        }),
    ),
  )
})
