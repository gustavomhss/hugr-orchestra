// @atlas/knowledge — src/read/relations.ts  (ADR-0015 D2 / #99a — the bidirectional relation read fold)
//
// A grounded RELATION fact (ADR-0015 D2) is a `family:'relation'` row carrying `endpointA`/`endpointB`/
// `relationKind` (stamped by the write door — `upsert.ts` / `governed-emit-identity.ts`). This fold answers
// "what relations touch this unit, and in which direction" by reading those carriers off the projection —
// DERIVED ON READ, never stored as a separate index, the same discipline as `deriveSubsumes` / `deriveSameAs`.
//
// This is DISTINCT from `@atlas/retrieval` `relate()`: that partitions the INDEX's structural edges (a
// query-time view of the code graph), while this returns the GROUNDED relation FACTS a proposer stated and
// the truth door admitted — each with its own identity, tier, provenance and freshness. One is what the code
// structurally is; the other is what Atlas has been told, on the record, about it.

import type { StoreProjection } from "../write/router.js"

/** Which end of the directed relation the queried unit sits at. `out` = the unit is the SUBJECT
 *  (`endpointA <kind> ?`); `in` = the OBJECT (`? <kind> endpointA`... i.e. `endpointB === unit`); `both` = the
 *  union. Directed on purpose — a relation reads left-to-right (contract §1), so direction is meaningful. */
export type RelationDirection = "out" | "in" | "both"

/** One grounded relation edge touching the queried unit. `nodeKey` is the relation's identity (`relationKey`,
 *  the row's key); the endpoints + kind are the carriers stamped at write time. `seal` is the two-seal
 *  provenance (ADR-0017) carried on the projection row — a sound-minted `proven` `depends-on` and an
 *  advisory relation would be INDISTINGUISHABLE at this fold without it (#99 R6, AR-11). ADDITIVE +
 *  absent-tolerant: an unsealed relation carries no `seal` (reads as "seal unknown", never "proven"), so a
 *  pre-seal projection folds byte-identically. The seal rides BOTH directions — it is a field of the edge,
 *  not of the query, so querying either endpoint surfaces the same seal (AR-26). Witness is NOT carried here:
 *  the projection row (`CurrentNode`) has no witness carrier, so the re-runnable derivation is surfaced by the
 *  single-fact `atlas node` door (which reads the durable `RelationNode.witness`), not by this list fold. */
export interface RelationEdge {
  readonly nodeKey: string
  readonly relationKind: string
  readonly endpointA: string // subject
  readonly endpointB: string // object
  readonly seal?: string //     ADR-0017 two-seal provenance — 'proven' | 'justified' | absent (unsealed)
}

/** Lexicographic string comparator — total, no locale (the one the sibling read folds sort by). */
function cmp(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * The grounded relations touching `unitKey`, in `direction` (default `both`). Pure + total (RETR-9 shape):
 * a non-string / empty `unitKey` yields the empty list, and a `family:'relation'` row whose endpoint carriers
 * are somehow not both strings is SKIPPED rather than throwing — the projection is untrusted input (the same
 * stance `sameas.ts` takes). Deterministic: the result is sorted by `(relationKind, endpointA, endpointB,
 * nodeKey)`, so equal input is byte-identical output.
 *
 * O(rows): a linear scan of the current map, which is the same cost `deriveSubsumes`/`deriveSameAs` pay. The
 * `endpointA`/`endpointB` carriers exist precisely so this is a field read, not a re-derivation from bytes.
 */
export function relationsOf(
  projection: StoreProjection,
  unitKey: string,
  direction: RelationDirection = "both",
): readonly RelationEdge[] {
  if (typeof unitKey !== "string" || unitKey.length === 0) return []
  const out: RelationEdge[] = []
  for (const node of projection.current.values()) {
    if (node.family !== "relation") continue
    const a = node.endpointA
    const b = node.endpointB
    const k = node.relationKind
    if (typeof a !== "string" || typeof b !== "string" || typeof k !== "string") continue // malformed row ⇒ skip
    const isSubject = a === unitKey // `out`: the unit points AT something
    const isObject = b === unitKey //  `in`: something points AT the unit
    const keep = direction === "out" ? isSubject : direction === "in" ? isObject : isSubject || isObject
    if (keep)
      out.push({
        nodeKey: node.nodeKey,
        relationKind: k,
        endpointA: a,
        endpointB: b,
        // SEAL carrier — from the projection row's own `seal` (ADR-0017); omitted ⇒ absent (exactOptional),
        // never a fabricated 'proven'. Rides whichever direction reaches this edge (AR-26).
        ...(typeof node.seal === "string" ? { seal: node.seal } : {}),
      })
  }
  return out.sort(
    (x, y) =>
      cmp(x.relationKind, y.relationKind) ||
      cmp(x.endpointA, y.endpointA) ||
      cmp(x.endpointB, y.endpointB) ||
      cmp(x.nodeKey, y.nodeKey),
  )
}
