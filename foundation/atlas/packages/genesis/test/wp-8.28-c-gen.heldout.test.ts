// @atlas/genesis — test/wp-8.28-c-gen.heldout.test.ts  (WP-8.28-c.GEN — HELD-OUT gate)
//
// Cold held-out transcription of the `-2` goldens SCN-GEN-13a-2 … SCN-GEN-13k-2 (held_out:true) from
// docs/requirements/goldens-gen.md. Authored by the reviewer against the EXISTING src (no src changes) to
// probe over-fit to the visible `-1` fixtures. Same oracle surface (../src/cost-policy.js + frozen
// types.ts); different fixtures (h1..h5, billing/ scope, 30 builds, 1200 syms).

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

const sig = (over: Partial<CheapSignal>): CheapSignal => ({
  tier: "T2",
  highValue: false,
  uncertain: false,
  checkable: false,
  ...over,
})

const ZERO_SIGNALS: MinedSignals = { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }

const candOf = (id: string, scope = ""): Candidate => {
  const qualifiedPath = `${scope}${id}`
  const site: StructRef = { kind: "symbol", qualifiedPath, subtreeHash: asSubtreeHash(`st-${qualifiedPath}`) }
  return { site, signals: ZERO_SIGNALS, ppr: 0.5, rank: 1 }
}
const pathOf = (c: Candidate): string => c.site.qualifiedPath

const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const
const BUDGET: GenesisBudget = { ceiling: 200, deepening: { review: OFF, enrich: OFF, expand: OFF } }

