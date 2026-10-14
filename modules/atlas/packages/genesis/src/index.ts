// @atlas/genesis — barrel
//
// Layer 8: the one-time BOOTSTRAP / composition root. Genesis seeds the Atlas onto an already-existing
// (brownfield) repo — DETERMINISTIC skeleton (S0/S1 `$0`-LLM, GEN-1/11), RATIONED intelligence (S2 the
// ONLY LLM entry, GEN-2), the HUMAN ratifies only the contested (S3, GEN-5) — then HANDS OFF to
// born-from-work (S4, GEN-7) and never remains a sweeper. As the composition root it imports DOWNWARD
// only (contracts / index / knowledge / memory) and is imported by no lower layer.
//
// GEN-6 is structural in these types: `mine`/`rank` return `Candidate[]` (a ranked SITE, NEVER a fact);
// GEN-2 is structural too: `extract` is the sole facet whose signature admits the LLM. The barrel
// re-exports the package's FULL public type surface so consumers can import from the bare package root
// (`import type { GenesisReport } from '@atlas/genesis'`). Each frozen interface is now co-located with its
// impl; the shared data model + the ≥2-consumer API interfaces (budget / extract / scan) live in types.ts.

// The frozen data model + the co-located API interfaces consumed by ≥2 src files (the GEN-13/14 budget
// vocabulary + BudgetApi, the S2 ExtractApi/ExtractResult, the S0 Skeleton/ScanApi). Every other frozen
// interface now lives beside its impl and is re-exported by `export *` from the runtime files below.
export type * from "./types.js"

// ── Runtime surface (Campaign-8 — bootstrap genesis) ─────────────────────────────────────────────────
export * from "./extract.js" // WP-8.28-a.GEN — budgeted grounded proposal (spend highest-first, 2-door, WhyNot)
export * from "./admit-harness.js" // WP-8.28-b.GEN — mechanical admission (HOLDS-and-flips-BROKEN; vacuous dropped)
export * from "./admit-transition.js" // #234 — the transition family's PURE admission legs (buildTransition/transitionWellFormed; justified, no oracle — D-T1), consumed by admit-harness AND the shipped producer
export * from "./admit-test-vacuity.js" // #95 D5 — the test-vacuity family's PURE seal legs (trySoundTestVacuity/buildSoundTestVacuity; proven via injected scanTestVacuity oracle), consumed by admit-harness AND the shipped producer
export * from "./cost-policy.js" // WP-8.28-c.GEN — tiered escalation defaults (1 sample/advisory/CEGIS≤1; refuter T0-only)
export * from "./align.js" // WP-8.29.GEN   — candidate-only writes + one batched ratification pass
export * from "./seed.js" // WP-8.29.GEN   — seed from ratified manifest; Awareness sources never fabricated
export * from "./coverage.js" // WP-8.30.GEN   — the per-site RUN LEDGER (GEN-8/12g) + its reconciliation
export * from "./run-controller.js" // WP-8.30.GEN   — resume/checkpoint + malformed-degrade + born-from-work hand-off
export * from "./loops.js" // WP-8.31.GEN   — governed deepening loops (opt-in, budget-gated, fixpoint-stopping)
export * from "./rank.js" // WP-8.27.GEN   — deterministic $0-LLM S0/S1 (scan canonicalize + integer fixed-point PPR + degenerate-history fallback)
export * from "./usefulness.js" // WP-6.18.GEN   — hits-calibrated seeds (GEN-16): loose-but-thin, decay/re-entry over the sealed KNOW-17 ledger
export * from "./verify-fact.js" // spike/verify-fact — the positive-dual dependency-fact oracle (proven/refuted/abstain)
export * from "./verify-count.js" // spike/verify-fact — the COUNT class: ≥N distinct callers under scope (sound lower bound)
export * from "./verify-negation.js" // spike/verify-fact — the NEGATION class: refute any-world, prove closed-world (#220 dual)
