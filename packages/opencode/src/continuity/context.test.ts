import { expect, test } from "bun:test"
import { create } from "./context"
import { MessageID, SessionID } from "@/session/schema"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import type { SessionV1 } from "@opencode-ai/core/v1/session"

const sessionID = SessionID.make("ses_context")
function history(): SessionV1.WithParts[] {
  return ["head", "tail", "new"].map((name) => ({
    info: {
      id: MessageID.make(`msg_${name}`), sessionID, role: "user", agent: "build",
      model: { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") },
      time: { created: 0 },
    },
    parts: [],
  }))
}
test("prepare without context preserves complete history", () => {
  const messages = history()
  expect(create().prepare(sessionID, messages)).toEqual({ messages, system: [] })
})
test("prepare captures matching context and tail without rewriting history", () => {
  const store = create()
  const messages = history()
  store.set({ sessionID, boundary: messages[1].info.id, tailStart: messages[1].info.id, text: "summary A" })
  const prepared = store.prepare(sessionID, messages)
  expect(prepared.messages).toEqual(messages.slice(1))
  expect(prepared.system).toHaveLength(1)
  expect(prepared.system[0]).toStartWith("Continuity context:\nsummary A\n\n")
  expect(prepared.system[0]).toContain("preserved tail supersede older decisions")
  store.set({ sessionID, boundary: messages[2].info.id, tailStart: messages[2].info.id, text: "summary B" })
  const next = store.prepare(sessionID, messages)
  expect(next.messages).toEqual(messages.slice(2))
  expect(next.system[0]).toStartWith("Continuity context:\nsummary B\n\n")
  expect(prepared.system[0]).toStartWith("Continuity context:\nsummary A\n\n")
  expect(messages.map((message) => message.info.id)).toEqual(["head", "tail", "new"].map((name) => MessageID.make(`msg_${name}`)))
})
test("missing anchor suppresses both summary and pruning; stored context retained", () => {
  const store = create()
  const messages = history()
  const context = { sessionID, boundary: messages[2].info.id, tailStart: messages[1].info.id, text: "keep me" }
  store.set(context)
  expect(store.prepare(sessionID, messages).system[0]).toStartWith("Continuity context:\nkeep me\n\n")
  const missing = [messages[0], messages[2]]
  expect(store.prepare(sessionID, missing)).toEqual({ messages: missing, system: [] })
  expect(store.get(sessionID)).toBe(context)
  expect(store.prepare(sessionID, []).system).toEqual([])
})
test("anchor at zero is valid and context is session-local", () => {
  const store = create()
  const messages = history()
  store.set({ sessionID, boundary: messages[2].info.id, tailStart: messages[0].info.id, text: "all tail" })
  const prepared = store.prepare(sessionID, messages)
  expect(prepared.messages).toEqual(messages)
  expect(prepared.system[0]).toStartWith("Continuity context:\nall tail\n\n")
  expect(store.prepare(SessionID.make("ses_other"), messages)).toEqual({ messages, system: [] })
  store.discard(sessionID)
  expect(store.prepare(sessionID, messages)).toEqual({ messages, system: [] })
})
