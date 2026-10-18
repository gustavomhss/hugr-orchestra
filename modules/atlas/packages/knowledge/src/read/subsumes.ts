// @atlas/knowledge — src/read/subsumes.ts  (WP-DEDUP-2 · DP-2 · derive `subsumes` on read)
//
// The READ-side coverage relation. `subsumes` is NOT stored (DP-2, dedup-identity.md): `primaryAnchorId`
// is pure and every input already lives in the projection, so `subsumes` is a total pure derivation over
// `StoreProjection` — ZERO new persisted state, never a write-time merge (that debt died with DP-1). This
// is distinct from the write-side near-dup probe: it emits a non-destructive `broader ⊃ narrower` edge,
// never a fold. `broader` = the ANCESTOR (fewer `::`-segments); the direction is inherent, so each valid
// pair is emitted exactly once. Pure + total — no throw, no clock, no LLM (A1).
//
// Reuses the airtight structural + exact-claim legs (DRY): `isPrefix` (segment-wise structural prefix)
// and `claimSimilarity` (NFC+trim exact equality) — the neutral co-located `anchor-match` matcher legs.

import { asNodeKey } from "@atlas/kernel"
import type { NodeKey } from "@atlas/contracts"
import type { CurrentNode, StoreProjection } from "../write/router.js"
import { claimSimilarity, isPrefix } from "./anchor-match.js"

/** A derived non-destructive coverage edge: `broader`'s anchor is a PROPER structural ancestor of
 *  `narrower`'s, and they share a slot, family, and at least one exact claim. `broader ⊃ narrower`. */
export interface Subsumes {
  readonly broader: NodeKey
  readonly narrower: NodeKey
}

/** `seg(x) = x.split('::')` — the `::`-path IS the sanctioned ancestry chain (`primaryAnchorId` is pure),
 *  so a segment-wise prefix is real structural containment, not a string hack (dedup-identity.md DP-2). */
function seg(anchorPath: string): readonly string[] {
  return anchorPath.split("::")
}

/** `true` iff `p`'s anchor is a PROPER structural prefix of `q`'s — fewer segments = the ancestor =
 *  broader. Equal anchors are EXCLUDED (they'd share a `nodeKey` ⇒ D1's union, never a subsumption). */
function strictlyContains(p: CurrentNode, q: CurrentNode): boolean {
  if (p.primaryAnchor === undefined || q.primaryAnchor === undefined) return false // anchorless ⇒ never
  const segP = seg(p.primaryAnchor)
  const segQ = seg(q.primaryAnchor)
  return isPrefix(segP, segQ) && segP.length < segQ.length // PROPER prefix (excludes equal anchors)
}

/** `true` iff the two claim-SETS intersect under exact NFC+trim equality — one shared claim at two
 *  granularities IS the subsumption; the sets need not be identical. No fuzzy τ (`claimSimilarity∈{0,1}`). */
function shareExactClaim(p: CurrentNode, q: CurrentNode): boolean {
  return p.claims.some((c) => q.claims.some((d) => claimSimilarity(c, d) === 1))
}

/**
 * Derive the FULL set of `subsumes` edges over the projection's current nodes (DP-2, frozen). For every
 * ORDERED pair `(p, q)` emit `{ broader: p.nodeKey, narrower: q.nodeKey }` iff ALL hold:
 *   1. strict containment — `seg(anchor(p))` is a PROPER prefix of `seg(anchor(q))` (anchorless ⇒ out;
 *      equal anchors excluded — that is D1's union, no `X ⊃ X`).
 *   2. same slot — `slot(p) === slot(q)`, BOTH defined (a slot-less node never participates: an
 *      `undefined === undefined` match is refused). The old matcher spanned ALL slots — that bug is fixed.
 *   3. same family — both `advisory` or both `predicate` (cross-family value spaces are incomparable).
 *   4. shared exact claim — the claim-sets intersect under exact NFC+trim equality.
 *
 * FULL set, not transitive reduction: a 3-deep chain crate⊃mod⊃fn yields all three edges (incl. crate⊃fn).
 * Result is SORTED by `(broader, narrower)` nodeKey lexicographic ascending — total, self-pair-free
 * (strict containment excludes `X ⊃ X`), each pair once (direction is inherent). Pure + total, no throw.
 */
export function deriveSubsumes(projection: StoreProjection): readonly Subsumes[] {
  const nodes = [...projection.current.values()]
  const edges: Subsumes[] = []
  for (const p of nodes) {
    for (const q of nodes) {
      if (!strictlyContains(p, q)) continue // (1) proper structural containment (also kills self-pairs)
      if (p.slot === undefined || p.slot !== q.slot) continue // (2) same slot, both defined
      if (p.family !== q.family) continue // (3) same family
      if (!shareExactClaim(p, q)) continue // (4) ≥1 shared exact claim
      edges.push({ broader: asNodeKey(p.nodeKey), narrower: asNodeKey(q.nodeKey) })
    }
  }
  edges.sort((a, b) =>
    a.broader < b.broader
      ? -1
      : a.broader > b.broader
        ? 1
        : a.narrower < b.narrower
          ? -1
          : a.narrower > b.narrower
            ? 1
            : 0,
  )
  return edges
}
