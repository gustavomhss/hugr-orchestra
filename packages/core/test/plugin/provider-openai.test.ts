import { AISDK } from "@orchestra/core/aisdk"
import { describe, expect } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { LanguageModelV3 } from "@ai-sdk/provider"
import { Effect } from "effect"
import { Global } from "@orchestra/core/global"
import { Credential } from "@orchestra/core/credential"
import { Siwc } from "@orchestra/core/auth/siwc"
import { SiwcHost } from "@orchestra/core/auth/siwc-host"
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
  const directory = yield* Effect.acquireRelease(
    Effect.promise(() => mkdtemp(join(tmpdir(), "openai-plugin-test-"))),
    (directory) => Effect.promise(() => rm(directory, { recursive: true, force: true })),
  )
  const plugin = yield* PluginV2.Service
  const aisdk = yield* AISDK.Service
  const host = yield* PluginHost.make(plugin)
  const integrations = yield* Integration.Service
  yield* OpenAIPlugin.effect(host).pipe(
    Effect.provideService(Integration.Service, integrations),
    Effect.provideService(Global.Service, Global.make({ data: directory })),
  )
  return directory
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
  it.live("uses dynamic Orchestra registration by default and saved identity for returning sign-in", () =>
    Effect.acquireUseRelease(
      Effect.sync(() => {
        const previous = process.env.ORCHESTRA_OPENAI_CLIENT_ID
        process.env.ORCHESTRA_OPENAI_CLIENT_ID = "fixture-owned-openai"
        return { previous }
      }),
      (fixture) => Effect.gen(function* () {
        const directory = yield* addPlugin()
        const integrations = yield* Integration.Service
        const browser = yield* integrations.connection.oauth({ integrationID: Integration.ID.make("openai"), methodID: Integration.MethodID.make("chatgpt-browser"), inputs: {} })
        const url = new URL(browser.url)
        expect(url.searchParams.get("client_id")).toBe("dynamic_agent_client")
        expect(url.searchParams.get("agent_name_hint")).toBe("Orchestra")
        const callback = new URL(required(url.searchParams.get("redirect_uri") ?? undefined))
        expect(callback.hostname).toBe("127.0.0.1")
        callback.searchParams.set("state", "wrong")
        expect((yield* Effect.promise(() => fetch(callback))).status).toBe(400)
        expect((yield* integrations.attempt.status(browser.attemptID)).status).toBe("pending")
        callback.searchParams.set("state", required(url.searchParams.get("state") ?? undefined))
        callback.searchParams.set("error", "access_denied")
        yield* Effect.promise(() => fetch(callback))
        while ((yield* integrations.attempt.status(browser.attemptID)).status === "pending") yield* Effect.promise(() => Bun.sleep(1))
        expect((yield* integrations.attempt.status(browser.attemptID)).status).toBe("failed")
        const credentials = yield* Credential.Service
        yield* credentials.create({ integrationID: Integration.ID.make("openai"), value: Credential.OAuth.make({
          type: "oauth", methodID: Integration.MethodID.make("chatgpt-browser"), access: "fixture", refresh: "fixture",
          expires: Date.now() + 3600000, metadata: { clientId: "fixture-saved-client", issuer: Siwc.issuer,
            subject: "fixture-subject", idToken: "fixture-hint", scopes: Siwc.scopes.split(" "),
            hostId: yield* Effect.promise(() => SiwcHost.load(join(directory, "siwc", "host-id"))) },
        }) })
        process.env.ORCHESTRA_OPENAI_CLIENT_ID = "fixture-next-registration"
        const returning = yield* integrations.connection.oauth({ integrationID: Integration.ID.make("openai"), methodID: Integration.MethodID.make("chatgpt-browser"), inputs: { account: "saved" } })
        expect(new URL(returning.url).searchParams.get("client_id")).toBe("fixture-saved-client")
        expect(new URL(returning.url).searchParams.get("id_token_hint")).toBe("fixture-hint")
      }),
      (fixture) => Effect.sync(() => {
        if (fixture.previous === undefined) delete process.env.ORCHESTRA_OPENAI_CLIENT_ID
        else process.env.ORCHESTRA_OPENAI_CLIENT_ID = fixture.previous
      }),
    ),
  )

  it.effect("registers browser and headless ChatGPT OAuth methods", () =>
    Effect.gen(function* () {
      yield* addPlugin()
      const integrations = yield* Integration.Service
      expect((yield* integrations.get(Integration.ID.make("openai")))?.methods).toMatchObject([
        { id: Integration.MethodID.make("chatgpt-browser"), type: "oauth", label: "Continue with ChatGPT (Orchestra)" },
        { id: Integration.MethodID.make("chatgpt-headless"), type: "oauth", label: "Continue with ChatGPT (manual browser)" },
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
