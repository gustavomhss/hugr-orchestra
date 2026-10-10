export * as ClaudeCodeTranscript from "./transcript"

import { randomUUID } from "node:crypto"
import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk"
import type { SessionV1 } from "@orchestra/core/v1/session"
import { ClaudeCodeNative } from "./native"
import type { Prepared } from "@/continuity/memory-types"

// SDK 0.3.289 package.json.claudeCodeVersion and manifest.json.version. Native shape fixtures target this CLI.
export const SUPPORTED = ["2.1.289"]
export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
export const content = (entry: SessionStoreEntry) => record(entry.message) ? entry.message.content : undefined
export const blocks = (entry: SessionStoreEntry) => {
  const value = content(entry)
  return Array.isArray(value) ? value.filter(record) : []
}
export const apiID = (entry: SessionStoreEntry) => record(entry.message) && typeof entry.message.id === "string" ? entry.message.id : undefined
export const prompt = (entry: SessionStoreEntry) => entry.type === "user" && !entry.isMeta && !entry.isCompactSummary &&
  !blocks(entry).some((block) => block.type === "tool_result")
export const main = (entry: SessionStoreEntry) => !entry.isSidechain
export const chain = (entry: SessionStoreEntry) => main(entry) && typeof entry.uuid === "string" &&
  ["user", "assistant", "attachment", "system"].includes(entry.type)

export function version(entries: SessionStoreEntry[]) {
  const versions = [...new Set(entries.filter(chain).map((entry) => entry.version))]
  return versions.length === 1 && typeof versions[0] === "string" ? versions[0] : undefined
}

export type Materialized = { kind: "ready" | "fallback"; entries: SessionStoreEntry[]; reason: string }

/** Only successful supported rewrites are ready; every valid-but-unsupported shape falls back authoritatively. */
export function materialize(input: Parameters<typeof prepare>[0]): Materialized {
  const value = prepare(input)
  return ["native", "masked", "swapped", "swapped-complete"].includes(value.reason)
    ? { kind: "ready", ...value } : { kind: "fallback", entries: ClaudeCodeNative.fold(input.entries), reason: value.reason }
}

