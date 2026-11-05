export * as ReviewSeatTools from "./seat-tools"

// The one declaration of the review seat's tools (lucy build plan K7). The seat grant, the allow-lists of both engines
// and the per-stage sets the fan-out writes into K4 scopes derive from it.

export const SEAT = "lucy"

/** The review seat's own host tools (review/tools.ts); no other caller may run them. */
export const REVIEW = ["review_analyze", "review_probe", "review_history"] as const

/** The read-only code intelligence the seat shares with the research seat. */
export const CODE = ["code_locate", "code_query", "code_search"] as const

/** Orchestra tools the seat calls on both engines. None duplicates a Claude Code builtin (claude-code/host/mcp.ts). */
export const OWN = [...REVIEW, ...CODE, "atlas_context"] as const

/** Orchestra loop ids, besides OWN. */
export const LOOP = ["read", "grep", "glob", "skill"] as const

/** Native Claude Code tool names granted to the seat, besides mcp__orchestra__<OWN>. */
export const CLAUDE = ["Read", "Grep", "Glob", "Skill"] as const

/** The governed receipt; only the lead's final turn calls it. */
export const RECORD = "maestro_record_review"

/**
 * Read policy shared by lead, lens and verifier. Verifier must spread this, not `lead`:
 * `lead` adds `atlas_context`, and a spread would hand the verifier that read.
 */
export const READ = [...LOOP, ...CODE, "review_history"] as const

/** Lead entry turn: the read policy plus read-only Atlas catalog and unit. */
export const lead = [...READ, "atlas_context"] as const

/** Lens child: the lead's set plus `review_analyze`, which a model caller can only page. */
export const lens = [...lead, "review_analyze"] as const

/** Verifier: the read policy plus `review_probe`. Not `[...lead, ...]`. */
export const verifier = [...READ, "review_probe"] as const

/** Lead final turn: the lead's set plus the receipt. The same Session may read Atlas. */
export const final = [...lead, RECORD] as const
