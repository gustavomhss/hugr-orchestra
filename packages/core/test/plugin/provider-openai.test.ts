import { AISDK } from "@orchestra/core/aisdk"
import { describe, expect, spyOn } from "bun:test"
import type { LanguageModelV3 } from "@ai-sdk/provider"
import { Effect, Schema } from "effect"
import { Catalog } from "@orchestra/core/catalog"
import { Integration } from "@orchestra/core/integration"
import { ModelV2 } from "@orchestra/core/model"
import { PluginV2 } from "@orchestra/core/plugin"
import { PluginHost } from "@orchestra/core/plugin/host"
import { OpenAIPlugin } from "@orchestra/core/plugin/provider/openai"
import { ProviderV2 } from "@orchestra/core/provider"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const it = testEffect(PluginTestLayer)

const addPlugin = Effect.fn(function* () {
  const plugin = yield* PluginV2.Service
  const aisdk = yield* AISDK.Service
  const host = yield* PluginHost.make(plugin)
  const integrations = yield* Integration.Service
  yield* OpenAIPlugin.effect(host).pipe(Effect.provideService(Integration.Service, integrations))
})

function required<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected value")
  return value
}

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

describe("OpenAIPlugin", () => {
  it.live("uses configured client ID for device exchange and refresh over HTTP", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const previous = process.env.ORCHESTRA_OPENAI_CLIENT_ID
        process.env.ORCHESTRA_OPENAI_CLIENT_ID = "fixture-owned-openai"
        const bodies: Array<Record<string, string>> = []
        const server = Bun.serve({ port: 0, async fetch(request) {
          const url = new URL(request.url)
          bodies.push(Schema.decodeUnknownSync(Schema.Record(Schema.String, Schema.String))(url.pathname.endsWith("usercode") ? await request.json() : Object.fromEntries(new URLSearchParams(await request.text()))))
          if (url.pathname.endsWith("usercode")) return Response.json({ device_auth_id: "device", user_code: "user", interval: "1" })
          if (url.pathname.endsWith("deviceauth/token")) return Response.json({ authorization_code: "code", code_verifier: "verifier" })
          return Response.json({ id_token: "fixture", access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: -1 })
        } })
        const original = fetch
        // Fixed issuer has no injection seam; redirect transport only, keep real local HTTP.
        const transport = spyOn(globalThis, "fetch").mockImplementation(Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
          const url = new URL(input instanceof Request ? input.url : input.toString())
          if (url.origin !== "https://auth.openai.com") throw new Error("Unexpected fixture origin")
          return original(new URL(url.pathname, server.url), init)
        }, { preconnect: original.preconnect }))
        return { previous, bodies, server, transport, original }
      }),
      (fixture) => Effect.gen(function* () {
        yield* addPlugin()
        const integrations = yield* Integration.Service
        const attempt = yield* integrations.connection.oauth({ integrationID: Integration.ID.make("openai"), methodID: Integration.MethodID.make("chatgpt-headless"), inputs: {} })
        while ((yield* integrations.attempt.status(attempt.attemptID)).status === "pending") yield* Effect.promise(() => Bun.sleep(1))
        expect((yield* integrations.attempt.status(attempt.attemptID)).status).toBe("complete")
        yield* integrations.connection.resolve(required(yield* integrations.connection.active(Integration.ID.make("openai"))))
        const browser = yield* integrations.connection.oauth({ integrationID: Integration.ID.make("openai"), methodID: Integration.MethodID.make("chatgpt-browser"), inputs: {} })
        const url = new URL(browser.url)
        expect(url.searchParams.get("client_id")).toBe("fixture-owned-openai")
        process.env.ORCHESTRA_OPENAI_CLIENT_ID = "fixture-next-registration"
        const callback = new URL(required(url.searchParams.get("redirect_uri") ?? undefined))
        callback.searchParams.set("state", required(url.searchParams.get("state") ?? undefined))
        callback.searchParams.set("code", "fixture-code")
        yield* Effect.promise(() => fixture.original(callback))
        while ((yield* integrations.attempt.status(browser.attemptID)).status === "pending") yield* Effect.promise(() => Bun.sleep(1))
        expect((yield* integrations.attempt.status(browser.attemptID)).status).toBe("complete")
        expect(fixture.bodies.filter((body) => body.client_id).map((body) => body.client_id)).toEqual(Array(4).fill("fixture-owned-openai"))
        delete process.env.ORCHESTRA_OPENAI_CLIENT_ID
        const error = yield* integrations.connection.oauth({ integrationID: Integration.ID.make("openai"), methodID: Integration.MethodID.make("chatgpt-headless"), inputs: {} }).pipe(Effect.flip)
        expect(String(error.cause)).toContain("openai: ORCHESTRA_OPENAI_CLIENT_ID")
      }),
      (fixture) => Effect.sync(() => {
        fixture.transport.mockRestore()
        fixture.server.stop(true)
        if (fixture.previous === undefined) delete process.env.ORCHESTRA_OPENAI_CLIENT_ID
        else process.env.ORCHESTRA_OPENAI_CLIENT_ID = fixture.previous
      }),
    ),
  )

  it.effect("registers browser and headless ChatGPT OAuth methods", () =>
    Effect.gen(function* () {
      yield* addPlugin()
      expect((yield* (yield* Integration.Service).get(Integration.ID.make("openai")))?.methods).toEqual([
        {
          id: Integration.MethodID.make("chatgpt-browser"),
          type: "oauth",
          label: "ChatGPT Pro/Plus (browser)",
        },
        {
          id: Integration.MethodID.make("chatgpt-headless"),
          type: "oauth",
          label: "ChatGPT Pro/Plus (headless)",
        },
      ])
    }),
  )

  it.effect("creates an OpenAI SDK for @ai-sdk/openai using the provider ID as SDK name", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const aisdk = yield* AISDK.Service
      yield* addPlugin()
      const result = yield* aisdk.runSDK({
        model: ModelV2.Info.make({
          ...ModelV2.Info.empty(ProviderV2.ID.make("custom-openai"), ModelV2.ID.make("gpt-5")),
          api: { id: ModelV2.ID.make("gpt-5"), type: "aisdk", package: "test-provider" },
        }),
        package: "@ai-sdk/openai",
        options: { name: "custom-openai", apiKey: "test" },
      })
      expect(result.sdk?.responses("gpt-5").provider).toBe("custom-openai.responses")
    }),
  )

  it.effect("ignores non-OpenAI SDK packages", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const aisdk = yield* AISDK.Service
      yield* addPlugin()
      const result = yield* aisdk.runSDK({
        model: ModelV2.Info.make({
          ...ModelV2.Info.empty(ProviderV2.ID.openai, ModelV2.ID.make("gpt-5")),
          api: { id: ModelV2.ID.make("gpt-5"), type: "aisdk", package: "test-provider" },
        }),
        package: "@ai-sdk/openai-compatible",
        options: { name: "openai" },
      })
      expect(result.sdk).toBeUndefined()
    }),
  )

  it.effect("uses the Responses API for language models", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const aisdk = yield* AISDK.Service
      const calls: string[] = []
      yield* addPlugin()
      const result = yield* aisdk.runLanguage({
        model: ModelV2.Info.make({
          ...ModelV2.Info.empty(ProviderV2.ID.openai, ModelV2.ID.make("alias")),
          api: { id: ModelV2.ID.make("gpt-5"), type: "aisdk", package: "test-provider" },
        }),
        sdk: fakeSelectorSdk(calls),
        options: {},
      })
      expect(calls).toEqual(["responses:gpt-5"])
      expect(result.language).toBeDefined()
    }),
  )

  it.effect("ignores non-OpenAI providers", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const aisdk = yield* AISDK.Service
      const calls: string[] = []
      yield* addPlugin()
      const result = yield* aisdk.runLanguage({
        model: ModelV2.Info.make({
          ...ModelV2.Info.empty(ProviderV2.ID.anthropic, ModelV2.ID.make("gpt-5")),
          api: { id: ModelV2.ID.make("gpt-5"), type: "aisdk", package: "test-provider" },
        }),
        sdk: fakeSelectorSdk(calls),
        options: {},
      })
      expect(calls).toEqual([])
      expect(result.language).toBeUndefined()
    }),
  )

  it.effect("disables gpt-5-chat-latest during catalog transforms", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      yield* catalog.transform((catalog) => {
        const item = ProviderV2.Info.make({
          ...ProviderV2.Info.empty(ProviderV2.ID.openai),
          api: { type: "aisdk", package: "@ai-sdk/openai" },
        })
        catalog.provider.update(item.id, (draft) => {
          draft.api = item.api
        })
        catalog.model.update(item.id, ModelV2.ID.make("gpt-5"), () => {})
        catalog.model.update(item.id, ModelV2.ID.make("gpt-5-chat-latest"), () => {})
      })
      yield* addPlugin()
      expect(required(yield* catalog.model.get(ProviderV2.ID.openai, ModelV2.ID.make("gpt-5"))).enabled).toBe(true)
      expect(
        required(yield* catalog.model.get(ProviderV2.ID.openai, ModelV2.ID.make("gpt-5-chat-latest"))).enabled,
      ).toBe(false)
    }),
  )

  it.effect("does not disable gpt-5-chat-latest for non-OpenAI providers", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      yield* catalog.transform((catalog) => {
        const item = ProviderV2.Info.make({
          ...ProviderV2.Info.empty(ProviderV2.ID.make("custom-openai")),
          api: { type: "aisdk", package: "test-provider" },
        })
        catalog.provider.update(item.id, (draft) => {
          draft.api = item.api
        })
        catalog.model.update(item.id, ModelV2.ID.make("gpt-5-chat-latest"), () => {})
      })
      yield* addPlugin()
      expect(
        required(yield* catalog.model.get(ProviderV2.ID.make("custom-openai"), ModelV2.ID.make("gpt-5-chat-latest")))
          .enabled,
      ).toBe(true)
    }),
  )
})
