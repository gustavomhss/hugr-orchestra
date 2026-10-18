import { expect, test } from "bun:test"
import { createMemo, createRoot } from "solid-js"
import { createPromptModelContext, selectPromptModel } from "../../src/pages/session/composer/prompt-model-selection"

const agent = { providerID: "openai", modelID: "gpt-5-codex" }
const configured = { providerID: "openai", modelID: "gpt-5" }
const recent = { providerID: "openrouter", modelID: "qwen3-coder" }
const fallback = { providerID: "google", modelID: "gemini-2.5-pro" }
const catalog = {
  connected: ["openai", "openrouter", "google"],
  all: new Map([
    ["openai", { models: { "gpt-5-codex": {}, "gpt-5": {} } }],
    ["openrouter", { models: { "qwen3-coder": {} } }],
    ["google", { models: { "gemini-2.5-pro": {} } }],
  ]),
}

test("active prompt agent, including one without a model, stays independent of the chosen model", () => {
  createRoot((dispose) => {
    const [context, setContext] = createPromptModelContext()
    const current = createMemo(() =>
      selectPromptModel({ agent: context.agent, recent: context.recent, fallback }, catalog),
    )
    try {
      expect(current()).toBe(fallback)
      setContext({ agent, recent: [recent] })
      expect(current()).toEqual(agent)
      setContext("agent", undefined)
      expect(current()).toEqual(recent)
      expect(selectPromptModel({ chosen: configured, agent: context.agent, recent: [recent], fallback }, catalog)).toBe(
        configured,
      )
      expect(context.agent).toBeUndefined()
    } finally {
      dispose()
    }
  })
})
