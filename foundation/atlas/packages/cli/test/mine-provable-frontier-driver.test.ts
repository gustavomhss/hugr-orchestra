// @atlas/cli — test/mine-provable-frontier-driver.test.ts  (PROVABLE-FRONTIER AC-4/AC-5 — the reorder changes
// which sites a budget-capped run spends on; the advisory arm is byte-identical to today)
//
// AC-4 [driver]  a dependency-arm-shaped run where the TOP-PPR site is a dep-sink and a LOWER-PPR site has
//                dep-candidates ⇒ under a budget of 1 the dep-candidate site IS the one visited — it was
//                excluded before the reorder. The provability predicate is injected on the frontier exactly as
//                `resolveProposer` threads it (an injected proposer keeps the injected frontier verbatim).
// AC-5 [back-compat] no `provableFirst` ⇒ NO reorder, byte-identical coverage; and a full multi-arm run's
//                advisory pass is byte-identical to the standalone advisory pass (the sound-arm reorder is
//                arm-scoped and never leaks into advisory).

import { describe, it, expect } from "vitest"
import { reconcile } from "@atlas/genesis"
import type { HistorySource, SkeletonSource, SiteProposer, Candidate } from "@atlas/genesis"
import type { StructRef } from "@atlas/contracts"
import type { Axes, Manifest } from "@atlas/index"
import { asSubtreeHash } from "@atlas/kernel"
import { driveMine, driveMineArms } from "../src/mine.js"
import { axisRoot, edge, gateEmitAll, fakeStore, ZERO_SIGNALS, NO_MODEL_ENV } from "./mine-fixtures.js"

// ── a FIVE-site frontier with a clear hub (highest PPR) and four spokes ──────────────────────────────────
const KEYS = ["st-e1", "st-e2", "st-e3", "st-e4", "st-e5"] as const
const pathOf = (id: string): string => `pkg/${id}.ts::${id}`
const fiveStruct = (id: string): StructRef => ({
  kind: "symbol",
  qualifiedPath: pathOf(id),
  subtreeHash: asSubtreeHash(id),
})
const FIVE: readonly StructRef[] = KEYS.map(fiveStruct)
// e2..e5 all reference e1 ⇒ e1 is the hub (highest PPR ⇒ rank 1 baseline); the spokes rank below it.
const FIVE_EDGES = KEYS.slice(1).map((k) => edge(k, KEYS[0]!))
const fiveSkeleton: SkeletonSource = {
  skeleton: () => {
    const axes: Axes = {
      spatial: axisRoot(KEYS),
      territory: axisRoot(KEYS),
      dependency: axisRoot(KEYS),
      edges: FIVE_EDGES,
    }
    const manifest: Manifest = { territories: [] }
    return { axes, manifest }
  },
}
const fiveHistory: HistorySource = {
  commitCount: () => 5,
  shallow: () => false,
  blameConcentration: () => 0,
  frontier: () => FIVE,
  signals: () => ZERO_SIGNALS,
}

/** A proposer that RECORDS the sites it is asked to propose at, in call order = the sites the budget spent on
 *  (the controller calls `propose` only for visited sites within the ceiling). Abstains (returns null) so it
 *  stays a pure visit-recorder. */
const recordingSites = (): { proposer: SiteProposer; visited: string[] } => {
  const visited: string[] = []
  return {
    proposer: {
      propose: (c: Candidate) => {
        visited.push(c.site.qualifiedPath)
        return null
      },
    },
    visited,
  }
}

const OFF = { enabled: false, maxDepth: 0, epsilon: 0 } as const
const cap = (n: number) => ({ ceiling: n, deepening: { review: OFF, enrich: OFF, expand: OFF } })
const REPO = "provable-frontier-driver-repo"

