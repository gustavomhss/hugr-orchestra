// @atlas/genesis — src/budget-types.ts  (GEN-13 / GEN-14 cost-discipline surface — was ref/budget.ts)
//
// EXTRACTED from `types.ts` at the 400-LOC godfile ceiling along a cohesive boundary (the budget/escalation
// vocabulary is its own concern), exactly as `negation-types.ts` was extracted from @atlas/knowledge's
// `types.ts` at the same ceiling (this WP, #210/#209, added the two `GenesisReport` witness fields that
// forced the split). RE-EXPORTED by `types.ts` (`export type * from './budget-types.js'`, mirrored by the
// barrel's own `export type * from './types.js'`) so the package surface — `import type { GenesisBudget }
// from '@atlas/genesis'` — is byte-identical to having declared it inline.
//
// Consumed by extract.ts + loops.ts + cost-policy.ts + run-controller.ts (≥2), so housed beside the shared
// model rather than in one impl file. CHEAP BY DEFAULT (base tier = exactly one LLM call/site); ESCALATE BY
// VALUE (extra mechanisms switch on only under `high-value ∧ uncertain`). The REVIEW / ENRICH / EXPAND
// deepening loops are GOVERNED (GEN-14): opt-in, budget-gated, fixpoint-stopping — all off ⇒ Δ=0.

import type { Tier } from "@atlas/contracts"
// `Candidate`/`CostReport` stay owned by `types.ts` (shared-model concerns, not budget-vocabulary ones) and
// are imported here — a type-only cycle, erased at runtime, exactly as negation-types' import of
// `RelationKind` from @atlas/knowledge's `types.ts` is.
import type { Candidate, CostReport } from "./types.js"

/**
 * One governed deepening loop (GEN-14). REVIEW / ENRICH / EXPAND are each opt-in or default-shallow,
 * budget-gated, with a fixpoint stop (a no-revision round / marginal value `< ε` / loop-until-dry on the
 * 2-door bar). No loop runs unbounded; the loops are the DEPTH DIAL, never a change to the default cost.
 *
 * [PINNED — oracle-pin-map §12] the fixpoint/ε carrier. GEN-14 names the stop conditions in prose; the
 * minimal carrier is `enabled` (the on/off gate) + `maxDepth` (the bounded depth dial, 0 at base) +
 * `epsilon` (the marginal-value-`<ε` stop leg). No speculative fields beyond the three named stops.
 */
export interface LoopConfig {
  readonly enabled: boolean // default false — loops-off ⇒ single-pass baseline (GEN-13/14, Δ=0)
  readonly maxDepth: number // the bounded depth dial — 0 at the base tier
  readonly epsilon: number // marginal-value stop: halt a round when value gain < ε // DEFINE default, owner-tunable
}

/** The three governed deepening loops (GEN-14). With all three off, genesis cost == the single cheap pass. */
export interface DeepeningLoops {
  readonly review: LoopConfig
  readonly enrich: LoopConfig
  readonly expand: LoopConfig
}

/**
 * The GEN-2 MARGINAL-VALUE STOP — a FIXED scheduler policy, NOT a tunable `GenesisBudget` field
 * (atlas-genesis:117). The scheduler keeps a trailing window of the last 20 ranked sites and HALTS
 * admission once that window admits fewer than 4 (a `< 20%` admit-rate). Named here at the type layer
 * (zero-runtime literal-type consts) so the policy is documented where the budget lives; it is applied by
 * the scheduler, never carried on `GenesisBudget`. [PINNED — oracle-pin-map §12, transcribed :117.]
 */
export interface MarginalValueStop {
  readonly window: 20 // trailing window size (sites)
  readonly minAdmits: 4 // halt below this many admits in the window (fewer than 4 of 20 ⇒ < 20%)
}

/**
 * The genesis cost policy (GEN-13). Carries the hard site ceiling + the governed deepening loops.
 *   - `ceiling`   — the hard `--budget` site ceiling; default `min(frontier_size, 200)` (GEN-2).
 *   - `deepening` — the three governed loops; ALL off ⇒ cost == single-pass baseline (GEN-14).
 *
 * The GEN-2 marginal-value stop is the fixed `MarginalValueStop` policy (above), NOT a field here.
 */
export interface GenesisBudget {
  readonly ceiling: number // hard site budget — default min(frontier_size, 200) (GEN-2)
  readonly deepening: DeepeningLoops // governed loops — all off ⇒ single-pass baseline (GEN-14)
}

/**
 * The S2 mechanisms a site MAY escalate to beyond the base single grounded proposal (GEN-13). All OFF at
 * the base tier (an empty set ⇒ exactly one LLM call/site); each switches on ONLY under the escalation
 * predicate `(high-value ∧ uncertain)`.
 */
export type Mechanism = "self-consistency" | "refuter" | "check-synthesis" | "codeql"

/** The escalation decision for one site (GEN-13). Base tier ⇒ `mechanisms == []` (exactly one call). */
export interface EscalationDecision {
  readonly tier: Tier // the site's (candidate) tier — refuter fires only for `T0`, checks for `tier≥T1`
  readonly mechanisms: readonly Mechanism[] // base ⇒ [] (one call); escalated subset otherwise
}

export interface BudgetApi {
  /** GEN-13 escalation. The predicate `(high-value ∧ uncertain)` is the ONLY gate that switches extra
   *  mechanisms on; a base-tier site returns `mechanisms: []` (exactly one LLM call — no self-consistency,
   *  no refuter, no check synthesis). Semgrep is preferred before CodeQL; the refuter fires only for
   *  `T0`-candidates. */
  escalate(cand: Candidate, budget: GenesisBudget): EscalationDecision

  /** GEN-13 per-stage cost under the ceiling — the `GenesisReport` cost breakdown. LLM-call count is a
   *  function of the PPR frontier, never of file/line count (GEN-3). */
  report(): CostReport
}
