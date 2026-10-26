import { describe, expect, test } from "bun:test"
import type { Provider } from "@/v2-wire"

import { connectedSubagentModels, modelUnavailable, parseModelKey } from "./subagent-model-rules"

describe("subagent model rules", () => {
  test("model identities keep every slash after the provider separator", () => {
    expect(parseModelKey("openrouter/team/model/version")).toEqual({
      providerID: "openrouter",
      modelID: "team/model/version",
    })
    expect(parseModelKey("openrouter/")).toBeUndefined()
    expect(parseModelKey("model")).toBeUndefined()
  })

  test("reports missing, deprecated and non-agent models instead of treating a connected provider as sufficient", () => {
    const model = { capabilities: { toolcall: true, input: { text: true }, output: { text: true } } }
    expect(modelUnavailable(model)).toBeUndefined()
    expect(modelUnavailable()).toBe("unavailable")
    expect(modelUnavailable({ ...model, status: "deprecated" })).toBe("unavailable")
    expect(modelUnavailable({ capabilities: { ...model.capabilities, toolcall: false } })).toBe("incompatible")
    expect(modelUnavailable({ capabilities: { ...model.capabilities, input: { text: false } } })).toBe("incompatible")
    expect(modelUnavailable({ capabilities: { ...model.capabilities, output: { text: false } } })).toBe("incompatible")
  })

  test("connected models stay selectable regardless of age, with incompatible choices available for explanation", () => {
    const model = {
      id: "team/old-model",
      name: "Old model",
      providerID: "router",
      api: { id: "team/old-model", url: "", npm: "" },
      capabilities: {
        temperature: true,
        reasoning: false,
        attachment: false,
        toolcall: true,
        interleaved: false,
        input: { text: true, audio: false, image: false, video: false, pdf: false },
        output: { text: true, audio: false, image: false, video: false, pdf: false },
      },
      cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
      limit: { context: 1000, output: 100 },
      status: "active" as const,
      options: {},
      headers: {},
      release_date: "2020-01-01",
    }
    const provider: Provider = {
      id: "router",
      name: "Router",
      source: "custom",
      env: [],
      options: {},
      models: {
        [model.id]: model,
        image: { ...model, id: "image", capabilities: { ...model.capabilities, toolcall: false } },
      },
    }
    const choices = connectedSubagentModels([provider])
    expect(choices.map((item) => item.id)).toEqual(["team/old-model", "image"])
    expect(choices[0].provider.id).toBe("router")
    expect(modelUnavailable(choices[0])).toBeUndefined()
    expect(modelUnavailable(choices[1])).toBe("incompatible")
  })
})
