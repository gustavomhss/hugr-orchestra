// @atlas/genesis — test/wp-8.27-gen.test.ts  (WP-8.27.GEN)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the deterministic `$0`-LLM S0/S1 stage:
//   GEN-1  (deterministic $0-LLM skeleton + ranking: SCN-GEN-1a..1c-1) ·
//   GEN-3  (cost tracks the frontier, not size:      SCN-GEN-3a..3b-1) ·
//   GEN-10 (explicit-structural mechanisms only:     SCN-GEN-10a..10b-1) ·
//   GEN-11 (reproducible PPR ranking — determinism law/PBT: SCN-GEN-11a..11c-1) ·
//   GEN-15 (history-thin fallback to structural centrality: SCN-GEN-15a..15c-1).
// The facet is imported DIRECTLY from ../src/rank.js (the barrel is wired by the lead at SEAL). The S0
// skeleton walk + the S1 history signals are CONSUMED via injected seams (card exclusion: "consumed from
// TOOLS") — modelled here as deterministic fakes so the CANONICALISATION, the PPR RANKING and the
// HISTORY-THIN FALLBACK are the units under test. Site identity rides the SEALED @atlas/kernel mint
// (`asSubtreeHash`), never a hand-rolled digest. Held-out `-2` fixtures are NOT transcribed.
//
// FLAG: interface_contract digest is `<filled-at-freeze>` (simulated) — resolved by disciplined judgment,
// not a real freeze hash.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asHash, asNodeKey } from "@atlas/kernel"
import type { StructRef, Hash } from "@atlas/contracts"
import type { Axes, DepEdge, IndexNode, Manifest } from "@atlas/index"
import type { Candidate, MinedSignals } from "@atlas/genesis"
import type { Skeleton } from "@atlas/genesis"
import {
  createScan,
  createMine,
  rank,
  makeRank,
  structuralSeeds,
  probeHistory,
  canonicalizeSkeleton,
  frontierBudget,
  s0s1Cost,
  DAMPING,
  MECHANISMS,
  MIN_COMMITS,
  type SkeletonSource,
  type HistorySource,
} from "../src/rank.js"

// ── fixtures (mirror the goldens' acme-repo@rev-c0ffee shapes) ────────────────────────────────────────

const site = (id: string): StructRef => ({
  kind: "symbol",
  qualifiedPath: `pkg/${id}.ts::${id}`,
  subtreeHash: asSubtreeHash(id),
})
const s1 = site("st-a10")
const s2 = site("st-b22")
const s3 = site("st-c31")
const s4 = site("st-d40")
const FRONTIER = [s1, s2, s3, s4] as const

const edge = (from: string, to: string | null): DepEdge => ({
  from: asHash(from),
  to: to === null ? null : asHash(to),
  kind: "resolved",
})

// def→ref edges (referencing → defining): s1 is referenced by s2,s3,s4; s2 by s3,s4; s3 by s4; s4 cold.
const REF_EDGES: readonly DepEdge[] = [
  edge("st-b22", "st-a10"),
  edge("st-c31", "st-a10"),
  edge("st-c31", "st-b22"),
  edge("st-d40", "st-a10"),
  edge("st-d40", "st-b22"),
  edge("st-d40", "st-c31"),
]

const leaf = (key: string): IndexNode => ({
  axis: "dependency",
  level: "symbol",
  key,
  subtreeHash: asSubtreeHash(key),
  children: [],
  objects: [] as readonly Hash[],
})
const axisRoot = (keys: readonly string[]): IndexNode => ({
  axis: "dependency",
  level: "repo",
  key: "root",
  subtreeHash: asSubtreeHash("root"),
  children: keys.map(leaf),
  objects: [],
})

const skeletonOf = (
  edges: readonly DepEdge[],
  keys: readonly string[],
  territories: readonly string[] = [],
): Skeleton => {
  const axes: Axes = {
    spatial: axisRoot(keys),
    territory: axisRoot(keys),
    dependency: axisRoot(keys),
    edges,
  }
  const manifest: Manifest = {
    territories: territories.map((name) => ({ name, owner: "unassigned", tier: "T2", globs: [`${name}/**`] })),
  }
  return { axes, manifest }
}

