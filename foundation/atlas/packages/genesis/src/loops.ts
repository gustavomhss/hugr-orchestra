// @atlas/genesis — src/loops.ts  (WP-8.31.GEN · GEN-14 — the governed deepening-loop controller)
//
// The three OPTIONAL deepening loops (REVIEW / ENRICH / EXPAND) as budget-gated, fixpoint-stopping passes
// over the EXISTING machinery (propose→verify = `ExtractApi`; relate() = atlas-retrieval RETR-10), adding
// NO new subsystem. Each loop is opt-in / default-shallow, halts at a diminishing-returns stop (a no-revision
// round · marginal value `< ε` · loop-until-dry), and is bounded by a round cap + budget (GEN-14a..d). With
// all loops OFF the machinery is touched ZERO times ⇒ genesis cost equals the single cheap pass (Δ=0). The
// GEN-14 fixpoint/ε carrier `LoopConfig` is the FROZEN types.ts type — reused, not re-declared.
//
// FLAG — `LoopConfig.epsilon` DEFAULT is OWNER-DEFINE. No MUST golden fixes its value, so `defaultLoops()`
// uses an INERT placeholder (loops default off ⇒ ε is never consulted) — NOT the owner's ratified default.

import type { StructRef } from "@atlas/contracts"
import type { Candidate, DeepeningLoops, ExtractApi, GenesisBudget, LoopConfig } from "./types.js"

// ── the ε-default placeholder (FLAG above) — inert while a loop is off ─────────────────────────────────
/** INERT placeholder for the OWNER-DEFINE `LoopConfig.epsilon` default (types.ts). Behind
 *  `enabled:false` in `defaultLoops()`, so it is never read; NOT the owner's ratified value. */
export const DEFAULT_EPSILON_PLACEHOLDER = 0

// ── governed-loop vocabulary ──────────────────────────────────────────────────────────────────────────

/** Why a governed loop stopped. `off` ⇒ never entered (Δ=0). The three deepening stops are `fixpoint`
 *  (a no-revision round), `marginal-value` (value gain `< ε`), and the anti-runaway `budget`/`depth` caps. */
export type LoopStop = "off" | "fixpoint" | "marginal-value" | "budget" | "depth"

/** The result of ONE loop round over the reused machinery. `revisions === 0` is the fixpoint signal;
 *  `value` is the marginal gain checked against `ε`; `calls` is the GEN-3 cost the round spent (≤ budget). */
export interface RoundResult {
  readonly revisions: number
  readonly calls: number
  readonly value: number
}

/** One governed round. Receives the round index + the remaining call budget; MUST spend `calls ≤ budgetLeft`
 *  (it reuses the already-budget-gated machinery). Never runs itself in a loop — the controller does. */
export type RoundFn = (round: number, budgetLeft: number) => RoundResult

/** The outcome of a governed loop: rounds executed (0 when off), total calls spent (0 when off ⇒ Δ=0),
 *  total revisions, and the stop reason. */
export interface LoopOutcome {
  readonly rounds: number
  readonly calls: number
  readonly revisions: number
  readonly stop: LoopStop
}

/** relate() (atlas-retrieval RETR-10) — the deterministic related-node set for a touched unit, consumed
 *  as a SEAM (reused, never re-implemented here). The full `RelationSet` lives in atlas-retrieval; the loop
 *  only needs the related anchors, so the seam is typed to the minimum it consumes. */
export interface RelateApi {
  relate(unit: StructRef): readonly StructRef[]
}

/** The EXISTING machinery the deepening loops reuse — nothing bespoke (GEN-14f/14g). Exactly two seams:
 *  the propose→verify harness (`ExtractApi`, types.ts) and relate() (`RelateApi`, RETR-10). */
export interface LoopMachinery {
  readonly proposeVerify: ExtractApi
  readonly relate: RelateApi
}

/** One ENRICH work item — an ALREADY-ADMITTED fact's anchor to deepen. `bornFromWorkLazy` marks a fact
 *  born-from-work would enrich lazily FOR FREE; ENRICH skips it (GEN-14h — no duplicated enrichment). */
