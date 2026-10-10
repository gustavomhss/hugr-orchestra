export * as ClaudeCodeNative from "./native"

import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk"

export const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
export const blocks = (entry: SessionStoreEntry) => record(entry.message) && Array.isArray(entry.message.content)
  ? entry.message.content.filter(record) : []
export const apiID = (entry: SessionStoreEntry) => record(entry.message) && typeof entry.message.id === "string" ? entry.message.id : undefined
export const conversational = (entry: SessionStoreEntry) => !entry.isSidechain && ["user", "assistant"].includes(entry.type)
export const linked = (entry: SessionStoreEntry) => !entry.isSidechain && typeof entry.uuid === "string" &&
  ["user", "assistant", "attachment", "system"].includes(entry.type)

/** CLI 2.1.289 darwin-x64: LEn/N1/KGn/Fan at byte 194352667; snapshot contains real system/tools. */
export function overhead(entries: SessionStoreEntry[]) {
  const at = entries.findLastIndex((entry) => record(entry.attachment) && entry.attachment.type === "prompt_snapshot")
  if (at < 0 || entries.slice(at + 1).some((entry) => record(entry.attachment) && entry.attachment.type === "prompt_render_point")) return undefined
  const snapshot = entries[at].attachment
  return record(snapshot) && Array.isArray(snapshot.systemPrompt) && snapshot.systemPrompt.every((item) => typeof item === "string") &&
    (snapshot.tools === undefined || Array.isArray(snapshot.tools) && snapshot.tools.every((tool) => record(tool) &&
      typeof tool.name === "string" && typeof tool.description === "string" &&
      (tool.schema === undefined || record(tool.schema)) && (tool.server === undefined || typeof tool.server === "string"))) ? snapshot : undefined
}

/** CLI 2.1.289 JSONL replay is UUID last-write-wins. The append log itself remains immutable. */
export function fold(entries: SessionStoreEntry[], retracted: readonly string[] = []) {
  const last = new Map(entries.flatMap((entry, index) => entry.uuid ? [[entry.uuid, index] as const] : []))
  return entries.filter((entry, index) => !entry.uuid || !retracted.includes(entry.uuid) && last.get(entry.uuid) === index)
}

/** Dependencies include compaction provenance, not just the restarted parent chain. */
export function dependencies(entry: SessionStoreEntry, rows: readonly SessionStoreEntry[]) {
  const result = [entry.parentUuid, entry.logicalParentUuid, entry.sourceToolAssistantUUID].filter((id): id is string => typeof id === "string")
  if (record(entry.attachment) && entry.attachment.type === "deferred_tools_delta" && Array.isArray(entry.attachment.surfacedDefinitions))
    result.push(...entry.attachment.surfacedDefinitions.flatMap((item) => record(item) && typeof item.sameAs === "string" ? [item.sameAs] : []))
  if (!record(entry.compactMetadata)) return result
  const list = entry.compactMetadata.preservedMessages
  if (record(list)) {
    if (typeof list.anchorUuid === "string") result.push(list.anchorUuid)
    for (const ids of [list.uuids, list.allUuids])
      if (Array.isArray(ids)) result.push(...ids.filter((id): id is string => typeof id === "string"))
  }
  const segment = entry.compactMetadata.preservedSegment
  if (record(segment)) {
    const seen = new Set<string>()
    let current = rows.find((row) => row.uuid === segment.tailUuid)
    while (current?.uuid && !seen.has(current.uuid)) {
      seen.add(current.uuid)
      result.push(current.uuid)
      if (current.uuid === segment.headUuid) break
      current = rows.find((row) => row.uuid === current?.parentUuid)
    }
    for (const id of [segment.anchorUuid, segment.headUuid, segment.tailUuid])
      if (typeof id === "string") result.push(id)
  }
  return result
}

