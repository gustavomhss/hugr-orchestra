// @atlas/genesis — test/wp-8.28-c-gen.test.ts  (WP-8.28-c.GEN)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the S2 ESCALATION CONTROLLER (GEN-13 cost
// discipline — cheap by default, escalate by value): SCN-GEN-13a-1 … SCN-GEN-13k-1. The facet is the
// tiered-escalation defaults — base tier is EXACTLY one grounded proposal (all extra S2 mechanisms OFF),
// switching on ONLY when a cheap signal shows the candidate is high-value ∧ uncertain. Defaults: one
// sample (no self-consistency), advisory-unless-checkable ∧ `tier≥T1`, CEGIS `K≤1`, refuter for `T0`
// ONLY, Semgrep-before-CodeQL, query DB built once, run scopable (no whole-repo pass), cost per stage.
//
// The facet is imported DIRECTLY from ../src/cost-policy.js (the barrel is wired by the lead at SEAL). The
// oracle is the FROZEN `types.ts` (`BudgetApi.escalate`/`report`, `EscalationDecision`,
// `Mechanism`, `GenesisBudget`, `Candidate`, `StageCost`/`CostReport`, per-stage
// cost). The cheap SIGNAL that gates escalation is an injected seam (a `SignalOracle` port) — the frozen
// `Candidate` carries no tier/uncertainty/checkability, so the signal is supplied, never invented onto the
// contract. StructRef identity rides the SEALED @atlas/kernel mint (`asSubtreeHash`), never a hand-rolled
// digest. Held-out `-2` fixtures are NOT transcribed.
//
// FLAG: interface_contract digest is `<filled-at-freeze>` (simulated) — resolved by disciplined judgment,
// not a real freeze hash. `GenesisReport.cost?` is FLAGGED optional in the oracle (surface-vs-acceptance
// tension); GEN-13k reads the per-stage `CostReport` directly, honoring the flag.

import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef, Tier } from "@atlas/contracts"
import type { Candidate, MinedSignals } from "@atlas/genesis"
import type { GenesisBudget } from "@atlas/genesis"
import {
  DEFAULT_SAMPLES,
  DEFAULT_CEGIS_K,
  shouldEscalate,
  decideMechanisms,
  runsRefuter,
  defaultKind,
  chooseAnalyzer,
  makeQueryDb,
  inScope,
  plan,
  makeCostRecorder,
  makeBudget,
  type CheapSignal,
  type SignalOracle,
} from "../src/cost-policy.js"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────

/** The cheap escalation signal (the seam input GEN-13 gates on). Defaults = the base-tier floor. */
const sig = (over: Partial<CheapSignal>): CheapSignal => ({
  tier: "T2",
  highValue: false,
  uncertain: false,
  checkable: false,
  ...over,
})

const ZERO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }

/** A ranked mining site anchored at `<scope><id>` (the scope filter rides `qualifiedPath`). */
const candOf = (id: string, scope = ""): Candidate => {
  const qualifiedPath = `${scope}${id}`
  const site: StructRef = { kind: "symbol", qualifiedPath, subtreeHash: asSubtreeHash(`st-${qualifiedPath}`) }
  return { site, signals: ZERO_SIGNALS, ppr: 0.5, rank: 1 }
}
const pathOf = (c: Candidate): string => c.site.qualifiedPath

const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const
const BUDGET: GenesisBudget = { ceiling: 200, deepening: { review: OFF, enrich: OFF, expand: OFF } }

// ── GEN-13a — base tier: a single grounded proposal, all extras off ────────────────────────────────────

