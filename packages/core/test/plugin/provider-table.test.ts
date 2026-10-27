// The fixture is imported first: plugin modules import ../internal, which imports
// the provider registry, which imports every plugin. Entering a single plugin module
// before that chain has loaded hits a temporal-dead-zone error on its own import.
import { PluginTestLayer } from "./fixture"
import { testEffect } from "../lib/effect"
import { AISDK } from "@orchestra/core/aisdk"
import { describe, expect } from "bun:test"
import { createAlibaba } from "@ai-sdk/alibaba"
import { createGroq } from "@ai-sdk/groq"
import type { LanguageModelV3 } from "@ai-sdk/provider"
import { Effect } from "effect"
import { ModelV2 } from "@orchestra/core/model"
import { PluginV2 } from "@orchestra/core/plugin"
import { PluginHost } from "@orchestra/core/plugin/host"
import { AlibabaPlugin } from "@orchestra/core/plugin/provider/alibaba"
import { GooglePlugin } from "@orchestra/core/plugin/provider/google"
import { GroqPlugin } from "@orchestra/core/plugin/provider/groq"
import { MistralPlugin } from "@orchestra/core/plugin/provider/mistral"
import { PerplexityPlugin } from "@orchestra/core/plugin/provider/perplexity"
import { TogetherAIPlugin } from "@orchestra/core/plugin/provider/togetherai"
import { VenicePlugin } from "@orchestra/core/plugin/provider/venice"
import { XAIPlugin } from "@orchestra/core/plugin/provider/xai"
import { ProviderV2 } from "@orchestra/core/provider"

const it = testEffect(PluginTestLayer)

