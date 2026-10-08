import { expect, test } from "bun:test"
import { ClaudeCodeNative } from "@/claude-code/native"
import { base, definition, discovery, parallel } from "./native-fixture"

const user = { ...base, type: "user", uuid: "u", parentUuid: null, message: { role: "user", content: "source" } }
const old = { ...base, type: "assistant", uuid: "old", parentUuid: "u", message: { id: "old-api", role: "assistant", content: [{ type: "text", text: "old branch" }] } }
const current = { ...base, type: "assistant", uuid: "new", parentUuid: "u", message: { id: "new-api", role: "assistant", content: [{ type: "text", text: "new branch" }] } }

test("active replay follows one SDK parent branch rather than append order", () => {
  const replay = ClaudeCodeNative.active([user, old, current], "new")
  expect(replay.reason).toBeUndefined()
  expect(replay.entries.map((entry) => entry.uuid)).toEqual(["u", "new"])
  expect(replay.entries[1]).toEqual(current)
  const siblings = ClaudeCodeNative.active([user, old, { ...current, message: { ...current.message, id: "old-api" } }], "new")
  expect(siblings.entries.map((entry) => entry.uuid)).toEqual(["u", "old", "new"])
})

test("UUID replay takes the last acknowledged revision, including reparenting and usage zeroing", () => {
  const revision = { ...old, parentUuid: "summary", message: { ...old.message, usage: {
    input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0,
  } } }
  const log = [user, old, current, revision]
  expect(ClaudeCodeNative.fold(log).find((entry) => entry.uuid === "old")).toEqual(revision)
  expect(log[1]).toEqual(old)
  expect(ClaudeCodeNative.fold(log, ["old"]).some((entry) => entry.uuid === "old")).toBe(false)
})

test("real deferred records restore definitions and carrier suppression, not fabricated tools arrays", () => {
  const restored = ClaudeCodeNative.discovery(discovery)
  expect(restored.reason).toBeUndefined()
  expect(restored.names).toEqual([definition.name])
  expect(restored.carriers?.has("carrier-definition")).toBe(true)
  expect(restored.carriers?.has("carrier-copy")).toBe(true)
  expect(restored.names).not.toContain("announcement")
  expect(restored.names).not.toContain("mcp__announced__only")
  const missing = discovery.filter((entry) => entry.uuid !== "carrier-definition")
  expect(ClaudeCodeNative.discovery(missing).reason).toBe("missing-definition-carrier")
  expect(ClaudeCodeNative.discovery([{ ...base, type: "attachment", uuid: "fake", parentUuid: "u",
    attachment: { type: "deferred_tools_record", tools: [definition.name] } }]).reason).toBe("unknown-deferred-tools-record")
})

test("compaction provenance follows logical parents and preserved segments when reverting", () => {
  const compact = { ...base, type: "system", subtype: "compact_boundary", uuid: "compact", parentUuid: null,
    logicalParentUuid: "old", compactMetadata: { trigger: "manual", preTokens: 100,
      preservedSegment: { headUuid: "u", tailUuid: "old", anchorUuid: "summary" } } }
  const summary = { ...user, uuid: "summary", parentUuid: "compact", isCompactSummary: true, message: { role: "user", content: "summarized reverted text" } }
  const log = [user, old, compact, summary]
  const removed = new Set(["old"])
  expect(ClaudeCodeNative.exclude(log, removed).map((entry) => entry.uuid)).toEqual(["u"])
  expect(removed.has("compact")).toBe(true)
  expect(removed.has("summary")).toBe(true)
})

test("SDK preservedMessages relink the selected tail and zero usage only in its replay copy", () => {
  const compact = { ...base, type: "system", subtype: "compact_boundary", uuid: "compact", parentUuid: null, logicalParentUuid: "old",
    compactMetadata: { trigger: "manual", preTokens: 100, preservedMessages: { anchorUuid: "summary", uuids: ["new"], allUuids: ["new"] } } }
  const summary = { ...user, uuid: "summary", parentUuid: "compact", isCompactSummary: true }
  const log = [user, old, current, compact, summary]
  const replay = ClaudeCodeNative.active(log, "new")
  expect(replay.reason).toBeUndefined()
  expect(replay.entries.map((entry) => entry.uuid)).toEqual(["compact", "summary", "new"])
  expect(replay.entries[2].parentUuid).toBe("summary")
  expect(replay.entries[2].message).toMatchObject({ usage: { input_tokens: 0, output_tokens: 0 } })
  expect(current.parentUuid).toBe("u")
})

test("pinned rAr topology recovers both parallel result siblings on the default active chain", () => {
  const replay = ClaudeCodeNative.active(parallel)
  expect(replay.reason).toBeUndefined()
  expect(replay.entries.map((entry) => entry.uuid)).toEqual(parallel.map((entry) => entry.uuid))
  expect(ClaudeCodeNative.validTools(replay.entries)).toBe(true)
  const missing = parallel.filter((entry) => entry.uuid !== "parallel-result-a")
  const unsafe = ClaudeCodeNative.active(missing)
  expect(unsafe.reason).toBe("unsafe-tool-dependencies")
  expect(unsafe.entries).toEqual(missing)
})

test("last-prompt null clear is not resurrected by older markers and preserved anchors promote after relinking", () => {
  const cleared = [user, old, { type: "last-prompt", leafUuid: "old", explicit: true }, { type: "last-prompt", leafUuid: null, explicit: true }]
  expect(ClaudeCodeNative.active(ClaudeCodeNative.fold(cleared)).entries).toEqual([])
  const compact = { ...base, type: "system", subtype: "compact_boundary", uuid: "compact", parentUuid: null,
    compactMetadata: { trigger: "manual", preTokens: 100, preservedMessages: { anchorUuid: "summary", uuids: ["new"] } } }
  const summary = { ...user, uuid: "summary", parentUuid: "compact", isCompactSummary: true, timestamp: "2026-10-08T00:00:00.000Z" }
  const replay = ClaudeCodeNative.active([user, old, current, compact, summary, { type: "last-prompt", leafUuid: "summary" }])
  expect(replay.entries.map((entry) => entry.uuid)).toEqual(["compact", "summary", "new"])
})

test("partial compaction resets obsolete head checkpoint without a replacement marker", () => {
  const compact = { ...base, type: "system", subtype: "compact_boundary", uuid: "compact", parentUuid: null,
    compactMetadata: { trigger: "manual", preTokens: 100, preservedMessages: { anchorUuid: "summary", uuids: ["new"] } } }
  const summary = { ...user, uuid: "summary", parentUuid: "compact", isCompactSummary: true }
  const replay = ClaudeCodeNative.active([user, old, current, { type: "last-prompt", leafUuid: "old", explicit: true }, compact, summary])
  expect(replay.reason).toBeUndefined()
  expect(replay.entries.map((entry) => entry.uuid)).toEqual(["compact", "summary", "new"])
})

test("host resynchronization cursor cannot resurrect pre-clear history", () => {
  const log = [user, old, { type: "last-prompt", leafUuid: null, explicit: true }]
  expect(ClaudeCodeNative.active(log, "old")).toMatchObject({ entries: [], reason: "cleared" })
  const later = { ...user, uuid: "later", message: { role: "user", content: "new admission" } }
  expect(ClaudeCodeNative.active([...log, later], "old").entries).toEqual([later])
})