describe("GEN-13 — cheap by default: the base tier is exactly one grounded proposal", () => {
  it("SCN-GEN-13a-1: base tier runs a single grounded proposal — every extra mechanism is off", () => {
    const s3 = sig({ tier: "T2", highValue: false, uncertain: true }) // NOT (high-value ∧ uncertain)
    expect(shouldEscalate(s3)).toBe(false)
    // self-consistency / refuter / CEGIS>1 / CodeQL are all OFF — an empty mechanism set is one LLM call.
    expect(decideMechanisms(s3)).toEqual([])
    // teeth: self-consistency-on-by-default would draw 3 samples for `s3` instead of 1.
    expect(DEFAULT_SAMPLES).toBe(1)
  })

  it("SCN-GEN-13b-1: a mechanism switches on only when high-value ∧ uncertain", () => {
    const s1 = sig({ tier: "T0", highValue: true, uncertain: true, checkable: true }) // high-value ∧ uncertain
    const s2 = sig({ tier: "T1", highValue: true, uncertain: false }) // high-value BUT certain
    const s4 = sig({ tier: "T2", highValue: false, uncertain: false }) // low tier, certain
    expect(shouldEscalate(s1)).toBe(true)
    // teeth: dropping the uncertainty conjunct would escalate `s2` (high-value ∧ certain).
    expect(shouldEscalate(s2)).toBe(false)
    expect(shouldEscalate(s4)).toBe(false)
    expect(decideMechanisms(s1).length).toBeGreaterThan(0)
    expect(decideMechanisms(s2)).toEqual([])
    expect(decideMechanisms(s4)).toEqual([])
  })

  it("SCN-GEN-13c-1: the default is one sample, no self-consistency", () => {
    const base = sig({ tier: "T2", highValue: false, uncertain: true })
    // teeth: a default of 5 samples + majority-vote is self-consistency on by default.
    expect(DEFAULT_SAMPLES).toBe(1)
    expect(decideMechanisms(base)).not.toContain("self-consistency")
  })

  it("SCN-GEN-13d-1: a candidate defaults to advisory unless checkable ∧ tier≥T1", () => {
    const a = sig({ tier: "T1", checkable: false }) // not mechanically checkable
    const b = sig({ tier: "T1", checkable: true }) //  checkable ∧ T1
    // teeth: an un-checkable candidate admitted as a predicate drops the checkable∧T1 guard.
    expect(defaultKind(a)).toBe("advisory")
    expect(defaultKind(b)).toBe("predicate")
    // the guard is a CONJUNCTION — a checkable T2 stays advisory (tier<T1).
    expect(defaultKind(sig({ tier: "T2", checkable: true }))).toBe("advisory")
  })

  it("SCN-GEN-13e-1: CEGIS default refinement bound is K≤1", () => {
    // teeth: a default of K=10 loops the refinement 10× per candidate (cost blow-up).
    expect(DEFAULT_CEGIS_K).toBe(1)
    expect(DEFAULT_CEGIS_K).toBeLessThanOrEqual(1)
  })
})

// ── GEN-13f/g/h — the escalated-mechanism gates ────────────────────────────────────────────────────────

describe("GEN-13 — escalate by value: each mechanism is tier/cost-gated", () => {
  it("SCN-GEN-13f-1: the refuter runs only for T0 candidates", () => {
    expect(runsRefuter("T0")).toBe(true)
    expect(runsRefuter("T1")).toBe(false)
    // teeth: a refuter that runs for every tier would fire the small-model refuter on a T2 candidate.
    expect(runsRefuter("T2")).toBe(false)
    // and it surfaces in the escalated decision for a T0 site, but never for a T1 one.
    expect(decideMechanisms(sig({ tier: "T0", highValue: true, uncertain: true }))).toContain("refuter")
    expect(decideMechanisms(sig({ tier: "T1", highValue: true, uncertain: true }))).not.toContain("refuter")
  })

  it("SCN-GEN-13g-1: Semgrep is attempted before CodeQL", () => {
    expect(chooseAnalyzer(true)).toBe("semgrep") // expressible in the cheap analyzer ⇒ Semgrep first
    // teeth: a CodeQL-first default would invoke the expensive analyzer even when Semgrep can express it.
    expect(chooseAnalyzer(false)).toBe("codeql") // CodeQL only when Semgrep cannot express it
  })

  it("SCN-GEN-13h-1: the query DB is built once, never per-check", () => {
    let builds = 0
    const db = makeQueryDb(() => {
      builds += 1
      return { name: "codeql-db" }
    })
    for (let i = 0; i < 20; i += 1) db.get() // 20 checks over the same repo
    // teeth: rebuilding per-check would trigger 20 DB builds.
    expect(builds).toBe(1)
    expect(db.builds()).toBe(1)
    expect(db.get().name).toBe("codeql-db")
  })
})