// One row per provider whose plugin tests are pure SDK-shape checks.
// Each row yields: create, one "ignores" case per ignored package, one
// naming case per naming entry, and one language-selection case.
// `method` is the SDK selector the plugin uses for naming (responses for xAI).
// `bare` means the SDK is created with no options (xAI keeps the SDK default name).
// `language.kind`: fallback = plugin leaves language selection alone;
// responses = plugin selects sdk.responses(api.id); real = runSDK then runLanguage.
const rows = [
  {
    id: "mistral",
    plugin: MistralPlugin,
    apiPackage: "test-provider",
    package: "@ai-sdk/mistral",
    ignored: ["@ai-sdk/openai-compatible"],
    providerID: "mistral",
    modelID: "mistral-large",
    method: "languageModel",
    bare: false,
    naming: [
      { id: "mistral", model: "mistral-large", provider: "mistral.chat" },
      { id: "custom-mistral", model: "mistral-large", provider: "mistral.chat" },
    ],
    language: { kind: "fallback" },
  },
  {
    id: "alibaba",
    plugin: AlibabaPlugin,
    apiPackage: "test-provider",
    package: "@ai-sdk/alibaba",
    ignored: ["@ai-sdk/openai-compatible"],
    providerID: "alibaba",
    modelID: "qwen-plus",
    method: "languageModel",
    bare: false,
    naming: [
      {
        id: "custom-alibaba",
        model: "qwen",
        provider: createAlibaba({ apiKey: "test", ...{ name: "custom-alibaba" } }).languageModel("qwen").provider,
      },
    ],
    language: { kind: "real", provider: "alibaba.chat" },
  },
  {
    id: "google",
    plugin: GooglePlugin,
    apiPackage: "@ai-sdk/google",
    package: "@ai-sdk/google",
    ignored: ["@ai-sdk/google-vertex"],
    providerID: "custom-google",
    modelID: "gemini-api",
    method: "languageModel",
    bare: false,
    naming: [{ id: "custom-google", model: "gemini", provider: "custom-google" }],
    language: { kind: "real", provider: "custom-google" },
  },
  {
    id: "groq",
    plugin: GroqPlugin,
    apiPackage: "@ai-sdk/groq",
    package: "@ai-sdk/groq",
    ignored: ["@ai-sdk/openai-compatible", "@ai-sdk/groq/compat"],
    providerID: "groq",
    modelID: "llama-api",
    method: "languageModel",
    bare: false,
    naming: [
      {
        id: "custom-groq",
        model: "llama",
        provider: createGroq({ name: "custom-groq", apiKey: "test" } as Parameters<typeof createGroq>[0] & {
          name: string
        }).languageModel("llama").provider,
      },
    ],
    language: { kind: "real", provider: "groq.chat" },
  },
  {
    id: "perplexity",
    plugin: PerplexityPlugin,
    apiPackage: "test-provider",
    package: "@ai-sdk/perplexity",
    ignored: ["@ai-sdk/perplexity-compatible"],
    providerID: "perplexity",
    modelID: "sonar",
    method: "languageModel",
    bare: false,
    naming: [
      { id: "perplexity", model: "sonar", provider: "perplexity" },
      { id: "custom-perplexity", model: "sonar", provider: "perplexity" },
    ],
    language: { kind: "fallback" },
  },
  {
    id: "togetherai",
    plugin: TogetherAIPlugin,
    apiPackage: "test-provider",
    package: "@ai-sdk/togetherai",
    ignored: ["file:///tmp/@ai-sdk/togetherai-provider.js"],
    providerID: "togetherai",
    modelID: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    method: "languageModel",
    bare: false,
    naming: [{ id: "custom-togetherai", model: "model", provider: "togetherai.chat" }],
    language: { kind: "fallback" },
  },
  {
    id: "venice",
    plugin: VenicePlugin,
    apiPackage: "test-provider",
    package: "venice-ai-sdk-provider",
    ignored: ["file:///tmp/venice-ai-sdk-provider.js", "@ai-sdk/openai-compatible"],
    providerID: "venice",
    modelID: "model",
    method: "languageModel",
    bare: false,
    naming: [{ id: "custom-venice", model: "model", provider: "custom-venice.chat" }],
    language: { kind: "fallback" },
  },
  {
    id: "xai",
    plugin: XAIPlugin,
    apiPackage: "@ai-sdk/xai",
    package: "@ai-sdk/xai",
    ignored: ["@ai-sdk/openai-compatible"],
    providerID: "xai",
    modelID: "grok-4",
    method: "responses",
    bare: true,
    naming: [{ id: "custom-xai", model: "grok-4", provider: "xai.responses" }],
    language: { kind: "responses" },
    foreign: "openai",
  },
] as const

type Row = (typeof rows)[number]

function model(row: Row, providerID: string, id: string) {
  return ModelV2.Info.make({
    ...ModelV2.Info.empty(ProviderV2.ID.make(providerID), ModelV2.ID.make(id)),
    api: { id: ModelV2.ID.make(row.modelID), type: "aisdk", package: row.apiPackage },
  })
}

function sdkOptions(row: Row, name: string) {
  if (row.bare) return {}
  return { name, apiKey: "test" }
}

const addPlugin = Effect.fn(function* (row: Row) {
  const plugin = yield* PluginV2.Service
  const host = yield* PluginHost.make(plugin)
  yield* row.plugin.effect(host)
})

function fakeSelectorSdk(calls: string[]) {
  const make = (method: string) => (id: string) => {
    calls.push(`${method}:${id}`)
    return { modelId: id, provider: method, specificationVersion: "v3" } as unknown as LanguageModelV3
  }
  return {
    responses: make("responses"),
    messages: make("messages"),
    chat: make("chat"),
    languageModel: make("languageModel"),
  }
}

