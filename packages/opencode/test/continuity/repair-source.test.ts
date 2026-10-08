import { expect, test } from "bun:test"
import { completeSnapshot } from "@/continuity/fork"
import { decode } from "@/continuity/memory"
import { create } from "@/continuity/context"
import { fingerprint, validSnapshot } from "@/continuity/model"
import { readStored, writeStored } from "@/continuity/archive-format"
import { RequestSource } from "@/continuity/request-source"
import { estimate, ATTACHMENT_TOKENS } from "@/continuity/masking"
import { MessageID, PartID, SessionID } from "@/session/schema"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { messages, host, model, producerID, captured } from "./memory-fixture"

function fixture() {
  const history = messages(["user", "assistant"])
  if (history[0].parts[0].type === "text") history[0].parts[0].text = "ACTUAL_EXACT_ASK: restore the cache, keep deployment local."
  const tool: SessionV1.ToolPart = { id: PartID.make("prt_receipt"), sessionID: history[1].info.sessionID, messageID: history[1].info.id,
    type: "tool", callID: "receipt", tool: "read", state: { status: "completed", input: { filePath: "receipt.txt" }, output: "RECEIPT_FINISHED",
      title: "read", metadata: { exit: 0, loaded: ["AGENTS.md"] }, time: { start: 1, end: 2 } } }
  history[1].parts.push(tool)
  const snapshot = completeSnapshot(history[0].info.sessionID, history)
  if (!snapshot) throw new Error("No complete fixture")
  const result = decode({ text: JSON.stringify({ now: { doing: "Receipt finished", next: "Verify receipt", src: ["t1"] }, ops: [] }), snapshot, producerID, host: host(history), budget: model.limit.context })
  if (!("artifact" in result)) throw new Error(JSON.stringify(result))
  return { history, snapshot, artifact: result.artifact, tool }
}

test("actual request identity survives synthetic continue, task-return and compaction records; exact ask restored explicitly when filtered", () => {
  const f = fixture()
  const contexts = create()
  contexts.set({ sessionID: f.artifact.parentID, boundary: f.artifact.boundary, text: f.artifact.text, artifact: f.artifact })
  for (const kind of ["continue", "task-return", "compaction"] as const) {
    const notice = messages(["user"])[0]
    notice.info.id = MessageID.make(`msg_${kind}`)
    notice.info.time.created = 99
    notice.parts = kind === "compaction" ? [{ id: PartID.ascending(), sessionID: notice.info.sessionID, messageID: notice.info.id, type: "compaction", auto: true }] :
      [{ id: PartID.ascending(), sessionID: notice.info.sessionID, messageID: notice.info.id, type: "text", text: "SYNTHETIC_MUST_NOT_REPLACE_ASK", synthetic: true,
        ...(kind === "task-return" ? { metadata: { source: { type: "task-return", task_id: "child", state: "completed" } } } : {}) }]
    const view = contexts.prepare(f.artifact.parentID, [...f.history, notice])
    expect(view.coverage?.currentUserID).toBe(f.history[0].info.id)
    expect(view.messages[0].parts).toEqual(f.history[0].parts)
    expect(view.messages.at(-1)?.info.id).toBe(notice.info.id)
    expect(RequestSource.actual(notice)).toBe(false)
  }
  const command = messages(["user"])[0]
  command.parts = [{ id: PartID.ascending(), sessionID: command.info.sessionID, messageID: command.info.id, type: "text", text: "expanded command", synthetic: true, metadata: { source: { type: "command", invocation: "/check --local" } } }]
  expect(RequestSource.actual(command)).toBe(true)
  const attachment = messages(["user"])[0]
  attachment.parts = [{ id: PartID.ascending(), sessionID: attachment.info.sessionID, messageID: attachment.info.id, type: "file", mime: "image/png", url: "data:image/png;base64,AAAA" }]
  expect(RequestSource.actual(attachment)).toBe(true)
  const filtered = structuredClone(f.history)
  filtered[0].parts = [{ id: PartID.ascending(), sessionID: filtered[0].info.sessionID, messageID: filtered[0].info.id, type: "text", text: "continue", synthetic: true }]
  const snap = completeSnapshot(f.artifact.parentID, filtered)
  if (!snap) throw new Error("No control-only prefix")
  const value = decode({ text: JSON.stringify({ now: { doing: "Receipt finished", next: "Verify", src: ["t1"] }, ops: [] }), snapshot: snap, producerID, host: host(filtered), budget: model.limit.context })
  if (!("artifact" in value)) throw new Error(JSON.stringify(value))
  contexts.set({ sessionID: value.artifact.parentID, boundary: value.artifact.boundary, text: value.artifact.text, artifact: value.artifact })
  const view = contexts.prepare(value.artifact.parentID, filtered, f.history[0])
  expect(view.messages[0]).toEqual(f.history[0])
  expect(view.coverage?.currentUserID).toBe(f.history[0].info.id)
})