/** Return structural failure instead of guessing which transcript bytes may be dropped. */
export function prepare(input: {
  entries: SessionStoreEntry[]
  mapping: Record<string, string>
  history: SessionV1.WithParts[]
  view: Prepared
}): { entries: SessionStoreEntry[]; reason: string } {
  if (!SUPPORTED.includes(version(input.entries) ?? "")) return { entries: input.entries, reason: "unsupported-version" }
  const active = ClaudeCodeNative.active(ClaudeCodeNative.fold(input.entries))
  if (active.reason) return { entries: input.entries, reason: active.reason }
  const entries = active.entries
  if (input.entries.filter(chain).some((entry) => entry.parentUuid !== null && typeof entry.parentUuid !== "string" ||
    ["user", "assistant"].includes(entry.type) && (!record(entry.message) ||
      typeof entry.message.content !== "string" && (!Array.isArray(entry.message.content) || !entry.message.content.every(record)))))
    return { entries: input.entries, reason: "unknown-native-shape" }
  const mapped = (entry: SessionStoreEntry) => input.mapping[entry.uuid ?? ""] ?? input.mapping[apiID(entry) ?? ""]
  if (entries.some((entry) => main(entry) && (entry.type === "assistant" || prompt(entry)) &&
    (!mapped(entry) || !input.history.some((message) => message.info.id === mapped(entry)))))
    return { entries: input.entries, reason: "unmapped-native-message" }
  if (input.view.coverage?.version === 5) return complete(input, entries, mapped)
  const originals = new Map(input.history.flatMap((message) => message.parts.flatMap((part) =>
    part.type === "tool" && part.state.status === "completed" ? [[part.id, part] as const] : [])))
  const masks = new Map(input.view.messages.flatMap((message) => message.parts.flatMap((part) => {
    const original = originals.get(part.id)
    return part.type === "tool" && part.state.status === "completed" && original?.state.status === "completed" &&
      (part.state.output !== original.state.output || (part.state.attachments?.length ?? 0) !== (original.state.attachments?.length ?? 0))
      ? [[part.callID, part.state.output] as const] : []
  })))
  const mask = (entries: SessionStoreEntry[]) => entries.flatMap((entry) => {
    // Native attachments identify their producing call. Only that call's attachments are removed.
    const attachment = record(entry.attachment) ? entry.attachment : undefined
    const call = attachment?.toolUseID ?? attachment?.tool_use_id ?? entry.toolUseID
    if (entry.type === "attachment" && typeof call === "string" && masks.has(call)) return []
    if (entry.type !== "user" || !blocks(entry).some((block) => block.type === "tool_result" && masks.has(String(block.tool_use_id))))
      return [entry]
    const value = content(entry)
    return [{ ...entry, message: { ...(record(entry.message) ? entry.message : {}), content: Array.isArray(value) ? value.map((block) =>
      record(block) && block.type === "tool_result" && masks.has(String(block.tool_use_id))
        ? { ...block, content: masks.get(String(block.tool_use_id)) } : block) : value } }]
  })
  if (!input.view.system.length) {
    const prepared = masks.size ? rechain(mask(entries)) : entries
    return ClaudeCodeNative.validTools(prepared) ? { entries: prepared, reason: masks.size ? "masked" : "native" }
      : { entries: input.entries, reason: "unsafe-tool-dependencies" }
  }
  const ids = new Set(input.view.messages.map((message) => message.info.id))
  const start = input.history.findIndex((message, index) => ids.has(message.info.id) &&
    input.history.slice(index).every((message) => ids.has(message.info.id)))
  const tailID = input.history[start]?.info.id
  const boundaryID = input.history.findLast((message) => message.info.role === "assistant")?.info.id
  const native = entries.filter(chain)
  let cut = native.findIndex((entry) => mapped(entry) === tailID)
  if (!tailID || cut < 0 || !native.some((entry) => mapped(entry) === boundaryID))
    return { entries: input.entries, reason: "unmapped-boundary-or-tail" }
  // Repair results whose tool_use falls before a mid-turn cut, including every block of that API message.
  for (let round = 0; round < native.length; round++) {
    const results = new Set(native.slice(cut).flatMap((entry) => blocks(entry).flatMap((block) =>
      block.type === "tool_result" ? [String(block.tool_use_id)] : [])))
    const dependency = native.findIndex((entry) => blocks(entry).some((block) => block.type === "tool_use" && results.has(String(block.id))))
    const id = apiID(native[cut])
    const firstBlock = id ? native.findIndex((entry) => apiID(entry) === id) : cut
    const next = Math.min(cut, dependency < 0 ? cut : dependency, firstBlock < 0 ? cut : firstBlock)
    if (next === cut) break
    cut = next
  }
  const openerID = input.view.messages.find((message) => message.info.role === "user")?.info.id
  const opener = native.find((entry) => prompt(entry) && mapped(entry) === openerID)
  const tail = mask(native.slice(cut))
  if (!tail.length || !opener) return { entries: input.entries, reason: "unmapped-opener" }
  const repaired = tail.some((entry) => entry.uuid === opener.uuid) ? tail : [opener, ...tail]
  if (!ClaudeCodeNative.validTools(repaired)) return { entries: input.entries, reason: "unsafe-tool-dependencies" }
  const discovered = ClaudeCodeNative.discovery(native)
  if (discovered.reason || !discovered.carriers || !discovered.names)
    return { entries: input.entries, reason: discovered.reason ?? "unknown-deferred-tools-shape" }
  const base = Object.fromEntries(["cwd", "sessionId", "version", "gitBranch", "entrypoint", "userType"].flatMap((key) =>
    repaired[0][key] === undefined ? [] : [[key, repaired[0][key]]]))
  const boundary: SessionStoreEntry = { ...base, type: "system", subtype: "compact_boundary", uuid: randomUUID(), parentUuid: null,
    logicalParentUuid: repaired[0].parentUuid ?? null, timestamp: new Date().toISOString(), isSidechain: false,
    content: "Conversation compacted", isMeta: false, level: "info",
    compactMetadata: { trigger: "manual", preTokens: 0, preCompactDiscoveredTools: discovered.names } }
  const summary: SessionStoreEntry = { ...base, type: "user", uuid: randomUUID(), parentUuid: boundary.uuid,
    timestamp: boundary.timestamp, isSidechain: false, isCompactSummary: true, isVisibleInTranscriptOnly: true,
    message: { role: "user", content: input.view.system.join("\n\n") } }
  const carriers = native.filter((entry) => entry.uuid && discovered.carriers.has(entry.uuid) && !repaired.some((row) => row.uuid === entry.uuid))
  return { entries: [boundary, summary, ...rechain([...carriers, ...repaired], summary.uuid)], reason: "swapped" }
}

