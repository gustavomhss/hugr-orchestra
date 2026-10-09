import { expect } from "bun:test"
import path from "node:path"
import { Effect, Schema } from "effect"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import { Session } from "@/session/session"
import { SessionCompaction } from "@/session/compaction"
import { MessageV2 } from "@/session/message-v2"
import { MessageID, PartID, type SessionID } from "@/session/schema"
import { Provider } from "@/provider/provider"
import { TestInstance } from "../fixture/fixture"
import { TestLLMServer } from "../lib/llm-server"
import { testEffect } from "../lib/effect"
import { makeHttp } from "./prompt.fixture"

const it = testEffect(makeHttp())
const ref = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }

function start() {
  return Effect.gen(function* () {
    const test = yield* TestInstance
    const llm = yield* TestLLMServer
    yield* Effect.promise(() => Bun.write(path.join(test.directory, "orchestra.json"), JSON.stringify({
      enabled_providers: ["test"],
      compaction: { tail_turns: 2, preserve_recent_tokens: 10_000 },
      provider: { test: { name: "Test", id: "test", env: [], npm: "@ai-sdk/openai-compatible",
        models: { "test-model": { id: "test-model", name: "test-model", tool_call: true,
          limit: { context: 100_000, output: 32_000 } } },
        options: { apiKey: "test-key", baseURL: llm.url } } },
    })))
    const sessions = yield* Session.Service
    const provider = yield* Provider.Service
    const model = yield* provider.getModel(ref.providerID, ref.modelID)
    const chat = yield* sessions.create({ title: "reminder history" })
    yield* llm.text("summary")
    return { sessions, model, chat, llm }
  })
}

function user(sessionID: SessionID, text: string, reminders: string[] = []) {
  return Effect.gen(function* () {
    const sessions = yield* Session.Service
    const info = yield* sessions.updateMessage({ id: MessageID.ascending(), sessionID, role: "user",
      agent: "maestro", model: ref, time: { created: Date.now() }, promptContext: { reminders } })
    yield* sessions.updatePart({ id: PartID.ascending(), sessionID, messageID: info.id, type: "text", text })
    return info
  })
}

function compact(sessionID: SessionID, auto = false, overflow = false) {
  return Effect.gen(function* () {
    const compaction = yield* SessionCompaction.Service
    const sessions = yield* Session.Service
    yield* compaction.create({ sessionID, agent: "maestro", model: ref, auto, overflow })
    const messages = yield* sessions.messages({ sessionID })
    const parent = messages.at(-1)
    if (!parent) throw new Error("expected compaction marker")
    expect(yield* compaction.process({ sessionID, parentID: parent.info.id, messages, auto, overflow })).toBe("continue")
  })
}

it.instance("hook reminders enter head summary as history while retained tail stays on its user", () => Effect.gen(function* () {
  const state = yield* start()
  const head = yield* user(state.chat.id, "older context", ["head first note", "head second note"])
  yield* user(state.chat.id, "keep this turn", ["tail note"])
  yield* user(state.chat.id, "and this one too")
  yield* compact(state.chat.id)
  const inputs = yield* state.llm.inputs
  expect(inputs).toHaveLength(1)
  const messages = Schema.decodeUnknownSync(Schema.Array(Schema.Struct({ role: Schema.String, content: Schema.String })))(inputs[0].messages)
  const users = messages.filter((message) => message.role === "user")
  expect(users).toHaveLength(1)
  expect(JSON.stringify(messages.filter((message) => message.role === "system"))).not.toContain("note")
  const captured = users[0].content
  expect(captured).toContain("[User]: older context")
  expect(captured).toContain("[Hook reminder]: head first note")
  expect(captured).toContain("[Hook reminder]: head second note")
  expect(captured.indexOf("<conversation>")).toBeLessThan(captured.indexOf("[User]: older context"))
  expect(captured.indexOf("[User]: older context")).toBeLessThan(captured.indexOf("head first note"))
  expect(captured.indexOf("head first note")).toBeLessThan(captured.indexOf("head second note"))
  expect(captured.indexOf("head second note")).toBeLessThan(captured.indexOf("</conversation>"))
  for (const text of ["keep this turn", "and this one too", "tail note", "What did we do so far?"])
    expect(captured).not.toContain(text)
  const rendered = yield* MessageV2.toModelMessagesEffect(MessageV2.filterCompacted(yield* MessageV2.stream(state.chat.id)), state.model)
  expect(JSON.stringify(rendered)).toContain("Hook reminder:\\ntail note")
  expect(JSON.stringify(rendered)).not.toContain("head first note")
  expect((yield* MessageV2.get({ sessionID: state.chat.id, messageID: head.id })).info).toMatchObject({
    promptContext: { reminders: ["head first note", "head second note"] },
  })
}), { git: true })

it.instance("hook reminders survive overflow replay with original stored parts intact", () => Effect.gen(function* () {
  const state = yield* start()
  yield* user(state.chat.id, "root")
  const original = yield* user(state.chat.id, "image", ["replay first note", "replay second note"])
  yield* state.sessions.updatePart({ id: PartID.ascending(), sessionID: state.chat.id, messageID: original.id,
    type: "file", mime: "image/png", filename: "cat.png", url: "https://example.com/cat.png" })
  const before = yield* MessageV2.get({ sessionID: state.chat.id, messageID: original.id })
  yield* compact(state.chat.id, true, true)
  const last = (yield* state.sessions.messages({ sessionID: state.chat.id })).at(-1)
  if (!last) throw new Error("expected replay")
  expect(last.info).toMatchObject({ role: "user", promptContext: { reminders: ["replay first note", "replay second note"] } })
  expect(last.info.id).not.toBe(original.id)
  expect(yield* MessageV2.toModelMessagesEffect([last], state.model)).toEqual([{ role: "user", content: [
    { type: "text", text: "image" },
    { type: "text", text: "[Attached image/png: cat.png]" },
    { type: "text", text: "Hook reminder:\nreplay first note" },
    { type: "text", text: "Hook reminder:\nreplay second note" },
  ] }])
  expect(yield* MessageV2.get({ sessionID: state.chat.id, messageID: original.id })).toEqual(before)
  const inputs = yield* state.llm.inputs
  expect(inputs).toHaveLength(1)
  expect(JSON.stringify(inputs[0])).not.toContain("replay first note")
}), { git: true })

it.instance("hook reminders never copy into fresh overflow guidance when replay has no earlier context", () => Effect.gen(function* () {
  const state = yield* start()
  yield* user(state.chat.id, "only request", ["not a fresh reminder"])
  yield* compact(state.chat.id, true, true)
  const last = (yield* state.sessions.messages({ sessionID: state.chat.id })).at(-1)
  if (!last || last.info.role !== "user") throw new Error("expected continuation user")
  expect(last.info.promptContext).toBeUndefined()
  expect(last.parts).toEqual(expect.arrayContaining([expect.objectContaining({ type: "text",
    text: expect.stringContaining("previous request exceeded the provider's size limit") })]))
}), { git: true })
