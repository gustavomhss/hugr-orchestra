// @atlas/knowledge — src/reconcile.ts  (WP-4.12-a.KNOW · reconcile drift classifier + re-author bound)
//
// KNOW-5 (atlas-knowledge:55, 80, 191-193): at reconcile the `DRIFTED` subset MUST be split. This module
// implements the FROZEN `ReconcileApi.reconcile` (co-located below) — the machine behind `atlas-reconcile`
// (shared with TOOLS-8). Only SEMANTIC rot blocks; a moved anchor doesn't. The subset partitions EXACTLY
// into MECHANICAL (the anchor moved but the claim still re-derives at the new `@sha` ⇒ auto-re-grounded,
// no human, no block, exit 0) and SEMANTIC (the claim no longer re-derives ⇒ flips `BROKEN`, blocks,
// exit 2). Human re-author count == `|semantic|`, never `|DRIFTED|`, never `N`.
//
// SEAM (no raw hashing): the per-element re-derivation `reDerives(claim, newSha)` — the pure re-hash at
// the grounding `subtreeHash` (atlas-knowledge:95-96) — is owned DOWNSTREAM (grounding/subtree oracle).
// This WP owns ONLY the split; the re-check is INJECTED as a `ReDerives` predicate, the same build-ahead
// discipline `bindFreshness` uses against GROUND's `DriftApi`. No clock, no IO, no hash computed here.
//
// SCOPE (card exclusions): NOT the advisory→STALE router (GROUND-13, WP-4.12-a.GROUND); NOT the
// `atlas-reconcile` exit-code/`DriftItem[]` surface (WP-4.12-a.TOOLS); NOT the auto-re-ground WRITER
// (EPIC-12-b). This surfaces the partition + the block/exit + the bounded re-author count; the write and
// the tool surface consume it downstream.

import type { Hash } from "@atlas/contracts"
import type { GroundedFact } from "../types.js"

// ── frozen ReconcileApi surface, co-located here (was ref/reconcile.ts) ───────────────────────────────

/**
 * A drifted fact paired with the NEW `@sha` its claim must re-derive against (KNOW-5). [PINNED —
 * oracle-pin-map §11] the minimal threading of the `reDerives(claim, newSha)` context INV-KNOW-5
 * consumes — no invented fields beyond the fact + its new-sha re-derivation anchor.
 */
export interface DriftedFact {
  readonly fact: GroundedFact
  readonly newSha: Hash
}

export interface ReconcileApi {
  /** Partition the `DRIFTED` subset by `reDerives(claim, newSha)` (KNOW-5). Pure + total; the re-check
   *  is a pure re-hash at the grounding `subtreeHash` — no clock, no IO (atlas-knowledge:95-96).
   *   - `mechanical`   — the auto-re-grounded subset (claim re-derives at the new `@sha`); exit 0.
   *   - `semantic`     — the `BROKEN` subset (claim no longer re-derives); blocks.
   *   - `reauthorCount`— MUST equal `|semantic|` (never `|DRIFTED|`, never `N`) — method-tags-knw:50.
   *   - `exitCode`     — 0 when `semantic` is empty; 2 to block on ANY semantic flip. Only exits {0, 2}. */
  reconcile(drifted: readonly DriftedFact[]): {
    readonly mechanical: readonly GroundedFact[]
    readonly semantic: readonly GroundedFact[]
    readonly reauthorCount: number
    readonly exitCode: number // reference names only {0, 2}
  }
}

/**
 * The injected per-fact re-derivation check `reDerives(claim, newSha)` (KNOW-5). Pure + total: at the new
 * `@sha`, does the drifted fact's claim still re-derive (the moved-anchor content re-hashes to the stored
 * grounding `subtreeHash`)? `true` ⇒ mechanical (auto-re-ground); `false` ⇒ semantic (BROKEN). The re-hash
 * itself is grounding-owned (SEAM: consume-only) — never computed in this module.
 */
export type ReDerives = (fact: GroundedFact, newSha: Hash) => boolean

/** The bound reconcile split — implements the FROZEN `ReconcileApi.reconcile`. */
export type Reconcile = ReconcileApi["reconcile"]

/**
 * Bind the reconcile split to the injected `reDerives` oracle.
 *
 * The returned `reconcile(drifted[])` partitions the `DRIFTED` subset by `reDerives(fact, newSha)` into two
 * DISJOINT, COVERING classes and derives the block from the semantic arm alone:
 *   - `mechanical`   — the auto-re-grounded subset (`reDerives` true); contributes NO block, NO re-author.
 *   - `semantic`     — the `BROKEN` subset (`reDerives` false); each flips `BROKEN` and blocks.
 *   - `reauthorCount`— strictly `semantic.length` (`== |semantic|`) — never `|DRIFTED|`, never `N`.
 *   - `exitCode`     — `0` iff `semantic` is empty; `2` to block the merge on ANY semantic flip.
 *
 * Pure + total (as pure/total as the injected oracle): a single left-to-right pass, no clock, no IO.
 */
export function bindReconcile(reDerives: ReDerives): Reconcile {
  return (drifted: readonly DriftedFact[]) => {
    const mechanical: GroundedFact[] = []
    const semantic: GroundedFact[] = []
    for (const d of drifted) {
      if (reDerives(d.fact, d.newSha)) mechanical.push(d.fact)
      else semantic.push(d.fact)
    }
    return {
      mechanical,
      semantic,
      reauthorCount: semantic.length, // == |semantic| (KNOW-5d); never |DRIFTED|, never N
      exitCode: semantic.length > 0 ? 2 : 0, // block iff any semantic flip (KNOW-5c); else exit 0 (KNOW-5b)
    }
  }
}
