// @atlas/genesis — src/usefulness.ts  (WP-6.18.GEN · GEN-16 — usefulness graded a-posteriori: the seed side)
//
// GEN-16 (atlas-genesis:173-179, 234-235; method-tags-gen:121-126): the ONE non-mechanical gate —
// "non-obvious ∧ actionable" — MUST NOT rest on the proposer's self-assessment. Genesis seeds
// LOOSE-BUT-THIN (a grounded candidate is seeded even with 0 measured hits), then lets DOWNSTREAM USE be
// the judge: a seeded fact accrues a logged `hit` each time a wave consults it (KNOW-17), a fact no wave
// ever consults over its window DECAYS out of the served set (archived to CAS, never deleted — re-enterable),
// and the admission threshold calibrates against OBSERVED hits (`threshold == f(hits)`), never a self-score.
//
// SEAM (card exclusions — GEN CONSUMES, never redefines): the hits ledger + decay + Door-2 mechanics are
// KNOW-17 (owned by @atlas/knowledge `ref/hits.ts` / `src/hits.ts`, sealed upstream). This module owns ONLY
// the GENESIS seed side:
//   • the SEED GATE (`seedGate`) — the genesis-owned admission decision. It reads NO proposer
//     self-assessment (`self_score`/`importance` are present on the candidate but NEVER consulted); the sole
//     mechanical input is grounding (GEN-4). A grounded candidate with 0 hits is STILL seeded (loose-but-thin).
//     ADR-0012 makes it the CONSUMER of the harness's obviousness score: the score rides through onto the
//     decision so ranking can read it, and the ADMIT/REJECT branch is untouched — `grounded` remains the sole
//     input. That is deliberate and load-bearing, not conservatism: `self_score`/`importance` exist here
//     PRECISELY so the gate can be witnessed ignoring them (GEN-16a), and a gate that started reading a new
//     input for its verdict would destroy that witness. The score is a RANKING signal, never an admission one.
//   • CONSULT/DECAY are DELEGATED to the injected KNOW-17 `HitsApi` — a hit is a LOGGED CITED event
//     (`logHit`), NEVER a self-assessed counter genesis keeps of its own; decay is the KNOW-17 pass.
//   • the admission threshold is `calibrate(observedHits)` — `calibrate` is the parametric OPEN-DEFINE
//     `f(hits)` (KNOW-17 / method-tags-knw:135), INJECTED, never a baked-in constant. Applied to OBSERVED
//     hits (the shared ledger), never to a proposer score.
// No hashing, no clock, no IO here; node identity is the sealed @atlas/kernel `NodeKey` (minted by callers).

import type { NodeKey, StructRef } from "@atlas/contracts"
import type { DecayConfig, LedgerEntry, HitsApi, ObviousnessScore } from "@atlas/knowledge"

/**
 * A proposer candidate presented to the genesis seed gate (GENESIS-HOME). It MAY carry the proposer's own
 * self-assessment (`self_score` / `importance`) — those fields are present so the gate can be witnessed
 * IGNORING them (GEN-16a). The ONLY field the gate reads is `grounded` (the GEN-4 mechanical bar: does the
 * citation re-derive at `source@sha`?). Usefulness is NOT a candidate field — it is measured a-posteriori.
 */
export interface SeedCandidate {
  readonly site: StructRef // the anchored structural unit the fact is grounded to (GEN-4)
  readonly grounded: boolean // GEN-4: does the citation re-derive? — the honest mechanical admission bar
  readonly self_score?: number // PROPOSER self-assessment — present, but the gate NEVER reads it (GEN-16a)
  readonly importance?: number // proposer self-assessment alias — also NEVER read (GEN-16a)
}

/**
 * The genesis seed-gate decision (GEN-16a/16b). `loose-but-thin` = seeded, usefulness deferred to hits.
 *
 * `obviousness` (ADR-0012) is carried THROUGH, never consulted: it is present on a `seeded` decision so the
 * ranker downstream has the cold-start prior, and its presence or value can never move `seeded`. Optional
 * because the score arrives from the admit harness, and a caller that has not computed one yet gets an
 * honest absence rather than a fabricated default.
 */
export interface SeedDecision {
  readonly seeded: boolean
  readonly reason: "loose-but-thin" | "ungrounded"
  readonly obviousness?: ObviousnessScore
}

/**
 * The genesis seed gate (GEN-16a/16b). Usefulness is graded a-POSTERIORI, so admission MUST NOT rest on the
 * proposer's self-assessment: this function reads NEITHER `self_score` NOR `importance`. The sole mechanical
 * input is `grounded` (GEN-4). A grounded candidate is seeded LOOSE-BUT-THIN — even with 0 measured hits —
 * and its usefulness is judged later by logged consults (KNOW-17). An ungrounded candidate is not a fact
 * (GEN-4/GEN-6) and is not seeded.
 */
