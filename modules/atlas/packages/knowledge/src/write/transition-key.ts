// @atlas/knowledge — src/write/transition-key.ts  (ADR-0015 D4 · #234 — the 2-rev transition's identity leg)
//
// The 3-legged SIBLING of `negation-key.ts` (#99b) and `relation-key.ts` (#99a). A transition is a 2-rev
// HISTORICAL record — "unit `unitKey` returned A at `shaBefore`, returns B at `shaAfter`" — whose identity
// binds the (unitKey, shaBefore, shaAfter) triple. Identity is the exact unit LINEAGE (the same `unitKey`
// across the two revs); a move/rename that changes `unitKey` is OUT OF SCOPE (D-T4, an honest limit).
//
// Re-exported by `router.ts` (beside `negation-key.js`/`relation-key.js`) so the package surface is unchanged,
// mirroring the #99a/#99b placement. Freshness lives elsewhere (the two rev-pair grounding entries, STAMPED at
// emit and never re-checked — D-T2). See docs/design/234-transition-design.md.

import { asNodeKey, canonicalForm, defaultEncoder } from "@atlas/kernel"
import type { NodeKey } from "@atlas/contracts"

/**
 * THE REFUSAL a malformed transition earns — the 3-legged analogue of `MalformedRelationError`/
 * `MalformedNegationError`. A transition whose `unitKey`, `shaBefore` or `shaAfter` is not a non-empty string,
 * or whose two revs are IDENTICAL (`shaBefore === shaAfter`), has no well-formed address and is refused (never
 * a raw `TypeError` out of a door — the door converts this to a fail-closed verdict). A NAMED class so a caller
 * can discriminate this refusal from an internal fault, exactly as the intrinsic/relation/negation doors do.
 *
 * WHY `shaBefore === shaAfter` IS REFUSED (the `a === b` analogue of `relationKey`): a rev-pair that spans no
 * interval is not a transition — the unit did not change across two identical revs, so "returned A, now returns
 * B" asserts nothing. Admitting it would put a zero-interval record through the two-rev identity, whose two
 * grounding legs would be duplicates of each other — a 2-entry pair that is really a 1-entry snapshot wearing a
 * transition's clothes. Refused so a transition always means what it says: one unit lineage, two DISTINCT revs.
 */
export const MALFORMED_TRANSITION_REASON =
  "malformed transition: a transition identity is the directed triple (unitKey, shaBefore, shaAfter), and one " +
  "of the three is not well-formed. unitKey must be a non-empty location-free unit key (a qualifiedPath), and " +
  "shaBefore/shaAfter must each be a non-empty rev content hash and must be DISTINCT (shaBefore === shaAfter " +
  "spans no interval — the unit did not change, so it is not a transition). Re-state the transition naming the " +
  "unit lineage and the two distinct revisions it spans"

export class MalformedTransitionError extends Error {
  constructor() {
    super(MALFORMED_TRANSITION_REASON)
    this.name = "MalformedTransitionError"
  }
}

/**
 * The transition identity leg (ADR-0015 D4). `transitionKey(unitKey, shaBefore, shaAfter) =
 * hash(canonicalForm({trn, u, b, a}))` — the (unitKey, shaBefore, shaAfter) triple, minted through the SEALED
 * kernel seam (no raw hashing). The `trn` tag keeps the preimage SET disjoint from `negationKey`'s ({neg,t,s}),
 * `relationKey`'s ({a,k,b}) and `nodeKey`'s ({a,s[,c]}) — no cross-family address collision (the #103
 * discipline). DIRECTED by construction: `(u, b, a) ≠ (u, a, b)` — a transition is not symmetric (before→after
 * is not after→before). Pure + total: a non-string/empty leg, or `shaBefore === shaAfter`, throws
 * `MalformedTransitionError` (the door converts it to a fail-closed verdict), never a raw `TypeError`. No
 * LLM/clock/seq.
 */
export function transitionKey(unitKey: unknown, shaBefore: unknown, shaAfter: unknown): NodeKey {
  if (typeof unitKey !== "string" || unitKey.length === 0) throw new MalformedTransitionError()
  if (typeof shaBefore !== "string" || shaBefore.length === 0) throw new MalformedTransitionError()
  if (typeof shaAfter !== "string" || shaAfter.length === 0) throw new MalformedTransitionError()
  if (shaBefore === shaAfter) throw new MalformedTransitionError() // no zero-interval — see MALFORMED_TRANSITION_REASON
  return asNodeKey(defaultEncoder.hash(canonicalForm({ trn: unitKey, b: shaBefore, a: shaAfter })))
}
