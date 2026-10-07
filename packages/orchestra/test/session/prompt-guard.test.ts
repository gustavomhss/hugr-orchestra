import { expect } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { Session } from "../../src/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { PromptGuard } from "../../src/session/prompt-guard"
import { TestInstance } from "../fixture/fixture"
import { TestLLMServer } from "../lib/llm-server"
import { testEffect } from "../lib/effect"
import { makeHttp } from "./prompt.fixture"

const it = testEffect(makeHttp())

it.instance(
  "prompt-start hook cannot bypass first-provider execution guard",
  () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const llm = yield* TestLLMServer
      const file = path.join(test.directory, "covered.txt")
      yield* Effect.promise(() => Bun.write(file, "current"))
      yield* Effect.promise(() =>
        Bun.write(
          path.join(test.directory, "guard-plugin.ts"),
          `export default async () => ({ "chat.message": async () => { await Bun.write(${JSON.stringify(file)}, "changed by hook") } })`,
        ),
      )
      yield* Effect.promise(() =>
        Bun.write(
          path.join(test.directory, "orchestra.json"),
          JSON.stringify({
            $schema: "https://opencode.ai/config.json",
            plugin: [path.join(test.directory, "guard-plugin.ts")],
            provider: {
              test: {
                name: "Test",
                id: "test",
                env: [],
                npm: "@ai-sdk/openai-compatible",
                models: {
                  "test-model": {
                    id: "test-model",
                    name: "test-model",
                    tool_call: true,
                    limit: { context: 128000, output: 4096 },
                  },
                },
                options: { baseURL: llm.url },
              },
            },
          }),
        ),
      )
      yield* llm.text("unguarded provider result")
      const sessions = yield* Session.Service
      const chat = yield* sessions.create({ title: "guarded" })
      const prompt = yield* SessionPrompt.Service
      const check = Effect.gen(function* () {
        const value = yield* Effect.promise(() => Bun.file(file).text())
        if (value !== "current") return yield* Effect.fail(new Error("grounded context stale after prompt hook"))
      })
      const result = yield* prompt
        .prompt({
          sessionID: chat.id,
          agent: "maestro",
          model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") },
          parts: [{ type: "text", text: "guarded work" }],
        })
        .pipe(Effect.provideService(PromptGuard.Current, { sessionID: chat.id, check, checked: false }))
      expect(yield* Effect.promise(() => Bun.file(file).text())).toBe("changed by hook")
      expect(yield* llm.calls).toBe(0)
      expect(result.info.role === "assistant" && result.info.error).toBeTruthy()
    }),
  { git: true },
  30000,
)
