import path from "path"
import { describe, expect } from "bun:test"
import { DateTime, Effect, Layer, Schema } from "effect"
import { LLM } from "@orchestra/llm"
import { OpenAIResponses } from "@orchestra/llm/protocols"
import { LLMClient, RequestExecutor } from "@orchestra/llm/route"
import { Catalog } from "@orchestra/core/catalog"
import { Config } from "@orchestra/core/config"
import { ConfigProviderPlugin } from "@orchestra/core/config/plugin/provider"
import { Credential } from "@orchestra/core/credential"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { PluginV2 } from "@orchestra/core/plugin"
import { PluginHost } from "@orchestra/core/plugin/host"
import { ProjectV2 } from "@orchestra/core/project"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { SessionV2 } from "@orchestra/core/session"
import { SessionRunnerModel } from "@orchestra/core/session/runner/model"
import { PluginTestLayer } from "./plugin/fixture"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.mergeAll(PluginTestLayer, LayerNode.compile(Global.node)))
const decode = Schema.decodeUnknownSync(Config.Info, { onExcessProperty: "ignore" })
const providerID = ProviderV2.ID.make("variant-fixture")
const modelID = ModelV2.ID.make("chat")

function document(model: unknown, api?: unknown, filepath?: string) {
  return new Config.Document({ type: "document", path: filepath, info: decode({
    providers: { "variant-fixture": { ...(api === undefined ? {} : { api }), models: { chat: model } } },
  }) })
}

const configure = Effect.fn(function* (entries: Config.Entry[]) {
  const plugins = yield* PluginV2.Service
  const host = yield* PluginHost.make(plugins)
  yield* ConfigProviderPlugin.Plugin.effect(host).pipe(
    Effect.provideService(Config.Service, Config.Service.of({ entries: () => Effect.succeed(entries) })),
  )
  const catalog = yield* Catalog.Service
  const model = yield* catalog.model.get(providerID, modelID)
  if (!model) throw new Error("Expected configured variant fixture")
  return model
})

function session(variant?: string) {
  return SessionV2.Info.make({
    id: SessionV2.ID.make("ses_variant_fixture"), projectID: ProjectV2.ID.global, title: "Variant fixture",
    model: { id: modelID, providerID, ...(variant === undefined ? {} : { variant: ModelV2.VariantID.make(variant) }) },
    cost: 0, tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    time: { created: DateTime.makeUnsafe(0), updated: DateTime.makeUnsafe(0) },
    location: { directory: AbsolutePath.make("/variant-fixture") },
  })
}

const capture = Effect.fn(function* (protocol: "openai" | "anthropic" = "openai") {
  const calls: { body: Record<string, unknown>; variant: string | null }[] = []
  const server = yield* Effect.acquireRelease(Effect.sync(() => Bun.serve({ port: 0, async fetch(request) {
    calls.push({ body: Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.Unknown))(await request.json()),
      variant: request.headers.get("x-variant") })
    const events = protocol === "openai"
      ? [{ type: "response.completed", response: { id: "variant-response" } }]
      : [{ type: "message_delta", delta: { stop_reason: "end_turn" } }, { type: "message_stop" }]
    return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""),
      { headers: { "Content-Type": "text/event-stream" } })
  } })), (server) => Effect.promise(() => server.stop(true)))
  return { url: `${server.url.origin}/v1`, calls }
})

const generate = (model: Parameters<typeof LLM.request>[0]["model"]) =>
  LLMClient.generate(LLM.request({ model, prompt: "Variant fixture" })).pipe(
    Effect.provide(LLMClient.layer.pipe(Layer.provide(RequestExecutor.fetchLayer))),
  )

