import { describe, expect, test } from "bun:test"
import { Catalog } from "@orchestra/core/catalog"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { Location } from "@orchestra/core/location"
import { ModelV2 } from "@orchestra/core/model"
import { VariantPlugin } from "@orchestra/core/plugin/variant"
import { ProviderV2 } from "@orchestra/core/provider"
import { AbsolutePath } from "@orchestra/core/schema"
import { Effect, Layer } from "effect"
import { location } from "../fixture/location"
import { testEffect } from "../lib/effect"
import { catalogHost, host } from "./host"

const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(location({ directory: AbsolutePath.make(import.meta.dir) })),
)
const it = testEffect(AppNodeBuilder.build(Catalog.node, [[Location.node, locationLayer]]))

describe("VariantPlugin", () => {
  it.effect("adds GLM 5.2 variants after catalog sources", () =>
    Effect.gen(function* () {
      const service = yield* Catalog.Service
      yield* service.transform((catalog) => {
        catalog.provider.update(ProviderV2.ID.opencode, (provider) => {
          provider.api = { type: "aisdk", package: "@ai-sdk/openai-compatible" }
        })
        catalog.model.update(ProviderV2.ID.opencode, ModelV2.ID.make("glm-5.2"), (model) => {
          model.api = {
            id: ModelV2.ID.make("glm-5.2"),
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
          }
        })
      })
      yield* VariantPlugin.Plugin.effect(host({ catalog: catalogHost(service) }))

      expect((yield* service.model.get(ProviderV2.ID.opencode, ModelV2.ID.make("glm-5.2")))?.variants).toEqual([
        expect.objectContaining({ id: "high", body: { reasoning_effort: "high" } }),
        expect.objectContaining({ id: "max", body: { reasoning_effort: "max" } }),
      ])
    }),
  )

  it.effect("keeps explicit variants over generated defaults", () =>
    Effect.gen(function* () {
      const service = yield* Catalog.Service
      yield* service.transform((catalog) => {
        catalog.model.update(ProviderV2.ID.opencode, ModelV2.ID.make("glm-5.2"), (model) => {
          model.api = {
            id: ModelV2.ID.make("glm-5.2"),
            type: "aisdk",
            package: "@ai-sdk/openai-compatible",
          }
          model.variants = [{ id: ModelV2.VariantID.make("high"), headers: { custom: "true" }, body: {} }]
        })
      })
      yield* VariantPlugin.Plugin.effect(host({ catalog: catalogHost(service) }))

      expect((yield* service.model.get(ProviderV2.ID.opencode, ModelV2.ID.make("glm-5.2")))?.variants).toEqual([
        expect.objectContaining({ id: "high", headers: { custom: "true" } }),
        expect.objectContaining({ id: "max", body: { reasoning_effort: "max" } }),
      ])
    }),
  )

  describe("generate", () => {
    const levels = (pkg: string, id: string) =>
      VariantPlugin.generate({ id, api: { id, type: "aisdk", package: pkg } }).map((variant) => variant.id)

    test("names every Claude effort level on current models through output_config", () => {
      expect(VariantPlugin.generate({ id: "claude-opus-5-5", api: { id: "claude-opus-5-5", type: "aisdk", package: "@ai-sdk/anthropic" } })).toEqual(
        ["low", "medium", "high", "xhigh", "max"].map((id) => ({ id, headers: {}, body: { output_config: { effort: id } } })),
      )
      expect(levels("@ai-sdk/anthropic", "claude-sonnet-4-6")).toEqual(["low", "medium", "high", "max"])
      expect(levels("@ai-sdk/anthropic", "claude-opus-4-5-20251101")).toEqual(["low", "medium", "high"])
    })

    test("offers no level a model would refuse", () => {
      expect(levels("@ai-sdk/anthropic", "claude-sonnet-4-5")).toEqual([])
      expect(levels("@ai-sdk/anthropic", "claude-3-5-haiku-20241022")).toEqual([])
      expect(levels("@ai-sdk/openai", "gpt-4.1")).toEqual([])
      expect(levels("@ai-sdk/openai-compatible", "claude-opus-5-5")).toEqual([])
    })

    test("names OpenAI reasoning efforts through the Responses reasoning field", () => {
      expect(VariantPlugin.generate({ id: "gpt-5.2", api: { id: "gpt-5.2", type: "aisdk", package: "@ai-sdk/openai" } })).toEqual(
        ["none", "low", "medium", "high", "xhigh"].map((id) => ({ id, headers: {}, body: { reasoning: { effort: id } } })),
      )
      expect(levels("@ai-sdk/openai", "gpt-5")).toEqual(["minimal", "low", "medium", "high"])
      expect(levels("@ai-sdk/openai", "gpt-5.1")).toEqual(["none", "low", "medium", "high"])
      expect(levels("@ai-sdk/openai", "gpt-5.1-codex")).toEqual(["low", "medium", "high"])
      expect(levels("@ai-sdk/openai", "gpt-5-pro")).toEqual(["high"])
      expect(levels("@ai-sdk/openai", "o3")).toEqual(["low", "medium", "high"])
    })
  })
})
