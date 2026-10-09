import { expect, test } from "bun:test"
import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ClaudeCodeTranscript } from "@/claude-code/transcript"
import { ClaudeCodeNative } from "@/claude-code/native"
import { MessageID, SessionID } from "@/session/schema"
import { ModelV2 } from "@orchestra/core/model"
import { ProviderV2 } from "@orchestra/core/provider"
import { PartID } from "@/session/schema"
import { discovery } from "./native-fixture"

const sessionID = SessionID.descending()
const history: SessionV1.WithParts[] = Array.from({ length: 4 }, (_, index) => ({ info: index === 0
  ? { id: MessageID.ascending(), sessionID, role: "user", agent: "claude", model: { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-haiku-4-5-20251001") }, time: { created: 0 } }
  : { id: MessageID.ascending(), sessionID, role: "assistant", agent: "claude", mode: "claude", parentID: MessageID.ascending(),
    modelID: ModelV2.ID.make("claude-haiku-4-5-20251001"), providerID: ProviderV2.ID.make("anthropic"), path: { cwd: "/repo", root: "/repo" }, cost: 0,
    tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }, time: { created: index } }, parts: [] }))
const base = { version: "2.1.289", isSidechain: false, sessionId: "native" }
const entries: SessionStoreEntry[] = [
  { ...base, type: "user", uuid: "opener", parentUuid: null, message: { role: "user", content: "original opener" } },
  { ...base, type: "assistant", uuid: "old", parentUuid: "opener", message: { id: "old-api", content: [{ type: "text", text: "old head" }] } },
  ...discovery,
  { ...base, type: "assistant", uuid: "use", parentUuid: "record", message: { id: "use-api", content: [
    { type: "thinking", thinking: "signed", signature: "keep-signature" }, { type: "tool_use", id: "t", name: "Read", input: {} }] } },
  { ...base, type: "user", uuid: "result", parentUuid: "use", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "receipt" }] } },
  { ...base, type: "assistant", uuid: "tail", parentUuid: "result", message: { id: "tail-api", content: [{ type: "text", text: "tail" }] } },
  { ...base, type: "attachment", uuid: "delta", parentUuid: "tail", attachment: { type: "deferred_tools_delta", surfacedNames: ["mcp__search__second"], addedNames: [], removedNames: [] } },
]
const mapping = { opener: history[0].info.id, old: history[1].info.id, use: history[2].info.id, result: history[3].info.id, tail: history[3].info.id }
const view = { system: ["# Working memory\naccepted producer memory"], messages: [history[0], history[3]] }

test("a mid-turn native tail repairs its opener and result dependencies without changing signed blocks or archive", () => {
  const archive = structuredClone(entries)
  const prepared = ClaudeCodeTranscript.prepare({ entries, history, mapping, view })
  expect(prepared.reason).toBe("swapped")
  expect(prepared.entries[0]).toMatchObject({ subtype: "compact_boundary", parentUuid: null,
    compactMetadata: { preCompactDiscoveredTools: ["mcp__docs__lookup", "mcp__search__second"] } })
  expect(prepared.entries[1]).toMatchObject({ isCompactSummary: true, message: { role: "user", content: view.system[0] } })
  expect(prepared.entries.some((entry) => entry.uuid === "carrier-definition")).toBe(true)
  expect(prepared.entries.some((entry) => entry.uuid === "carrier-copy")).toBe(true)
  expect(prepared.entries.find((entry) => entry.uuid === "use")?.message).toEqual(entries.find((entry) => entry.uuid === "use")?.message)
  prepared.entries.slice(1).forEach((entry, index) => expect(entry.parentUuid).toBe(prepared.entries[index].uuid))
  expect(entries).toEqual(archive)
})

test("unknown versions, missing boundary mappings, and orphan tools retain full native context with a structural reason", () => {
  const unknown = entries.map((entry) => ({ ...entry, version: "unknown" }))
  const paused = ClaudeCodeTranscript.prepare({ entries: unknown, history, mapping, view })
  expect(paused.reason).toBe("unsupported-version")
  expect(paused.entries).toEqual(unknown)
  const unmapped = ClaudeCodeTranscript.prepare({ entries, history, mapping: {}, view })
  expect(unmapped.reason).toBe("unmapped-native-message")
  expect(unmapped.entries).toEqual(entries)
  const orphan = entries.filter((entry) => entry.uuid !== "use")
  const unsafe = ClaudeCodeTranscript.prepare({ entries: orphan, history, mapping, view })
  expect(unsafe.reason).toBe("missing-parent")
  expect(unsafe.entries).toEqual(orphan)
})

