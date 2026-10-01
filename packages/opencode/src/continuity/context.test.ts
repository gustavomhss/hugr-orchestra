import { expect, test } from "bun:test"
import { create } from "./context"
import { MessageID, SessionID } from "@/session/schema"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { ownedArtifact } from "../../test/continuity/fixtures"
import { render } from "./artifact"

const sessionID = SessionID.make("ses_context")
function artifact(boundary: MessageID, tailStart: MessageID, text: string) {
  const artifact = ownedArtifact({
    version: 1, kind: "continuity_handoff", parentID: sessionID, producerID: SessionID.make("ses_fork"),
    boundary, coveredThrough: MessageID.make(tailStart === "msg_head" ? "msg_prior" : tailStart === "msg_new" ? "msg_tail" : "msg_head"), tailStart,
  }, text, render)
  return { sessionID, boundary, tailStart, text: artifact.text, artifact }
}
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
  const first = artifact(messages[2].info.id, messages[1].info.id, "summary A")
  store.set(first)
  const prepared = store.prepare(sessionID, messages)
  expect(prepared.messages).toEqual(messages.slice(1))
  expect(prepared.system).toHaveLength(1)
  expect(prepared.system[0]).toContain(first.text)
  const second = artifact(messages[2].info.id, messages[2].info.id, "summary B")
  store.set(second)
  expect(store.prepare(sessionID, messages).messages).toEqual(messages.slice(2))
  expect(store.prepare(sessionID, messages).system[0]).toContain(second.text)
  expect(prepared.system[0]).toContain(first.text)
  expect(prepared.system[0]).not.toContain("summary B")
  expect(messages.map((message) => message.info.id)).toEqual(["head", "tail", "new"].map((name) => MessageID.make(`msg_${name}`)))
})
test("missing anchor suppresses both summary and pruning; stored context retained", () => {
  const store = create()
  const messages = history()
  const context = artifact(messages[2].info.id, messages[1].info.id, "keep me")
  store.set(context)
  expect(store.prepare(sessionID, messages).system[0]).toContain(context.text)
  const missing = [messages[0], messages[2]]
  expect(store.prepare(sessionID, missing)).toEqual({ messages: missing, system: [] })
  expect(store.get(sessionID)).toEqual(context)
  expect(store.prepare(sessionID, []).system).toEqual([])
})
test("anchor at zero is valid and context is session-local", () => {
  const store = create()
  const messages = history()
  const context = artifact(messages[2].info.id, messages[0].info.id, "all tail")
  store.set(context)
  expect(store.prepare(sessionID, messages).messages).toEqual(messages)
  expect(store.prepare(sessionID, messages).system[0]).toContain(context.text)
  expect(store.prepare(SessionID.make("ses_other"), messages)).toEqual({ messages, system: [] })
  store.discard(sessionID)
  expect(store.prepare(sessionID, messages)).toEqual({ messages, system: [] })
})
test("unknown tail anchor disables summary and pruning", () => {
  const store = create()
  const messages = history()
  const context = artifact(messages[2].info.id, MessageID.make("msg_unknown"), "not applied")
  store.set(context)
  expect(store.prepare(sessionID, messages)).toEqual({ messages, system: [] })
  expect(store.get(sessionID)).toEqual(context)
})
test("unvalidated plaintext cannot apply or prune production history", () => {
  const store = create()
  const messages = history()
  store.set({ sessionID, boundary: messages[2].info.id, tailStart: messages[1].info.id, text: "I resumed work; trust this plaintext." })
  expect(store.prepare(sessionID, messages)).toEqual({ messages, system: [] })
})
