// @atlas/knowledge — src/freshness.ts  (WP-4.10-a.KNOW · knowledge drift-verdict binding site)
//
// KNOW-3 (atlas-knowledge:53): the drift oracle is the BLAKE3 `subtreeHash`, NOT a line-range — an
// import added above the cited unit, or an unrelated rename elsewhere, stays FRESH; a real change to the
// cited unit DRIFTs. KNOW-3 was AMENDED 2026-08-02: a REFORMAT of the cited unit also drifts (no
// normalizer exists), and a rename OF the cited symbol drifts by a stronger mechanism — the name is in
// the anchor key, so the anchor stops resolving and fails closed. That leg was never delivered in any
// revision. KNOW-3 was AMENDED 2026-08-09 (ADR-0014): GROUND's subtreeHash preimage now includes a
// declaration's bound leading doc-comment (the contiguous `comment` run), so a contiguous leading comment
// DRIFTs the unit and the "header above stays FRESH" leg holds only for a blank-line-separated header; an
// import still stays FRESH (not a `comment` node). This module CONSUMES that oracle unchanged.
// See `@atlas/grounding` `src/subtree.ts` for why the byte-exact oracle is deliberate. This module is the
// KNOWLEDGE-LAYER BINDING that wires a Knowledge fact's freshness verdict to GROUND's frozen
// drift-oracle (`@atlas/grounding` `DriftApi.driftDetect`, WP-4.10-a.GROUND). It CONSUMES the oracle;
// it does NOT redefine it, and it computes NO hash itself (the subtreeHash compute lives in GROUND /
// grounding-ref/subtree.ts and is re-checked there — SEAM: consume-only, no raw hashing here).
//
// SEAM (dependency injection, not a runtime gap): the oracle is injected as a `DriftApi` dependency
// (types-only import of the FROZEN interface) rather than statically imported. NOTE — the original reason
// stated here, "`@atlas/grounding` ships zero runtime yet (its barrel is `export type *`)", is FALSE and
// was corrected (#204): `drift.js` value-exports `isGrounded`/`driftDetect` at `grounding/src/index.ts`.
// The injection is a deliberate LAYER SEAM (bind the frozen interface, keep this module oracle-agnostic and
// testable against a fixture), NOT a workaround for a missing impl.
//
// SCOPE (card exclusions): NOT the subtreeHash compute (owned by GROUND); NOT the write-decision/upsert
// (EPIC-13); NOT the drift mechanical/semantic split nor the advisory→STALE router (EPIC-12 / GROUND-13).
// A Knowledge fact carries the 2-state `KnowledgeFreshness` (FRESH | DRIFTED — no STALE, types.ts):
// the structural verdict is FRESH iff the oracle says FRESH, else DRIFTED (fail-closed narrowing).

import type { DriftApi } from "@atlas/grounding"
import type { Freshness as GroundingFreshness } from "@atlas/contracts"
import type { Axes } from "@atlas/index"
import type { GroundedFact, KnowledgeFreshness } from "../types.js"

/**
 * The bound Knowledge drift-verdict function: `freshness(fact, tree)` (KNOW-3a/3b/3c). Given a built-
 * index snapshot `tree` (`@atlas/index` `Axes` — the GROUND-pinned drift source-of-truth carrier), it
 * returns the fact's 2-state `KnowledgeFreshness`.
 */
export type Freshness = (fact: GroundedFact, tree: Axes) => KnowledgeFreshness

/**
 * Bind the Knowledge drift-verdict to GROUND's drift oracle.
 *
 * The returned `freshness(fact, tree)`:
 *   - delegates entirely to `oracle.driftDetect(fact.grounding, tree)` — the drift oracle is the anchor
 *     `subtreeHash` re-checked against the current tree (KNOW-3a); no line number, no local re-hash;
 *   - narrows the canonical 3-state grounding `Freshness` down to the 2-state Knowledge vocabulary:
 *     `FRESH` stays `FRESH`; anything else (`DRIFTED`, or a `STALE` the layer never sees for KNOW-3)
 *     is `DRIFTED` (fail-closed — a non-FRESH structural verdict never surfaces as FRESH).
 *
 * Because the verdict IS the oracle's verdict, cosmetic edits that leave `subtreeHash` unchanged stay
 * FRESH (KNOW-3b) and a real change that moves `subtreeHash` DRIFTs (KNOW-3c) — the discipline is the
 * oracle's, consumed here, never re-implemented. Pure + total (as pure/total as the injected oracle).
 */
export function bindFreshness(oracle: DriftApi): Freshness {
  return (fact: GroundedFact, tree: Axes): KnowledgeFreshness => {
    const verdict = oracle.driftDetect(fact.grounding, tree)
    return verdict === "FRESH" ? "FRESH" : "DRIFTED"
  }
}

/** Route structural drift by fact kind. Unknown runtime kinds fail closed to predicate drift. */
export function resolveFactFreshness(
  kind: "advisory" | "predicate",
  structural: GroundingFreshness,
): GroundingFreshness {
  if (kind !== "advisory" && kind !== "predicate") return "DRIFTED"
  if (structural === "FRESH") return "FRESH"
  if (kind === "advisory") return "STALE"
  return "DRIFTED"
}
