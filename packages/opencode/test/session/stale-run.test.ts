import { expect } from "bun:test"
import path from "path"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { FSUtil } from "@opencode-ai/core/fs-util"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Effect } from "effect"
import { Session } from "@/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import { TestLLMServer } from "../lib/llm-server"
import { makeHttp } from "./prompt.fixture"

const it = testEffect(makeHttp())

const ref = {
  providerID: ProviderV2.ID.make("test"),
  modelID: ModelV2.ID.make("test-model"),
}

const useProvider = Effect.fn("test.useProvider")(function* () {
  const { directory } = yield* TestInstance
  const llm = yield* TestLLMServer
  const fs = yield* FSUtil.Service
  yield* fs.writeWithDirs(
    path.join(directory, "opencode.json"),
    JSON.stringify({
      $schema: "https://opencode.ai/config.json",
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
  )
  return llm
})

const user = Effect.fn("test.user")(function* (sessionID: SessionID, text: string) {
  const sessions = yield* Session.Service
  const msg = yield* sessions.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID,
    agent: "build",
    model: ref,
    time: { created: Date.now() },
  })
  yield* sessions.updatePart({ id: PartID.ascending(), messageID: msg.id, sessionID, type: "text", text })
  return msg
})

// Leaves the Session the way a killed process does: an open assistant message with a tool call still running.
const killedRun = Effect.fn("test.killedRun")(function* (sessionID: SessionID) {
  const sessions = yield* Session.Service
  const parent = yield* user(sessionID, "hello")
  const assistant: SessionV1.Assistant = {
    id: MessageID.ascending(),
    role: "assistant",
    parentID: parent.id,
    sessionID,
    mode: "build",
    agent: "build",
    cost: 0,
    path: { cwd: "/tmp", root: "/tmp" },
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
    modelID: ref.modelID,
    providerID: ref.providerID,
    time: { created: Date.now() },
  }
  yield* sessions.updateMessage(assistant)
  yield* sessions.updatePart({
    id: PartID.ascending(),
    messageID: assistant.id,
    sessionID,
    type: "tool",
    callID: "stale-call",
    tool: "edit",
    state: { status: "running", input: {}, metadata: { step: 1 }, time: { start: 1 } },
  })
  return assistant
})

it.instance("first run in a process closes tool calls a terminated process left running, without retrying them", () =>
  Effect.gen(function* () {
    const llm = yield* useProvider()
    const prompt = yield* SessionPrompt.Service
    const sessions = yield* Session.Service
    const chat = yield* sessions.create({
      title: "Stale run",
      permission: [{ permission: "*", pattern: "*", action: "allow" }],
    })
    const stale = yield* killedRun(chat.id)
    yield* user(chat.id, "continue")
    yield* llm.text("done")

    yield* prompt.loop({ sessionID: chat.id })

    const closed = (yield* sessions.messages({ sessionID: chat.id })).find((msg) => msg.info.id === stale.id)
    const part = closed?.parts.find((item) => item.type === "tool")
    expect(part?.type === "tool" && part.state).toMatchObject({
      status: "error",
      error: "Tool execution aborted",
      metadata: { step: 1, interrupted: true },
      time: { start: 1 },
    })
    expect(closed?.info.role === "assistant" && closed.info.time.completed).toBeNumber()
    expect(closed?.info.role === "assistant" && closed.info.error?.name).toBe("MessageAbortedError")
    // Only the new user turn reaches the provider; the interrupted call is not replayed.
    expect(yield* llm.hits).toHaveLength(1)
  }),
)