const BASE_SKELETON = skeletonOf(REF_EDGES, ["st-a10", "st-b22", "st-c31", "st-d40"])

const loudSignals = (n: number): MinedSignals => ({
  hotspot: n / 100,
  szzBugCommits: n,
  coChanged: [],
  owners: ["alice"],
  messages: ["fix bug"],
})

/** A deterministic skeleton source (the sealed atlas-init walk, faked). */
const skeletonSource = (sk: Skeleton): SkeletonSource => ({ skeleton: () => sk })

/** A history source with a healthy log + the {s1..s4} mined frontier. */
const healthyHistory = (frontier: readonly StructRef[] = FRONTIER): HistorySource => ({
  commitCount: () => 500,
  shallow: () => false,
  blameConcentration: () => 0.2,
  frontier: () => frontier,
  signals: (st) => loudSignals(st.subtreeHash.length),
})

const idsOf = (cands: readonly Candidate[]): string[] => cands.map((c) => c.site.subtreeHash)

// ── GEN-1 — deterministic $0-LLM skeleton + ranking ───────────────────────────────────────────────────

describe("GEN-1 — S0+S1 are $0-LLM pure functions of repo@rev, byte-identically reproducible", () => {
  it("SCN-GEN-1a-1: S0+S1 spend 0 LLM calls (no model seam is even in the surface)", () => {
    const scan = createScan(skeletonSource(BASE_SKELETON))
    const mine = createMine({ skeleton: skeletonSource(BASE_SKELETON), history: healthyHistory() })
    const sk = scan.scan("acme", "rev-c0ffee")
    const cands = mine.mine("acme", "rev-c0ffee")
    // structural output is produced, and both structural stages report ZERO LLM spend (GEN-2 is the sole entry).
    expect(sk.axes.edges.length).toBe(REF_EDGES.length)
    expect(cands.length).toBe(4)
    for (const stage of s0s1Cost()) expect(stage.llmCalls).toBe(0)
  })

  it("SCN-GEN-1b-1: same rev → byte-identical skeleton", () => {
    const scan = createScan(skeletonSource(BASE_SKELETON))
    const a = scan.scan("acme", "rev-c0ffee")
    const b = scan.scan("acme", "rev-c0ffee")
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    // teeth: an mtime/insertion-order walk would emit edges out of order — canonicalisation sorts them.
    const shuffled = skeletonOf([...REF_EDGES].reverse(), ["st-d40", "st-a10", "st-c31", "st-b22"])
    expect(JSON.stringify(canonicalizeSkeleton(shuffled))).toBe(JSON.stringify(a))
  })

  it("SCN-GEN-1c-1: same rev → byte-identical candidate ranking", () => {
    const mine = createMine({ skeleton: skeletonSource(BASE_SKELETON), history: healthyHistory() })
    const first = mine.mine("acme", "rev-c0ffee")
    const second = mine.mine("acme", "rev-c0ffee")
    expect(idsOf(first)).toEqual(["st-a10", "st-b22", "st-c31", "st-d40"])
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
  })
})

// ── GEN-3 — cost tracks the importance-surface, not size ──────────────────────────────────────────────