export function seedGate(candidate: SeedCandidate, obviousness?: ObviousnessScore): SeedDecision {
  // GEN-16a: the decision is a pure function of `grounded` — INDEPENDENT of any proposer self-assessment.
  // GEN-16b: no strict a-priori usefulness bar; a grounded 0-hit candidate is admitted (loose-but-thin).
  //
  // ADR-0012: `obviousness` is the HARNESS-computed score, and it appears on NEITHER branch condition. It is
  // a second parameter rather than a `SeedCandidate` field on purpose — putting it on the candidate would sit
  // it beside `self_score`/`importance`, where the next reader has to work out which of the three the
  // proposer authored. Here the shape says it: the candidate is what the proposer sent, the second argument
  // is what the harness measured.
  if (!candidate.grounded) return { seeded: false, reason: "ungrounded" }
  return obviousness === undefined
    ? { seeded: true, reason: "loose-but-thin" }
    : { seeded: true, reason: "loose-but-thin", obviousness }
}

/**
 * The parametric admission threshold as a FUNCTION of observed hits (`threshold == f(hits)`,
 * method-tags-gen §INV-GEN-16 / method-tags-knw:135). PARAMETRIC — injected, never a baked-in constant; the
 * VALUE is not frozen (it calibrates on observed downstream hits, not the proposer's score). Mirrors the
 * KNOW-17 `Calibrate`; genesis applies it to the SHARED ledger's observed hit-count.
 */
export type Calibrate = (observedHits: number) => number

/**
 * The injected KNOW-17 seam (build-ahead; CONSUMED, never redefined — card exclusions):
 *   - `hits`      — the sealed KNOW-17 ledger (`logHit` accrues one logged CITED hit; `decay` archives 0-hit
 *                   facts and is re-enterable). Genesis keeps NO counter of its own.
 *   - `calibrate` — the parametric OPEN-DEFINE `f(hits)`; applied to observed hits, never a self-score.
 */
export interface SeedGateDeps {
  readonly hits: HitsApi
  readonly calibrate: Calibrate
}

/**
 * The bound GEN-16 seed-side surface. `seed` is the genesis-owned loose-but-thin gate; `consult`, `decay`
 * and `admissionThreshold` DELEGATE to the consumed KNOW-17 seam (a hit is a logged cited event, decay is
 * KNOW-17's pass, the threshold is `calibrate(observedHits)`).
 */
export interface SeedGate {
  /** GEN-16a/16b — seed loose-but-thin; reads no proposer self-assessment. The optional ADR-0012 score is
   *  carried onto the decision for ranking and never enters the seeded/ungrounded verdict. */
  seed(candidate: SeedCandidate, obviousness?: ObviousnessScore): SeedDecision
  /** GEN-16c — a wave consults a seeded fact ⇒ accrue one LOGGED CITED hit (KNOW-17 `logHit`). Returns the
   *  minimal ledger record; its `hits` is the observed count the threshold calibrates against. */
  consult(nodeId: NodeKey): LedgerEntry
  /** GEN-16d — the decay pass (KNOW-17): a fact with 0 hits in the window is archived to CAS (never deleted)
   *  and dropped from the served set; it may re-enter on a later `consult`. */
  decay(cfg: DecayConfig): { readonly decayed: readonly NodeKey[]; readonly retained: readonly NodeKey[] }
  /** GEN-16e — the admission threshold = `calibrate(observedHits)`, a function of OBSERVED hits (the shared
   *  ledger), never a hard-coded constant and never a proposer self-score. */
  admissionThreshold(observedHits: number): number
}

/**
 * Bind the GEN-16 seed side to the injected KNOW-17 ledger + parametric calibration. Genesis owns only the
 * loose-but-thin seed decision; the ledger accrual, decay/re-entry and Door-2 mechanics are CONSUMED from
 * KNOW-17 (never redefined here). Deterministic + total; no hashing, no clock, no IO.
 */
export function bindSeedGate(deps: SeedGateDeps): SeedGate {
  return {
    seed: seedGate,
    // GEN-16c: usefulness is a LOGGED CITED outcome — delegate to the KNOW-17 ledger, keep no local counter.
    consult: (nodeId: NodeKey): LedgerEntry => deps.hits.logHit(nodeId),
    // GEN-16d: unconsulted (0-hit) facts decay via the KNOW-17 pass (archived, re-enterable — never deleted).
    decay: (cfg: DecayConfig) => deps.hits.decay(cfg),
    // GEN-16e: threshold == f(observed hits) — the parametric OPEN-DEFINE calibration over the shared ledger.
    admissionThreshold: (observedHits: number): number => deps.calibrate(observedHits),
  }
}
