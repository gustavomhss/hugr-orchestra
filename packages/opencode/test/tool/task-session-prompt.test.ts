import { expect } from "bun:test"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { Effect, Layer } from "effect"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import path from "node:path"
import { Session } from "../../src/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { MessageID, PartID } from "../../src/session/schema"
import { TaskTool } from "../../src/tool/task"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"
import { makeHttp } from "../session/prompt.fixture"

const it = testEffect(Layer.merge(makeHttp(), LayerNode.compile(filesystem)))

const model = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

it.instance(
  "TaskTool resumes native child history through SessionPrompt",
  () =>
    Effect.gen(function* () {
      const instance = yield* TestInstance
      const llm = yield* TestLLMServer
      yield* Effect.promise(() =>
        Bun.write(
          path.join(instance.directory, "opencode.json"),
          JSON.stringify({
            provider: {
              test: {
                name: "Test",
                id: "test",
                env: [],
                npm: "@ai-sdk/openai-compatible",
                models: {
                  "test-model": {
                    id: "test-model",
                    name: "Test Model",
                    attachment: false,
                    reasoning: false,
                    temperature: false,
                    tool_call: true,
                    release_date: "2025-01-01",
                    limit: { context: 100000, output: 10000 },
                    cost: { input: 0, output: 0 },
                    options: {},
                  },
                },
                options: { apiKey: "test-key", baseURL: llm.url },
              },
            },
          }),
        ),
      )
      const prompt = yield* SessionPrompt.Service
      const sessions = yield* Session.Service
      const chat = yield* sessions.create({
        title: "Pinned",
        permission: [{ permission: "*", pattern: "*", action: "allow" }],
      })
      const user = yield* sessions.updateMessage({
        id: MessageID.ascending(),
        role: "user",
        sessionID: chat.id,
        agent: "build",
        model,
        time: { created: Date.now() },
      })
      const assistant: SessionV1.Assistant = {
        id: MessageID.ascending(),
        role: "assistant",
        parentID: user.id,
        sessionID: chat.id,
        mode: "build",
        agent: "build",
        cost: 0,
        path: { cwd: "/tmp", root: "/tmp" },
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        modelID: model.modelID,
        providerID: model.providerID,
        time: { created: Date.now() },
      }
      yield* sessions.updateMessage(assistant)
      yield* sessions.updatePart({
        id: PartID.ascending(),
        messageID: assistant.id,
        sessionID: chat.id,
        type: "text",
        text: "hi there",
      })
      const tool = yield* TaskTool
      const def = yield* tool.init()
      const context = {
        sessionID: chat.id,
        messageID: assistant.id,
        agent: "build",
        abort: new AbortController().signal,
        extra: {
          bypassAgentCheck: true,
          promptOps: {
            cancel: prompt.cancel,
            resolvePromptParts: prompt.resolvePromptParts,
            prompt: prompt.prompt,
          },
        },
        messages: [],
        metadata: () => Effect.void,
        ask: () => Effect.void,
      }

      yield* llm.text("initial child reply")
      const initial = yield* def.execute(
        { description: "inspect bug", prompt: "initial child prompt", subagent_type: "general" },
        context,
      )
      const child = yield* sessions.get(initial.metadata.sessionId)

      yield* llm.text("resumed child reply")
      const resumed = yield* def.execute(
        {
          description: "resume inspect",
          prompt: "resumed child prompt",
          subagent_type: "general",
          task_id: child.id,
        },
        context,
      )
      const hits = yield* llm.hits
      const request = JSON.stringify(hits.at(-1)?.body)

      expect(request).toContain("initial child prompt")
      expect(request).toContain("initial child reply")
      expect(request).toContain("resumed child prompt")
      expect(yield* sessions.children(chat.id)).toHaveLength(1)
      expect(resumed.metadata.sessionId).toBe(child.id)
    }),
  15_000,
)