test("mask plus swap follows only the active SDK sibling branch and keeps the old branch archived", () => {
  const userInfo: SessionV1.User = { sessionID, id: history[2].info.id, role: "user", agent: "claude",
    model: { providerID: ProviderV2.ID.make("anthropic"), modelID: ModelV2.ID.make("claude-haiku-4-5-20251001") }, time: { created: 2 } }
  const tool: SessionV1.ToolPart = { id: PartID.ascending(), sessionID, messageID: history[3].info.id, type: "tool", tool: "read", callID: "new-call",
    state: { status: "completed", input: {}, output: "native output", title: "read", metadata: {}, time: { start: 1, end: 2 } } }
  const visible = [history[0], history[1], { info: userInfo, parts: [] }, { ...history[3], parts: [tool] }]
  const native: SessionStoreEntry[] = [
    { ...base, type: "user", uuid: "u0", parentUuid: null, message: { role: "user", content: "head" } },
    { ...base, type: "assistant", uuid: "head", parentUuid: "u0", message: { id: "head-api", role: "assistant", content: [{ type: "text", text: "head response" }] } },
    { ...base, type: "user", uuid: "u2", parentUuid: "head", message: { role: "user", content: "retained user" } },
    { ...base, type: "assistant", uuid: "old-branch", parentUuid: "u2", message: { id: "old-branch-api", role: "assistant", content: [{ type: "text", text: "OLD_BRANCH_MUST_NOT_LOAD" }] } },
    { ...base, type: "assistant", uuid: "new-branch", parentUuid: "u2", message: { id: "new-branch-api", role: "assistant", content: [{ type: "tool_use", id: "new-call", name: "Read", input: {} }] } },
    { ...base, type: "user", uuid: "new-result", parentUuid: "new-branch", message: { role: "user", content: [{ type: "tool_result", tool_use_id: "new-call", content: "native output" }] } },
  ]
  const archived = structuredClone(native)
  const prepared = ClaudeCodeTranscript.prepare({ entries: native, history: visible,
    mapping: { u0: history[0].info.id, head: history[1].info.id, u2: history[2].info.id, "new-branch": history[3].info.id },
    view: { system: ["# Working memory\nhead covered"], messages: [visible[2], { ...visible[3], parts: [{ ...tool,
      state: { status: "completed", input: {}, output: "EXACT_HOST_STUB", title: "read", metadata: {}, time: { start: 1, end: 2 } } }] }] } })
  expect(prepared.reason).toBe("swapped")
  expect(JSON.stringify(prepared.entries)).not.toContain("OLD_BRANCH_MUST_NOT_LOAD")
  expect(JSON.stringify(prepared.entries)).toContain("EXACT_HOST_STUB")
  expect(native).toEqual(archived)
})

test("v5 memory-only native swap never repairs covered calls, results, signed reasoning, or arbitrary attachments back into context", () => {
  const visible = structuredClone(history)
  visible[2].parts.push({ id: PartID.ascending(), sessionID, messageID: visible[2].info.id, type: "tool", tool: "read", callID: "t",
    state: { status: "completed", input: {}, output: "receipt", title: "read", metadata: {}, time: { start: 1, end: 2 } } })
  const native = [...entries, { ...base, type: "attachment", uuid: "old-image", parentUuid: "delta",
    attachment: { type: "image", toolUseID: "t", data: "COVERED_BINARY_NOISE" } }]
  const archived = structuredClone(native)
  const prepared = ClaudeCodeTranscript.prepare({ entries: native, history: visible, mapping,
    view: { system: view.system, messages: [], coverage: { version: 5, boundary: visible[3].info.id, coveredThrough: visible[3].info.id } } })
  expect(prepared.reason).toBe("swapped-complete")
  expect(prepared.entries[0]).toMatchObject({ subtype: "compact_boundary", parentUuid: null, logicalParentUuid: "tail" })
  expect(prepared.entries[1]).toMatchObject({ isCompactSummary: true, message: { content: view.system[0] } })
  for (const uuid of ["opener", "old", "use", "result", "tail", "old-image"])
    expect(prepared.entries.some((entry) => entry.uuid === uuid)).toBe(false)
  for (const noise of ["keep-signature", "receipt", "COVERED_BINARY_NOISE", '"tool_use"', '"tool_result"'])
    expect(JSON.stringify(prepared.entries)).not.toContain(noise)
  expect(prepared.entries.some((entry) => entry.uuid === "carrier-definition")).toBe(true)
  expect(native).toEqual(archived)
  const reverted = ClaudeCodeNative.exclude([...native, ...prepared.entries], new Set(["tail"]))
  expect(reverted.some((entry) => entry.uuid === prepared.entries[0].uuid)).toBe(false)
  expect(reverted.some((entry) => entry.uuid === prepared.entries[1].uuid)).toBe(false)
  const invalid = ClaudeCodeTranscript.prepare({ entries: native, history: visible, mapping,
    view: { system: view.system, messages: [], coverage: { version: 5, boundary: visible[3].info.id, coveredThrough: visible[2].info.id } } })
  expect(invalid.reason).toBe("invalid-complete-coverage")
  expect(invalid.entries).toEqual(native)
})

