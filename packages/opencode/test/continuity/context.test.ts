import { expect, test } from "bun:test"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { create } from "@/continuity/context"
import { decode } from "@/continuity/artifact"
import { snapshot } from "@/continuity/fork"
import { catalogue } from "@/continuity/source"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { selectSource } from "./fixtures"

const sessionID = SessionID.make("ses_capability")
const model = { providerID: ProviderV2.ID.make("test"), modelID: ModelV2.ID.make("test-model") }
const history: SessionV1.WithParts[] = Array.from({ length: 12 }, (_, index) => {
  const id = MessageID.make(`msg_capability_${index}`)
  return {
    info: index % 2 === 0
      ? { id, sessionID, role: "user", agent: "build", model, time: { created: index } }
      : { id, sessionID, role: "assistant", agent: "build", mode: "build",
        parentID: MessageID.make(`msg_capability_${index - 1}`), modelID: model.modelID, providerID: model.providerID,
        path: { cwd: "/test", root: "/test" }, cost: 0,
        tokens: { input: 100, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        finish: "stop", time: { created: index, completed: index } },
    parts: [{ id: PartID.make(`prt_capability_${index}`), messageID: id, sessionID, type: "text", text: `CAPABILITY_${index}` }],
  }
})

function context(references: boolean) {
  const captured = snapshot(sessionID, history, undefined, true)
  if (!captured) throw new Error("missing compressible history")
  const sources = catalogue({ parentID: sessionID, head: captured.head, canRecall: true })
  const exact = selectSource(sources.units, "CAPABILITY_0")
  const reference = selectSource(sources.units, "CAPABILITY_1")
  expect(reference.role).toBe("assistant")
  expect(reference.recoverable).toBe(true)
  const decoded = decode({
    text: JSON.stringify({ status: "ready", exact: [{ source: exact.id, reason: "identifier" }], notes: [],
      reference_only: references ? [{ source: reference.id, purpose: "Historical proposal", retrieve_when: "Before adopting proposal" }] : [],
      omissions: [], issues: [] }),
    catalogue: sources, maxTokens: 6000,
    envelope: { version: 1, kind: "continuity_handoff", parentID: sessionID, producerID: SessionID.make("ses_producer"),
      boundary: captured.boundary, tailStart: captured.tailStart, coveredThrough: captured.head.at(-1)!.info.id },
  })
  if (!decoded.ok) throw new Error(decoded.reason)
  const store = create()
  expect(store.set({ sessionID, boundary: captured.boundary, tailStart: captured.tailStart,
    artifact: decoded.artifact, text: decoded.artifact.text })).toBe(true)
  return { store, artifact: decoded.artifact }
}

test("exact-only artifact prunes with default or explicit false recall capability", () => {
  const { store } = context(false)
  for (const prepared of [store.prepare(sessionID, history), store.prepare(sessionID, history, false)]) {
    expect(prepared.messages).toEqual(history.slice(4))
    expect(prepared.system).toHaveLength(1)
    expect(prepared.system[0]).toContain("CAPABILITY_0")
  }
})

test("reference artifact prunes only while recall allowed; revocation retains last valid artifact", () => {
  const { store, artifact } = context(true)
  const allowed = store.prepare(sessionID, history, true)
  expect(allowed.messages).toEqual(history.slice(4))
  expect(allowed.system).toHaveLength(1)
  for (const prepared of [store.prepare(sessionID, history), store.prepare(sessionID, history, false)]) {
    expect(prepared.messages).toBe(history)
    expect(prepared.system).toEqual([])
    expect(store.get(sessionID)?.artifact).toBe(artifact)
  }
  expect(store.prepare(sessionID, history, true)).toEqual(allowed)
})