for (const field of ["finish", "parent", "error", "completed", "structured", "args", "output", "image"] as const) test(`semantic ${field} changes invalidate cold projection`, () => {
  const f = fixture()
  const changed = structuredClone(f.history)
  const info = changed[1].info
  if (info.role !== "assistant") throw new Error("Expected assistant")
  if (field === "finish") info.finish = "length"
  if (field === "parent") info.parentID = MessageID.make("msg_other")
  if (field === "error") info.error = { name: "UnknownError", data: { message: "meaning changed" } }
  if (field === "completed") delete info.time.completed
  if (field === "structured") info.structured = { receipt: "changed" }
  const part = changed[1].parts[1]
  if (part.type !== "tool" || part.state.status !== "completed") throw new Error("Expected tool")
  if (field === "args") part.state.input.filePath = "different.txt"
  if (field === "output") part.state.output = "DIFFERENT_RECEIPT"
  if (field === "image") part.state.attachments = [{ id: PartID.ascending(), sessionID: info.sessionID, messageID: info.id, type: "file", mime: "image/png", url: "data:image/png;base64,IMAGE_CHANGED" }]
  const contexts = create()
  contexts.set({ sessionID: f.artifact.parentID, boundary: f.artifact.boundary, text: f.artifact.text, artifact: f.artifact })
  expect(contexts.prepare(f.artifact.parentID, changed).coverage).toBeUndefined()
})

test("bookkeeping changes keep fingerprints; foreign/diverged heads and incompatible prior artifacts fail C13", () => {
  const f = fixture()
  const changed = structuredClone(f.history[1])
  if (changed.info.role !== "assistant") throw new Error("Expected assistant")
  changed.info.cost = 999; changed.info.tokens.input = 999; changed.info.time.completed = 999
  const part = changed.parts[1]
  if (part.type !== "tool" || part.state.status !== "completed") throw new Error("Expected tool")
  part.state.time.compacted = 100; part.state.time.start = 9; part.state.time.end = 10; part.state.metadata.loaded = ["other-cache.md"]
  expect(fingerprint(changed)).toBe(fingerprint(f.history[1]))
  const head = structuredClone(f.snapshot.head)
  if (head[0].parts[0].type === "text") head[0].parts[0].text = "DIVERGED_HEAD"
  expect(validSnapshot({ ...f.snapshot, head })).toBe(false)
  head[0].parts[0].messageID = MessageID.make("msg_foreign")
  expect(validSnapshot({ ...f.snapshot, head })).toBe(false)
  const extended = [...f.history, ...messages(["user", "assistant"]).map((message, index) => ({ info: { ...message.info, id: MessageID.make(`msg_extended_${index}`),
    ...(message.info.role === "assistant" ? { parentID: MessageID.make("msg_extended_0") } : {}) },
    parts: message.parts.map((part) => ({ ...part, id: PartID.ascending(), messageID: MessageID.make(`msg_extended_${index}`) })) }))]
  const incremental = completeSnapshot(f.artifact.parentID, extended, f.artifact)
  if (!incremental) throw new Error("No incremental snapshot")
  expect(validSnapshot({ ...incremental, previous: { ...f.artifact, parentID: SessionID.make("ses_foreign") } })).toBe(false)
})

test("known full call/result JSON embedded in prose or wrappers remains C16; completed historical failures remain archived observations", () => {
  const f = fixture()
  const source = f.tool
  const value = `Evidence: ${JSON.stringify({ type: "tool-call", toolCallId: source.callID, toolName: source.tool, input: source.state.input }, null, 2).replace(/\n/g, " ")}`
  const result = decode({ text: JSON.stringify({ now: { doing: value, next: "Verify", src: ["t1"] }, ops: [] }), snapshot: f.snapshot, producerID, host: host(f.history), budget: model.limit.context })
  expect(result).toMatchObject({ check: "C16" })
  const history = messages(["user", "assistant", "assistant"])
  const failed = history[1].info
  if (failed.role !== "assistant") throw new Error("Expected assistant")
  failed.error = { name: "UnknownError", data: { message: "Prior provider failure" } }
  delete failed.finish
  const last = history[2].info
  if (last.role !== "assistant") throw new Error("Expected assistant")
  last.parentID = history[0].info.id
  expect(completeSnapshot(history[0].info.sessionID, history)?.covered).toHaveLength(3)
})