describe("GEN-3 — spend is a function of the frontier, invariant to line count", () => {
  it("SCN-GEN-3a-1: call-count = f(frontier), invariant to line count", () => {
    // rev-A: 4-node graph. rev-B: same {s1..s4} frontier but 3× the nodes (un-churned bulk).
    const bulkKeys = ["st-a10", "st-b22", "st-c31", "st-d40", "x1", "x2", "x3", "x4", "x5", "x6", "x7", "x8"]
    const revA = createMine({ skeleton: skeletonSource(BASE_SKELETON), history: healthyHistory() })
    const revB = createMine({
      skeleton: skeletonSource(skeletonOf(REF_EDGES, bulkKeys)),
      history: healthyHistory(),
    })
    const a = frontierBudget(revA.mine("acme", "A"))
    const b = frontierBudget(revB.mine("acme", "B"))
    expect(a).toBe(4)
    expect(b).toBe(4) // teeth: sizing by node/line totals would make revB spend 3×
  })

  it("SCN-GEN-3b-1: +10k un-churned lines → Δspend = 0", () => {
    const withBulk = skeletonOf(
      [...REF_EDGES, edge("vendor/big.js", null)],
      ["st-a10", "st-b22", "st-c31", "st-d40", "vendor/big.js"],
    )
    const base = createMine({ skeleton: skeletonSource(BASE_SKELETON), history: healthyHistory() })
    const bulky = createMine({ skeleton: skeletonSource(withBulk), history: healthyHistory() })
    expect(frontierBudget(bulky.mine("acme", "x"))).toBe(frontierBudget(base.mine("acme", "x"))) // Δ = 0
  })
})

// ── GEN-10 — explicit-structural mechanisms only ──────────────────────────────────────────────────────

describe("GEN-10 — every stage binds a named deterministic mechanism; no embedding/vector/ANN", () => {
  const ADMISSIBLE = new Set([
    "tree-sitter",
    "SCIP",
    "stack-graphs",
    "SZZ",
    "hotspots",
    "temporal-coupling",
    "ownership",
    "personalized-PageRank",
    "CodeQL",
    "Semgrep",
  ])
  const BANNED = /embed|vector|ann|cosine|smart[- ]?scor/i

  it("SCN-GEN-10a-1: each stage binds a named, deterministic mechanism from the registry", () => {
    for (const stage of ["scan", "mine", "rank"] as const) {
      const bound = MECHANISMS[stage]
      expect(bound.length).toBeGreaterThan(0) // none unbound
      for (const mech of bound) expect(ADMISSIBLE.has(mech)).toBe(true)
    }
  })

  it("SCN-GEN-10b-1: zero embedding/vector/ANN mechanisms in the rank path", () => {
    const all = Object.values(MECHANISMS).flat()
    for (const mech of all) expect(BANNED.test(mech)).toBe(false)
    // the ranker is explicit-structural: personalized-PageRank, never a similarity embedding (A-14).
    expect(MECHANISMS.rank).toEqual(["personalized-PageRank"])
  })
})

// ── GEN-11 — reproducible ranking (the determinism law · PBT) ─────────────────────────────────────────

describe("GEN-11 — the PPR ranking is a deterministic function of repo@rev; no RNG/clock/model", () => {
  it("SCN-GEN-11a-1: ranking is invariant under adjacency / input permutation", () => {
    const canonical = idsOf(rank(BASE_SKELETON, FRONTIER))
    expect(canonical).toEqual(["st-a10", "st-b22", "st-c31", "st-d40"])
    // permute the edge order AND the personalization order — the ranking is identical every time.
    const permutedGraph = skeletonOf([...REF_EDGES].reverse(), ["st-c31", "st-a10", "st-d40", "st-b22"])
    for (const pers of [
      [s4, s3, s2, s1],
      [s2, s4, s1, s3],
      [s3, s1, s4, s2],
    ]) {
      expect(idsOf(rank(permutedGraph, pers))).toEqual(canonical)
    }
  })

  it("SCN-GEN-11b-1: the rank path carries no RNG/clock/model — damping is a pinned constant", () => {
    expect(DAMPING).toBe(0.85) // pinned (atlas-genesis:142)
    // behavioural witness of no RNG/clock: 8 independent runs are byte-identical (an RNG seed would drift).
    const runs = Array.from({ length: 8 }, () => JSON.stringify(rank(BASE_SKELETON, FRONTIER)))
    expect(new Set(runs).size).toBe(1)
  })

  it("SCN-GEN-11c-1: fixed-point scores + stable order ⇒ byte-identical ranking (cross-machine)", () => {
    const x = rank(BASE_SKELETON, FRONTIER)
    const y = rank(BASE_SKELETON, [...FRONTIER].reverse())
    // integer fixed-point scores compare exactly; ties broken by subtreeHash — no raw-float sort.
    expect(JSON.stringify(x)).toBe(JSON.stringify(y))
    expect(x.map((c) => c.rank)).toEqual([1, 2, 3, 4])
  })
})

