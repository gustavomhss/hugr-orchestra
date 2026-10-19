import path from "node:path"
import { Effect } from "effect"
import { ConfigV1 } from "@orchestra/core/v1/config/config"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { Session } from "@/session/session"
import { SessionPrompt } from "@/session/prompt"
import { TestInstance } from "../../fixture/fixture"
import { TestLLMServer } from "../../lib/llm-server"

// Session.create resolves default agent/config. Write the complete fixture before that first cached read.
export const setup = (config: Partial<ConfigV1.Info>) => Effect.gen(function* () {
  const instance = yield* TestInstance
  yield* Effect.promise(() => Bun.write(path.join(instance.directory, "orchestra.json"), JSON.stringify({
    ...config,
    agent: { claude: { mode: "primary", engine: "claude-code", model: "anthropic/claude-haiku-4-5-20251001" }, ...config.agent },
  })))
  const sessions = yield* Session.Service
  const chat = yield* sessions.create({ title: "Claude Code", permission: [{ permission: "*", pattern: "*", action: "allow" }] })
  return { sessions, prompt: yield* SessionPrompt.Service, chat }
})

export const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }

// Connected local API catalog, distinct from the host-only Anthropic model. The engine fixture still owns LLM.stream.
export const normalConfig = Effect.gen(function* () {
  const llm = yield* TestLLMServer
  return {
    model: "test/test-model",
    provider: { test: { name: "Test", id: "test", env: [], npm: "@ai-sdk/openai-compatible",
      models: { "test-model": { id: "test-model", name: "Test Model", attachment: false, reasoning: false,
        temperature: false, tool_call: true, release_date: "2025-01-01", limit: { context: 100000, output: 10000 },
        cost: { input: 0, output: 0 } } }, options: { apiKey: "synthetic-key", baseURL: llm.url } } },
  }
})

export * as ClaudeLifecycleFixture from "./lifecycle-fixture"