describe("PROVABLE-FRONTIER AC-4 — the reorder changes which sites a budget-capped run spends on", () => {
  // Establish the BASELINE rank order (no reorder) by visiting the whole frontier once.
  const baseline = recordingSites()
  driveMine(REPO, {
    env: NO_MODEL_ENV,
    skeleton: fiveSkeleton,
    history: fiveHistory,
    proposer: baseline.proposer,
    gate: gateEmitAll(),
    store: fakeStore(),
  })
  const rankedPaths = baseline.visited // rank 1..5 in PPR order
  const topPpr = rankedPaths[0]! //     the hub — a DEP-SINK in the scenario (unprovable)
  const lowPpr = rankedPaths[rankedPaths.length - 1]! // the coldest spoke — the one WITH dep-candidates

  it("sanity: the hub is top-PPR and the provable site is a strictly lower-PPR one", () => {
    expect(rankedPaths).toHaveLength(5)
    expect(topPpr).toBe(pathOf("st-e1")) // the hub really is rank 1
    expect(lowPpr).not.toBe(topPpr) //     the provable site is genuinely lower-ranked
  })

  it("WITHOUT the reorder, budget=1 spends on the top-PPR sink and NEVER the provable low-PPR site", () => {
    const rec = recordingSites()
    driveMine(REPO, {
      env: NO_MODEL_ENV,
      skeleton: fiveSkeleton,
      history: fiveHistory,
      proposer: rec.proposer,
      gate: gateEmitAll(),
      store: fakeStore(),
      budget: cap(1),
    })
    expect(rec.visited).toEqual([topPpr]) // the sink is what the budget bought — the bug this WP fixes
  })

  it("WITH the reorder, budget=1 spends on the PROVABLE low-PPR site (it was excluded before)", () => {
    // teeth (breaks-on "no stable partition in createMine"): without the reorder this visits `topPpr`, so the
    // provable site never reaches the model under the cap. `provableFirst` is injected on the frontier exactly
    // as `resolveProposer`→`withDefaults` threads it for a wired sound arm.
    const rec = recordingSites()
    driveMine(REPO, {
      env: NO_MODEL_ENV,
      skeleton: fiveSkeleton,
      history: fiveHistory,
      proposer: rec.proposer,
      gate: gateEmitAll(),
      store: fakeStore(),
      budget: cap(1),
      frontier: { provableFirst: (s) => s.qualifiedPath === lowPpr },
    })
    expect(rec.visited).toEqual([lowPpr]) // the reorder moved the provable site to rank 1 ⇒ the budget bought IT
  })
})

describe("PROVABLE-FRONTIER AC-5 — back-compat: no provableFirst ⇒ no reorder; advisory byte-identical", () => {
  const coverageJson = (frontier?: { provableFirst?: (s: StructRef) => boolean }): string => {
    const r = driveMine(REPO, {
      env: NO_MODEL_ENV,
      skeleton: fiveSkeleton,
      history: fiveHistory,
      proposer: recordingSites().proposer,
      gate: gateEmitAll(),
      store: fakeStore(),
      ...(frontier !== undefined ? { frontier } : {}),
    })
    return JSON.stringify(r.coverage)
  }

  it("an absent provableFirst and an empty-object frontier both yield the master coverage, byte for byte", () => {
    const base = coverageJson() //          resolved-frontier path, no provability predicate
    const emptyFrontier = coverageJson({}) //  an explicit frontier with no provableFirst
    expect(emptyFrontier).toBe(base) // no reorder, no renumber — byte-identical
  })

  it("a full multi-arm run (no model wired) — the advisory arm is byte-identical to a standalone advisory pass", () => {
    // With no model wired NO arm carries a provableFirst (resolveProposer builds it only on the wired path), so
    // the multi-arm advisory pass and the single advisory pass must be identical. This pins that threading the
    // predicate did not perturb the advisory frontier plumbing; AC-1 (unset ⇒ untouched) + AC-3 (advisory ⇒
    // provableFirst undefined) together extend the guarantee to a run where the SOUND arms do reorder.
    const arms = driveMineArms(REPO, {
      env: NO_MODEL_ENV,
      skeleton: fiveSkeleton,
      history: fiveHistory,
      gate: gateEmitAll(),
      store: fakeStore(),
    })
    const advisory = arms.find((a) => a.slot === "advisory")
    expect(advisory).toBeDefined()

    const single = driveMine(REPO, {
      env: { ...NO_MODEL_ENV, ATLAS_MINE_SLOT: "advisory" },
      skeleton: fiveSkeleton,
      history: fiveHistory,
      gate: gateEmitAll(),
      store: fakeStore(),
    })
    expect(reconcile(advisory!.pass.report.coverage)).toEqual(reconcile(single.coverage))
    expect(JSON.stringify(advisory!.pass.report.coverage)).toBe(JSON.stringify(single.coverage))
  })
})
