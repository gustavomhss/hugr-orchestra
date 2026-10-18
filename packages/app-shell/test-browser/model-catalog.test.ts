import { expect, test } from "bun:test"
import type { Provider } from "@orchestra/sdk/v2/client"
import { createRoot } from "solid-js"
import { createStore } from "solid-js/store"
import { createModelCatalog } from "../src/hooks/provider-catalog"

function provider(id: string, releases: Array<{ id: string; date: string; family?: string }>): Provider {
  return {
    id,
    name: id,
    source: "api",
    env: [],
    options: {},
    models: Object.fromEntries(
      releases.map((release) => [
        release.id,
        {
          id: release.id,
          providerID: id,
          name: release.id,
          family: release.family,
          api: { id: release.id, url: "", npm: "@ai-sdk/openai-compatible" },
          capabilities: {
            temperature: false,
            reasoning: false,
            attachment: false,
            toolcall: true,
            input: { text: true, audio: false, image: false, video: false, pdf: false },
            output: { text: true, audio: false, image: false, video: false, pdf: false },
            interleaved: false,
          },
          cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
          limit: { context: 128_000, output: 8_192 },
          status: "active",
          options: {},
          headers: {},
          release_date: release.date,
        },
      ]),
    ),
  }
}

test("old free Zen and slash-ID OpenRouter models remain selectable without saved preferences", () => {
  createRoot((dispose) => {
    const catalog = createModelCatalog(
      () => [
        provider("opencode", [{ id: "free", date: "2020-01-01" }]),
        provider("openrouter", [{ id: "meta-llama/llama-3.3-70b-instruct:free", date: "2020-01-01" }]),
      ],
      () => [],
    )
    try {
      expect(
        catalog
          .list()
          .filter((model) => catalog.visible({ providerID: model.provider.id, modelID: model.id }))
          .map((model) => `${model.provider.id}/${model.id}`),
      ).toEqual(["opencode/free", "openrouter/meta-llama/llama-3.3-70b-instruct:free"])
    } finally {
      dispose()
    }
  })
})

test("family, missing dates and future dates never hide available models", () => {
  createRoot((dispose) => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const models = [
      { id: "family/new", date: today, family: "same" },
      { id: "family/old", date: yesterday, family: "same" },
      { id: "no-family/new", date: today },
      { id: "no-family/old", date: yesterday },
      { id: "future", date: "2999-01-01" },
      { id: "missing", date: "" },
      { id: "invalid", date: "invalid" },
    ]
    const catalog = createModelCatalog(
      () => [provider("openrouter", models)],
      () => [],
    )
    try {
      expect(catalog.list().map((model) => model.id)).toEqual(models.map((model) => model.id))
      models.forEach((model) => expect(catalog.visible({ providerID: "openrouter", modelID: model.id })).toBe(true))
    } finally {
      dispose()
    }
  })
})

test("explicit hide/show stays reactive and scoped to provider plus full model ID", () => {
  createRoot((dispose) => {
    const [state, setState] = createStore({
      connected: [
        provider("openrouter", [{ id: "org/model", date: "2020-01-01" }]),
        provider("custom", [{ id: "org/model", date: "2020-01-01" }]),
      ],
      preferences: [{ providerID: "openrouter", modelID: "org/model", visibility: "hide" as "hide" | "show" }],
    })
    const catalog = createModelCatalog(
      () => state.connected,
      () => state.preferences,
    )
    try {
      expect(catalog.visible({ providerID: "openrouter", modelID: "org/model" })).toBe(false)
      expect(catalog.visible({ providerID: "custom", modelID: "org/model" })).toBe(true)
      setState("preferences", 0, "visibility", "show")
      expect(catalog.visible({ providerID: "openrouter", modelID: "org/model" })).toBe(true)
      setState("connected", [state.connected[1]])
      expect(catalog.list().map((model) => model.provider.id)).toEqual(["custom"])
      setState("connected", [])
      expect(catalog.list()).toEqual([])
    } finally {
      dispose()
    }
  })
})
