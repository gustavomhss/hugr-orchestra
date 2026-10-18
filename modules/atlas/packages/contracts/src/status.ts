// @atlas/contracts — status.ts
//
// The CANONICAL grounding state vocabulary. Freshness is the 3-state oracle (NOT the knowledge
// 2-state variant); Status is the invariant verdict.

/** Grounding freshness — the CANONICAL 3-state. STALE = advisory drift: non-blocking,
 *  served-with-flag (GROUND-13). (atlas-grounding line 48) */
export type Freshness = "FRESH" | "DRIFTED" | "STALE"

/** An invariant's verdict. (atlas-grounding line 49) */
export type Status = "HOLDS" | "BROKEN" | "NA" | "advisory"
