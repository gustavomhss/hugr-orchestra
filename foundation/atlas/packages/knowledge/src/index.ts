// @atlas/knowledge — barrel
//
// Layer 4: the write-decision / lifecycle / ratification / check-engine — the Knowledge kind of the
// Atlas (the shared, grounded, project-level truth). Re-exports the package's FULL public surface so
// consumers import from the bare package root (`import type { GroundedFact } from '@atlas/knowledge'`).
// Each frozen interface is co-located with its impl; the shared/multi-consumer ones (EvaluatorApi /
// StoreApi) live in types.ts beside the data model.

// The frozen data model + the co-located EvaluatorApi / StoreApi interfaces consumed by ≥2 src files.
// Every other frozen interface now lives beside its impl and is re-exported by `export *` below.
// 196c — the runtime `isSemanticSlot` guard. MUST precede the `export type *` star below: reachability.mjs's
// `declaringModule` returns on the FIRST matching re-export, and a `type *` star degrades any name it captures
// to a TYPE binding — so if the star came first, this VALUE export would resolve type-only and read as an
// uncalled reference model even though `adapter-io/src/llm.ts` calls it. Value re-export first ⇒ value binding.
export { isSemanticSlot } from "./types.js"
export type * from "./types.js"

// ── Runtime surface ────────────────────────────────────────────────────────────────────────────────
export * from "./lifecycle/freshness.js" // WP-4.10-a.KNOW — knowledge drift oracle binds to the grounding subtreeHash (Campaign-4)
export * from "./lifecycle/emit.js" // WP-4.11-a.KNOW — grounded emit: a fact is truth only if grounded (fail-closed)
export * from "./lifecycle/status.js" // WP-4.11-a.KNOW — status recompute drops the node-declared verdict (never self-declared)
export * from "./lifecycle/reconcile.js" // WP-4.12-a.KNOW — drift split: mechanical auto-reground, semantic block, reauthor==|semantic|
// Campaign-5 (knowledge lifecycle) runtime surface:
export * from "./write/router.js" // WP-5.13-a.KNOW — write-routing: every write an upsert (exhaustive over the KNOW-4 cells)
export * from "./write/link.js" // WP-SAMEAS — the pure symmetric `sameAs` write/RETRACT reducers (total, no-op on self/absent)
export * from "./write/closed-slot.js" // KNOW-10/15i — the closed-13-slot write REFUSAL (#152), enforced at `upsert`; ABSENT stands aside (a stated NARROWING — read that file)
export * from "./read/subsumes.js" // WP-DEDUP-2 · DP-2 — derive the `subsumes` coverage relation on read (never stored)
export * from "./read/relations.js" // ADR-0015 D2 / #99a — derive the bidirectional grounded-relation set on read (never stored)
export * from "./read/negations.js" // ADR-0015 D3 / #99b — derive the grounded-negation set + honest abstentions on read (#202 observability)
export * from "./read/transitions.js" // ADR-0015 D4 / #234 — derive the grounded-transition set + lineage supersession on read (never a stored flip)
export * from "./read/test-vacuity.js" // ADR-0015 D5 / #95 — derive the grounded test-vacuity set on read (single-anchor, no lineage, never stored)
export * from "./write/negation-key.js" // ADR-0015 D3 / #99b — the scoped-negative's identity leg (negationKey + MalformedNegationError); also re-exported by router.js
export * from "./read/sameas.js" // WP-SAMEAS — derive the transitive `sameAs` equivalence on read (union-find, never a merge); A-D3 — retraction-aware, + `sameAsEdgeState`
export * from "./lifecycle/evaluator.js" // WP-5.16.KNOW  — predicate check-engine: deterministic index-query, no code execution
export * from "./lifecycle/produce.js" // WP-5.17.KNOW  — production-moments: writes fire only at the 3 moments; sealing fed-or-why-not
// WP-5.14.KNOW (fact lifecycle) — unblocked by the R3 data-model reconciliation (ADR-0001):
export * from "./write/template.js" // KNOW-10 — required-field ∧ ≤512B cap ∧ closed-13-slot template validate
export * from "./write/authz.js" // KNOW-11 — isScope: the runtime SHAPE half of the write gate. The DECISION (`actorInScope`) lives in adapter-io/src/policy.ts; the second, nominal implementation that used to live here had zero production callers and was deleted (#186 — see the file header)
export * from "./write/archive.js" // KNOW-12 — supersede via CAS dedup, supersededBy as a Hash return-leg
// WP-5.15.KNOW (tier-routed ratification + confidence fast-path) — unblocked by R3 RatifyContext:
export * from "./ratify/init.js" // KNOW-6  — $0-LLM territory classify (tier=T2, T0-candidate flag)
export * from "./ratify/tier.js" // KNOW-7  — tier routing
export * from "./ratify/ratify.js" // KNOW-8  — T0 → human+billy (never auto), staged/token
export * from "./ratify/fastpath.js" // KNOW-18 — auto-accept ONLY grounded∧lowRisk∧T2∧advisory∧¬contested (route(candidate, ctx))
// Campaign-6:
export * from "./lifecycle/hits.js" // WP-6.18.KNOW — served-fact hits ledger + door-2 threshold calibration + decay/re-entry
