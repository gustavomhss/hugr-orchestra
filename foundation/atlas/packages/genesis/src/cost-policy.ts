// @atlas/genesis — src/cost-policy.ts   (WP-8.28-c.GEN — EPIC-28-c, GEN-13)
//
// The S2 ESCALATION CONTROLLER — tiered escalation defaults (cost discipline: CHEAP BY DEFAULT, ESCALATE BY
// VALUE). Every S2 mechanism BEYOND a single grounded proposal is OFF at the base tier; it switches on ONLY
// when a cheap signal shows the candidate is high-value (tier/blast) AND uncertain. Frozen defaults: one
// sample (no self-consistency), advisory-unless-checkable ∧ `tier≥T1`, CEGIS `K≤1`, refuter for `T0` ONLY,
// Semgrep-before-CodeQL, any query DB built ONCE (amortized). Reports cost PER STAGE under the ceiling.
// Implements the frozen `BudgetApi` (types.ts); the cheap escalation signal is an INJECTED `SignalOracle`.

import type { StructRef, Tier } from "@atlas/contracts"
import { isWeakerTier } from "@atlas/knowledge"
import type {
  BudgetApi,
  Candidate,
  CostReport,
  EscalationDecision,
  GenesisBudget,
  Mechanism,
  PipelineStage,
  StageCost,
} from "./types.js"

// ── the frozen GEN-13 defaults ─────────────────────────────────────────────────────────────────────────

/** One sample at base — NO self-consistency voting (GEN-13c). The default draw is a single proposal. */
export const DEFAULT_SAMPLES = 1 as const

/** CEGIS refinement is bounded at `K≤1` by default (GEN-13e) — at most one refine round before drop. */
export const DEFAULT_CEGIS_K = 1 as const

// ── the cheap escalation signal (injected seam input) ──────────────────────────────────────────────────

/**
 * The cheap signal the escalation predicate gates on (GEN-13). The frozen `Candidate` carries no
 * tier/uncertainty/checkability, so these are SUPPLIED by an upstream cheap probe — never invented onto the
 * contract. A base-tier site is `{ highValue:false, uncertain:false, checkable:false }` (the single-proposal
 * floor).
 *   - `tier`      — the candidate tier (`T0` highest); gates the refuter (`T0` only) and the checkable floor.
 *   - `highValue` — a high tier/blast site (the value leg of the escalation conjunction).
 *   - `uncertain` — the cheap uncertainty flag (the uncertainty leg — BOTH legs required to escalate).
 *   - `checkable` — the slot is mechanically checkable (drives advisory-vs-predicate, GEN-13d).
 */
export interface CheapSignal {
  readonly tier: Tier
  readonly highValue: boolean
  readonly uncertain: boolean
  readonly checkable: boolean
}

/** The injected cheap-signal port: maps a ranked site to its escalation signal. CALLED, never defined here. */
export interface SignalOracle {
  signal(cand: Candidate): CheapSignal
}

// ── the escalation predicate + mechanism decision (GEN-13a/b/f) ─────────────────────────────────────────

/**
 * `tier≥floor` on the `T0 > T1 > T2` order — the checkable / predicate floor (GEN-13d).
 *
 * Derived from THE lattice (`@atlas/knowledge`), never from a private rank table. This function used to
 * carry its own `Record<Tier, number>`, which made it the fifth such table in the tree and gave it the same
 * de-totalised shape the lattice was created to kill: `Tier` is TYPE-ONLY, so an off-lattice value read
 * `undefined` out of the table and `undefined >= 1` is `false` — a silent answer, not a refusal.
 *
 * TOTAL over `unknown` and FAIL-CLOSED by construction: `isWeakerTier` returns `true` for anything off the
 * lattice on either side, so `tierAtLeast` returns `false` — the candidate falls back to `advisory` and
 * check-synthesis is skipped. That is the LESS-privileged branch at both call sites below, so the
 * degradation is safe; it is now stated rather than inherited from an arithmetic accident.
 */
export function tierAtLeast(tier: unknown, floor: unknown): boolean {
  return !isWeakerTier(tier, floor)
}

/**
 * GEN-13b — the ONLY gate that switches extra mechanisms on: `high-value ∧ uncertain`. BOTH conjuncts are
 * required — a high-value ∧ certain site stays at the single-proposal base (never escalates on value alone).
 */
export function shouldEscalate(sig: CheapSignal): boolean {
  return sig.highValue && sig.uncertain
}

/** GEN-13f — the small-model refuter fires for `T0`-candidates ONLY; every other tier skips it. */
export function runsRefuter(tier: Tier): boolean {
  return tier === "T0"
}

/**
 * GEN-13a/b — the escalation decision for one site. At the base tier (NOT high-value ∧ uncertain) the set is
 * EMPTY: exactly one LLM call, every extra mechanism off (no self-consistency, no check synthesis, no
 * refuter, no CodeQL). When the site is high-value ∧ uncertain the extras switch on: self-consistency to
 * cross-check the uncertain claim, check-synthesis when the slot is checkable ∧ `tier≥T1` (GEN-13d), and the
 * refuter for a `T0` site only (GEN-13f).
 */
export function decideMechanisms(sig: CheapSignal): readonly Mechanism[] {
  if (!shouldEscalate(sig)) return [] // base tier — one grounded proposal, all extras OFF
  const mechanisms: Mechanism[] = ["self-consistency"]
  if (sig.checkable && tierAtLeast(sig.tier, "T1")) mechanisms.push("check-synthesis")
  if (runsRefuter(sig.tier)) mechanisms.push("refuter")
  return mechanisms
}