function complete(input: { entries: SessionStoreEntry[]; history: SessionV1.WithParts[]; view: Prepared }, entries: SessionStoreEntry[],
  mapped: (entry: SessionStoreEntry) => string | undefined): { entries: SessionStoreEntry[]; reason: string } {
  const coverage = input.view.coverage
  if (!coverage || coverage.coveredThrough !== coverage.boundary || !input.view.system.length) return { entries: input.entries, reason: "invalid-complete-coverage" }
  const boundary = input.history.findIndex((message) => message.info.id === coverage.boundary)
  const covered = entries.findLast((entry) => entry.type === "assistant" && mapped(entry) === coverage.boundary)
  if (boundary < 0 || !covered?.uuid)
    return { entries: input.entries, reason: "unmapped-complete-boundary" }
  const calls = new Map(input.history.flatMap((message, index) => message.parts.flatMap((part) => part.type === "tool" ? [[part.callID, index] as const] : [])))
  if (entries.some((entry) => blocks(entry).some((block) => block.type === "tool_result" && !calls.has(String(block.tool_use_id)))))
    return { entries: input.entries, reason: "unmapped-complete-tool-result" }
  const discovery = ClaudeCodeNative.discovery(entries)
  if (discovery.reason || !discovery.carriers || !discovery.names) return { entries: input.entries, reason: discovery.reason ?? "unknown-complete-carriers" }
  const ids = new Map<string, number>(input.history.map((message, index) => [message.info.id, index]))
  const kept = entries.filter((entry) => {
    if (entry.uuid && discovery.carriers.has(entry.uuid)) return true
    if (record(entry.attachment) && ["prompt_snapshot", "prompt_render_point"].includes(String(entry.attachment.type))) return true
    const id = mapped(entry)
    if (entry.type === "user" && prompt(entry) && coverage.currentUserID !== undefined && id === coverage.currentUserID) return true
    if (entry.type === "assistant" || entry.type === "user") {
      const result = blocks(entry).filter((block) => block.type === "tool_result")
      if (result.length) return result.every((block) => (calls.get(String(block.tool_use_id)) ?? -1) > boundary)
      return id !== undefined && (ids.get(id) ?? -1) > boundary
    }
    if (entry.type === "attachment") {
      const data = record(entry.attachment) ? entry.attachment : {}
      const call = data.toolUseID ?? data.tool_use_id ?? entry.toolUseID
      if (typeof call === "string") return (calls.get(call) ?? -1) > boundary
    }
    // Arbitrary covered attachments/system noise never reappear through a dependency-repair tail.
    return false
  })
  // Retained prompts own their media/reminder descendants, including a current prompt inside coverage.
  // Call ownership wins over parent topology: covered tool payload must never return through this closure.
  const retained = new Set(kept.flatMap((entry) => {
    if (typeof entry.uuid !== "string") return []
    if (entry.type === "user" || entry.type === "assistant") return [entry.uuid]
    const data = record(entry.attachment) ? entry.attachment : {}
    const call = data.toolUseID ?? data.tool_use_id ?? entry.toolUseID
    return typeof call === "string" && (calls.get(call) ?? -1) > boundary ? [entry.uuid] : []
  }))
  for (let round = 0; round < entries.length; round++) {
    const before = retained.size
    for (const entry of entries) {
      if (entry.type !== "attachment" || typeof entry.uuid !== "string" || typeof entry.parentUuid !== "string" || !retained.has(entry.parentUuid)) continue
      const data = record(entry.attachment) ? entry.attachment : {}
      const call = data.toolUseID ?? data.tool_use_id ?? entry.toolUseID
      if (call !== undefined && (typeof call !== "string" || (calls.get(call) ?? -1) <= boundary)) continue
      retained.add(entry.uuid)
    }
    if (retained.size === before) break
  }
  const replay = entries.filter((entry) => kept.includes(entry) || typeof entry.uuid === "string" && retained.has(entry.uuid))
  if (!ClaudeCodeNative.validTools(replay)) return { entries: input.entries, reason: "unsafe-complete-postboundary-dependencies" }
  const base = Object.fromEntries(["cwd", "sessionId", "version", "gitBranch", "entrypoint", "userType"].flatMap((key) =>
    entries.at(-1)?.[key] === undefined ? [] : [[key, entries.at(-1)?.[key]]]))
  const marker: SessionStoreEntry = { ...base, type: "system", subtype: "compact_boundary", uuid: randomUUID(), parentUuid: null,
    logicalParentUuid: covered.uuid,
    timestamp: new Date().toISOString(), isSidechain: false, level: "info", content: "Conversation compacted",
    compactMetadata: { trigger: "manual", preTokens: 0, preCompactDiscoveredTools: discovery.names } }
  const summary: SessionStoreEntry = { ...base, type: "user", uuid: randomUUID(), parentUuid: marker.uuid, timestamp: marker.timestamp,
    isSidechain: false, isCompactSummary: true, isVisibleInTranscriptOnly: true, message: { role: "user", content: input.view.system.join("\n\n") } }
  return { entries: [marker, summary, ...rechain(replay, summary.uuid)], reason: "swapped-complete" }
}

function rechain(entries: SessionStoreEntry[], initial?: string) {
  let parent = initial
  return entries.map((entry) => {
    if (!chain(entry)) return entry
    const next = { ...entry, parentUuid: parent ?? null }
    parent = entry.uuid
    return next
  })
}
