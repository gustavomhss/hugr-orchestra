import type { SessionStoreEntry } from "@anthropic-ai/claude-agent-sdk"

// Source-derived, not a live-account transcript. CLI 2.1.289 embedded in SDK 0.3.289.
// Binary manifest commit 736d26eef42d1e3017e07e6d5bd0970b8c3a068f.
// Embedded source byte offsets: 194356096 ($En/tJ record schema/replay), 193162303 (N1e sameAs resolution),
// 195769942 (S9 discovered names), 197655959 (xFt/Jpr delta construction), 201703590 (compact metadata),
// 194203001 module functions C_e/Zxr (preserved usage zeroing/reparenting), spt (one parent-chain replay).
// The same embedded module's rAr recovers tool_result sibling users by parent/sourceToolAssistantUUID;
// Zxr relinks preserved anchor/tail before spt. JSONL last-prompt carries leafUuid and explicit, including null clear.
// UUIDs/content/names are scenario data; field shapes and restoration rules come from those functions.
export const base = { version: "2.1.289", sessionId: "native-session", isSidechain: false, cwd: "/fixture",
  userType: "external", timestamp: "2026-10-07T00:00:00.000Z" }
export const definition = { name: "mcp__docs__lookup", description: "Look up documents",
  input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, defer_loading: true }
export const discovery: SessionStoreEntry[] = [
  { ...base, type: "attachment", uuid: "carrier-definition", parentUuid: "old", attachment: {
    type: "deferred_tools_delta", addedNames: [definition.name], addedLines: ["- mcp__docs__lookup: Look up documents"], removedNames: [],
    surfacedNames: [definition.name], surfacedDefinitions: [{ name: definition.name, listing: "- mcp__docs__lookup: Look up documents", definition }],
  } },
  { ...base, type: "attachment", uuid: "carrier-copy", parentUuid: "carrier-definition", attachment: {
    type: "deferred_tools_delta", surfacedNames: [definition.name], addedNames: [], removedNames: [],
    surfacedDefinitions: [{ name: definition.name, listing: "- mcp__docs__lookup: Look up documents", sameAs: "carrier-definition" }],
  } },
  { ...base, type: "attachment", uuid: "announcement", parentUuid: "carrier-copy", attachment: {
    type: "deferred_tools_delta", surfacedNames: ["mcp__announced__only"], addedNames: ["mcp__announced__only"], removedNames: [],
  } },
  { ...base, type: "attachment", uuid: "record", parentUuid: "announcement", attachment: {
    type: "deferred_tools_record", entries: [definition], nameOnlyAnnouncements: ["announcement"], strippedReferences: ["toolu_reference:mcp__docs__lookup"],
    toolInputCopies: [{ id: "toolu_reference", copy: "wire" }],
  } },
]
export const promptSnapshot: SessionStoreEntry = { ...base, type: "attachment", uuid: "prompt-snapshot", parentUuid: "u", attachment: {
  type: "prompt_snapshot", systemPrompt: ["Scenario coding system prompt"], tools: [{ name: definition.name,
    description: definition.description, schema: definition.input_schema, server: "docs" }], contextRendering: "announced",
} }
export const parallel: SessionStoreEntry[] = [
  { ...base, type: "user", uuid: "parallel-user", parentUuid: null, message: { role: "user", content: "parallel tools" } },
  { ...base, type: "assistant", uuid: "parallel-assistant", parentUuid: "parallel-user", message: { id: "parallel-api", role: "assistant", content: [
    { type: "tool_use", id: "parallel-a", name: "Read", input: { file_path: "a" } },
    { type: "tool_use", id: "parallel-b", name: "Read", input: { file_path: "b" } },
  ] } },
  { ...base, type: "user", uuid: "parallel-result-a", parentUuid: "parallel-assistant", sourceToolAssistantUUID: "parallel-assistant", message: {
    role: "user", content: [{ type: "tool_result", tool_use_id: "parallel-a", content: "A complete" }],
  } },
  { ...base, type: "user", uuid: "parallel-result-b", parentUuid: "parallel-assistant", sourceToolAssistantUUID: "parallel-assistant", message: {
    role: "user", content: [{ type: "tool_result", tool_use_id: "parallel-b", content: "B complete" }],
  } },
]
