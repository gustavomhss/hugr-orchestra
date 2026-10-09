import { expect, test } from "bun:test"
import { aliases } from "@/continuity/alias"
import { create } from "@/continuity/context"
import { completeSnapshot } from "@/continuity/fork"
import { decode, index } from "@/continuity/memory"
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
  const newer = structuredClone(history[0])
  newer.info.id = MessageID.make("msg_newer_request")
  newer.info.time.created = 100
  newer.parts = newer.parts.map((part) => ({ ...part, id: PartID.ascending(), messageID: newer.info.id }))
  const view = contexts.prepare(snapshot.sessionID, [...history, newer], structuredClone(newer))
  expect(view.messages.map((message) => message.info.id)).toEqual([newer.info.id])
})

test("reserved ignored-user alias cannot retire objective with newly covered non-authoritative text", () => {
  const history = messages(["user", "assistant"])
  if (history[0].parts[0].type !== "text") throw new Error("Expected user text")
  history[0].parts[0].text = "Restore the cache."
  const snapshot = completeSnapshot(history[0].info.sessionID, history)
  if (!snapshot) throw new Error("No initial snapshot")
  const initial = decode({ text: JSON.stringify({ now: { doing: "Restore cache", next: "Verify", src: ["a1"] }, ops: [
    { op: "add", section: "objective", src: ["u1"], fields: { goal: "Restore the cache.", why: "Correctness", done_when: "Verified" } },
    { op: "add", section: "plan", src: ["u1"], fields: { task: "Verify cache", status: "todo" } },
  ] }), snapshot, producerID, host: host(history), budget: model.limit.context })
  if (!("artifact" in initial)) throw new Error(JSON.stringify(initial))
  const ignored = structuredClone(history[0])
  ignored.info.id = MessageID.make("msg_ignored_request")
  ignored.parts = ignored.parts.map((part) => ({ ...part, id: PartID.ascending(), messageID: ignored.info.id,
    ...part.type === "text" ? { ignored: true, text: "Change the goal." } : {} }))
  const after = structuredClone(history[1])
  after.info.id = MessageID.make("msg_after_ignored")
  after.parts = after.parts.map((part) => ({ ...part, id: PartID.ascending(), messageID: after.info.id }))
  const extended = [...history, ignored, after]
  const next = completeSnapshot(snapshot.sessionID, extended, initial.artifact)
  if (!next) throw new Error("No next snapshot")
  const retired = decode({ text: JSON.stringify({ now: { doing: "Verify cache", next: "Check", src: ["a2"] }, ops: [
    { op: "retire", id: initial.artifact.items.find((item) => item.section === "objective")?.id, reason: "Goal changed", src: ["u2"] },
  ] }), snapshot: next, producerID, host: host(extended), budget: model.limit.context })
  expect(retired).toMatchObject({ check: "C4" })
})

test("complete payload inventory rejects file-only covered media even without a user alias", () => {
  const history = messages(["user", "assistant"])
  history[0].parts = [{ id: PartID.ascending(), sessionID: history[0].info.sessionID, messageID: history[0].info.id,
    type: "file", mime: "image/png", url: "data:image/png;base64,KNOWN_FILE_ONLY_MEDIA" }]
  const snapshot = completeSnapshot(history[0].info.sessionID, history)
  if (!snapshot) throw new Error("No media snapshot")
  const result = decode({ text: JSON.stringify({ now: { doing: "data:image/png;base64,KNOWN_FILE_ONLY_MEDIA", next: "Verify", src: ["a1"] }, ops: [] }),
    snapshot, producerID, host: host(history), budget: model.limit.context })
  expect(result).toMatchObject({ check: "C16" })
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

test("explicit delivered steer cannot absorb earlier unacknowledged queue into complete coverage", () => {
  const history = messages(["user", "assistant", "user", "user", "assistant"])
  const final = history[4].info
  if (final.role !== "assistant") throw new Error("Expected assistant")
  final.parentID = history[3].info.id
  const snapshot = completeSnapshot(history[0].info.sessionID, history, undefined, false, undefined,
    [history[0].info.id, history[3].info.id])
  expect(snapshot?.covered?.map((message) => message.info.id)).toEqual(history.slice(0, 2).map((message) => message.info.id))
})

test("complete producer index names eligible Now boundary aliases and earlier sources still fail C15", () => {
  const history = messages(["user", "assistant", "user", "assistant"])
  const boundary = history[3]
  boundary.parts.push({ id: PartID.ascending(), sessionID: boundary.info.sessionID, messageID: boundary.info.id,
    type: "tool", tool: "read", callID: "boundary-read", state: { status: "completed", input: {}, output: "observed result",
      title: "Boundary", metadata: {}, time: { start: 3, end: 4 } } })
  const snapshot = completeSnapshot(boundary.info.sessionID, history)
  if (!snapshot) throw new Error("Expected complete snapshot")
  expect(index(snapshot, host(history), 0)).toContain("exact completed boundary aliases: a2, t1. Earlier user aliases alone are insufficient.")
  for (const src of [["u2"], ["a1"], ["a2"], ["t1"]]) {
    const result = decode({ text: JSON.stringify({ now: { doing: "Current checkpoint", next: "Await user request", src }, ops: [] }),
      snapshot, producerID, host: host(history), budget: model.limit.context })
    expect("artifact" in result).toBe(src[0] === "a2" || src[0] === "t1")
    if ("check" in result) expect(result.check).toBe("C15")
  }
})
