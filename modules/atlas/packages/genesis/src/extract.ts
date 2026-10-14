// @atlas/genesis — src/extract.ts  (WP-8.28-a.GEN · GEN-2 / GEN-4 / GEN-6 — the S2 proposal driver)
//
// The BUDGETED, RANKED-SITE S2 driver: the LLM fires only on ranked sites, HIGHEST-PPR-FIRST, ONE bounded
// call per site, under a HARD budget ceiling (default `min(frontier_size, 200)`, GEN-2), halting at the
// marginal-value floor (trailing-20 admit-rate `< 20%`). Every candidate is routed through the 2-door bar
// at atlas-emit (grounding re-derives, GEN-4; obviousness SCORED not gated, ADR-0012); admission is the gate's MECHANICAL verdict —
// a seed's self-declaration is NEVER consulted (GEN-4d). The ranking, the 2-door gate, and the escalation
// defaults are CALLED through the injected `ExtractDeps` seams, never authored here.

import type { PredicateSlot, RelationKind } from "@atlas/knowledge"
import type { Candidate, ExtractApi, ExtractResult, Fact, GenesisBudget, WhyNot } from "./types.js"

// ── GEN-2 marginal-value stop — the FIXED scheduler policy (atlas-genesis:117, types.ts) ──────────────
// Transcribed from the frozen `MarginalValueStop` literal type: a trailing window of the last 20 ranked
// sites; HALT once that window admits fewer than 4 (a `< 20%` admit-rate). Applied by the scheduler here,
// never carried on `GenesisBudget`.
export const MARGINAL_WINDOW = 20 as const
export const MARGINAL_MIN_ADMITS = 4 as const

/**
 * The hard budget ceiling default (GEN-2): `min(frontier_size, 200)` sites/run. A bare numeric `--budget N`
 * overrides it via `GenesisBudget.ceiling`; the driver enforces whatever ceiling it is handed. Named here
 * so the GEN-2 formula lives with the enforcement it governs.
 */
export function defaultCeiling(frontierSize: number): number {
  return Math.min(frontierSize, 200)
}

/**
 * The fields EVERY proposed seed carries, whatever its fact family (WP-96-SEAM2). Opaque to the driver —
 * the whole seed is routed straight to `EmitGate.emit`. A model MAY attach a self-declaration
 * (`selfAsserted` / `confidence`); the driver NEVER reads it (GEN-4d) — admission is the gate's verdict alone.
 */
interface SeedBase {
  readonly cand: Candidate
  /**
   * The trimmed CLAIM text. REQUIRED on every family (not just advisory): the existing advisory gates read
   * `seed.claim` off the un-narrowed `SeedProposal` unconditionally (mine-fixtures / e2e / genesis gates),
   * so widening the seed into a union whose members lacked `claim` would break `tsc` at every one of those
   * readers. So `claim` stays a shared, required base field — a relation/negation seed still carries a human
   * claim string (unread by the relation/negation proposal it builds, which grounds off its own legs). This
   * is the one place THIS WP overrides the brief's per-shape field list; see the returned card's framing note.
   */
  readonly claim: string
  /**
   * [#195c] The VALIDATED answer bytes as a string — the untrimmed answer envelope the model returned, of
   * which `claim` is the trimmed projection. Present ONLY on a model-produced seed that passed the adapter's
   * admission sanity gate (`llm.ts admitModelAnswer`). W-MINE scrubs this and puts it to CAS as the fact's
   * `answerRef` receipt (KNOW-11); the DRIVER here NEVER reads it (it is opaque provenance,
   * routed straight to the gate). Absent on a hand-built / human seed. Typed here rather than ridden as an
   * untyped widened field, so the emit path can thread it without a cast.
   */
  readonly rawAnswer?: string
  readonly selfAsserted?: boolean // IGNORED by the driver (GEN-4d) — never promotes a seed
  readonly confidence?: number //    IGNORED by the driver (GEN-4d) — never promotes a seed
}

/**
 * An ADVISORY seed (GEN-12e) — the ORIGINAL shape, and the ONLY one the default proposer produces. `kind` is
 * OPTIONAL so every existing producer/fixture (which omits it) stays a valid advisory seed byte-for-byte.
 */
export interface AdvisorySeed extends SeedBase {
  readonly kind?: "advisory"
}

