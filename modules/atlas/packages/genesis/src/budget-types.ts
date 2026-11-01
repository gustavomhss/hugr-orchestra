// @atlas/genesis — src/budget-types.ts
//
// The genesis cost policy. Split out of `types.ts` to keep that file under the 400-LOC cap and RE-EXPORTED
// by it, so `import type { GenesisBudget } from '@atlas/genesis'` is unchanged. A mine pass spends exactly
// one bounded LLM call per ranked site, highest-PPR first, until the ceiling or the marginal-value stop.

/**
 * The GEN-2 MARGINAL-VALUE STOP — a FIXED scheduler policy, NOT a tunable `GenesisBudget` field
 * (atlas-genesis:117). The scheduler keeps a trailing window of the last 20 ranked sites and HALTS
 * admission once that window admits fewer than 4 (a `< 20%` admit-rate). Named here at the type layer
 * (zero-runtime literal-type consts) so the policy is documented where the budget lives; it is applied by
 * the scheduler, never carried on `GenesisBudget`.
 */
export interface MarginalValueStop {
  readonly window: 20 // trailing window size (sites)
  readonly minAdmits: 4 // halt below this many admits in the window (fewer than 4 of 20 ⇒ < 20%)
}

/** The genesis cost policy: the hard `--budget` site ceiling, default `min(frontier_size, 200)` (GEN-2). */
export interface GenesisBudget {
  readonly ceiling: number
}
