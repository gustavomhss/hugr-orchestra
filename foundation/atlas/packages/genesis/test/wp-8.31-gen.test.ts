// @atlas/genesis — test/wp-8.31-gen.test.ts   (WP-8.31.GEN — EPIC-31)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the GOVERNED DEEPENING LOOPS (GEN-14):
//   - SCN-GEN-14a-1 (happy) — REVIEW / ENRICH / EXPAND are opt-in or default-shallow (none deep-by-default).
//   - SCN-GEN-14b-1 (happy) — each loop is budget-gated (halts at the call budget).
//   - SCN-GEN-14c-1 (happy) — each loop carries a diminishing-returns / fixpoint stop (no-revision round; <ε).
//   - SCN-GEN-14d-1 (guard) — no loop runs unbounded (a pathological input still terminates at the round cap).
//   - SCN-GEN-14e-1 (happy) — with all loops off, cost == the GEN-13 single pass (Δ=0 added calls).
//   - SCN-GEN-14f-1 (happy) — each loop reuses propose→verify / relate() (no bespoke pipeline).
//   - SCN-GEN-14g-1 (guard) — the loops add no new subsystem (only the two existing seams are consulted).
//   - SCN-GEN-14h-1 (guard) — loops do not duplicate born-from-work's free lazy enrichment (lazy items skipped).
//
// The facet is imported DIRECTLY from ../src/loops.js (the barrel is wired by the lead at SEAL). The
// propose→verify harness (`ExtractApi`, types.ts) and relate() (atlas-retrieval RETR-10) are the
// EXISTING machinery the loops reuse — modelled here as injected fakes/spies so the governed CONTROLLER
// (opt-in · budget-gate · fixpoint stop · round cap · Δ=0) is the unit under test. No raw hashing: branded
// ids come from the SEALED @atlas/kernel helpers. Held-out `-2` fixtures are the GATE's — NOT transcribed.
//
// FLAG: interface_contract digest is `<filled-at-freeze>` (simulated) — resolved by disciplined judgment,
// not a real freeze hash.
// FLAG: `LoopConfig.epsilon` default is OWNER-DEFINE (types.ts); no MUST golden fixes its value, so
// the facet's `defaultLoops()` placeholder is INERT (enabled:false) and asserted by NO test here.

import { describe, it, expect } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import type { Candidate } from "@atlas/genesis"
import type { ExtractApi, ExtractResult } from "@atlas/genesis"
import type { GenesisBudget, LoopConfig } from "@atlas/genesis"
import {
  defaultLoops,
  isOptedIn,
  runLoop,
  reviewRound,
  enrichRound,
  expandRound,
  runDeepening,
  type LoopMachinery,
  type RelateApi,
  type EnrichItem,
  type RoundFn,
} from "../src/loops.js"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────────

const siteOf = (id: string): StructRef => ({
  kind: "symbol",
  qualifiedPath: `pkg/${id}.ts::${id}`,
  subtreeHash: asSubtreeHash(`st-${id}`),
})

const cand = (id: string, ppr = 1, rank = 0): Candidate => ({
  site: siteOf(id),
  signals: { hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] },
  ppr,
  rank,
})

const budgetOf = (ceiling: number): GenesisBudget => ({ ceiling, deepening: defaultLoops() })

const ON = (over: Partial<LoopConfig> = {}): LoopConfig => ({
  enabled: true,
  maxDepth: 100,
  epsilon: 0,
  ...over,
})

interface Spy {
  extractCalls: number
  relateCalls: StructRef[]
}

/** A machinery double: `extract` returns a caller-controlled `ExtractResult`; `relate` returns a
 *  caller-controlled neighbour set. Both record their invocations so REUSE (14f/14g/14h) is observable. */