// ── GEN-15 — history-thin fallback to structural centrality ───────────────────────────────────────────

describe("GEN-15 — degenerate history degrades to structural centrality, never rank noise", () => {
  const shallowHistory = (frontier: readonly StructRef[] = FRONTIER): HistorySource => ({
    ...healthyHistory(frontier),
    commitCount: () => 1, // below MIN_COMMITS ⇒ degenerate
  })

  it("SCN-GEN-15a-1: degenerate history trips the pre-check → structural fallback", () => {
    expect(MIN_COMMITS).toBe(2)
    const thin = probeHistory(shallowHistory(), "acme", "shallow")
    expect(thin.thin).toBe(true)
    expect(thin.reason).toBe("low-commit-count")
    const healthy = probeHistory(healthyHistory(), "acme", "rev-c0ffee")
    expect(healthy.thin).toBe(false)
    // the mine driver falls the personalization back to structural signals (mined signals dropped).
    const mine = createMine({ skeleton: skeletonSource(BASE_SKELETON), history: shallowHistory() })
    const cands = mine.mine("acme", "shallow")
    expect(cands.length).toBeGreaterThan(0)
    for (const c of cands) expect(c.signals.szzBugCommits).toBe(0) // structural fallback → no history seeding
  })

  it("SCN-GEN-15b-1: history is a booster, never a dependency (empty log still ranks)", () => {
    // healthy-log shape but an EMPTY mined frontier ⇒ still a non-degenerate structural ranking.
    const emptyFrontier = createMine({
      skeleton: skeletonSource(BASE_SKELETON),
      history: healthyHistory([]),
    })
    const cands = emptyFrontier.mine("acme", "empty")
    expect(cands.length).toBeGreaterThan(0) // teeth: a hard history dependency would error / return nothing
  })

  it("SCN-GEN-15c-1: degrades to structural centrality (non-uniform), not uniform/random noise", () => {
    const seeds = structuralSeeds(BASE_SKELETON)
    expect(seeds.length).toBe(4)
    const cands = rank(BASE_SKELETON, seeds)
    // a non-uniform frontier: the PPR scores are strictly distinct (structural centrality, not rank noise).
    const scores = cands.map((c) => c.ppr)
    expect(new Set(scores).size).toBe(scores.length)
    expect(scores[0]).toBeGreaterThan(scores[scores.length - 1]!)
  })
})

// ── F1+F2 REGRESSION — REAL-INDEX shape: subtreeHash (content) ≠ node-identity (edge endpoint) ─────────
// The toy fixtures above mint BOTH legs from one id (asHash('st-a10') === asSubtreeHash('st-a10')),
// collapsing the two DELIBERATELY-ORTHOGONAL identity spaces (contracts/hash.ts:5,22-25; KNOW-15). On the
// REAL index the dep-graph keys edge endpoints by NODE IDENTITY (nk-*) while a mined frontier site joins by
// its CONTENT subtreeHash (st-*); each IndexNode carries BOTH so the frozen Skeleton exposes the bridge.
// Without the bridge every site is a disconnected island → PPR ties → alphabetical-by-subtreeHash inverts
// the hub to LAST (the held-out CASE B). These reproduce that shape and prove the hub now ranks #1.