export interface EnrichItem {
  readonly site: StructRef
  readonly bornFromWorkLazy: boolean
}

/** The inputs the three loops deepen over (all pre-ranked upstream). */
export interface DeepeningWork {
  readonly reviewCands: readonly Candidate[]
  readonly enrichItems: readonly EnrichItem[]
  readonly expandSites: readonly StructRef[]
}

/** The whole deepening outcome. `addedCalls` is the cost ADDED over the single cheap pass — `0` when all
 *  three loops are off (GEN-14e, Δ=0). */
export interface DeepeningOutcome {
  readonly review: LoopOutcome
  readonly enrich: LoopOutcome
  readonly expand: LoopOutcome
  readonly addedCalls: number
}

const ZERO_SIGNALS = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] } as const

// ── the DEFAULT (off / shallow) config — the GEN-14e baseline ─────────────────────────────────────────

/**
 * The default deepening config: all three loops OFF (GEN-14a) — none runs deep unless opted in, and
 * loops-off ⇒ genesis cost == the single cheap pass (GEN-14e, Δ=0). The "REVIEW on for `tier≥T1`" policy
 * is a caller ESCALATION (GEN-13 escalate-by-value), not the base default; the honest base floor is off.
 */
export function defaultLoops(): DeepeningLoops {
  const off: LoopConfig = { enabled: false, maxDepth: 0, epsilon: DEFAULT_EPSILON_PLACEHOLDER }
  return { review: off, enrich: off, expand: off }
}

/** Whether a loop is opted in (GEN-14a). A default-shallow config is NOT opted in. */
export function isOptedIn(cfg: LoopConfig): boolean {
  return cfg.enabled
}

/** A per-round budget carrier for a reused-machinery call — the SAME `GenesisBudget` gate the base pass
 *  uses (no new budget carrier), with inner loops OFF so the reuse never recurses. */
function capBudget(ceiling: number): GenesisBudget {
  return { ceiling: Math.max(0, ceiling), deepening: defaultLoops() }
}

// ── the governed controller ───────────────────────────────────────────────────────────────────────────

/**
 * Run ONE governed loop (GEN-14). Enforces, in order:
 *   • OPT-IN (GEN-14a): a loop that is off never enters — 0 rounds, 0 calls (Δ=0, GEN-14e).
 *   • ROUND CAP (GEN-14d): at most `cfg.maxDepth` rounds — no loop runs unbounded.
 *   • BUDGET GATE (GEN-14b): halts once spent calls reach `budget.ceiling`.
 *   • FIXPOINT STOP (GEN-14c): halts on the first no-revision round.
 *   • MARGINAL-VALUE STOP (GEN-14c): halts when a round's value gain `< cfg.epsilon`.
 * The `round` closure does the actual work by REUSING the machinery; the controller only governs it.
 */
export function runLoop(cfg: LoopConfig, budget: GenesisBudget, round: RoundFn): LoopOutcome {
  if (!isOptedIn(cfg)) return { rounds: 0, calls: 0, revisions: 0, stop: "off" } // GEN-14a/14e — Δ=0

  let calls = 0
  let revisions = 0
  let rounds = 0

  for (let d = 0; d < cfg.maxDepth; d += 1) {
    const budgetLeft = budget.ceiling - calls
    if (budgetLeft <= 0) return { rounds, calls, revisions, stop: "budget" } // GEN-14b

    const r = round(d, budgetLeft)
    calls += Math.min(r.calls, budgetLeft) // the round spends ≤ what it was handed
    revisions += r.revisions
    rounds += 1

    if (r.revisions === 0) return { rounds, calls, revisions, stop: "fixpoint" } // GEN-14c — no-revision round
    if (r.value < cfg.epsilon) return { rounds, calls, revisions, stop: "marginal-value" } // GEN-14c — <ε
    if (calls >= budget.ceiling) return { rounds, calls, revisions, stop: "budget" } // GEN-14b
  }

  return { rounds, calls, revisions, stop: "depth" } // GEN-14d — bounded by the round cap
}