// ── advisory-vs-predicate default (GEN-13d) ────────────────────────────────────────────────────────────

/** A candidate's default kind — an advisory claim or a mechanically-checked predicate. */
export type CandidateKind = "advisory" | "predicate"

/**
 * GEN-13d — a candidate defaults to ADVISORY unless it is mechanically checkable AND `tier≥T1`; only then is
 * it a predicate. The guard is a conjunction: an un-checkable candidate, or a checkable-but-low-tier one,
 * stays advisory.
 */
export function defaultKind(sig: CheapSignal): CandidateKind {
  return sig.checkable && tierAtLeast(sig.tier, "T1") ? "predicate" : "advisory"
}

// ── analyzer choice: Semgrep before CodeQL (GEN-13g) ───────────────────────────────────────────────────

/** The static-analysis engine a synthesized check runs on. Semgrep is the cheap one, CodeQL the expensive. */
export type Analyzer = "semgrep" | "codeql"

/**
 * GEN-13g — Semgrep (cheaper) is attempted FIRST; CodeQL is chosen only when Semgrep cannot express the
 * check. The expensive analyzer never runs before the cheap one.
 */
export function chooseAnalyzer(semgrepExpressible: boolean): Analyzer {
  return semgrepExpressible ? "semgrep" : "codeql"
}

// ── the query DB, built once (GEN-13h) ─────────────────────────────────────────────────────────────────

/** An amortized query DB: built ONCE on first use, reused across every check (GEN-13h). */
export interface QueryDb<T> {
  get(): T
  builds(): number
}

/**
 * GEN-13h — memoize a query-DB build so N checks over the same repo trigger EXACTLY ONE build (amortized),
 * never a per-check rebuild. The first `get()` builds and caches; every later `get()` returns the cache.
 */
export function makeQueryDb<T>(build: () => T): QueryDb<T> {
  let cached: { readonly db: T } | null = null
  let count = 0
  return {
    get(): T {
      if (cached === null) {
        cached = { db: build() }
        count += 1
      }
      return cached.db
    },
    builds(): number {
      return count
    },
  }
}

// ── scope: no whole-repo pass; scopable to a subtree (GEN-13i/j) ────────────────────────────────────────

/** GEN-13j — a site is in scope when no `--scope` is set, or its `qualifiedPath` is under the scope prefix. */
export function inScope(site: StructRef, scope?: string): boolean {
  return scope === undefined || site.qualifiedPath.startsWith(scope)
}

/**
 * GEN-13i/j — the sites a run processes: the HANDED frontier, filtered to `--scope`. Genesis never expands
 * beyond the frontier it is given (no whole-repo pass, GEN-13i); with a scope the cold tail is left to
 * born-from-work (GEN-13j).
 */
export function plan(frontier: readonly Candidate[], scope?: string): readonly Candidate[] {
  return frontier.filter((cand) => inScope(cand.site, scope))
}

// ── per-stage cost (GEN-13k) ───────────────────────────────────────────────────────────────────────────

/** Accumulates the per-stage LLM-call cost (GEN-13k). `report()` is the `GenesisReport` cost breakdown. */
export interface CostRecorder {
  record(stage: PipelineStage, llmCalls: number): void
  report(): CostReport
}

/**
 * GEN-13k — a per-stage cost recorder. Calls are summed PER pipeline stage (S0 scan / S1 mine+rank / S2
 * extract / …), so the `GenesisReport` carries a per-stage breakdown — never a single lump total. LLM-call
 * count is the GEN-3 cost oracle (a function of the frontier, never of file/line count).
 */
export function makeCostRecorder(): CostRecorder {
  const byStage = new Map<PipelineStage, number>()
  return {
    record(stage: PipelineStage, llmCalls: number): void {
      byStage.set(stage, (byStage.get(stage) ?? 0) + llmCalls)
    },
    report(): CostReport {
      return [...byStage.entries()].map(([stage, llmCalls]): StageCost => ({ stage, llmCalls }))
    },
  }
}

// ── the frozen BudgetApi binding ───────────────────────────────────────────────────────────────────────

/** The controller's injected seams — the cheap-signal port + the per-stage cost recorder. */
export interface BudgetDeps {
  readonly signal: SignalOracle
  readonly cost: CostRecorder
}

/**
 * Bind the escalation controller to the frozen `BudgetApi` (types.ts): `escalate(cand, budget)` reads
 * the injected cheap signal and returns the `{ tier, mechanisms }` decision (base ⇒ `[]`, exactly one call);
 * `report()` returns the accumulated per-stage `CostReport`. The signature is EXACTLY the frozen surface —
 * the signal port is the "it calls them" seam (card exclusions), never a change to the contract.
 */
export function makeBudget(deps: BudgetDeps): BudgetApi {
  return {
    escalate(cand: Candidate, _budget: GenesisBudget): EscalationDecision {
      const sig = deps.signal.signal(cand)
      return { tier: sig.tier, mechanisms: decideMechanisms(sig) }
    },
    report(): CostReport {
      return deps.cost.report()
    },
  }
}

// differential-vs-oracle (compile-time): `makeBudget` conforms to the frozen BudgetApi surface.
const _budget: (deps: BudgetDeps) => BudgetApi = makeBudget
void _budget