test("Now must cite final completed step, not old waiting evidence", () => {
  const f = fixture()
  const result = decode({ text: JSON.stringify({ now: { doing: "Waiting for receipt", next: "Wait", src: ["u1"] }, ops: [] }), snapshot: f.snapshot,
    producerID, host: host(f.history), budget: model.limit.context })
  expect(result).toMatchObject({ check: "C15" })
})

for (const status of ["completed", "error"] as const) test(`call provenance changes invalidate ${status} tool coverage independently of result metadata`, () => {
  const f = fixture()
  const original = structuredClone(f.history[1])
  const part = original.parts[1]
  if (part.type !== "tool") throw new Error("Expected tool")
  if (status === "error") part.state = { status, input: {}, error: "Error: expected nonempty object, got {}", metadata: { exit: 1 }, time: { start: 1, end: 2 } }
  part.metadata = { providerExecuted: true, providerCall: { origin: "first" }, timing: { elapsed: 1 } }
  const history = [f.history[0], original]
  const snapshot = completeSnapshot(f.artifact.parentID, history)
  if (!snapshot) throw new Error("No metadata snapshot")
  const result = decode({ text: JSON.stringify({ now: { doing: "Check finished", next: "Verify result", src: ["t1"] }, ops: [] }),
    snapshot, producerID, host: host(history), budget: model.limit.context })
  if (!("artifact" in result)) throw new Error(JSON.stringify(result))
  const stored = readStored(writeStored(f.artifact.parentID, { context: { sessionID: f.artifact.parentID, boundary: snapshot.boundary,
    text: result.artifact.text, artifact: result.artifact }, masks: [] }), f.artifact.parentID)
  if (!stored.context) throw new Error("No persisted metadata artifact")
  const contexts = create()
  contexts.set(stored.context)
  expect(contexts.prepare(f.artifact.parentID, history).coverage?.coveredThrough).toBe(snapshot.boundary)
  expect(contexts.prepare(f.artifact.parentID, history).messages[0].parts).toEqual(f.history[0].parts)
  const changed = structuredClone(original)
  const changedPart = changed.parts[1]
  if (changedPart.type !== "tool") throw new Error("Expected tool")
  changedPart.metadata = { ...changedPart.metadata, providerExecuted: false }
  expect(fingerprint(changed)).not.toBe(fingerprint(original))
  expect(contexts.prepare(f.artifact.parentID, [f.history[0], changed]).coverage).toBeUndefined()
  contexts.set(stored.context)
  changedPart.metadata = { ...part.metadata, providerCall: { origin: "second" } }
  expect(fingerprint(changed)).not.toBe(fingerprint(original))
  expect(contexts.prepare(f.artifact.parentID, [f.history[0], changed]).coverage).toBeUndefined()
  contexts.set(stored.context)
  changedPart.metadata = { ...part.metadata, timing: { elapsed: 999 } }
  expect(fingerprint(changed)).toBe(fingerprint(original))
  expect(contexts.prepare(f.artifact.parentID, [f.history[0], changed]).coverage?.coveredThrough).toBe(snapshot.boundary)
  if (changedPart.state.status === "completed" || changedPart.state.status === "error") changedPart.state.metadata = { exit: 99 }
  expect(contexts.prepare(f.artifact.parentID, [f.history[0], changed]).coverage).toBeUndefined()
})

