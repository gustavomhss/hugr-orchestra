// Anti-vacuity guard for the PPR damping (ADR-0011, GEN-11).
//
// WHY THIS FILE EXISTS. `rank.ts` used to declare the damping TWICE: an exported `DAMPING = 0.85` that no
// `src` module ever read, and a private `D_NUM`/`D_DEN` pair that did all the arithmetic. The only assertion
// anywhere was `expect(DAMPING).toBe(0.85)` — which pinned the decorative copy. Measured on master before
// the fix: setting the REAL damping to 0.50 — a change that reorders which sites get proposed to the model —
// passed **780 tests** (genesis 140, e2e + adapter-io 640) with nothing red.
//
// That is the exact shape the repo keeps rediscovering: a constant rigorously asserted, guarding nothing.
// A constant test cannot detect it, so this file pins the RANKING OUTPUT instead. The values below are the
// observed fixed-point result at the ratified damping; any change to the ratio moves every one of them.
//
// The ratified law is `pinned(damping=0.85, seed)` (properties-gen.md:119, atlas-genesis:142).

import { describe, expect, it } from "vitest"

import { asHash, asSubtreeHash } from "@atlas/kernel"
import type { Hash, StructRef } from "@atlas/contracts"
import type { Axes, DepEdge, IndexNode, Manifest } from "@atlas/index"

import { DAMPING, DAMPING_DEN, DAMPING_NUM, rank } from "../src/rank.js"
import type { Skeleton } from "../src/types.js"

// ── fixture: the goldens' acme-repo shape (s1 referenced by s2,s3,s4; s2 by s3,s4; s3 by s4; s4 cold) ────

const site = (id: string): StructRef => ({
  kind: "symbol",
  qualifiedPath: `pkg/${id}.ts::${id}`,
  subtreeHash: asSubtreeHash(id),
})
const KEYS = ["st-a10", "st-b22", "st-c31", "st-d40"] as const

const edge = (from: string, to: string): DepEdge => ({ from: asHash(from), to: asHash(to), kind: "resolved" })
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

const SKELETON: Skeleton = {
  axes: {
    spatial: axisRoot(KEYS),
    territory: axisRoot(KEYS),
    dependency: axisRoot(KEYS),
    edges: REF_EDGES,
  } as Axes,
  manifest: { territories: [] } as Manifest,
}

/**
 * The observed personalized-PageRank scores at the ratified damping `85/100`, in the integer fixed-point
 * the implementation evaluates in (GEN-11 — byte-identical across machines, so these are exact, not
 * approximate). Recorded by running `rank()` itself; they are a WITNESS of the damping, not a re-derivation
 * of it — re-deriving the expectation from the same constant is how a pin becomes a tautology.
 */
const PINNED_PPR: ReadonlyArray<readonly [string, number]> = [
  ["st-a10", 0.451376272],
  ["st-b22", 0.243987174],
  ["st-c31", 0.17121907],
  ["st-d40", 0.133417457],
]

describe("GEN-11 — the PPR damping is guarded by the ranking it produces, not by a constant", () => {
  it("the ranked scores are EXACTLY the ratified-damping fixed point", () => {
    // teeth (breaks-on "DAMPING_NUM is changed from 85n to any other value"): every score moves. Measured:
    // at 50n this expectation fails, whereas before the fix the whole 780-test suite stayed green.
    const ranked = rank(SKELETON, KEYS.map(site))
    expect(ranked.map((c) => [c.site.subtreeHash, c.ppr] as const)).toStrictEqual(PINNED_PPR)
  })

  it("the ranking ORDER is the dependency-importance order, hub first", () => {
    // A weaker, more legible companion: even a reader who will not check nine decimal places can see that
    // the most-referenced symbol ranks first and the cold leaf last.
    const ranked = rank(SKELETON, KEYS.map(site))
    expect(ranked.map((c) => c.site.subtreeHash)).toStrictEqual(["st-a10", "st-b22", "st-c31", "st-d40"])
    expect(ranked.map((c) => c.rank)).toStrictEqual([1, 2, 3, 4])
  })

  it("the exported decimal is DERIVED from the ratio the arithmetic uses — never a second literal", () => {
    // teeth (breaks-on "`DAMPING` is re-introduced as an independent `0.85` literal while the ratio moves"):
    // that is precisely the two-declarations defect this file was written for, and it would pass a
    // `toBe(0.85)` assertion while the real damping had drifted.
    expect(DAMPING).toBe(Number(DAMPING_NUM) / Number(DAMPING_DEN))
    expect(DAMPING).toBe(0.85) // the ratified value (properties-gen.md:119)
  })
})
