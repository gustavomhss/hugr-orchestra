// @atlas/knowledge — src/write/link.ts  (WP-SAMEAS · the symmetric sameAs write/RETRACT reducers)
//
// The pure write reducers for the human-asserted `sameAs` equivalence (H1). `linkSameAs(projection, a, b)`
// asserts `a ≡ b` by adding the SYMMETRIC edge — `b` onto `a`'s `sameAs` set AND `a` onto `b`'s — so the
// read-side union-find fold (`deriveSameAs`) is local from either endpoint. `unlinkSameAs(projection, a, b)`
// WITHDRAWS one (A-D3 / task #83) by APPENDING the symmetric retraction to `sameAsRetracted` — it removes
// nothing. Both return a NEW projection (inputs untouched — pure). TOTAL: `a === b`, or EITHER key absent
// from `current`, returns the projection UNCHANGED (a structural no-op; the governed door, not these
// reducers, decides REJECTION). Each node's peer lists are kept SORTED + de-duped (the same lexicographic
// order the read fold + subsumes use). `cas`/`builtAt`/other nodes are untouched. No clock, no random, no LLM.

import type { CurrentNode, StoreProjection } from "./router.js"

/** The lexicographic order both carriers are kept in (the one the read folds and `subsumes` already use). */
const cmp = (x: string, y: string): number => (x < y ? -1 : x > y ? 1 : 0)

/** Add `peer` to `node.sameAs`, kept SORTED + de-duped — idempotent (already-present peer ⇒ node unchanged).
 *  Spread preserves every other field (family/contentHash/claims/anchor/slot/…). */
function withPeer(node: CurrentNode, peer: string): CurrentNode {
  const existing = node.sameAs ?? []
  if (existing.includes(peer)) return node // already asserted — no-op (idempotent)
  const sameAs = [...existing, peer].sort(cmp)
  return { ...node, sameAs }
}

/**
 * Add `peer` to `node.sameAsRetracted`, kept SORTED + de-duped — idempotent.
 *
 * `sameAs` IS LEFT ALONE ON PURPOSE (A-D3, task #83). This is an APPEND, not a delete: the assertion stays
 * recorded and the retraction is recorded ALONGSIDE it, so the row carries who-asserted AND who-retracted
 * instead of collapsing back to a state indistinguishable from "never linked". Every other field survives
 * by spread, `sameAs` included.
 */
function withRetraction(node: CurrentNode, peer: string): CurrentNode {
  const existing = node.sameAsRetracted ?? []
  if (existing.includes(peer)) return node // already retracted — no-op (idempotent)
  const sameAsRetracted = [...existing, peer].sort(cmp)
  return { ...node, sameAsRetracted }
}

/**
 * Assert `a ≡ b` — the SYMMETRIC `sameAs` edge. Pure: returns a NEW projection, inputs untouched. TOTAL:
 *   • `a === b` ⇒ UNCHANGED (a node never names itself; the door rejects this, this reducer no-ops).
 *   • EITHER key absent from `current` ⇒ UNCHANGED (the door rejects the unknown node; this reducer no-ops).
 * Otherwise both endpoints gain the peer (sorted + de-duped) and the rest of the projection — `cas`, the
 * freshness `builtAt` watermark, every other node — is preserved verbatim.
 */
export function linkSameAs(projection: StoreProjection, a: string, b: string): StoreProjection {
  if (a === b) return projection // no self-equivalence — total no-op
  const nodeA = projection.current.get(a)
  const nodeB = projection.current.get(b)
  if (nodeA === undefined || nodeB === undefined) return projection // absent endpoint — total no-op
  const current = new Map(projection.current)
  current.set(a, withPeer(nodeA, b))
  current.set(b, withPeer(nodeB, a))
  return { ...projection, current } // preserve cas + builtAt (only `current` changes)
}

/**
 * RETRACT `a ≡ b` — record the SYMMETRIC withdrawal of a previously asserted `sameAs` edge (A-D3, task #83).
 * Pure: returns a NEW projection, inputs untouched. TOTAL on exactly the branches `linkSameAs` is total on:
 *   • `a === b` ⇒ UNCHANGED (there was never a self-edge to withdraw).
 *   • EITHER key absent from `current` ⇒ UNCHANGED (the door refuses the unknown node; this reducer no-ops).
 * Otherwise both endpoints gain the peer in `sameAsRetracted` (sorted + de-duped) and NOTHING is removed —
 * `sameAs` still names the peer, `cas`, `builtAt` and every other node are preserved verbatim.
 *
 * THIS REDUCER DOES NOT DECIDE WHETHER THE PAIR WAS EVER LINKED. Like `linkSameAs`, it is a structural
 * reducer and the GOVERNED DOOR owns refusal: `governed-link.ts` refuses a retraction of an unasserted pair
 * (`not-linked`) and of an already-retracted pair (`already-retracted`), each AFTER the whole gate ladder
 * (distinct → both-known → authz → ratify) so the pair's state is never an oracle for a caller who has not
 * earned it.
 */
export function unlinkSameAs(projection: StoreProjection, a: string, b: string): StoreProjection {
  if (a === b) return projection // no self-equivalence ever existed — total no-op
  const nodeA = projection.current.get(a)
  const nodeB = projection.current.get(b)
  if (nodeA === undefined || nodeB === undefined) return projection // absent endpoint — total no-op
  const current = new Map(projection.current)
  current.set(a, withRetraction(nodeA, b))
  current.set(b, withRetraction(nodeB, a))
  return { ...projection, current } // preserve cas + builtAt (only `current` changes)
}
