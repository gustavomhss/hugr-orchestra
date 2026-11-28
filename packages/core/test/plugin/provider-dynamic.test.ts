import { Npm } from "@orchestra/core/npm"
import { describe, expect } from "bun:test"
import { Cause, Effect, Layer } from "effect"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import { AISDK } from "@orchestra/core/aisdk"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { ModelV2 } from "@orchestra/core/model"
import { PluginV2 } from "@orchestra/core/plugin"
import { PluginHost } from "@orchestra/core/plugin/host"
import { DynamicProviderPlugin } from "@orchestra/core/plugin/provider/dynamic"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelExecutionOptions } from "../../src/model-execution-options"
import { testEffect } from "../lib/effect"
import { PluginTestLayer } from "./fixture"

const fixtureProvider = new URL("./fixtures/provider-factory.ts", import.meta.url).href
const fixtureProviderPath = fileURLToPath(fixtureProvider)
const it = testEffect(PluginTestLayer)
const itWithAISDK = testEffect(Layer.mergeAll(PluginTestLayer, AppNodeBuilder.build(AISDK.node)))

function npmEntrypoint(entrypoint?: string) {
  return Npm.Service.of({
    add: () => Effect.succeed({ directory: "", entrypoint }),
    install: () => Effect.void,
    which: () => Effect.succeed(undefined),
  })
}

const addPlugin = Effect.fn(function* (npm?: Npm.Interface) {
  const plugin = yield* PluginV2.Service
  const host = yield* PluginHost.make(plugin)
  yield* DynamicProviderPlugin.effect(host).pipe(Effect.provideService(Npm.Service, npm ?? (yield* Npm.Service)))
})

function tempEntrypoint(source: string) {
  return Effect.acquireRelease(
    Effect.promise(async () => {
      const directory = await fs.mkdtemp(path.join(os.tmpdir(), "orchestra-provider-dynamic-"))
      const entrypoint = path.join(directory, "provider.mjs")
      await Bun.write(entrypoint, source)
      return { directory, entrypoint }
    }),
    (tmp) => Effect.promise(() => fs.rm(tmp.directory, { recursive: true, force: true })),
  )
}