describe("F1+F2 — real-index shape: frontier subtreeHash resolves to node identity before the PPR join", () => {
  // node-identity keys (nk-*, the DepEdge endpoint space) are DISTINCT from content subtreeHashes (st-*);
  // the hub's subtreeHash is chosen to sort LAST alphabetically, so the F1 island bug buries it at #4.
  const CORR: readonly (readonly [string, string])[] = [
    ["nk-hub", "st-zzz-hub"],
    ["nk-leaf", "st-aaa-leaf"],
    ["nk-mid1", "st-bbb-mid1"],
    ["nk-mid2", "st-ccc-mid2"],
  ]
  const rnode = (nk: string, st: string): IndexNode => ({
    axis: "dependency",
    level: "symbol",
    key: nk,
    subtreeHash: asSubtreeHash(st),
    children: [],
    objects: [],
  })
  const depRoot: IndexNode = {
    axis: "dependency",
    level: "repo",
    key: "nk-root",
    subtreeHash: asSubtreeHash("st-root"),
    children: CORR.map(([nk, st]) => rnode(nk, st)),
    objects: [],
  }
  const nkEdge = (from: string, to: string): DepEdge => ({ from: asHash(from), to: asHash(to), kind: "resolved" })
  // def→ref (referencing → defining): the hub is referenced by leaf+mid1+mid2; the leaf references all, is
  // referenced by none (cold). A heavily-referenced defining node accumulates PPR mass.
  const REAL_EDGES: readonly DepEdge[] = [
    nkEdge("nk-leaf", "nk-hub"),
    nkEdge("nk-mid1", "nk-hub"),
    nkEdge("nk-mid2", "nk-hub"),
    nkEdge("nk-leaf", "nk-mid1"),
    nkEdge("nk-leaf", "nk-mid2"),
  ]
  const REAL_SKELETON: Skeleton = {
    axes: { spatial: depRoot, territory: depRoot, dependency: depRoot, edges: REAL_EDGES },
    manifest: { territories: [] },
  }
  const frontierSite = (st: string): StructRef => ({
    kind: "symbol",
    qualifiedPath: `x/${st}`,
    subtreeHash: asSubtreeHash(st),
  })
  const REAL_FRONTIER = CORR.map(([, st]) => frontierSite(st))

  it("F1: a mined frontier site joins the dep-graph via subtreeHash↔node-identity — hub outranks the leaf", () => {
    const ranked = rank(REAL_SKELETON, REAL_FRONTIER)
    const order = ranked.map((c) => c.site.subtreeHash)
    // the most-referenced defining node ranks #1 — NOT buried last by the F1 island→alphabetical collapse.
    expect(order[0]).toBe("st-zzz-hub")
    expect(ranked.find((c) => c.site.subtreeHash === "st-zzz-hub")!.rank).toBe(1)
    expect(order[0]).not.toBe("st-aaa-leaf") // the cold leaf is not the hub
  })

  it("F2: structuralSeeds emit the CONTENT subtreeHash leg, never a re-branded node-identity Hash", () => {
    const seeds = structuralSeeds(REAL_SKELETON)
    const hashes = seeds.map((s) => s.subtreeHash as string)
    // every seed carries a real st-* content hash (resolved via the correspondence), never an nk-* endpoint.
    for (const h of hashes) expect(h.startsWith("st-")).toBe(true)
    expect(hashes.some((h) => h.startsWith("nk-"))).toBe(false)
    // and those seeds round-trip through rank → the hub (highest structural degree) ranks #1.
    expect(rank(REAL_SKELETON, seeds)[0]!.site.subtreeHash).toBe("st-zzz-hub")
  })
})

// ── the frozen Scan/Mine/Rank bindings ────────────────────────────────────────────────────────────────

describe("the facet binds the frozen Scan/Mine/Rank surfaces", () => {
  it("makeRank() exposes the frozen rank(graph, personalization)", () => {
    const api = makeRank()
    expect(idsOf([...api.rank(BASE_SKELETON, FRONTIER)])).toEqual(["st-a10", "st-b22", "st-c31", "st-d40"])
  })

  it("createMine binds mine + probeHistory; a ratified-shape node key is a sealed-kernel mint", () => {
    const mine = createMine({ skeleton: skeletonSource(BASE_SKELETON), history: healthyHistory() })
    expect(mine.probeHistory("acme", "rev-c0ffee").thin).toBe(false)
    expect(asNodeKey("nk-x")).toBe("nk-x") // identity rides the sealed @atlas/kernel mint, never hand-rolled
  })
})