export function exclude(entries: SessionStoreEntry[], removed: Set<string>) {
  for (let round = 0; round <= entries.length; round++) {
    const before = removed.size
    for (const entry of entries)
      if (entry.uuid && dependencies(entry, entries).some((id) => removed.has(id))) removed.add(entry.uuid)
    if (removed.size === before) break
  }
  return entries.filter((entry) => (!entry.uuid || !removed.has(entry.uuid)) &&
    !(typeof entry.leafUuid === "string" && removed.has(entry.leafUuid)))
}

/** Source: pinned CLI spt/rAr/Zxr. Walk one parent chain, retain full API siblings and attached metadata. */
export function active(entries: SessionStoreEntry[], selected?: string): { entries: SessionStoreEntry[]; reason?: string; leaf?: string } {
  const clear = entries.findLastIndex((entry) => entry.type === "last-prompt" && entry.leafUuid === null && entry.explicit === true)
  if (clear >= 0) {
    entries = entries.slice(clear + 1)
    // A host-derived resynchronization cursor cannot override an authoritative native clear.
    if (!entries.some((entry) => entry.uuid === selected)) selected = undefined
    if (!entries.some(conversational)) return { entries: [], reason: "cleared" }
  }
  if (entries.some((entry) => ["tombstone", "message-deletion"].includes(entry.type)))
    return { entries, reason: "unsupported-native-suppression" }
  const rows = new Map(entries.filter(linked).map((entry) => [entry.uuid as string, entry]))
  const boundary = entries.findLast((entry) => entry.type === "system" && entry.subtype === "compact_boundary" && !entry.isSidechain)
  let preserved: { anchor: string; tail: string } | undefined
  if (boundary && record(boundary.compactMetadata)) {
    const list = boundary.compactMetadata.preservedMessages
    const segment = boundary.compactMetadata.preservedSegment
    const ids = record(list) && Array.isArray(list.uuids) && list.uuids.every((id) => typeof id === "string") ? list.uuids : undefined
    const kept = ids ?? (record(segment) ? segmentIds(segment, rows) : undefined)
    const anchor = record(list) ? list.anchorUuid : record(segment) ? segment.anchorUuid : undefined
    if ((list || segment) && (!kept || typeof anchor !== "string" || !rows.has(anchor) || kept.some((id) => !rows.has(id))))
      return { entries, reason: "unknown-preserved-segment" }
    if (kept && typeof anchor === "string") {
      let parent = anchor
      for (const id of kept) {
        const row = rows.get(id)
        if (!row) continue
        rows.set(id, { ...row, parentUuid: parent, ...(row.type === "assistant" && record(row.message) ? { message: { ...row.message,
          usage: { ...(record(row.message.usage) ? row.message.usage : {}), input_tokens: 0, output_tokens: 0,
            cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } } : {}) })
        parent = id
      }
      for (const [id, row] of rows)
        if (row.parentUuid === anchor && id !== kept[0]) rows.set(id, { ...row, parentUuid: parent })
      if (kept.length) preserved = { anchor, tail: parent }
    }
  }
  const boundaryIndex = boundary ? entries.indexOf(boundary) : -1
  // Pinned reader resets last-prompt state at a compact boundary; archived head checkpoints are obsolete.
  const marker = entries.slice(boundaryIndex + 1).findLast((entry) => entry.type === "last-prompt")
  if (typeof marker?.leafUuid === "string" && !rows.has(marker.leafUuid))
    return { entries, reason: "missing-active-leaf", leaf: marker.leafUuid }
  const candidates = entries.filter(conversational)
  const latest = candidates.at(-1)
  const checkpoint = typeof marker?.leafUuid === "string" && rows.has(marker.leafUuid) ? marker.leafUuid : undefined
  const inferred = checkpoint ?? latest?.uuid
  const leaf = selected ?? (preserved && inferred === preserved.anchor && marker?.explicit !== true ? preserved.tail : inferred)
  if (!leaf) return { entries: entries.filter((entry) => !linked(entry)), leaf }
  const path: SessionStoreEntry[] = []
  const included = new Set<string>()
  let current = rows.get(leaf)
  while (current?.uuid) {
    if (included.has(current.uuid)) return { entries, reason: "parent-cycle", leaf }
    included.add(current.uuid)
    path.push(current)
    if (current.parentUuid === null || current.parentUuid === undefined) break
    if (typeof current.parentUuid !== "string" || !rows.has(current.parentUuid)) return { entries, reason: "missing-parent", leaf }
    current = rows.get(current.parentUuid)
  }
  if (!current) return { entries, reason: "missing-active-leaf", leaf }
  path.reverse()
  const expanded = path.flatMap((entry) => {
    const api = apiID(entry)
    if (!api) return [entry]
    const siblings = entries.filter((row) => row.type === "assistant" && !row.isSidechain && apiID(row) === api &&
      (row.parentUuid === entry.parentUuid || included.has(String(row.parentUuid))))
    siblings.forEach((row) => { if (row.uuid) included.add(row.uuid) })
    return siblings.length ? siblings.map((row) => rows.get(row.uuid ?? "") ?? row) : [entry]
  }).filter((entry, index, all) => all.findIndex((row) => row.uuid === entry.uuid) === index)
  // Pinned rAr: parallel tool-result users are siblings, often owned through sourceToolAssistantUUID.
  const owners = new Set(expanded.filter((row) => row.type === "assistant").flatMap((row) => [row.uuid, apiID(row)].filter((id): id is string => typeof id === "string")))
  const calls = new Set(expanded.flatMap((row) => blocks(row).flatMap((block) => block.type === "tool_use" ? [String(block.id)] : [])))
  const results = entries.filter((row) => row.type === "user" && !row.isSidechain && blocks(row).some((block) => block.type === "tool_result" && calls.has(String(block.tool_use_id))) &&
    (owners.has(String(row.parentUuid)) || owners.has(String(row.sourceToolAssistantUUID))))
  const completed = expanded.flatMap((row, index) => {
    if (row.type !== "assistant") return [row]
    const api = apiID(row)
    if (api && expanded.slice(index + 1).some((other) => apiID(other) === api)) return [row]
    const ids = new Set(expanded.filter((other) => other.type === "assistant" && apiID(other) === api).flatMap((other) =>
      blocks(other).flatMap((block) => block.type === "tool_use" ? [String(block.id)] : [])))
    return [row, ...results.filter((result) => blocks(result).some((block) => block.type === "tool_result" && ids.has(String(block.tool_use_id))))]
  }).filter((row, index, all) => all.findIndex((item) => item.uuid === row.uuid) === index)
  completed.forEach((row) => { if (row.uuid) included.add(row.uuid) })
  // Attachments are not competing conversational leaves; they follow their owning chain nodes.
  for (let round = 0; round < rows.size; round++) {
    const before = included.size
    for (const row of rows.values()) if (row.type !== "user" && row.type !== "assistant" && row.uuid &&
      typeof row.parentUuid === "string" && included.has(row.parentUuid)) included.add(row.uuid)
    for (const id of [...included]) {
      const row = rows.get(id)
      if (!row || !record(row.attachment) || row.attachment.type !== "deferred_tools_delta" || !Array.isArray(row.attachment.surfacedDefinitions)) continue
      for (const definition of row.attachment.surfacedDefinitions) if (record(definition) && typeof definition.sameAs === "string") {
        const carrier = rows.get(definition.sameAs)
        if (!carrier || carrier.type !== "attachment") return { entries, reason: "missing-definition-carrier", leaf }
        included.add(definition.sameAs)
      }
    }
    if (included.size === before) break
  }
  const attached = entries.filter((row) => row.uuid && included.has(row.uuid) && !completed.some((item) => item.uuid === row.uuid))
  const replay = [...completed, ...attached, ...entries.filter((entry) => !linked(entry) && entry.type !== "last-prompt")]
  if (!validTools(replay)) return { entries, reason: "unsafe-tool-dependencies", leaf }
  return { entries: replay, leaf }
}

export function validTools(entries: SessionStoreEntry[]) {
  const calls = new Set<string>()
  const results = new Set<string>()
  for (const entry of entries) for (const block of blocks(entry)) {
    if (block.type === "tool_use") {
      if (typeof block.id !== "string" || !block.id.length || calls.has(block.id)) return false
      calls.add(block.id)
    }
    if (block.type !== "tool_result") continue
    const id = block.tool_use_id
    if (typeof id !== "string" || !id.length) return false
    if (!calls.has(id) || results.has(id)) return false
    results.add(id)
  }
  return [...calls].every((id) => results.has(id))
}

function segmentIds(segment: Record<string, unknown>, rows: Map<string, SessionStoreEntry>) {
  const result: string[] = []
  let current = rows.get(String(segment.tailUuid))
  while (current?.uuid && !result.includes(current.uuid)) {
    result.push(current.uuid)
    if (current.uuid === segment.headUuid) return result.reverse()
    current = rows.get(String(current.parentUuid))
  }
}

/** Source: tJ, N1e, S9 in embedded CLI 2.1.289. Announcement strings identify carriers, not tools. */
export function discovery(entries: SessionStoreEntry[]) {
  const announcements = new Set<string>()
  const carriers = new Set<string>()
  const definitions = new Map<string, Set<string>>()
  const names = new Set<string>()
  const strings = (value: unknown) => value === undefined || Array.isArray(value) && value.every((item) => typeof item === "string")
  for (const entry of entries) {
    const data = record(entry.attachment) ? entry.attachment : undefined
    if (data?.type !== "deferred_tools_record") continue
    if (!Array.isArray(data.entries) || !data.entries.every((item) => record(item) && typeof item.name === "string") ||
      !strings(data.nameOnlyAnnouncements) || !strings(data.strippedReferences) ||
      data.toolInputCopies !== undefined && (!Array.isArray(data.toolInputCopies) || !data.toolInputCopies.every((item) =>
        record(item) && typeof item.id === "string" && ["wire", "displayed"].includes(String(item.copy)))))
      return { reason: "unknown-deferred-tools-record" }
    if (entry.uuid) carriers.add(entry.uuid)
    if (Array.isArray(data.nameOnlyAnnouncements)) data.nameOnlyAnnouncements.forEach((id) => announcements.add(id))
  }
  for (const entry of entries) {
    if (record(entry.compactMetadata) && entry.compactMetadata.preCompactDiscoveredTools !== undefined) {
      const previous = entry.compactMetadata.preCompactDiscoveredTools
      if (!strings(previous) || !Array.isArray(previous)) return { reason: "unknown-discovered-tools" }
      previous.forEach((name) => names.add(name))
    }
    const data = record(entry.attachment) ? entry.attachment : undefined
    if (data?.type === "deferred_tools_delta") {
      if (!strings(data.surfacedNames) || !strings(data.addedNames) || !strings(data.removedNames) ||
        data.surfacedDefinitions !== undefined && !Array.isArray(data.surfacedDefinitions)) return { reason: "unknown-deferred-tools-delta" }
      if (entry.uuid) carriers.add(entry.uuid)
      const defined = new Set<string>()
      for (const item of Array.isArray(data.surfacedDefinitions) ? data.surfacedDefinitions : []) {
        if (!record(item) || typeof item.name !== "string" || typeof item.listing !== "string") return { reason: "unknown-surfaced-definition" }
        if (record(item.definition)) defined.add(item.name)
        else if (typeof item.sameAs === "string" && definitions.get(item.sameAs)?.has(item.name)) {
          defined.add(item.name)
          carriers.add(item.sameAs)
        } else return { reason: "missing-definition-carrier" }
      }
      if (entry.uuid && !announcements.has(entry.uuid)) {
        definitions.set(entry.uuid, defined)
        if (Array.isArray(data.surfacedNames)) data.surfacedNames.forEach((name) => names.add(name))
      }
    }
    for (const block of blocks(entry)) if (block.type === "tool_result" && Array.isArray(block.content))
      for (const item of block.content) if (record(item) && item.type === "tool_reference" && typeof item.tool_name === "string") names.add(item.tool_name)
  }
  return { names: [...names].sort(), carriers }
}
