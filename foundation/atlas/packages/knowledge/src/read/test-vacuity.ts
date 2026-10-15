// @atlas/knowledge — src/read/test-vacuity.ts  (ADR-0015 D5 / #95 — the grounded test-vacuity read fold)
//
// The read surface of the single-anchor PROVEN family. One pure, total derive-on-read fold over the ONE store
// projection, mirroring `relations.ts` (#99a) / `transitions.ts` (#234) — a test-vacuity READ is a distinct
// verb, the same way `atlas relations` is distinct from `atlas query`. Wave 2 wires this into compose/CLI; this
// leg only EXPOSES the pure fold + type (scope fence: knowledge read leg only, no producer, no wiring).
//
// `testVacuitiesOf` reads the grounded TEST-VACUITY facts — `family:'test-vacuity'` rows the admit door
// admitted — off the projection's `current` map. A test-vacuity fact is a `GroundedFact`, so it lands in
// `current` via `upsert` like any fact (frozen seam): NOTHING new is stored for it. Its identity legs
// (`unitKey`, `testName`) and its proven `shape` ride the EXISTING frozen carriers (projection-types.ts —
// `unitKey` is shared with the transition carrier, `testName`/`shape` are the test-vacuity carrier), so a
// test-vacuity fact reads back by a FIELD read, not a re-derivation from CAS bytes.
//
// ── SINGLE-ANCHOR: NO LINEAGE, NO SUPERSESSION VERDICT (the whole reason this is SIMPLER than transitions) ──
// A test-vacuity fact's identity is the (unitKey, testName) PAIR — a unit may hold MANY named vacuous tests,
// each its OWN node (a distinct `testVacuityKey`), all independent. Unlike a transition (a 2-rev record whose
// `shaBefore`→`shaAfter` legs chain into a lineage, so the read side must compute a HEAD/SUPERSEDED verdict,
// D-T3), a test-vacuity fact anchors ONE unit rev and stands alone. So this fold has NO chain to walk and NO
// derive-on-read authoring verdict: every admitted fact reads back as itself. If a supersession notion is ever
// needed (e.g. the same test ceasing to be vacuous across revs), it too would be derive-on-read — but for v1
// this is a straight fold, and that is stated honestly here rather than modeled speculatively.
//
// ── SEAL, NOT FRESHNESS, IS THE LEG THIS FOLD SURFACES (mirror relations.ts, not the FRESH-by-construction of
// transitions) ────────────────────────────────────────────────────────────────────────────────────────────
// This carries the `seal` (ADR-0017 two-seal provenance, 'proven' on every minted test-vacuity node) straight
// off the projection row, EXACTLY as `relationsOf` does — a `seal:'proven'` sound-arm fact and an advisory
// prose fact are otherwise indistinguishable at this list seam. It does NOT carry a `freshness` leg, and that
// is a deliberate, honest omission, NOT the FRESH-by-construction shortcut `transitionsOf` takes: a
// test-vacuity fact's freshness IS genuinely re-derivable at HEAD (re-run `scanTestVacuity` over the unit and
// re-prove iff a fact with this `testName`+`shape` still appears — test-vacuity-types.ts). That oracle is
// tree-sitter over the unit's AST, living in adapter-io, holding CAS bytes this pure knowledge fold cannot
// reach — so reverify is the ADAPTER's leg (Wave 1a), exactly as `relationsOf` leaves witness/freshness to the
// single-fact `atlas node` door. Fabricating a constant `'FRESH'` here would be a lie (unlike a transition,
// this fact CAN drift), so it is omitted rather than faked. Wave 1a/Wave 2 inject the recompute at their seam.
//
// SCOPE/LINEAGE FILTER (#153 lesson): the optional `unit` filter keeps only rows on that exact unit lineage
// (`unitKey === unit`) — exact-match, not a raw prefix — since a test-vacuity fact's identity anchors one unit.

import type { StoreProjection } from "../write/router.js"

/** One grounded TEST-VACUITY fact the admit door admitted (ADR-0015 D5). `nodeKey` is the fact's identity
 *  (`testVacuityKey`, the row's key); `unitKey`/`testName` are the identity legs and `shape` the proven
 *  syntactic property, all stamped on the row's frozen carriers (string form at this seam, exactly as
 *  `RelationEdge.relationKind` is). `seal` is the ADR-0017 provenance carried on the row — 'proven' on every
 *  minted test-vacuity node; ADDITIVE + absent-tolerant, so a pre-seal projection folds byte-identically and an
 *  absent seal reads as "seal unknown", never a fabricated 'proven'. There is NO authoring/supersession verdict
 *  (single-anchor, no lineage — see the file header) and NO freshness leg (re-derivable at HEAD by the adapter's
 *  tree-sitter oracle, which this pure fold cannot reach — never faked). */
export interface GroundedTestVacuity {
  readonly nodeKey: string
  readonly unitKey: string
  readonly testName: string
  readonly shape: string // the proven TestVacuityShape VALUE, string form at this read seam (mirror relationKind)
  readonly seal?: string // ADR-0017 two-seal provenance — 'proven' | absent (unsealed); never fabricated
}

/** Lexicographic string comparator — total, no locale (the one the sibling read folds sort by). */
function cmp(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0
}

/**
 * The grounded TEST-VACUITY facts the admit door admitted, optionally filtered to one `unit` lineage. Pure +
 * total (RETR-9 shape, mirroring `relationsOf`/`transitionsOf`): an absent/empty `unit` returns EVERY
 * test-vacuity fact, a `family:'test-vacuity'` row whose identity carriers (`unitKey`/`testName`/`shape`) are
 * somehow not all strings is SKIPPED rather than throwing (the projection is untrusted input, the same stance
 * `relations.ts`/`sameas.ts` take), and an empty projection yields `[]`. Deterministic: sorted by
 * `(unitKey, testName, nodeKey)`, so equal input is byte-identical output.
 *
 * O(rows): a linear scan of the current map, the same cost `relationsOf`/`transitionsOf` pay. The
 * `unitKey`/`testName`/`shape` carriers exist precisely so this is a field read, not a re-derivation from bytes.
 * SINGLE-ANCHOR (see the file header): there is no lineage to chain and no supersession verdict to compute —
 * each admitted fact reads back as itself, so this is strictly a filter-and-project fold.
 */
export function testVacuitiesOf(projection: StoreProjection, unit?: string): readonly GroundedTestVacuity[] {
  const filter = typeof unit === "string" && unit.length > 0 ? unit : undefined

  const out: GroundedTestVacuity[] = []
  for (const node of projection.current.values()) {
    if (node.family !== "test-vacuity") continue
    const u = node.unitKey,
      t = node.testName,
      s = node.shape
    if (typeof u !== "string" || typeof t !== "string" || typeof s !== "string") continue // malformed row ⇒ skip
    if (filter !== undefined && u !== filter) continue
    out.push({
      nodeKey: node.nodeKey,
      unitKey: u,
      testName: t,
      shape: s,
      // SEAL carrier — from the projection row's own `seal` (ADR-0017); omitted ⇒ absent (exactOptional),
      // never a fabricated 'proven'. Mirror relationsOf's seal discipline exactly.
      ...(typeof node.seal === "string" ? { seal: node.seal } : {}),
    })
  }

  return out.sort((x, y) => cmp(x.unitKey, y.unitKey) || cmp(x.testName, y.testName) || cmp(x.nodeKey, y.nodeKey))
}