test("error-only latest tool step anchors Now and exact failure; empty argument object does not ban proven command/error braces", () => {
  const history = messages(["user", "assistant"])
  history[1].parts = [{ id: PartID.ascending(), sessionID: history[1].info.sessionID, messageID: history[1].info.id, type: "tool", callID: "zero",
    tool: "bash", state: { status: "error", input: {}, error: "Error: expected nonempty object, got {}", time: { start: 1, end: 2 } } },
    { id: PartID.ascending(), sessionID: history[1].info.sessionID, messageID: history[1].info.id, type: "tool", callID: "command", tool: "bash",
      state: { status: "completed", input: { command: "node -e 'console.log({})'" }, output: "done", title: "command", metadata: {}, time: { start: 1, end: 2 } } }]
  const snapshot = completeSnapshot(history[0].info.sessionID, history)
  if (!snapshot) throw new Error("No error-only snapshot")
  const result = decode({ text: JSON.stringify({ now: { doing: "Failed object verification", next: "Retry with a nonempty object", src: ["t1"] }, ops: [
    { op: "add", section: "failures", src: ["t1"], fields: { tried: "object check", error: "Error: expected nonempty object, got {}", cause: "empty object", lesson: "When object is empty, supply fields." } },
    { op: "add", section: "values", src: ["t2"], fields: { name: "Command", value: "node -e 'console.log({})'" } },
  ] }), snapshot, producerID, host: host(history), budget: model.limit.context })
  if (!("artifact" in result)) throw new Error(JSON.stringify(result))
  expect(result.artifact.text).toContain("Error: expected nonempty object, got {}")
  expect(result.artifact.text).toContain("Retry with a nonempty object")
  expect(result.artifact.text).toContain("node -e 'console.log({})'")
  expect(decode({ text: JSON.stringify({ now: { doing: "Old waiting", next: "Wait", src: ["u1"] }, ops: [] }), snapshot, producerID, host: host(history), budget: model.limit.context })).toMatchObject({ check: "C15" })
})

test("latest terminal error with no completed tool or assistant text supplies required Now source", () => {
  const history = messages(["user", "assistant"])
  history[1].parts = [{ id: PartID.ascending(), sessionID: history[1].info.sessionID, messageID: history[1].info.id, type: "tool", callID: "failed",
    tool: "bash", state: { status: "error", input: {}, error: "exit 75: receipt failed", time: { start: 1, end: 2 } } }]
  const snapshot = completeSnapshot(history[0].info.sessionID, history)
  if (!snapshot) throw new Error("No terminal error snapshot")
  const result = decode({ text: JSON.stringify({ now: { doing: "Receipt check failed", next: "Verify failed receipt", src: ["t1"] }, ops: [] }),
    snapshot, producerID, host: host(history), budget: model.limit.context })
  expect("artifact" in result).toBe(true)
  const wrapper = { type: "tool-call", toolCallId: "failed", toolName: "bash", input: {} }
  expect(decode({ text: JSON.stringify({ now: { doing: `Observed ${JSON.stringify(wrapper)}`, next: "Verify", src: ["t1"] }, ops: [] }),
    snapshot, producerID, host: host(history), budget: model.limit.context })).toMatchObject({ check: "C16" })
  expect(decode({ text: JSON.stringify({ now: { doing: "Waiting", next: "Wait", src: ["u1"] }, ops: [] }),
    snapshot, producerID, host: host(history), budget: model.limit.context })).toMatchObject({ check: "C15" })
})

test("C16 permits long new natural language and exact operational commands without arbitrary memory size target", () => {
  const f = fixture()
  if (f.tool.state.status !== "completed") throw new Error("Expected tool")
  const command = "node --check " + "actual-module-path/".repeat(100)
  f.tool.state.input = { command }
  const snapshot = completeSnapshot(f.artifact.parentID, f.history)
  if (!snapshot) throw new Error("No snapshot")
  const result = decode({ text: JSON.stringify({ now: { doing: "Receipt finished", next: "Verify", src: ["t1"] }, ops: [
    { op: "add", section: "findings", src: ["t1"], fields: { finding: "Independent long natural language explanation. ".repeat(2000), why: "Gist", status: "hypothesis", check: "Verify" } },
    { op: "add", section: "values", src: ["t1"], fields: { name: "Check command", value: command } },
  ] }), snapshot, producerID, host: host(f.history), budget: model.limit.context })
  expect("artifact" in result).toBe(true)
})

test("delivered two-user batch covers both through confirmed second parent, excludes later queued ask and synthetic control", () => {
  const history = messages(["user", "user", "assistant", "user", "user"])
  history[4].parts = [{ id: PartID.ascending(), sessionID: history[4].info.sessionID, messageID: history[4].info.id, type: "text", text: "continue", synthetic: true }]
  const snapshot = completeSnapshot(history[0].info.sessionID, history)
  expect(snapshot?.covered?.map((message) => message.info.id)).toEqual(history.slice(0, 3).map((message) => message.info.id))
})

