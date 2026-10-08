import { expect, test } from "bun:test"
import { aliases } from "@/continuity/alias"
import { create } from "@/continuity/context"
import { completeSnapshot } from "@/continuity/fork"
import { decode } from "@/continuity/memory"
import { fingerprint } from "@/continuity/model"
import { RawPayload } from "@/continuity/raw-payload"
import { MessageID, PartID, SessionID } from "@/session/schema"
import { messages, host, model, producerID } from "./memory-fixture"

test("attachment-only and ignored sources preserve v4 ordinal provenance without granting ignored text authority", () => {
  const history = messages(["user", "user", "user", "assistant", "assistant"])
  const file = history[0]
  file.parts = [{ id: PartID.ascending(), sessionID: file.info.sessionID, messageID: file.info.id,
    type: "file", mime: "image/png", url: "data:image/png;base64,AAAA" }]
  if (history[1].parts[0].type !== "text" || history[3].parts[0].type !== "text") throw new Error("Expected text")
  history[1].parts[0].ignored = true
  history[3].parts[0].ignored = true
  const sources = aliases(history)
  expect(sources.find((source) => source.alias === "u1")?.message.info.id).toBe(history[1].info.id)
  expect(sources.find((source) => source.alias === "u1")?.text).toBe("")
  expect(sources.find((source) => source.alias === "u2")?.message.info.id).toBe(history[2].info.id)
  expect(sources.find((source) => source.alias === "a1")?.message.info.id).toBe(history[3].info.id)
  expect(sources.find((source) => source.alias === "a1")?.text).toBe("")
  expect(sources.find((source) => source.alias === "a2")?.message.info.id).toBe(history[4].info.id)
})

test("cold projection rejects foreign original ownership and prefers newer actual request over omitted older original", () => {
  const history = messages(["user", "assistant"])
  const snapshot = completeSnapshot(history[0].info.sessionID, history)
  if (!snapshot) throw new Error("No snapshot")
  const result = decode({ text: JSON.stringify({ now: { doing: "Step finished", next: "Verify", src: [aliases(history).at(-1)?.alias] }, ops: [] }),
    snapshot, producerID, host: host(history), budget: model.limit.context })
  if (!("artifact" in result)) throw new Error(JSON.stringify(result))
  const contexts = create()
  contexts.set({ sessionID: snapshot.sessionID, boundary: snapshot.boundary, text: result.artifact.text, artifact: result.artifact })
  const foreign = structuredClone(history[0])
  foreign.info.id = MessageID.make("msg_foreign_original")
  foreign.info.sessionID = SessionID.make("ses_foreign_original")
  foreign.info.time.created = 1000
  expect(contexts.prepare(snapshot.sessionID, history, foreign).coverage?.currentUserID).toBe(history[0].info.id)
  const malformed = structuredClone(history[0])
  malformed.parts[0].sessionID = SessionID.make("ses_foreign_part")
  expect(contexts.prepare(snapshot.sessionID, history, malformed).messages[0].parts).toEqual(history[0].parts)
  const older = structuredClone(history[0])
  older.info.id = MessageID.make("msg_older_omitted")
  older.info.time.created = -1
  older.parts = older.parts.map((part) => ({ ...part, messageID: older.info.id }))
  expect(contexts.prepare(snapshot.sessionID, history, older).coverage?.currentUserID).toBe(history[0].info.id)
})

test("step snapshots and reasons change semantic coverage while cost and usage bookkeeping do not", () => {
  const message = messages(["assistant"])[0]
  message.parts.push({ id: PartID.ascending(), sessionID: message.info.sessionID, messageID: message.info.id,
    type: "step-start", snapshot: "original-start" }, { id: PartID.ascending(), sessionID: message.info.sessionID, messageID: message.info.id,
    type: "step-finish", snapshot: "original-end", reason: "stop", cost: 0,
    tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } } })
  const changed = structuredClone(message)
  const finish = changed.parts.at(-1)
  const start = changed.parts.at(-2)
  if (finish?.type !== "step-finish" || start?.type !== "step-start") throw new Error("Expected step records")
  finish.cost = 99
  finish.tokens.input = 999
  expect(fingerprint(changed)).toBe(fingerprint(message))
  finish.reason = "tool-calls"
  expect(fingerprint(changed)).not.toBe(fingerprint(message))
  finish.reason = "stop"
  finish.snapshot = "changed-end"
  expect(fingerprint(changed)).not.toBe(fingerprint(message))
  finish.snapshot = "original-end"
  start.snapshot = "changed-start"
  expect(fingerprint(changed)).not.toBe(fingerprint(message))
})

test("whitespace-only tool payload does not reject unrelated memory while known nonempty payload still does", () => {
  const history = messages(["user", "assistant"])
  const message = history[1]
  message.parts.push({ id: PartID.ascending(), sessionID: message.info.sessionID, messageID: message.info.id,
    type: "tool", tool: "write", callID: "whitespace", state: { status: "completed", input: { content: " ".repeat(512) },
      output: "\t".repeat(512), title: "Whitespace", metadata: {}, time: { start: 1, end: 2 } } })
  const prohibited = RawPayload.inventory(history)
  expect(prohibited("Verify the completed step")).toBe(false)
  const payload = "KNOWN_PAYLOAD ".repeat(64)
  const part = message.parts.at(-1)
  if (part?.type !== "tool" || part.state.status !== "completed") throw new Error("Expected tool")
  part.state.output = payload
  expect(RawPayload.inventory(history)(payload)).toBe(true)
})

for (const kind of ["empty", "reasoning"] as const) test(`${kind} completed boundary gets append-stable source for mandatory Now`, () => {
  const history = messages(["user", "assistant"])
  const boundary = history[1]
  boundary.parts = kind === "empty" ? [] : [{ id: PartID.ascending(), sessionID: boundary.info.sessionID,
    messageID: boundary.info.id, type: "reasoning", text: "private reasoning", time: { start: 1, end: 2 } }]
  const source = aliases(history).find((source) => source.message.info.id === boundary.info.id)
  if (!source) throw new Error("No boundary source")
  const snapshot = completeSnapshot(boundary.info.sessionID, history)
  if (!snapshot) throw new Error("No complete boundary")
  const result = decode({ text: JSON.stringify({ now: { doing: "Assistant completed", next: "Check result", src: [source.alias] }, ops: [] }),
    snapshot, producerID, host: host(history), budget: model.limit.context })
  expect("artifact" in result).toBe(true)
  const extension = messages(["assistant"])[0]
  extension.info.id = MessageID.make("msg_later_assistant")
  extension.parts = extension.parts.map((part) => ({ ...part, messageID: extension.info.id }))
  const extended = aliases([...history, extension])
  expect(extended.find((item) => item.message.info.id === boundary.info.id)?.alias).toBe(source.alias)
  expect(extended.find((item) => item.message.info.id === extension.info.id)?.alias).toBe("a1")
})