describe("DynamicProviderPlugin", () => {
  it.effect("creates an SDK from a provider factory export", () =>
    Effect.gen(function* () {
      const aisdk = yield* AISDK.Service
      yield* addPlugin()
      const result = yield* aisdk.runSDK({
        model: ModelV2.Info.make({
          ...ModelV2.Info.empty(ProviderV2.ID.make("custom"), ModelV2.ID.make("test-model")),
          api: { id: ModelV2.ID.make("test-model"), type: "aisdk", package: fixtureProvider },
        }),
        package: fixtureProvider,
        options: { name: "custom", marker: "dynamic" },
      })
      expect(result.sdk.options).toEqual({ marker: "dynamic", name: "custom" })
      expect(result.sdk.languageModel("x")).toEqual({ modelID: "x", options: { marker: "dynamic", name: "custom" } })
    }),
  )

  it.effect("does not override an SDK already supplied by an earlier plugin", () =>
    Effect.gen(function* () {
      const aisdk = yield* AISDK.Service
      const sdk = { marker: "existing" }
      yield* addPlugin()
      const result = yield* aisdk.runSDK({
        model: ModelV2.Info.make({
          ...ModelV2.Info.empty(ProviderV2.ID.make("custom"), ModelV2.ID.make("test-model")),
          api: { id: ModelV2.ID.make("test-model"), type: "aisdk", package: fixtureProvider },
        }),
        package: fixtureProvider,
        options: { name: "custom", marker: "dynamic" },
        sdk,
      })
      expect(result.sdk).toBe(sdk)
    }),
  )

  it.effect("injects the provider ID as the SDK factory name", () =>
    Effect.gen(function* () {
      const aisdk = yield* AISDK.Service
      yield* addPlugin()
      const result = yield* aisdk.runSDK({
        model: ModelV2.Info.make({
          ...ModelV2.Info.empty(ProviderV2.ID.make("custom-provider"), ModelV2.ID.make("test-model")),
          api: { id: ModelV2.ID.make("test-model"), type: "aisdk", package: fixtureProvider },
        }),
        package: fixtureProvider,
        options: { name: "custom-provider", marker: "dynamic" },
      })
      expect(result.sdk.options).toEqual({ marker: "dynamic", name: "custom-provider" })
    }),
  )

  it.effect("loads npm packages through their resolved import entrypoint", () =>
    Effect.gen(function* () {
      const aisdk = yield* AISDK.Service
      yield* addPlugin(npmEntrypoint(fixtureProviderPath))
      const result = yield* aisdk.runSDK({
        model: ModelV2.Info.make({
          ...ModelV2.Info.empty(ProviderV2.ID.make("npm-provider"), ModelV2.ID.make("test-model")),
          api: { id: ModelV2.ID.make("test-model"), type: "aisdk", package: "fixture-provider" },
        }),
        package: "fixture-provider",
        options: { name: "npm-provider", marker: "npm" },
      })
      expect(result.sdk.languageModel("x")).toEqual({ modelID: "x", options: { marker: "npm", name: "npm-provider" } })
    }),
  )

  itWithAISDK.effect("wraps missing npm entrypoint failures as AISDK init errors", () =>
    Effect.gen(function* () {
      const aisdk = yield* AISDK.Service
      yield* addPlugin(npmEntrypoint())
      const exit = yield* aisdk
        .language(
          ModelV2.Info.make({
            ...ModelV2.Info.empty(ProviderV2.ID.make("missing-entrypoint"), ModelV2.ID.make("alias")),
            api: { id: ModelV2.ID.make("alias"), type: "aisdk", package: "fixture-provider" },
          }),
        )
        .pipe(Effect.exit)
      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") expect(Cause.prettyErrors(exit.cause).join("\n")).toContain("AISDK.InitError")
    }),
  )

  itWithAISDK.effect("wraps dynamic import failures as AISDK init errors", () =>
    Effect.gen(function* () {
      const aisdk = yield* AISDK.Service
      yield* addPlugin()
      const exit = yield* aisdk
        .language(
          ModelV2.Info.make({
            ...ModelV2.Info.empty(ProviderV2.ID.make("bad-import"), ModelV2.ID.make("alias")),
            api: { id: ModelV2.ID.make("alias"), type: "aisdk", package: "file:///missing/provider-factory.js" },
          }),
        )
        .pipe(Effect.exit)
      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") expect(Cause.prettyErrors(exit.cause).join("\n")).toContain("AISDK.InitError")
    }),
  )

  itWithAISDK.live("wraps missing provider factory exports as AISDK init errors", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const aisdk = yield* AISDK.Service
      const tmp = yield* tempEntrypoint("export const notAProviderFactory = true\n")
      yield* addPlugin(npmEntrypoint(tmp.entrypoint))
      const exit = yield* aisdk
        .language(
          ModelV2.Info.make({
            ...ModelV2.Info.empty(ProviderV2.ID.make("missing-factory"), ModelV2.ID.make("alias")),
            api: { id: ModelV2.ID.make("alias"), type: "aisdk", package: "fixture-provider" },
          }),
        )
        .pipe(Effect.exit)
      expect(exit._tag).toBe("Failure")
      if (exit._tag === "Failure") expect(Cause.prettyErrors(exit.cause).join("\n")).toContain("AISDK.InitError")
    }),
  )

  itWithAISDK.effect("uses the model api.id for the default language model", () =>
    Effect.gen(function* () {
      const plugin = yield* PluginV2.Service
      const aisdk = yield* AISDK.Service
      yield* addPlugin()
      const language = yield* aisdk.language(
        ModelV2.Info.make({
          ...ModelV2.Info.empty(ProviderV2.ID.make("custom"), ModelV2.ID.make("alias")),
          api: { id: ModelV2.ID.make("test-model-api"), type: "aisdk", package: fixtureProvider },
        }),
      )
      expect(language).toMatchObject({ modelID: "test-model-api", options: { name: "custom" } })
    }),
  )
})