const completeHistory = structuredClone(history)
completeHistory[2].parts.push({ id: PartID.ascending(), sessionID, messageID: history[2].info.id, type: "tool", tool: "read", callID: "t",
  state: { status: "completed", input: {}, output: "receipt", title: "read", metadata: {}, time: { start: 1, end: 2 } } })
const completeView = { system: view.system, messages: [], coverage: { version: 5 as const,
  boundary: history[3].info.id, coveredThrough: history[3].info.id } }

test("unmapped ordinary native users fail closed instead of disappearing or matching an absent current user", () => {
  for (const currentUserID of [undefined, history[0].info.id]) {
    const native = [{ ...entries[0], uuid: "unmapped", message: { role: "user", content: "UNMAPPED_PROMPT" } },
      ...entries.map((entry) => entry.uuid === "opener" ? { ...entry, parentUuid: "unmapped" } : entry)]
    const prepared = ClaudeCodeTranscript.materialize({ entries: native, history: completeHistory, mapping,
      view: { ...completeView, coverage: { ...completeView.coverage, currentUserID } } })
    expect(prepared).toEqual({ kind: "fallback", reason: "unmapped-native-message", entries: native })
  }
})

test("current covered request retains its media parent closure without restoring covered tool payload", () => {
  const native = [...entries,
    { ...base, type: "attachment", uuid: "request-image", parentUuid: "opener", attachment: { type: "image", data: "CURRENT_MEDIA" } },
    { ...base, type: "attachment", uuid: "request-detail", parentUuid: "request-image", attachment: { type: "note", text: "CURRENT_DETAIL" } },
    { ...base, type: "attachment", uuid: "covered-tool", parentUuid: "request-detail", attachment: { type: "image", toolUseID: "t", data: "COVERED_TOOL" } },
    { ...base, type: "attachment", uuid: "covered-child", parentUuid: "covered-tool", attachment: { type: "note", text: "COVERED_CHILD" } },
    { ...base, type: "attachment", uuid: "covered-carrier-child", parentUuid: "delta", attachment: { type: "image", data: "COVERED_CARRIER_MEDIA" } },
  ]
  const archived = structuredClone(native)
  const prepared = ClaudeCodeTranscript.prepare({ entries: native, history: completeHistory, mapping,
    view: { ...completeView, coverage: { ...completeView.coverage, currentUserID: history[0].info.id } } })
  expect(prepared.reason).toBe("swapped-complete")
  expect(prepared.entries.slice(2).map((entry) => entry.uuid)).toEqual([
    "opener", ...discovery.map((entry) => entry.uuid), "delta", "request-image", "request-detail",
  ])
  expect(JSON.stringify(prepared.entries)).not.toContain("COVERED_TOOL")
  expect(JSON.stringify(prepared.entries)).not.toContain("COVERED_CHILD")
  expect(JSON.stringify(prepared.entries)).not.toContain("COVERED_CARRIER_MEDIA")
  expect(native).toEqual(archived)
  const memoryOnly = ClaudeCodeTranscript.prepare({ entries: native, history: completeHistory, mapping, view: completeView })
  expect(memoryOnly.reason).toBe("swapped-complete")
  for (const uuid of ["opener", "request-image", "request-detail"])
    expect(memoryOnly.entries.some((entry) => entry.uuid === uuid)).toBe(false)
})
