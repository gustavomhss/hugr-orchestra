import { expect, test } from "bun:test"
import { selectPromptModel } from "./prompt-model-selection"

const chosen = { providerID: "anthropic", modelID: "claude-sonnet-4" }
const agent = { providerID: "openai", modelID: "gpt-5-codex" }
const configured = { providerID: "openai", modelID: "gpt-5" }
const recent = { providerID: "openrouter", modelID: "qwen3-coder" }
const fallback = { providerID: "google", modelID: "gemini-2.5-pro" }
const catalog = {
  connected: ["openai", "openrouter", "google"],
  all: new Map([
    ["anthropic", { models: { "claude-sonnet-4": {} } }],
    ["openai", { models: { "gpt-5-codex": {}, "gpt-5": {} } }],
    ["openrouter", { models: { "qwen3-coder": {} } }],
    ["google", { models: { "gemini-2.5-pro": {} } }],
  ]),
}

test("disconnected or missing chosen models cannot override the actual composer candidates", () => {
  expect(selectPromptModel({ chosen, agent, configured, recent: [recent], fallback }, catalog)).toBe(agent)
  expect(
    selectPromptModel({ chosen: { ...agent, modelID: "removed" }, configured, recent: [recent], fallback }, catalog),
  ).toBe(configured)
  expect(selectPromptModel({ chosen: agent, configured, recent: [recent], fallback }, catalog)).toBe(agent)
  expect(selectPromptModel({ chosen: configured, agent, recent: [recent], fallback }, catalog)).toBe(configured)
})

test("valid recents precede provider default; unavailable recents fall through", () => {
  expect(selectPromptModel({ chosen, recent: [recent], fallback }, catalog)).toBe(recent)
  expect(selectPromptModel({ chosen, recent: [chosen, recent], fallback }, catalog)).toBe(recent)
  expect(selectPromptModel({ chosen, recent: [chosen], fallback }, catalog)).toBe(fallback)
  expect(selectPromptModel({ chosen, recent: [chosen] }, catalog)).toBeUndefined()
})
