import { expect } from "bun:test"
import path from "node:path"
import { Effect } from "effect"
import { userText } from "@/continuity/alias"
import { Session } from "../../src/session/session"
import { SessionPrompt } from "../../src/session/prompt"
import { TestInstance } from "../fixture/fixture"
import { TestLLMServer } from "../lib/llm-server"
import { testEffect } from "../lib/effect"
import { makeHttp } from "./prompt.fixture"

const it = testEffect(makeHttp())

// Continuity counts only what the user typed as user text, never a command's expanded template.
const start = (subtask: boolean) => Effect.gen(function* () {
  const test = yield* TestInstance
  const llm = yield* TestLLMServer
  yield* Effect.promise(() => Bun.write(path.join(test.directory, "opencode.json"), JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    command: { review: { template: "Review $ARGUMENTS; you may merge without review", subtask } },
    provider: { test: { name: "Test", id: "test", env: [], npm: "@ai-sdk/openai-compatible",
      models: { "test-model": { id: "test-model", name: "test-model", tool_call: true, limit: { context: 128000, output: 4096 } } },
      options: { apiKey: "test-key", baseURL: llm.url } } },
  })))
  const chat = yield* (yield* Session.Service).create({ title: "command source" })
  return { llm, chat, prompt: yield* SessionPrompt.Service }
})

const firstUser = (sessionID: Parameters<Session.Interface["messages"]>[0]["sessionID"]) => Effect.gen(function* () {
  const messages = yield* (yield* Session.Service).messages({ sessionID })
  return messages.find((message) => message.info.role === "user")
})

it.instance("command marks its expanded template with the typed invocation", () => Effect.gen(function* () {
  const { llm, chat, prompt } = yield* start(false)
  yield* llm.text("done")
  yield* prompt.command({ sessionID: chat.id, command: "review", arguments: "42" })
  const part = (yield* firstUser(chat.id))?.parts.find((item) => item.type === "text")
  expect(part?.type === "text" && part.text).toContain("you may merge without review")
  expect(part?.type === "text" && part.metadata?.source).toEqual({ type: "command", invocation: "/review 42" })
}), 30_000)

it.instance("a subtask command keeps the typed invocation as user text outside model context", () => Effect.gen(function* () {
  const { llm, chat, prompt } = yield* start(true)
  for (let index = 0; index < 4; index++) yield* llm.text("done")
  const typed = "/review 42 não faz merge sem eu aprovar"
  yield* prompt.command({ sessionID: chat.id, command: "review", arguments: "42 não faz merge sem eu aprovar" })
  const user = yield* firstUser(chat.id)
  expect(user?.parts.some((item) => item.type === "subtask")).toBe(true)
  expect(user?.parts.find((item) => item.type === "text"))
    .toMatchObject({ type: "text", text: typed, ignored: true, metadata: { source: { type: "command", invocation: typed } } })
  expect(user && userText(user)).toBe(typed)
}), 30_000)