/** A PREDICATE seed (GEN-12) — carries the `slot` that drives SOUND-ORACLE-FIRST at admission (GEN-12k). */
export interface PredicateSeed extends SeedBase {
  readonly kind: "predicate"
  readonly slot: PredicateSlot
  readonly target?: string // ADR-0017 dependency-slot leg — the global symbol X the fact depends on (absent for non-oracle slots)
  readonly scope?: string //  ADR-0017 dependency-slot leg — the directory key S the dependency witness ranges over
  readonly atLeast?: number // #196c count-slot leg — the WITNESSED lower bound N the harness derived (absent for non-count slots)
  readonly derivation?: string // 196b justified-slot leg — the contestable grounds a semantic slot carries onto `node.derivation`. UNLIKE `scratch` (discarded chain-of-thought), this is PERSISTED as the `justified` seal's own witness-analog (ADR-0017 CORRECTION 5). Absent for oracle slots (their witness is the proof).
}

/**
 * A RELATION seed (ADR-0015 D2, #99a) — the two location-free endpoint unitKeys + the closed `relationKind`.
 * NO relationKey: identity is minted DOWNSTREAM, never proposed by the model (KNOW-15b parity).
 */
export interface RelationSeed extends SeedBase {
  readonly kind: "relation"
  readonly relationKind: RelationKind
  readonly endpointA: string // location-free unitKey of A (subject)
  readonly endpointB: string // location-free unitKey of B (object)
}

/**
 * A NEGATION seed (ADR-0015 D3, #99b) — names the (relationKind, target, scope) the negative is ABOUT. NO
 * grounding: the governed door CONSTRUCTS the scope-directory Merkle grounding at admit (WP-96-N), not the seed.
 */
export interface NegationSeed extends SeedBase {
  readonly kind: "negation"
  readonly relationKind: RelationKind // the NEGATED relation (shares #99a's closed vocabulary)
  readonly target: string //            location-free GLOBAL symbol key the negative is about
  readonly scope: string //             the CLOSED scope (a DIRECTORY key) the witness ranges over
}

/**
 * A proposed seed from ONE bounded S2 call (GEN-12: the model only PROPOSES; admission is mechanical and
 * lives at the gate), discriminated by its fact FAMILY (`kind`). Widened from advisory-only by WP-96-SEAM2
 * so a mine pass can carry a predicate / relation / negation shape and the gate can dispatch on it; the
 * default proposer still emits advisory (a `kind`-less `AdvisorySeed`), so back-compat is byte-identical.
 */
export type SeedProposal = AdvisorySeed | PredicateSeed | RelationSeed | NegationSeed

/**
 * The single bounded LLM call per site (GEN-2). CALLED, never defined here (the proposer/admission engine
 * is EPIC-28-b). The driver invokes this EXACTLY ONCE per visited site. Three distinct outcomes:
 *   - a `SeedProposal` — a grounded proposal the driver routes to the gate;
 *   - `null` — a PLAIN GEN-12 model-abstention (the model declined; an empty answer is not a corruption);
 *   - `{ abstain }` — [#195c] a MALFORMED-ANSWER abstention, carrying the sanity gate's already-tagged
 *     `answer-malformed:*` sub-reason so a spliced/corrupt answer drives a DISTINCT, greppable grounded
 *     `WhyNot` instead of vanishing into the silent `null` case (the 2026-08-04 splice was invisible).
 */
export interface SiteProposer {
  propose(cand: Candidate): SeedProposal | { readonly abstain: string } | null
}

/** The gate's mechanical verdict: an admitted grounded `Fact`, or a grounded `WhyNot` abstention. */
export type EmitVerdict =
  | { readonly emitted: true; readonly fact: Fact }
  | { readonly emitted: false; readonly whyNot: WhyNot }

/**
 * The admission bar at atlas-emit (truth: grounding re-derives FRESH by subtreeHash; usefulness: non-obvious
 * ∧ actionable) — CALLED, never defined here (CAMPAIGN-4). Admission depends ONLY on this verdict; the
 * seed's own self-declaration is never an input (GEN-4d). An un-admitted seed yields a grounded `WhyNot`.
 */
export interface EmitGate {
  emit(seed: SeedProposal, cand: Candidate): EmitVerdict
}

/** The injected S2 seams the driver calls (GEN-2/4). Nothing here is authored by this WP — it orchestrates. */
export interface ExtractDeps {
  readonly proposer: SiteProposer
  readonly gate: EmitGate
}