for (const row of rows) {
  describe(`${row.id} provider plugin`, () => {
    it.effect(`creates a ${row.id} SDK for ${row.package}`, () =>
      Effect.gen(function* () {
        const aisdk = yield* AISDK.Service
        yield* addPlugin(row)
        const result = yield* aisdk.runSDK({
          model: model(row, row.providerID, row.modelID),
          package: row.package,
          options: sdkOptions(row, row.providerID),
        })
        expect(result.sdk).toBeDefined()
      }),
    )

    for (const pkg of row.ignored) {
      it.effect(`ignores ${pkg}`, () =>
        Effect.gen(function* () {
          const aisdk = yield* AISDK.Service
          yield* addPlugin(row)
          const result = yield* aisdk.runSDK({
            model: model(row, row.providerID, row.modelID),
            package: pkg,
            options: sdkOptions(row, row.providerID),
          })
          expect(result.sdk).toBeUndefined()
        }),
      )
    }

    for (const item of row.naming) {
      it.effect(`matches the bundled ${row.id} SDK provider name for ${item.id}`, () =>
        Effect.gen(function* () {
          const aisdk = yield* AISDK.Service
          const providers: string[] = []
          yield* addPlugin(row)
          yield* aisdk.hook.sdk((event) =>
            Effect.sync(() => {
              providers.push(event.sdk[row.method](item.model).provider)
            }),
          )
          const result = yield* aisdk.runSDK({
            model: model(row, item.id, row.modelID),
            package: row.package,
            options: sdkOptions(row, item.id),
          })
          expect(result.sdk?.[row.method](item.model).provider).toBe(item.provider)
          expect(result.sdk?.[row.method](item.model).modelId).toBe(item.model)
          expect(providers).toEqual([item.provider])
        }),
      )
    }

    if (row.language.kind === "real") {
      const provider = row.language.provider
      it.effect(`keeps ${row.id} language selection on the default languageModel(api.id) path`, () =>
        Effect.gen(function* () {
          const aisdk = yield* AISDK.Service
          yield* addPlugin(row)
          const sdkEvent = yield* aisdk.runSDK({
            model: model(row, row.providerID, "alias"),
            package: row.package,
            options: sdkOptions(row, row.providerID),
          })
          const result = yield* aisdk.runLanguage({
            model: sdkEvent.model,
            sdk: sdkEvent.sdk,
            options: sdkEvent.options,
          })
          const language = result.language ?? result.sdk.languageModel(result.model.api.id)
          expect(language.modelId).toBe(row.modelID)
          expect(language.provider).toBe(provider)
        }),
      )
    }

    if (row.language.kind === "fallback") {
      it.effect(`leaves ${row.id} language selection on the default sdk.languageModel(api.id) path`, () =>
        Effect.gen(function* () {
          const aisdk = yield* AISDK.Service
          const calls: string[] = []
          const sdk = fakeSelectorSdk(calls)
          yield* addPlugin(row)
          const result = yield* aisdk.runLanguage({
            model: model(row, row.providerID, "alias"),
            sdk,
            options: {},
          })
          expect(result.language).toBeUndefined()
          expect(calls).toEqual([])
          const language = result.language ?? sdk.languageModel(result.model.api.id)
          expect(calls).toEqual([`languageModel:${row.modelID}`])
          expect(language).toBeDefined()
        }),
      )
    }

    if (row.language.kind === "responses") {
      it.effect(`uses responses with the model api.id for ${row.id} language models`, () =>
        Effect.gen(function* () {
          const aisdk = yield* AISDK.Service
          const calls: string[] = []
          yield* addPlugin(row)
          const result = yield* aisdk.runLanguage({
            model: model(row, row.providerID, "alias"),
            sdk: fakeSelectorSdk(calls),
            options: {},
          })
          expect(calls).toEqual([`responses:${row.modelID}`])
          expect(result.language).toBeDefined()
        }),
      )
    }

    if ("foreign" in row) {
      const foreign = row.foreign
      it.effect(`ignores non-${row.id} providers for language selection`, () =>
        Effect.gen(function* () {
          const aisdk = yield* AISDK.Service
          const calls: string[] = []
          yield* addPlugin(row)
          const result = yield* aisdk.runLanguage({
            model: model(row, foreign, row.modelID),
            sdk: fakeSelectorSdk(calls),
            options: {},
          })
          expect(calls).toEqual([])
          expect(result.language).toBeUndefined()
        }),
      )
    }
  })
}
