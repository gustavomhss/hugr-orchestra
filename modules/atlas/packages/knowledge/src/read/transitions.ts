// @atlas/knowledge — src/read/transitions.ts  (ADR-0015 D4 / #234 — the grounded-transition read fold)
//
// The read surface of the 2-rev historical family. One pure, total derive-on-read fold over the ONE store
// projection, mirroring `relations.ts` (#99a) / `negations.ts` (#99b) — a transition READ is a distinct verb,
// the same way `atlas relations`/`atlas negations` are distinct from `atlas query`.
//
// `transitionsOf` reads the grounded TRANSITIONS — `family:'transition'` rows the door admitted — off the
// projection's `current` map. A transition is a `GroundedFact`, so it lands in `current` via `upsert` like any
// fact (frozen seam): NOTHING new is stored for it. Its identity legs (`unitKey`, `shaBefore`, `shaAfter`) ride
// the EXISTING frozen transition carriers (projection-types.ts), so a transition reads back by a FIELD read.
//
// ── SUPERSESSION IS DERIVE-ON-READ, NOT A STORED FLIP (D-T3, the whole design decision) ─────────────────────
// A transition is minted `authoring:'TRANSITIONED'` and is NEVER mutated in place (immutable historical
// record). Two transitions on the SAME `unitKey` but different sha-pairs are DISTINCT nodes (distinct
// `transitionKey`s), BOTH retained. Which one is the lineage's CURRENT head is computed HERE, over the lineage:
// the HEAD is the transition whose `shaAfter` is no OTHER same-unit transition's `shaBefore` (the tip of the
// shaBefore→shaAfter chain); every predecessor reads back `SUPERSEDED`. This is "superseded, not falsified" —
// the older record is retained and readable, it is just no longer the lineage's current state. No write-time
// mutation, no store scan: exactly the derive-on-read stance `subsumes`/`sameAs` take.
//
// FRESHNESS IS STAMPED AT EMIT, NEVER RE-CHECKED (D-T2). Unlike `negationsOf` (which injects a per-row
// `freshnessOf` recompute against the live index), a transition is a HISTORICAL record about two PAST revs — a
// re-derivation against HEAD is meaningless (it would AND-fold to DRIFTED forever). So this fold reads the
// STORED freshness the door stamped at emit, and takes NO freshness oracle at all.
//
// SCOPE/LINEAGE FILTER (#153 lesson): the optional `unit` filter keeps only rows on that exact unit LINEAGE
// (`unitKey === unit`). Exact-match, not a prefix — a transition's identity is one unit lineage, and D-T4 keeps
// rename/move OUT of scope, so there is no cross-unit lineage to widen into.

import type { StoreProjection } from "../write/router.js"
import type { KnowledgeFreshness } from "../types.js"

/** One grounded TRANSITION the door admitted, with its DERIVE-ON-READ lineage verdict (D-T3). `nodeKey` is the
 *  transition's identity (`transitionKey`, the row's key); `unitKey`/`shaBefore`/`shaAfter` are the identity
 *  legs stamped on the row's frozen carriers. `authoring` is the COMPUTED verdict: `'TRANSITIONED'` for the
 *  lineage HEAD (the tip of the chain), `'SUPERSEDED'` for every predecessor — NOT the stored mint value (which
 *  is always `'TRANSITIONED'`). `freshness` is the STAMPED-at-emit verdict read straight off the fact (never
 *  re-checked, D-T2). */
export interface GroundedTransition {
  readonly nodeKey: string
  readonly unitKey: string
  readonly shaBefore: string
  readonly shaAfter: string
  readonly authoring: "TRANSITIONED" | "SUPERSEDED" // DERIVE-ON-READ head/predecessor verdict (D-T3)
  readonly freshness: KnowledgeFreshness // stamped at emit, read straight off the row's fact (D-T2)
}