// ── the three loops, each a thin round bound to the REUSED machinery (no bespoke pipeline, GEN-14f/g) ──

/**
 * REVIEW (quality) — an independent COLD re-pass over the just-seeded SET, reusing propose→verify
 * (`ExtractApi`, types.ts) to drop contradictions / redundancy / mis-tiering (cross-fact, vs S2's per-fact check).
 * A round that drops/abstains nothing is a no-revision round ⇒ the controller reaches the fixpoint.
 */
export function reviewRound(m: LoopMachinery, cands: readonly Candidate[]): RoundFn {
  return (_round, budgetLeft) => {
    const calls = Math.min(cands.length, budgetLeft) // one bounded call per re-visited site (GEN-2c reuse)
    const res = m.proposeVerify.extract(cands, capBudget(budgetLeft))
    // a cold review REVISES by dropping a just-seeded fact (it re-abstains); a re-pass that drops nothing
    // is a no-revision round ⇒ the controller reaches the fixpoint (GEN-14c).
    const revisions = res.abstained.length
    return { revisions, calls, value: revisions }
  }
}

/**
 * ENRICH (depth) — deepen ALREADY-ADMITTED facts, reusing relate() to link related facts (and the predicate
 * path upstream). GEN-14h: a fact born-from-work would enrich lazily FOR FREE is SKIPPED — no duplicated
 * enrichment. A round that surfaces no new links is a no-revision round ⇒ fixpoint.
 */
export function enrichRound(m: LoopMachinery, items: readonly EnrichItem[]): RoundFn {
  return (_round, budgetLeft) => {
    let calls = 0
    let revisions = 0
    for (const it of items) {
      if (calls >= budgetLeft) break // budget gate within the round (GEN-14b)
      if (it.bornFromWorkLazy) continue // GEN-14h — do not re-do born-from-work's free lazy enrichment
      const related = m.relate.relate(it.site) // reuse relate() (GEN-14f)
      calls += 1
      revisions += related.length
    }
    return { revisions, calls, value: revisions }
  }
}

/**
 * EXPAND (breadth) — follow the graph: a seeded fact's dependency edges (relate()) surface NEW sites off the
 * static PPR frontier, then re-rank + re-extract (propose→verify) over them. Reuses BOTH seams; loops
 * until dry, then the controller's round cap + budget bound it (GEN-14d — never unbounded).
 */
export function expandRound(m: LoopMachinery, seedSites: readonly StructRef[]): RoundFn {
  return (_round, budgetLeft) => {
    let calls = 0
    let revisions = 0
    for (const s of seedSites) {
      if (calls >= budgetLeft) break // budget gate within the round (GEN-14b)
      const neighbours = m.relate.relate(s) // dependency edges off the frontier (reuse relate(), GEN-14f)
      calls += 1
      const newCands: Candidate[] = neighbours.map((site, i) => ({
        site,
        signals: ZERO_SIGNALS,
        ppr: 1 / (i + 1),
        rank: i,
      }))
      const res = m.proposeVerify.extract(newCands, capBudget(budgetLeft - calls)) // reuse propose→verify
      revisions += res.facts.length
    }
    return { revisions, calls, value: revisions }
  }
}

// ── the whole deepening pass ──────────────────────────────────────────────────────────────────────────

/**
 * Run the three governed loops over `work`. `addedCalls` is the cost ADDED over the single cheap pass —
 * exactly `0` when all three loops are off (GEN-14e, Δ=0), because `runLoop` short-circuits an off loop
 * WITHOUT ever invoking its round (so the machinery is never touched).
 */
export function runDeepening(
  loops: DeepeningLoops,
  budget: GenesisBudget,
  m: LoopMachinery,
  work: DeepeningWork,
): DeepeningOutcome {
  const review = runLoop(loops.review, budget, reviewRound(m, work.reviewCands))
  const enrich = runLoop(loops.enrich, budget, enrichRound(m, work.enrichItems))
  const expand = runLoop(loops.expand, budget, expandRound(m, work.expandSites))
  const addedCalls = review.calls + enrich.calls + expand.calls
  return { review, enrich, expand, addedCalls }
}
