export * as ResearchSeatTools from "./seat-tools"

// The one declaration of the discovery seat's tools (J1.1). Allow-lists, capture lists and retention lists derive from
// it. A new tool enters OWN only in the PR that qualifies it (JD-2): code_locate, code_query, code_search, probe_run and
// inquiry are absent until then. RETAINED already names them; it only applies once a tool runs.

export const SEAT = "jimmy"

/** Orchestra tools the seat calls on both engines. None duplicates a Claude Code builtin (claude-code/host/mcp.ts). */
export const OWN = [
  "research_capture", "research_view", "research_record",
  "atlas_context", "atlas_memory_recall", "atlas_memory_emit",
] as const

/** Orchestra loop ids, besides OWN. */
export const LOOP = ["read", "grep", "glob", "websearch", "skill", "context_recall", "context_compact"] as const

/** Native Claude Code tool names granted to the subagent, besides mcp__orchestra__<OWN>. */
export const CLAUDE = ["Read", "Grep", "Glob", "WebSearch", "Skill"] as const

/** Outputs retained as evidence. */
export const RETAINED = ["read", "grep", "glob", "websearch", "code_locate", "code_query", "code_search", "probe_run", "atlas_context"] as const

/** Claude Code builtins whose output PostToolUse captures. */
export const CAPTURED = ["Read", "Grep", "Glob", "WebSearch"] as const