// ── GEN-13i/j — no whole-repo pass; scopable to a subtree ──────────────────────────────────────────────

describe("GEN-13 — genesis is scopable, no whole-repo pass required", () => {
  it("SCN-GEN-13i-1: genesis requires no whole-repo pass — only the frontier is processed", () => {
    // a 4-site frontier in a nominal 900-symbol repo — the controller only ever sees the handed frontier.
    const frontier = [candOf("s1"), candOf("s2"), candOf("s3"), candOf("s4")]
    const processed = plan(frontier)
    // teeth: a mandatory whole-repo pass would analyze all 900 symbols, not just the 4-site frontier.
    expect(processed.length).toBe(4)
    expect(processed).toEqual(frontier)
  })

  it("SCN-GEN-13j-1: genesis is scopable to a subtree, cold tail left to born-from-work", () => {
    const frontier = [
      candOf("post", "ledger/"),
      candOf("reconcile", "ledger/"),
      candOf("login", "auth/"),
      candOf("fmt", "util/"),
    ]
    const processed = plan(frontier, "ledger/")
    expect(processed.map(pathOf)).toEqual(["ledger/post", "ledger/reconcile"])
    // teeth: an ignored --scope would process the auth/ + util/ cold tail too.
    expect(processed.some((c) => pathOf(c).startsWith("auth/"))).toBe(false)
    expect(processed.some((c) => pathOf(c).startsWith("util/"))).toBe(false)
    expect(inScope({ kind: "symbol", qualifiedPath: "auth/login", subtreeHash: asSubtreeHash("x") }, "ledger/")).toBe(
      false,
    )
  })
})

// ── GEN-13k — the GenesisReport carries per-stage cost ─────────────────────────────────────────────────

describe("GEN-13 — cost is reported per stage, under the ceiling", () => {
  it("SCN-GEN-13k-1: the cost report carries a per-stage breakdown, not a single lump total", () => {
    const cost = makeCostRecorder()
    cost.record("S0", 0) // scan   — $0 deterministic
    cost.record("S1", 0) // mine   — $0
    cost.record("S1", 0) // rank   — $0 (also S1)
    cost.record("S2", 5) // extract — the only LLM stage
    const report = cost.report()

    const stages = report.map((s) => s.stage)
    expect(stages).toContain("S0")
    expect(stages).toContain("S1")
    expect(stages).toContain("S2")
    expect(report.find((s) => s.stage === "S2")?.llmCalls).toBe(5)
    // under the ceiling (GEN-2).
    expect(report.reduce((n, s) => n + s.llmCalls, 0)).toBeLessThanOrEqual(BUDGET.ceiling)
    // teeth: a single lump total would carry no per-stage keys (length 1, no S0/S1/S2 breakdown).
    expect(report.length).toBeGreaterThan(1)
  })
})

// ── the frozen BudgetApi binding ───────────────────────────────────────────────────────────────────────

describe("makeBudget binds the frozen BudgetApi surface", () => {
  it("escalate(cand, budget) reads the cheap signal and returns the tier + mechanism decision", () => {
    const cost = makeCostRecorder()
    const signal: SignalOracle = {
      signal: (): CheapSignal => sig({ tier: "T0", highValue: true, uncertain: true, checkable: true }),
    }
    const api = makeBudget({ signal, cost })
    const decision = api.escalate(candOf("applyPosting", "ledger/"), BUDGET)
    expect(decision.tier).toBe("T0")
    expect(decision.mechanisms).toContain("refuter") // T0 ∧ escalated
    expect(api.report()).toEqual([]) // nothing recorded yet ⇒ empty per-stage report
  })

  it("a base-tier signal yields the empty (single-proposal) mechanism set through the frozen surface", () => {
    const cost = makeCostRecorder()
    const baseTiers: Tier = "T2"
    const signal: SignalOracle = { signal: (): CheapSignal => sig({ tier: baseTiers }) }
    const api = makeBudget({ signal, cost })
    expect(api.escalate(candOf("fmt", "util/"), BUDGET).mechanisms).toEqual([])
  })
})
