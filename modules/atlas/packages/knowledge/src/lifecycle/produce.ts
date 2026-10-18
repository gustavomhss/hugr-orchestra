// @atlas/knowledge — src/produce.ts  (WP-5.17.KNOW · born-from-work: moment-gated producer + seal probe)
//
// KNOW-13 (atlas-knowledge:63, 208-209; method-tags-knw:102-107): facts are produced ONLY at the three
// moments (init-skeleton → enrich-by-blast-radius → wave-close-write), NEVER a repo-wide sweep; and a
// sealing wave MUST have fed the Atlas (`absorb`) or emitted a grounded why-not — a bare seal records a
// violation. This module implements the FROZEN `ProduceApi` (co-located below). It OWNS the production-moment
// GATE and the fed-or-why-not DEFINITION (the KNOW→TOOLS seam-freeze consumed by WP-5.17.TOOLS).
//
// SEAM (no raw hashing; build-ahead injection — the same discipline `bindFreshness`/`bindReconcile` use):
//   • the Candidate→GroundedFact ratification transform is OWNER-DEFINE (oracle-pin: "produce body"),
//     owned DOWNSTREAM by the write-decision/ratification route (WP-5.13-a / WP-5.15). It is INJECTED as
//     `Mint`, never defined here — this WP owns only the moment GATE over it.
//   • the sealing wave is a SIG-TBD upward Orchestra artifact (`seal: unknown`, ProduceApi.sealProbe);
//     its two legs are read by injected `SealLeg`s. This WP owns the fed-or-why-not COMBINATOR: violation
//     is the negation of the (absorb ∨ why-not) disjunction. No hash, no clock, no IO computed here.
//
// SCOPE (card exclusions): NOT the wave-close write DRIVER on the tool side (WP-5.17.TOOLS, consumes this);
// NOT ratification routing (WP-5.15.KNOW); NOT the write-decision route (WP-5.13-a.KNOW).

import type { Candidate, GroundedFact } from "../types.js"

// ── frozen ProduceApi surface, co-located here (was ref/produce.ts) ───────────────────────────────────

/**
 * The three — and ONLY three — production moments (KNOW-13, atlas-knowledge:63). Facts produced outside
 * these (a repo-wide sweep) MUST yield 0 facts (method-tags-knw:106). The list is closed.
 */
export type ProductionMoment = "init-skeleton" | "enrich-by-blast-radius" | "wave-close-write"

export interface ProduceApi {
  /** Moment-gated producer (KNOW-13): a production event is ACCEPTED only if tagged one of the three
   *  `ProductionMoment`s; a repo-wide sweep produces 0 facts. Pure + total. The production event carries
   *  the proposed `Candidate` facts; the accepted-facts return is the produced `GroundedFact`s
   *  (a sweep / off-moment event ⇒ `[]`). */
  produce(moment: ProductionMoment, event: readonly Candidate[]): readonly GroundedFact[]

  /** Seal probe (KNOW-13): a sealing wave that neither fed the Atlas (`absorb`) nor emitted a grounded
   *  why-not records a VIOLATION. `violation:true` on a bare seal. Pure + total. The wave/seal input is
   *  not frozen → `unknown`; `violation` is the reference-implied leg. */
  sealProbe(seal: unknown): { readonly violation: boolean }
}

/**
 * The three — and ONLY three — production moments (KNOW-13), materialized as a runtime CLOSED set so the
 * gate rejects any off-union tag (a repo-wide sweep) whose type is erased at runtime. Adding a member is a
 * spec revision, not a code change.
 */
const PRODUCTION_MOMENTS: ReadonlySet<ProductionMoment> = new Set<ProductionMoment>([
  "init-skeleton",
  "enrich-by-blast-radius",
  "wave-close-write",
])

/**
 * The injected DOWNSTREAM ratification transform (OWNER-DEFINE — WP-5.13-a/WP-5.15). Mints a `GroundedFact`
 * from an admitted `Candidate`. This module NEVER defines the transform body; it is consumed, build-ahead.
 */
export type Mint = (candidate: Candidate) => GroundedFact

/**
 * The injected reader of ONE leg of the (SIG-TBD, unfrozen) sealing wave — did the wave feed the Atlas
 * (`absorb`) / carry a grounded why-not? The seal SHAPE is not frozen (ProduceApi), so each leg is read
 * upstream/downstream and consumed here — never invented.
 */
export type SealLeg = (seal: unknown) => boolean

/**
 * Bind the moment-gated producer + fed-or-why-not seal probe — implements the FROZEN `ProduceApi`.
 *
 *   - `produce(moment, event)` (KNOW-13a): ADMIT only at the three `ProductionMoment`s; a repo-wide sweep /
 *     off-moment event ⇒ `[]` (0 facts). Admitted candidates are minted by the injected `mint`. Pure + total.
 *   - `sealProbe(seal)` (KNOW-13b): `violation` iff NEITHER leg holds — the negation of the owned
 *     `absorb ∨ why-not` obligation. A bare seal ⇒ `violation:true`. Pure + total.
 */
export function bindProduce(mint: Mint, absorbed: SealLeg, hasWhyNot: SealLeg): ProduceApi {
  return {
    produce(moment: ProductionMoment, event: readonly Candidate[]): readonly GroundedFact[] {
      if (!PRODUCTION_MOMENTS.has(moment)) return [] // off-moment (sweep) ⇒ 0 facts (KNOW-13a)
      return event.map(mint)
    },
    sealProbe(seal: unknown): { readonly violation: boolean } {
      const fedOrWhyNot = absorbed(seal) || hasWhyNot(seal) // the owned fed-or-why-not disjunction
      return { violation: !fedOrWhyNot } // bare seal (neither leg) ⇒ violation (KNOW-13b)
    },
  }
}
