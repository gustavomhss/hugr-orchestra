// @atlas/cli — test/mine-budget-cap.test.ts  (MINE-BUDGET-CAP · AC-1..AC-4)
//
// The CLI-reachable site cap. `ATLAS_MINE_BUDGET=N` wires the run-controller's already-existing
// `GenesisBudget.ceiling` seam from the environment (no `--budget` flag exists). This suite pins:
//   AC-1 [unit]      `resolveMineBudget` — unset ⇒ undefined; a positive int ⇒ cappedBudget(N); junk THROWS.
//   AC-2 [e2e]       a single-arm run under `ATLAS_MINE_BUDGET=3` over a 5-site frontier visits AT MOST 3.
//   AC-3 [back-compat] unset env ⇒ the full frontier is visited, exactly as today (the cap is opt-in).
//   AC-4 [multi-arm] `runMineArms` under `ATLAS_MINE_BUDGET=2` caps EACH arm at 2 sites.
//
// The frontier here is ≥5 on purpose: a cap of 3 (AC-2) / 2 (AC-4) is a REAL cut below the natural size, so
// "it capped" cannot be confused with "the frontier was small". Sites over the ceiling are `unvisited`
// cause:ceiling — read back through the frozen `reconcile` (no product internals imported).

import { describe, it, expect } from "vitest"
import { reconcile, type GenesisReport, type HistorySource, type SkeletonSource } from "@atlas/genesis"
import type { StructRef } from "@atlas/contracts"
import type { Axes, Manifest } from "@atlas/index"
import { asSubtreeHash } from "@atlas/kernel"
import { resolveMineBudget, MINE_BUDGET_ENV } from "../src/mine-proposer.js"
import { driveMine, driveMineArms } from "../src/mine.js"
import {
  axisRoot,
  edge,
  recordingProposer,
  gateEmitAll,
  fakeStore,
  ZERO_SIGNALS,
  NO_MODEL_ENV,
} from "./mine-fixtures.js"

// ── a FIVE-site frontier (bigger than any cap below, so a cap is a real cut) ────────────────────────────
const KEYS = ["st-e1", "st-e2", "st-e3", "st-e4", "st-e5"] as const
const fiveStruct = (id: string): StructRef => ({
  kind: "symbol",
  qualifiedPath: `pkg/${id}.ts::${id}`,
  subtreeHash: asSubtreeHash(id),
})
const FIVE: readonly StructRef[] = KEYS.map(fiveStruct)
// A dep chain e2→e1, e3→e1, e4→e1, e5→e1 so e1 is the hub (highest PPR) and all five rank distinctly.
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

const REPO = "budget-cap-repo"
const runOver = (env: NodeJS.ProcessEnv): GenesisReport =>
  driveMine(REPO, {
    env,
    skeleton: fiveSkeleton,
    history: fiveHistory,
    proposer: recordingProposer().proposer,
    gate: gateEmitAll(),
    store: fakeStore(),
  })
/** Sites the run actually spent a call on = every recorded outcome that is not `unvisited`. */
const visitedCount = (r: GenesisReport): number => {
  const rec = reconcile(r.coverage)
  return rec.seeded + rec.abstained + rec.unrecorded + rec.interrupted
}

describe("MINE-BUDGET-CAP — resolveMineBudget (AC-1)", () => {
  it("unset / empty ⇒ undefined (the controller default applies, byte-identical to today)", () => {
    expect(resolveMineBudget({})).toBeUndefined()
    expect(resolveMineBudget({ [MINE_BUDGET_ENV]: "" })).toBeUndefined()
  })

  it("a positive integer string ⇒ cappedBudget(N) — ceiling N, all deepening loops off", () => {
    const b = resolveMineBudget({ [MINE_BUDGET_ENV]: "5" })!
    expect(b.ceiling).toBe(5)
    expect([b.deepening.review.enabled, b.deepening.enrich.enabled, b.deepening.expand.enabled]).toEqual([
      false,
      false,
      false,
    ])
  })

  it("'0', negative, non-integer and non-numeric all THROW (no silent fallback to the 200 default)", () => {
    for (const bad of ["0", "-1", "1.5", "abc", " ", "3abc", "0x5"]) {
      expect(() => resolveMineBudget({ [MINE_BUDGET_ENV]: bad }), bad).toThrow()
    }
  })
})

describe("MINE-BUDGET-CAP — capped mine run (AC-2, AC-3)", () => {
  it("AC-2: ATLAS_MINE_BUDGET=3 over a 5-site frontier visits AT MOST 3, the rest unvisited cause:ceiling", () => {
    const r = runOver({ ...NO_MODEL_ENV, [MINE_BUDGET_ENV]: "3" })
    const rec = reconcile(r.coverage)
    expect(rec.planned).toBe(5) // the natural frontier really is bigger than the cap
    expect(visitedCount(r)).toBeLessThanOrEqual(3)
    expect(visitedCount(r)).toBe(3) // the cap is a real cut, not an accident of a small frontier
    expect(rec.unvisited).toBe(2)
    const ceilingCut = (r.coverage?.sites ?? []).filter((s) => s.outcome === "unvisited")
    expect(ceilingCut.every((s) => s.outcome === "unvisited" && s.cause === "ceiling")).toBe(true)
  })

  it("AC-3: unset env ⇒ the FULL 5-site frontier is visited (the cap is opt-in only)", () => {
    const r = runOver({ ...NO_MODEL_ENV })
    const rec = reconcile(r.coverage)
    expect(rec.planned).toBe(5)
    expect(rec.unvisited).toBe(0)
    expect(visitedCount(r)).toBe(5)
  })
})

describe("MINE-BUDGET-CAP — multi-arm cap (AC-4)", () => {
  it("the arms driven under ATLAS_MINE_BUDGET=2 each cap at 2 sites (per-arm ledgers)", () => {
    // `driveMineArms` drives the frozen single pass ONCE per resolved arm; each pass reads the same env, so
    // every arm's OWN coverage ledger must show the cap. An injected proposer/gate keeps it hermetic while
    // the budget still rides through from the env (the CLI path, not an injected budget).
    const arms = driveMineArms(REPO, {
      env: { ...NO_MODEL_ENV, [MINE_BUDGET_ENV]: "2" },
      skeleton: fiveSkeleton,
      history: fiveHistory,
      proposer: recordingProposer().proposer,
      gate: gateEmitAll(),
      store: fakeStore(),
    })
    expect(arms.length).toBeGreaterThan(0)
    for (const a of arms) {
      const rec = reconcile(a.pass.report.coverage)
      expect(rec.planned).toBe(5)
      const visited = rec.seeded + rec.abstained + rec.unrecorded + rec.interrupted
      expect(visited, a.slot).toBeLessThanOrEqual(2)
      expect(visited, a.slot).toBe(2)
    }
  })
})