describe("GEN-13 held-out — cheap by default / escalate by value", () => {
  it("SCN-GEN-13a-2: base-tier site h3 runs one grounded proposal — every extra off", () => {
    const h3 = sig({ tier: "T2", highValue: false, uncertain: true })
    expect(shouldEscalate(h3)).toBe(false)
    expect(decideMechanisms(h3)).toEqual([])
    expect(DEFAULT_SAMPLES).toBe(1)
  })

  it("SCN-GEN-13b-2: mechanism switches on only for h1 (high-value ∧ uncertain)", () => {
    const h1 = sig({ tier: "T0", highValue: true, uncertain: true, checkable: true })
    const h2 = sig({ tier: "T1", highValue: true, uncertain: false })
    const h4 = sig({ tier: "T2", highValue: false, uncertain: false })
    expect(shouldEscalate(h1)).toBe(true)
    expect(shouldEscalate(h2)).toBe(false)
    expect(shouldEscalate(h4)).toBe(false)
    expect(decideMechanisms(h1).length).toBeGreaterThan(0)
    expect(decideMechanisms(h2)).toEqual([])
    expect(decideMechanisms(h4)).toEqual([])
  })

  it("SCN-GEN-13c-2: beacon default is one sample, no self-consistency", () => {
    const base = sig({ tier: "T2", highValue: false, uncertain: true })
    expect(DEFAULT_SAMPLES).toBe(1)
    expect(decideMechanisms(base)).not.toContain("self-consistency")
  })

  it("SCN-GEN-13d-2: A2 (softwrap, un-checkable) advisory; B2 (credit.reverse, checkable ∧ T1) predicate", () => {
    const a2 = sig({ tier: "T1", checkable: false })
    const b2 = sig({ tier: "T1", checkable: true })
    expect(defaultKind(a2)).toBe("advisory")
    expect(defaultKind(b2)).toBe("predicate")
    expect(defaultKind(sig({ tier: "T2", checkable: true }))).toBe("advisory")
  })

  it("SCN-GEN-13e-2: beacon CEGIS default refinement bound is K≤1", () => {
    expect(DEFAULT_CEGIS_K).toBe(1)
    expect(DEFAULT_CEGIS_K).toBeLessThanOrEqual(1)
  })

  it("SCN-GEN-13f-2: refuter runs for h1 (T0) only — h2 (T1)/h4 (T2) skip it", () => {
    expect(runsRefuter("T0")).toBe(true)
    expect(runsRefuter("T1")).toBe(false)
    expect(runsRefuter("T2")).toBe(false)
    expect(decideMechanisms(sig({ tier: "T0", highValue: true, uncertain: true }))).toContain("refuter")
    expect(decideMechanisms(sig({ tier: "T1", highValue: true, uncertain: true }))).not.toContain("refuter")
  })

  it("SCN-GEN-13g-2: Semgrep is attempted before CodeQL on beacon", () => {
    expect(chooseAnalyzer(true)).toBe("semgrep")
    expect(chooseAnalyzer(false)).toBe("codeql")
  })

  it("SCN-GEN-13h-2: beacon query DB built once across 30 checks", () => {
    let builds = 0
    const db = makeQueryDb(() => {
      builds += 1
      return { name: "beacon-codeql-db" }
    })
    for (let i = 0; i < 30; i += 1) db.get()
    expect(builds).toBe(1)
    expect(db.builds()).toBe(1)
    expect(db.get().name).toBe("beacon-codeql-db")
  })

  it("SCN-GEN-13i-2: beacon requires no whole-repo pass — only the {h1..h5} frontier is processed", () => {
    const frontier = [candOf("h1"), candOf("h2"), candOf("h3"), candOf("h4"), candOf("h5")]
    const processed = plan(frontier)
    expect(processed.length).toBe(5)
    expect(processed).toEqual(frontier)
  })

  it("SCN-GEN-13j-2: beacon is scopable to billing/ — session/format/text cold tail left", () => {
    const frontier = [
      candOf("charge", "billing/"),
      candOf("reverse", "billing/"),
      candOf("login", "session/"),
      candOf("pretty", "format/"),
      candOf("softwrap", "text/"),
    ]
    const processed = plan(frontier, "billing/")
    expect(processed.map(pathOf)).toEqual(["billing/charge", "billing/reverse"])
    expect(processed.some((c) => pathOf(c).startsWith("session/"))).toBe(false)
    expect(processed.some((c) => pathOf(c).startsWith("format/"))).toBe(false)
    expect(processed.some((c) => pathOf(c).startsWith("text/"))).toBe(false)
    expect(
      inScope({ kind: "symbol", qualifiedPath: "session/login", subtreeHash: asSubtreeHash("x") }, "billing/"),
    ).toBe(false)
  })

  it("SCN-GEN-13k-2: beacon GenesisReport carries a per-stage cost breakdown under the ceiling", () => {
    const cost = makeCostRecorder()
    cost.record("S0", 0)
    cost.record("S1", 0)
    cost.record("S1", 0)
    cost.record("S2", 7)
    const report = cost.report()
    const stages = report.map((s) => s.stage)
    expect(stages).toContain("S0")
    expect(stages).toContain("S1")
    expect(stages).toContain("S2")
    expect(report.find((s) => s.stage === "S2")?.llmCalls).toBe(7)
    expect(report.reduce((n, s) => n + s.llmCalls, 0)).toBeLessThanOrEqual(BUDGET.ceiling)
    expect(report.length).toBeGreaterThan(1)
  })
})

describe("makeBudget held-out — frozen BudgetApi surface on the beacon fixtures", () => {
  it("escalate(cand, budget) reads the injected cheap signal for a T0 beacon site", () => {
    const cost = makeCostRecorder()
    const signal: SignalOracle = {
      signal: (): CheapSignal => sig({ tier: "T0", highValue: true, uncertain: true, checkable: true }),
    }
    const api = makeBudget({ signal, cost })
    const decision = api.escalate(candOf("reverse", "billing/"), BUDGET)
    expect(decision.tier).toBe("T0")
    expect(decision.mechanisms).toContain("refuter")
    expect(api.report()).toEqual([])
  })

  it("a base-tier beacon signal yields the empty single-proposal mechanism set", () => {
    const cost = makeCostRecorder()
    const baseTier: Tier = "T2"
    const signal: SignalOracle = { signal: (): CheapSignal => sig({ tier: baseTier }) }
    const api = makeBudget({ signal, cost })
    expect(api.escalate(candOf("softwrap", "text/"), BUDGET).mechanisms).toEqual([])
  })
})
