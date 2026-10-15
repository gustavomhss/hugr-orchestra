// @atlas/knowledge — src/read/anchor-match.ts  (the airtight structural + exact-claim matcher legs)
//
// The two pure, total, LLM-free matcher primitives shared by the read-side coverage relation
// (`subsumes.ts`): the segment-wise structural-prefix test on `::`-split anchor paths, and the EXACT
// NFC+trim claim-equality metric. Neutral home (read/, beside their only consumer) — NOT under write/,
// so the read side never reaches into a write-side module. Both are byte-identical to their former
// home (the retired KNOW-15h near-dup probe, whose always-merge leg died with the dedup redesign, DP-1).

/** EXACT normalized claim similarity — the AIRTIGHT leg. Returns `1` iff the claims are byte-identical
 *  after NFC+trim, else `0`. The near-SYNONYM metric (`0 < sim < 1`) is an OPEN-DEFINE threshold τ
 *  (residue SCN-KNOW-15h-2) — deliberately NOT invented here. */
export function claimSimilarity(a: string, b: string): 0 | 1 {
  return a.normalize("NFC").trim() === b.normalize("NFC").trim() ? 1 : 0
}

/** `true` iff `short`'s segments are a leading run of `long`'s — the segment-wise structural-prefix
 *  test on `::`-split anchor paths. The degenerate equal case (`short === long`) is a prefix. Total. */
export function isPrefix(short: readonly string[], long: readonly string[]): boolean {
  if (short.length > long.length) return false
  for (let i = 0; i < short.length; i++) if (short[i] !== long[i]) return false
  return true
}
