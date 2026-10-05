// @atlas/genesis — test/provable-frontier.test.ts  (PROVABLE-FRONTIER — reorder each sound arm's ranked
// frontier so provable sites come first, so a budget-capped run spends its sites where the oracle can admit)
//
// THE CEILING THIS REMOVES. A metered sound-arm run yielded 0 proven facts because the PPR-ranked frontier's
// top sites are dependency SINKS (import nothing) and re-export barrels — sites the sound oracle cannot prove.
// The fix is a STABLE PARTITION of the ranked frontier by a pure provability predicate (`FrontierOptions.
// provableFirst`), applied in `createMine` AFTER `rank`, preserving the PPR/rank order WITHIN each group and
// re-numbering `rank` 1..N so the budget cap sees the new order. Unset ⇒ byte-identical to master.

import { describe, expect, it } from "vitest"
import { asSubtreeHash } from "@atlas/kernel"
import type { StructRef } from "@atlas/contracts"
import { createMine } from "../src/rank.js"
import type { HistorySource, SkeletonSource } from "../src/rank.js"
import type { Skeleton } from "../src/types.js"

// ── the corpus: 5 file sites, no dep-graph vertices of their own ⇒ all tie at the PPR floor, so the ranked
// order is produced entirely by the (file-site) tie-break `cmp(subtreeHash)`. That makes the baseline order
// DETERMINISTIC and independent of any hidden PPR — exactly the surface the partition must preserve.
const SK: Skeleton = {
  axes: { spatial: node(), territory: node(), dependency: node(), edges: [] },
  manifest: { territories: [] },
}

function node(): Skeleton["axes"]["spatial"] {
  return { axis: "spatial", level: "file", key: ".", subtreeHash: asSubtreeHash("st-root"), children: [], objects: [] }
}

const site = (name: string, hash: string): StructRef => ({
  kind: "file",
  qualifiedPath: name,
  subtreeHash: asSubtreeHash(hash),
})

// hashes chosen so the baseline (hash-asc) order is a,b,c,d,e — the order `rank` emits with no provableFirst.
const A = site("a.ts", "st-a")
const B = site("b.ts", "st-b")
const C = site("c.ts", "st-c")
const D = site("d.ts", "st-d")
const E = site("e.ts", "st-e")
const FIVE = [A, B, C, D, E] as const

const skeleton: SkeletonSource = { skeleton: () => SK }
/** A NON-thin history whose mined frontier is exactly the five sites — so `createMine` ranks them (never the
 *  structural fallback), and the ranked order is the surface the partition operates on. */
const history = (frontier: readonly StructRef[]): HistorySource => ({
  commitCount: () => 5, //          ≥ MIN_COMMITS ⇒ not thin
  shallow: () => false,
  blameConcentration: () => 0,
  frontier: () => frontier,
  signals: () => ({ hotspot: 0, szzBugCommits: 0, coChanged: [], owners: [], messages: [] }),
})

const pathsOf = (cands: readonly { readonly site: StructRef }[]): string[] => cands.map((c) => c.site.qualifiedPath)
const provable =
  (set: ReadonlySet<string>) =>
  (s: StructRef): boolean =>
    set.has(s.qualifiedPath)

describe("PROVABLE-FRONTIER AC-1 — provable sites move first, preserving relative PPR order; rank renumbered", () => {
  it("baseline (no provableFirst) ⇒ the five sites rank a,b,c,d,e — the order the partition must preserve within groups", () => {
    const cands = createMine({ skeleton, history: history(FIVE) }).mine("/repo", "HEAD")
    expect(pathsOf(cands)).toEqual(["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"])
    expect(cands.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5])
  })

  it("marking C and E provable ⇒ [c, e] FIRST in their original relative order, then [a, b, d]; rank 1..5", () => {
    // teeth (breaks-on "re-sort, not stable partition"): a sort by provability alone would let c/e or a/b/d
    // swap; the partition must keep c before e (their PPR order) and a before b before d.
    const pf = provable(new Set(["c.ts", "e.ts"]))
    const cands = createMine({ skeleton, history: history(FIVE), frontier: { provableFirst: pf } }).mine(
      "/repo",
      "HEAD",
    )

    expect(pathsOf(cands)).toEqual(["c.ts", "e.ts", "a.ts", "b.ts", "d.ts"])
    expect(cands.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5]) // renumbered so the budget cap sees the new order
  })

  it("UNSET provableFirst ⇒ output byte-identical to the baseline (no reorder, no renumber)", () => {
    const base = createMine({ skeleton, history: history(FIVE) }).mine("/repo", "HEAD")
    const withUndef = createMine({ skeleton, history: history(FIVE), frontier: {} }).mine("/repo", "HEAD")
    expect(JSON.stringify(withUndef)).toBe(JSON.stringify(base))
  })
})

describe("PROVABLE-FRONTIER AC-2 — the partition is STABLE and deterministic", () => {
  it("equal-provability sites keep their PPR order (all-provable ⇒ identity; none-provable ⇒ identity)", () => {
    const all = createMine({ skeleton, history: history(FIVE), frontier: { provableFirst: () => true } }).mine(
      "/repo",
      "HEAD",
    )
    const none = createMine({ skeleton, history: history(FIVE), frontier: { provableFirst: () => false } }).mine(
      "/repo",
      "HEAD",
    )
    const base = createMine({ skeleton, history: history(FIVE) }).mine("/repo", "HEAD")

    expect(pathsOf(all)).toEqual(pathsOf(base)) //  every site provable ⇒ order unchanged
    expect(pathsOf(none)).toEqual(pathsOf(base)) // no site provable ⇒ order unchanged
    expect(all.map((c) => c.rank)).toEqual([1, 2, 3, 4, 5])
  })

  it("same input ⇒ byte-identical output across runs (deterministic, total, pure)", () => {
    const pf = provable(new Set(["b.ts", "d.ts"]))
    const one = createMine({ skeleton, history: history(FIVE), frontier: { provableFirst: pf } }).mine("/repo", "HEAD")
    const two = createMine({ skeleton, history: history(FIVE), frontier: { provableFirst: pf } }).mine("/repo", "HEAD")

    expect(pathsOf(one)).toEqual(["b.ts", "d.ts", "a.ts", "c.ts", "e.ts"]) // provable first, PPR order kept
    expect(JSON.stringify(one)).toBe(JSON.stringify(two))
  })
})