/** Lexicographic string comparator — total, no locale (the one the sibling read folds sort by). */
function cmp(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * The grounded TRANSITIONS the door admitted, optionally filtered to one `unit` lineage. Pure + total (RETR-9
 * shape, mirroring `relationsOf`/`negationsOf`): an absent/empty `unit` returns EVERY transition, a
 * `family:'transition'` row whose identity carriers are somehow not all strings is SKIPPED rather than throwing
 * (the projection is untrusted input), and an empty projection yields `[]`. Deterministic: sorted by
 * `(unitKey, shaBefore, shaAfter, nodeKey)`, so equal input is byte-identical output.
 *
 * SUPERSESSION (D-T3) is computed HERE, per lineage: within one `unitKey`, the set of `shaBefore` values is the
 * "has-a-successor" set; a transition whose `shaAfter` is in that set is SUPERSEDED (some later transition
 * continues from where it ended), and the one whose `shaAfter` is NOT is the lineage HEAD (`TRANSITIONED`). A
 * broken/forked lineage (no unique tip, or a cycle) degrades gracefully: every node whose `shaAfter` has a
 * successor is SUPERSEDED and any tip(s) read `TRANSITIONED` — never a throw, never a silent drop.
 */
export function transitionsOf(projection: StoreProjection, unit?: string): readonly GroundedTransition[] {
  const filter = typeof unit === "string" && unit.length > 0 ? unit : undefined

  // First pass — collect the well-formed transition rows (identity legs + FRESH-by-construction, see freshnessOf).
  type Row = { nodeKey: string; unitKey: string; shaBefore: string; shaAfter: string; freshness: KnowledgeFreshness }
  const rows: Row[] = []
  for (const node of projection.current.values()) {
    if (node.family !== "transition") continue
    const u = node.unitKey,
      b = node.shaBefore,
      a = node.shaAfter
    if (typeof u !== "string" || typeof b !== "string" || typeof a !== "string") continue // malformed ⇒ skip
    if (filter !== undefined && u !== filter) continue
    rows.push({
      nodeKey: node.nodeKey,
      unitKey: u,
      shaBefore: b,
      shaAfter: a,
      freshness: freshnessOf(projection, node.nodeKey),
    })
  }

  // Per-lineage "has-a-successor" set: the `shaBefore` values seen on each unit. A transition whose OWN
  // `shaAfter` is some sibling's `shaBefore` has been continued ⇒ SUPERSEDED (D-T3).
  const successorStarts = new Map<string, Set<string>>() // unitKey → set of shaBefore on that unit
  for (const r of rows) {
    let s = successorStarts.get(r.unitKey)
    if (s === undefined) {
      s = new Set()
      successorStarts.set(r.unitKey, s)
    }
    s.add(r.shaBefore)
  }

  const out: GroundedTransition[] = rows.map((r) => {
    const superseded = successorStarts.get(r.unitKey)?.has(r.shaAfter) === true
    return {
      nodeKey: r.nodeKey,
      unitKey: r.unitKey,
      shaBefore: r.shaBefore,
      shaAfter: r.shaAfter,
      authoring: superseded ? "SUPERSEDED" : "TRANSITIONED",
      freshness: r.freshness,
    }
  })

  return out.sort(
    (x, y) =>
      cmp(x.unitKey, y.unitKey) ||
      cmp(x.shaBefore, y.shaBefore) ||
      cmp(x.shaAfter, y.shaAfter) ||
      cmp(x.nodeKey, y.nodeKey),
  )
}

/** `'FRESH'` BY CONSTRUCTION (D-T2), NOT a stored value read back. A transition is an immutable historical
 *  record about two PAST revs that is NEVER re-checked at HEAD, so `buildTransition` ALWAYS stamps it `FRESH`
 *  and nothing ever restamps it — the record is a true statement about the past regardless of HEAD. This fold
 *  therefore returns the constant `'FRESH'` rather than recovering the stamped value off CAS (a pure knowledge
 *  fold cannot reach a fact body anyway). This is not a lie by omission: for the transition family stored ==
 *  returned by D-T2. The `projection`/`nodeKey` params are kept for signature parity with the sibling folds'
 *  `freshnessOf` seam, so an adapter that ever needs the CAS-stamped value can override this at its own leg. */
function freshnessOf(_projection: StoreProjection, _nodeKey: string): KnowledgeFreshness {
  return "FRESH" // by construction (D-T2) — see the doc above; a transition is never re-checked, so never non-FRESH
}