test("ordinary alphabetic text/commands count fully; actual domain image payload is bounded", () => {
  expect(estimate([{ role: "user", content: "A".repeat(100_000) }])).toBeGreaterThan(24_000)
  expect(estimate({ command: "A".repeat(100_000) })).toBeGreaterThan(24_000)
  expect(estimate([{ role: "user", content: [{ type: "image", image: "data:image/png;base64," + "A".repeat(100_000) }] }])).toBeLessThan(ATTACHMENT_TOKENS + 100)
})

for (const location of ["now", "finding"] as const) for (const kind of ["image", "patch", "args", "ask"] as const) test(`C16 blocks known ${kind} copied into ${location}, without grading arbitrary prose`, () => {
  const f = fixture()
  const blob = `KNOWN_${kind}_` + "x".repeat(12000)
  const part = f.tool
  if (part.state.status !== "completed") throw new Error("Expected tool")
  if (kind === "image") part.state.attachments = [{ id: PartID.ascending(), sessionID: part.sessionID, messageID: part.messageID, type: "file", mime: "image/png", url: "data:image/png;base64," + blob }]
  if (kind === "patch") { part.tool = "apply_patch"; part.state.input = { patchText: blob } }
  if (kind === "args") part.state.input = { command: blob }
  if (kind === "ask" && f.history[0].parts[0].type === "text") f.history[0].parts[0].text = blob
  const payload = kind === "args" ? JSON.stringify(part.state.input) : blob
  const snapshot = completeSnapshot(f.artifact.parentID, f.history)
  if (!snapshot) throw new Error("No snapshot")
  const result = decode({ text: JSON.stringify({ now: { doing: location === "now" ? payload : "Receipt finished", next: "Verify", src: ["t1"] },
    ops: location === "finding" ? [{ op: "add", section: "findings", src: ["t1"], fields: { finding: payload, why: "test", status: "hypothesis", check: "verify" } }] : [] }),
    snapshot, producerID, host: host(f.history), budget: model.limit.context })
  expect(result).toMatchObject({ check: "C16" })
})

test("v4 reread cannot revoke guarded objective/rule/user decision with old evidence; new user revocation works", () => {
  const history = messages()
  if (history[0].parts[0].type === "text") history[0].parts[0].text = "Restore the cache. Do not deploy. Use the local agent."
  const initial = decode({ text: JSON.stringify({ ops: [
    { op: "add", section: "objective", src: ["u1"], fields: { goal: "Restore cache", why: "Correctness", done_when: "Verified" } },
    { op: "add", section: "rules", src: ["u1"], fields: { kind: "must_not", rule: "Do not deploy", quote: "Do not deploy." } },
    { op: "add", section: "decisions", src: ["u1"], fields: { decision: "Use local agent", why: "Local scope", by: "user", quote: "Use the local agent." } },
    { op: "add", section: "plan", src: ["u1"], fields: { task: "Verify", status: "todo" } },
  ] }), snapshot: { ...captured(), head: history.slice(0, 2), tail: history.slice(2, 10) }, producerID, host: host(history), budget: model.limit.context })
  if (!("artifact" in initial)) throw new Error(JSON.stringify(initial))
  const snapshot = completeSnapshot(initial.artifact.parentID, history, initial.artifact)
  if (!snapshot) throw new Error("No migration")
  for (const item of initial.artifact.items.filter((item) => item.section !== "plan")) {
    const old = decode({ text: JSON.stringify({ now: { doing: "Verify", next: "Check", src: ["a8"] }, ops: [{ op: "retire", id: item.id,
      reason: "Old raw reread", src: ["u1"], quote: item.fields.quote ?? "Restore the cache." }] }), snapshot, producerID, host: host(history), budget: model.limit.context })
    expect(old).toMatchObject({ check: "C7" })
  }
  if (history[2].parts[0].type === "text") history[2].parts[0].text = "Change the goal. You may deploy. Stop using the local agent."
  const fresh = completeSnapshot(initial.artifact.parentID, history, initial.artifact)
  if (!fresh) throw new Error("No fresh migration")
  const result = decode({ text: JSON.stringify({ now: { doing: "Verify", next: "Check", src: ["a8"] }, ops: initial.artifact.items.filter((item) => item.section !== "plan")
    .map((item) => ({ op: "retire", id: item.id, reason: "New revocation", src: ["u2"], quote: item.section === "rules" ? "You may deploy." : "Stop using the local agent." })) }),
    snapshot: fresh, producerID, host: host(history), budget: model.limit.context })
  expect("artifact" in result && result.artifact.items.map((item) => item.section)).toEqual(["plan"])
})
