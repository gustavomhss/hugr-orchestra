import type { Model, Provider } from "@orchestra/sdk/v2/client"

function model(id: string, name: string): Model {
  return {
    id,
    name,
    providerID: "example",
    api: { id, url: "https://example.invalid", npm: "@ai-sdk/openai-compatible" },
    capabilities: {
      temperature: true,
      reasoning: false,
      attachment: false,
      toolcall: true,
      input: { text: true, audio: false, image: false, video: false, pdf: false },
      output: { text: true, audio: false, image: false, video: false, pdf: false },
      interleaved: false,
    },
    cost: { input: 0, output: 0, cache: { read: 0, write: 0 } },
    limit: { context: 200_000, output: 16_000 },
    status: "active",
    options: {},
    headers: {},
    release_date: "2026-10-01",
  }
}

export const agentProvider: Provider = {
  id: "example",
  name: "Example",
  source: "custom",
  env: [],
  options: {},
  models: { builder: model("builder", "Builder"), reasoner: model("reasoner", "Reasoner") },
}