/** Highest-PPR-first order (GEN-2). Deterministic: PPR descending, ties broken by the stable `rank` (GEN-11). */
function byPprDescending(a: Candidate, b: Candidate): number {
  if (b.ppr !== a.ppr) return b.ppr - a.ppr
  return a.rank - b.rank
}

/** Count of admits within the trailing window (GEN-2 marginal-value stop). */
function admitsIn(window: readonly boolean[]): number {
  let n = 0
  for (const admitted of window) if (admitted) n += 1
  return n
}

/**
 * The S2 proposal driver (GEN-2/4/6). Consumes the RANKED frontier and:
 *   • visits highest-PPR-first, ONE bounded call per site (GEN-2b/2c) — never an un-ranked site, no
 *     repo-wide sweep (GEN-2a/2f: the driver only ever iterates the frontier it is handed);
 *   • enforces the HARD ceiling `budget.ceiling` (GEN-2d) and HALTS at the marginal-value floor once the
 *     trailing-20 window admits `< 4` (GEN-2e);
 *   • routes every seed through the 2-door bar (GEN-4) — a fact enters the set ONLY on `emitted:true`,
 *     carrying the gate's grounded (subtreeHash) record; a self-declaration never promotes a seed (GEN-4d);
 *   • mints NO fact from `candidate.signals` — the fact set is built solely from gate verdicts (GEN-6).
 * Total: never throws on the driver path.
 */
export function runExtract(cands: readonly Candidate[], budget: GenesisBudget, deps: ExtractDeps): ExtractResult {
  const ranked = [...cands].sort(byPprDescending) // highest-PPR-first (GEN-2b), deterministic
  const facts: Fact[] = []
  const abstained: WhyNot[] = []
  const window: boolean[] = [] // trailing admit-outcomes (GEN-2 marginal-value stop)
  let visited = 0 // one bounded call per visited site — the GEN-2 spend counter

  for (const cand of ranked) {
    // GEN-2d hard ceiling: no call past the budget.
    if (visited >= budget.ceiling) break
    // GEN-2e marginal-value halt: once the trailing-20 window admits `< 4`, stop — do NOT drain the budget.
    if (window.length >= MARGINAL_WINDOW && admitsIn(window) < MARGINAL_MIN_ADMITS) break

    // GEN-2c: EXACTLY ONE bounded call per site (no self-consistency, no re-call).
    const seed = deps.proposer.propose(cand)
    visited += 1

    let admitted = false
    if (seed === null) {
      // GEN-12: abstention is first-class — a site that yields no proposal yields a grounded WhyNot.
      abstained.push({ site: cand.site, reason: "model abstained: no grounded fact at site" })
    } else if ("abstain" in seed) {
      // [#195c] A MALFORMED-answer abstention is DISTINCT from a plain model-abstain: it produces a grounded
      // WhyNot whose reason is the sanity gate's `answer-malformed:*` sub-reason (carried VERBATIM, never
      // re-derived), so the spliced/corrupt-answer class is GREPPABLE in the run ledger rather than silent.
      abstained.push({ site: cand.site, reason: seed.abstain })
    } else {
      // GEN-4: admission is the mechanical 2-door verdict alone (self-declaration on `seed` is NOT read).
      const verdict = deps.gate.emit(seed, cand)
      if (verdict.emitted) {
        facts.push(verdict.fact) // GEN-6: the fact comes from the gate, never from cand.signals
        admitted = true
      } else {
        abstained.push(verdict.whyNot)
      }
    }

    window.push(admitted)
    if (window.length > MARGINAL_WINDOW) window.shift() // keep only the trailing 20
  }

  return { facts, abstained }
}

/**
 * Bind the driver to the frozen `ExtractApi` (types.ts) — `extract(cands, budget)` with the injected
 * S2 seams captured in the closure. The signature is EXACTLY the frozen surface; the seams are the "it
 * calls them" ports (card exclusions), never a change to the contract.
 */
export function makeExtract(deps: ExtractDeps): ExtractApi {
  return {
    extract: (cands: readonly Candidate[], budget: GenesisBudget): ExtractResult => runExtract(cands, budget, deps),
  }
}

// differential-vs-oracle (compile-time): `makeExtract` conforms to the frozen ExtractApi surface.
const _extract: (deps: ExtractDeps) => ExtractApi = makeExtract
void _extract
