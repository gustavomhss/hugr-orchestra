import { expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { ATTACHMENT_TOKENS, estimate } from "@/continuity/masking"
import { ParentReceipt } from "@/continuity/parent-receipt"
import { completeSnapshot } from "@/continuity/fork"
import { LLMPrepared } from "@/session/llm/prepared"
import { MessageV2 } from "@/session/message-v2"
import { PromptContinuity } from "@/session/prompt-continuity"
import { Session } from "@/session/session"
import { create } from "@/continuity/context"
import { decode } from "@/continuity/memory"
import { PartID, SessionID } from "@/session/schema"
import { ProviderTest } from "../fake/provider"
import { testEffect } from "../lib/effect"
import { messages, model, host, producerID } from "./memory-fixture"

const it = testEffect(Layer.empty)

it.live("real converted tool-result image/PDF payloads are charged as media, while tool arguments remain text", () => Effect.gen(function* () {
  const history = messages(["user", "assistant"])
  const current = history[1]
  const payload = "A".repeat(100_000)
  current.parts.push({ id: PartID.ascending(), sessionID: current.info.sessionID, messageID: current.info.id,
    type: "tool", tool: "read", callID: "media", state: { status: "completed", input: { filePath: "evidence" },
      output: "Read evidence", title: "Read", metadata: {}, time: { start: 1, end: 2 },
      attachments: ["image/png", "application/pdf"].map((mime) => ({ id: PartID.ascending(), sessionID: current.info.sessionID,
        messageID: current.info.id, type: "file" as const, mime, url: `data:${mime};base64,${payload}` })) } })
  const selected = ProviderTest.model()
  const converted = yield* MessageV2.toModelMessagesEffect(history, { ...selected, capabilities: { ...selected.capabilities,
    attachment: true, input: { ...selected.capabilities.input, image: true, pdf: true } } })
  expect(JSON.stringify(converted)).toContain('"type":"media"')
  expect(estimate({ messages: converted, tools: {}, options: {} })).toBeLessThan(ATTACHMENT_TOKENS * 2 + 1000)
  expect(estimate({ messages: converted, tools: {}, options: { arbitrary: payload } })).toBeGreaterThan(24_000)
}))

for (const location of ["tool-schema", "response-schema", "json-result", "arguments"] as const)
  test(`media-shaped ${location} remains ordinary serialized text`, () => {
    const payload = { type: "image", image: "A".repeat(100_000) }
    const value = location === "tool-schema" ? { messages: [], tools: { image: { schema: { const: payload, examples: [payload] } } } } :
      location === "response-schema" ? { messages: [], responseSchema: { const: payload } } :
      location === "arguments" ? [{ role: "assistant", content: [{ type: "tool-call", toolCallId: "call", toolName: "read", input: payload }] }] :
      [{ role: "tool", content: [{ type: "tool-result", toolCallId: "call", toolName: "read", output: { type: "json", value: payload } }] }]
    expect(estimate(value)).toBeGreaterThan(24_000)
  })

test("parent receipts reject opaque plan replacement, edited canonical source and foreign snapshot ownership", () => {
  const history = messages(["user", "assistant"])
  const user = history[0].info
  const response = history[1].info
  if (user.role !== "user" || response.role !== "assistant") throw new Error("Expected complete turn")
  response.tokens.input = 1000
  const snapshot = completeSnapshot(user.sessionID, history)
  if (!snapshot) throw new Error("No snapshot")
  const plan = LLMPrepared.token()
  const parent = ParentReceipt.capture({ input: { user, model, sessionID: user.sessionID, prepared: plan,
    agent: { name: "build", mode: "primary", permission: [], options: {} }, system: [],
    messages: [{ role: "user", content: "Projected prefix" }], tools: {} }, messageIDs: [user.id] }, response.id, [history[0]])
  ParentReceipt.complete(parent, response)
  expect(ParentReceipt.matches(parent, snapshot, model)).toBe(true)
  parent.input.prepared = LLMPrepared.token()
  expect(ParentReceipt.matches(parent, snapshot, model)).toBe(false)
  parent.input.prepared = plan
  const changed = structuredClone(history)
  if (changed[0].parts[0].type !== "text") throw new Error("Expected text")
  changed[0].parts[0].text = "Edited canonical source"
  const edited = completeSnapshot(user.sessionID, changed)
  if (!edited) throw new Error("No edited snapshot")
  expect(ParentReceipt.matches(parent, edited, model)).toBe(false)
  expect(ParentReceipt.matches(parent, { ...snapshot, sessionID: SessionID.make("ses_foreign") }, model)).toBe(false)
})

it.live("active v5 projection detaches current request from canonical receipt sources before mutable message hooks", () => Effect.gen(function* () {
  const history = messages(["user", "assistant"])
  const response = history[1].info
  if (response.role !== "assistant") throw new Error("Expected response")
  response.tokens.input = 1000
  const snapshot = completeSnapshot(history[0].info.sessionID, history)
  if (!snapshot) throw new Error("No snapshot")
  const memory = decode({ text: JSON.stringify({ now: { doing: "Complete", next: "Verify", src: ["a1"] }, ops: [] }),
    snapshot, producerID, host: host(history), budget: model.limit.context })
  if (!("artifact" in memory)) throw new Error(JSON.stringify(memory))
  const contexts = create()
  contexts.set({ sessionID: snapshot.sessionID, boundary: snapshot.boundary, text: memory.artifact.text, artifact: memory.artifact })
  const selected = yield* Session.Service.use((sessions) => PromptContinuity.select(history, sessions, snapshot.sessionID)).pipe(
    Effect.provide(Layer.mock(Session.Service, { messages: () => Effect.succeed(history) })))
  if (!selected.user || !selected.originalRequest) throw new Error("No actual user")
  const view = contexts.prepare(snapshot.sessionID, history, selected.originalRequest)
  const part = view.messages[0].parts[0]
  if (part.type !== "text") throw new Error("Expected projected text")
  part.text = "IN_PLACE_PLUGIN_TRANSFORM"
  expect(selected.sourceHistory[0].parts).toEqual(history[0].parts)
  expect(JSON.stringify(selected.sourceHistory)).not.toContain("IN_PLACE_PLUGIN_TRANSFORM")
  const parent = ParentReceipt.capture({ input: { user: selected.user, model, sessionID: snapshot.sessionID,
    agent: { name: "build", mode: "primary", permission: [], options: {} }, system: view.system,
    messages: [{ role: "user", content: part.text }], tools: {} }, messageIDs: view.messages.map((message) => message.info.id) }, response.id,
    view.messages.flatMap((message) => selected.sourceHistory.find((source) => source.info.id === message.info.id) ?? []))
  ParentReceipt.complete(parent, response)
  expect(ParentReceipt.matches(parent, snapshot, model)).toBe(true)
}))