const machineryOf = (
  onExtract: (cands: readonly Candidate[]) => ExtractResult,
  onRelate: (unit: StructRef) => readonly StructRef[],
): { m: LoopMachinery; spy: Spy } => {
  const spy: Spy = { extractCalls: 0, relateCalls: [] }
  const proposeVerify: ExtractApi = {
    extract: (cands) => {
      spy.extractCalls += 1
      return onExtract(cands)
    },
  }
  const relate: RelateApi = {
    relate: (unit) => {
      spy.relateCalls.push(unit)
      return onRelate(unit)
    },
  }
  return { m: { proposeVerify, relate }, spy }
}

const STABLE: ExtractResult = { facts: [], abstained: [] }

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

describe("WP-8.31.GEN — governed deepening loops (GEN-14)", () => {
  // SCN-GEN-14a-1 — REVIEW / ENRICH / EXPAND are opt-in or default-shallow.
  it("SCN-GEN-14a-1: no loop runs deep by default — each is off / default-shallow", () => {
    const d = defaultLoops()
    for (const cfg of [d.review, d.enrich, d.expand]) {
      expect(isOptedIn(cfg)).toBe(false) // none opted in
      expect(cfg.enabled).toBe(false) // teeth: EXPAND defaulting to deep (enabled+10 rounds) would fail here
      expect(cfg.maxDepth).toBe(0) //     no depth without opt-in
    }
  })

  // SCN-GEN-14b-1 — each deepening loop is budget-gated.
  it("SCN-GEN-14b-1: ENRICH opted in with a 50-call budget halts at the 50-call budget", () => {
    const items: EnrichItem[] = Array.from({ length: 200 }, (_, i) => ({
      site: siteOf(`e${i}`),
      bornFromWorkLazy: false,
    }))
    const { m } = machineryOf(
      () => STABLE,
      () => [siteOf("linked")],
    ) // every relate() revises (never dry)
    const out = runLoop(ON(), budgetOf(50), enrichRound(m, items))
    expect(out.calls).toBe(50) // halted exactly at the budget — the gate is present
    expect(out.stop).toBe("budget") // teeth: ignoring the budget would run all 200 (calls>50)
  })

  // SCN-GEN-14c-1 — each loop carries a diminishing-returns / fixpoint stop.
  it("SCN-GEN-14c-1: REVIEW stops at the no-revision fixpoint round", () => {
    const cands = [cand("a"), cand("b"), cand("c")]
    const { m } = machineryOf(
      () => STABLE,
      () => [],
    ) // stable re-pass ⇒ 0 revisions ⇒ fixpoint
    const out = runLoop(ON(), budgetOf(1_000), reviewRound(m, cands))
    expect(out.stop).toBe("fixpoint") // teeth: no fixpoint predicate would keep looping past the no-op round
    expect(out.rounds).toBe(1) //        halted on the very first no-revision round
  })

  it("SCN-GEN-14c-1 (ε-leg): a loop halts on marginal value < ε", () => {
    // a synthetic round whose value falls below ε on round 2
    const round: RoundFn = (r) => ({ revisions: 1, calls: 1, value: r === 0 ? 5 : 0.001 })
    const out = runLoop(ON({ epsilon: 0.01 }), budgetOf(1_000), round)
    expect(out.stop).toBe("marginal-value")
  })

  // SCN-GEN-14d-1 — no deepening loop runs unbounded.
  it("SCN-GEN-14d-1: EXPAND on a never-dry input still terminates at the round cap", () => {
    // pathological: relate() always surfaces a NEW site and extract always yields a fact ⇒ never a fixpoint
    const { m } = machineryOf(
      () => ({ facts: [{} as never], abstained: [] }),
      () => [siteOf("new")],
    )
    const out = runLoop(ON({ maxDepth: 5 }), budgetOf(1_000_000), expandRound(m, [siteOf("seed")]))
    expect(out.stop).toBe("depth") // bounded by the round cap — not the budget, not a fixpoint
    expect(out.rounds).toBe(5) //     terminated at maxDepth; teeth: no cap ⇒ this would loop forever
    expect(out.rounds).toBeLessThanOrEqual(5)
  })

  // SCN-GEN-14e-1 — with all loops off, cost == the GEN-13 single pass (Δ=0).
  it("SCN-GEN-14e-1: all loops off adds zero calls over the single pass (Δ=0)", () => {
    const { m, spy } = machineryOf(
      () => STABLE,
      () => [siteOf("x")],
    )
    const out = runDeepening(defaultLoops(), budgetOf(200), m, {
      reviewCands: [cand("a")],
      enrichItems: [{ site: siteOf("e"), bornFromWorkLazy: false }],
      expandSites: [siteOf("s")],
    })
    expect(out.addedCalls).toBe(0) // Δ=0 — loops-off never touches the machinery
    expect(spy.extractCalls).toBe(0)
    expect(spy.relateCalls.length).toBe(0) // teeth: an always-on prologue would spend here
  })

  // SCN-GEN-14f-1 — each loop reuses propose→verify / relate().
  it("SCN-GEN-14f-1: REVIEW reuses propose→verify; ENRICH/EXPAND reuse relate()", () => {
    const rev = machineryOf(
      () => STABLE,
      () => [],
    )
    runLoop(ON({ maxDepth: 1 }), budgetOf(10), reviewRound(rev.m, [cand("a")]))
    expect(rev.spy.extractCalls).toBeGreaterThan(0) // REVIEW built on the propose→verify harness

    const enr = machineryOf(
      () => STABLE,
      () => [siteOf("l")],
    )
    runLoop(ON({ maxDepth: 1 }), budgetOf(10), enrichRound(enr.m, [{ site: siteOf("e"), bornFromWorkLazy: false }]))
    expect(enr.spy.relateCalls.length).toBeGreaterThan(0) // ENRICH built on relate()

    const exp = machineryOf(
      () => STABLE,
      () => [siteOf("n")],
    )
    runLoop(ON({ maxDepth: 1 }), budgetOf(10), expandRound(exp.m, [siteOf("s")]))
    expect(exp.spy.relateCalls.length).toBeGreaterThan(0) // EXPAND follows relate() edges
    expect(exp.spy.extractCalls).toBeGreaterThan(0) //       then re-extracts (propose→verify)
  })

  // SCN-GEN-14g-1 — the deepening loops add no new subsystem.
  it("SCN-GEN-14g-1: the loops consult only the two existing seams — 0 new subsystems", () => {
    const { m } = machineryOf(
      () => STABLE,
      () => [siteOf("x")],
    )
    // the machinery surface the loops are wired to is EXACTLY {proposeVerify, relate} — nothing bespoke
    expect(Object.keys(m).sort()).toEqual(["proposeVerify", "relate"])
    runDeepening(
      { review: ON({ maxDepth: 1 }), enrich: ON({ maxDepth: 1 }), expand: ON({ maxDepth: 1 }) },
      budgetOf(50),
      m,
      {
        reviewCands: [cand("a")],
        enrichItems: [{ site: siteOf("e"), bornFromWorkLazy: false }],
        expandSites: [siteOf("s")],
      },
    )
    expect(Object.keys(m).sort()).toEqual(["proposeVerify", "relate"]) // still 0 new after running
  })

  // SCN-GEN-14h-1 — loops do not duplicate born-from-work's free lazy enrichment.
  it("SCN-GEN-14h-1: ENRICH skips born-from-work lazy items — no duplicated enrichment", () => {
    const items: EnrichItem[] = [
      { site: siteOf("eager1"), bornFromWorkLazy: false },
      { site: siteOf("lazy"), bornFromWorkLazy: true }, // born-from-work already enriches this for free
      { site: siteOf("eager2"), bornFromWorkLazy: false },
    ]
    const { m, spy } = machineryOf(
      () => STABLE,
      () => [siteOf("l")],
    )
    runLoop(ON({ maxDepth: 1 }), budgetOf(50), enrichRound(m, items))
    expect(spy.relateCalls.length).toBe(2) // only the 2 eager items — the lazy one is NOT re-enriched
    expect(spy.relateCalls.map((s) => s.qualifiedPath)).not.toContain("pkg/lazy.ts::lazy")
  })
})