describe("E6 literal variant AISDK cache", () => {
  itWithAISDK.effect("CONTROL E6 an ordinary selected variant is constructed by the actual provider factory", () => Effect.gen(function* () {
    const aisdk = yield* AISDK.Service
    yield* addPlugin()
    const base = ModelV2.Info.make({ ...ModelV2.Info.empty(ProviderV2.ID.make("e6-ordinary-cache"), ModelV2.ID.make("alias")),
      api: { id: ModelV2.ID.make("fixture-api"), type: "aisdk", package: fixtureProvider },
      variants: [{ id: ModelV2.VariantID.make("ordinary"), headers: {}, body: { marker: "ordinary" } }],
    })
    const selected = yield* ModelExecutionOptions.selectVariant(base, ModelV2.VariantID.make("ordinary"))
    const language = yield* aisdk.language(selected.model)
    expect(language).toMatchObject({ modelID: "fixture-api", options: { marker: "ordinary", name: "e6-ordinary-cache" } })
  }))

  itWithAISDK.effect("E6: actual language cache distinguishes omitted identity from literal default", () => Effect.gen(function* () {
    const aisdk = yield* AISDK.Service
    yield* addPlugin()
    const base = ModelV2.Info.make({ ...ModelV2.Info.empty(ProviderV2.ID.make("e6-default-cache"), ModelV2.ID.make("alias")),
      api: { id: ModelV2.ID.make("fixture-api"), type: "aisdk", package: fixtureProvider },
      request: { headers: {}, body: { marker: "omitted" } },
    })
    const omitted = yield* aisdk.language(base)
    const named = yield* aisdk.language(ModelV2.Info.make({ ...base,
      request: { variant: "default", headers: {}, body: { marker: "literal-default" } },
    }))
    expect(omitted).toMatchObject({ options: { marker: "omitted" } })
    expect(named).not.toBe(omitted)
    expect(named).toMatchObject({ options: { marker: "literal-default" } })
  }))

  itWithAISDK.effect("E6: cache keys represent actual selected variants while inherited and explicit high can share", () => Effect.gen(function* () {
    const aisdk = yield* AISDK.Service
    yield* addPlugin()
    const base = ModelV2.Info.make({ ...ModelV2.Info.empty(ProviderV2.ID.make("e6-effective-cache"), ModelV2.ID.make("alias")),
      api: { id: ModelV2.ID.make("fixture-api"), type: "aisdk", package: fixtureProvider },
      request: { variant: "high", headers: { "x-base": "untouched" }, body: { marker: "base" } },
      variants: [
        { id: ModelV2.VariantID.make("high"), headers: { "x-variant": "high" }, body: { marker: "high" } },
        { id: ModelV2.VariantID.make("low"), headers: { "x-variant": "low" }, body: { marker: "low" } },
      ],
    })
    const before = JSON.stringify(base)
    const inherited = yield* ModelExecutionOptions.selectVariant(base, undefined)
    const explicit = yield* ModelExecutionOptions.selectVariant(base, ModelV2.VariantID.make("high"))
    const lower = yield* ModelExecutionOptions.selectVariant(base, ModelV2.VariantID.make("low"))
    const high = yield* aisdk.language(inherited.model)
    expect(yield* aisdk.language(explicit.model)).toBe(high)
    const low = yield* aisdk.language(lower.model)
    expect(high).toMatchObject({ options: { marker: "high" } })
    expect(low).not.toBe(high)
    expect(low).toMatchObject({ options: { marker: "low" } })
    expect(inherited.model.request.variant).toBe("high")
    expect(lower.model.request.variant).toBe("low")
    expect(lower.model.request.headers).toMatchObject({ "x-base": "untouched", "x-variant": "low" })
    expect(JSON.stringify(base)).toBe(before)
  }))
})