describe("E7 native canonical variants", () => {
  it.live("trusted ConfigProvider layers preserve generation through Catalog and final OpenAI HTTP", () => Effect.gen(function* () {
    const server = yield* capture()
    const model = yield* configure([
      document({ request: { body: { store: false } }, variants: [{ id: "custom", headers: { "x-variant": "custom" },
        generation: { temperature: 0.4, maxTokens: 29 }, providerOptions: { openai: { textVerbosity: "low" } } }] },
        { type: "aisdk", package: "@ai-sdk/openai", url: server.url,
          settings: { generation: { temperature: 0.8, maxTokens: 11, topP: 0.7 } } }),
      document({ variants: [{ id: "custom", generation: { temperature: 0 },
        providerOptions: { openai: { reasoningEffort: "high" } } }] }),
      document({ variants: [{ id: "custom", generation: { temperature: undefined, maxTokens: undefined } }] }),
    ])
    const resolved = yield* SessionRunnerModel.resolve(session("custom"), model)
    const prepared = yield* LLMClient.prepare(LLM.request({ model: resolved, prompt: "Variant fixture" }))
    expect(prepared.body).toMatchObject({ temperature: 0, max_output_tokens: 29, top_p: 0.7 })
    yield* generate(resolved)
    expect(server.calls).toHaveLength(1)
    expect(server.calls[0]).toMatchObject({ variant: "custom", body: { temperature: 0, max_output_tokens: 29,
      top_p: 0.7, store: false, reasoning: { effort: "high" }, text: { verbosity: "low" } } })
    expect(resolved.route.defaults.http?.body).toEqual({ store: false })
  }))

  it.live("Anthropic canonical thinking and stop replacement reach final HTTP outside overlays", () => Effect.gen(function* () {
    const server = yield* capture("anthropic")
    const model = yield* configure([
      document({ variants: [{ id: "thinking", generation: { stop: ["first-variant-stop"] },
        providerOptions: { anthropic: { thinking: { type: "enabled", budgetTokens: 11000 } } } }] },
        { type: "aisdk", package: "@ai-sdk/anthropic", url: server.url,
          settings: { generation: { maxTokens: 16000, topP: 0.7, stop: ["base-stop", "discarded"] } } }),
      document({ variants: [{ id: "thinking", generation: { temperature: 0, stop: ["variant-stop"] },
        providerOptions: { anthropic: { thinking: { budgetTokens: 12000 } } } }] }),
    ])
    const resolved = yield* SessionRunnerModel.resolve(session("thinking"), model)
    const prepared = yield* LLMClient.prepare(LLM.request({ model: resolved, prompt: "Variant fixture" }))
    expect(prepared.body).toMatchObject({ temperature: 0, max_tokens: 16000, top_p: 0.7,
      stop_sequences: ["variant-stop"], thinking: { type: "enabled", budget_tokens: 12000 } })
    expect(resolved.route.defaults.http?.body).toEqual({})
    yield* generate(resolved)
    expect(server.calls).toHaveLength(1)
    expect(server.calls[0].body).toMatchObject({ stop_sequences: ["variant-stop"],
      thinking: { type: "enabled", budget_tokens: 12000 } })
  }))

  it.effect("variant generation rejects typo fields during real ConfigProvider decoding", () => Effect.sync(() => {
    expect(() => document({ variants: [{ id: "typo", generation: { temperatur: 0 } }] })).toThrow("temperatur")
  }))

  for (const generation of [null, { temperature: "0" }, { temperature: 0, extra: true }]) {
    it.effect(`variant generation rejects malformed/excess configuration ${JSON.stringify(generation)}`, () => Effect.sync(() => {
      expect(() => document({ variants: [{ id: "invalid", generation }] })).toThrow()
    }))
  }

  for (const body of [{ temperature: 0 }, { thinking: { type: "enabled", budget_tokens: 12000 } },
    { tools: [] }, { messages: [] }, { model: "other" }]) {
    it.live(`legacy variant body ${Object.keys(body)[0]} fails typed resolution before provider requests`, () => Effect.gen(function* () {
      const server = yield* capture()
      const model = yield* configure([document({ variants: [{ id: "legacy", body, generation: { temperature: 0 } }] },
        { type: "aisdk", package: "@ai-sdk/openai", url: server.url })])
      const failure = yield* SessionRunnerModel.resolve(session("legacy"), model).pipe(
        Effect.flatMap(generate), Effect.flip,
      )
      expect(failure).toMatchObject({ _tag: "SessionRunnerModel.ModelUnavailableError",
        cause: expect.stringContaining(Object.keys(body)[0]) })
      expect(server.calls).toEqual([])
    }))
  }

  it.live("credential metadata cannot add denied body keys after canonical variant validation", () => Effect.gen(function* () {
    const server = yield* capture()
    const model = yield* configure([document({ variants: [{ id: "safe", generation: { temperature: 0 } }] },
      { type: "aisdk", package: "@ai-sdk/openai", url: server.url })])
    const failure = yield* SessionRunnerModel.resolve(session("safe"), model,
      Credential.Key.make({ type: "key", key: "synthetic-key", metadata: { temperature: 0.5 } })).pipe(
      Effect.flatMap(generate), Effect.flip,
    )
    expect(failure).toMatchObject({ _tag: "SessionRunnerModel.ModelUnavailableError",
      cause: expect.stringContaining("temperature") })
    expect(server.calls).toEqual([])
  }))

  for (const variant of [undefined, "default"]) {
    it.effect(`missing configured default fails for ${variant ?? "omitted"} selection`, () => Effect.gen(function* () {
      const model = yield* configure([document({ request: { variant: "missing" } },
        { type: "aisdk", package: "@ai-sdk/openai", url: "https://variant.example/v1" })])
      const failure = yield* SessionRunnerModel.resolve(session(variant), model).pipe(
        Effect.match({ onFailure: (error) => error, onSuccess: () => undefined }),
      )
      expect(failure).toMatchObject({ _tag: "SessionRunnerModel.VariantUnavailableError", variant: "missing" })
    }))
  }

  it.live("omitted canonical options keep no default variant and unchanged native defaults", () => Effect.gen(function* () {
    const server = yield* capture()
    const model = yield* configure([document({ variants: [{ id: "plain", headers: {}, body: { store: false } }] },
      { type: "aisdk", package: "@ai-sdk/openai", url: server.url })])
    expect(model.variants[0]).not.toHaveProperty("generation")
    expect(model.variants[0]).not.toHaveProperty("providerOptions")
    const resolved = yield* SessionRunnerModel.resolve(session(), model)
    const prepared = yield* LLMClient.prepare(LLM.request({ model: resolved, prompt: "Variant fixture" }))
    expect(prepared.body).toMatchObject({ temperature: undefined })
    expect(resolved.route.defaults.providerOptions).toEqual(OpenAIResponses.route.defaults.providerOptions)
    expect(resolved.route.defaults.http?.body).toEqual({})
    yield* generate(resolved)
    expect(server.calls).toHaveLength(1)
    expect(server.calls[0].body).not.toHaveProperty("temperature")
  }))

  it.live("untrusted project canonical options cannot alter a trusted variant", () => Effect.gen(function* () {
    const location = yield* Location.Service
    const server = yield* capture("anthropic")
    const model = yield* configure([
      document({ variants: [{ id: "trusted", generation: { temperature: 0.2, stop: ["trusted"] },
        providerOptions: { anthropic: { thinking: { type: "enabled", budgetTokens: 12000 } } } }] },
        { type: "aisdk", package: "@ai-sdk/anthropic", url: server.url, settings: { generation: { maxTokens: 16000 } } }),
      document({ variants: [{ id: "trusted", generation: { temperature: 0, stop: ["untrusted"] },
        providerOptions: { anthropic: { thinking: { budgetTokens: 15000 } } } }] }, undefined,
        path.join(location.directory, "orchestra.json")),
    ])
    const resolved = yield* SessionRunnerModel.resolve(session("trusted"), model)
    yield* generate(resolved)
    expect(server.calls).toHaveLength(1)
    expect(server.calls[0].body).toMatchObject({ temperature: 0.2, stop_sequences: ["trusted"],
      thinking: { type: "enabled", budget_tokens: 12000 } })
  }))
})
