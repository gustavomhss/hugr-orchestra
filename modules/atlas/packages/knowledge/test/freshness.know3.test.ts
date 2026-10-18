// WP-4.10-a.KNOW · RED/GREEN — the knowledge drift-verdict binding (KNOW-3) against the FROZEN grounding
// drift-oracle seam. Transcribes the visible `-1` goldens SCN-KNOW-3a-1 / 3b-1 / 3c-1
// (docs/requirements/goldens-knw.md). Held-out `-2` fixtures are NOT referenced here.
//
// BUILD-AHEAD (STALE PREMISE, kept deliberately — read this before trusting the fixture): this file was
// written when `@atlas/grounding` shipped zero runtime, so the oracle is supplied as a FIXTURE `DriftApi`
// simulating a `subtreeHash(normalize(unit))` comparison. BOTH halves of that are now false: grounding
// ships real runtime, and **no `normalize` exists anywhere in the product** — the oracle hashes the raw
// source slice. That stale premise is exactly why SCN-KNOW-3b-1 below was VACUOUS (it pinned both the key
// and the hash by hand and applied no edit at all). The real-mint leg lives in
// `freshness.know3.realmint.test.ts`, which drives `@atlas/index` `build()` and `@atlas/grounding`
// `driftDetect` with nothing hand-pinned. What remains HERE is only the KNOWLEDGE-LAYER BINDING —
// that `bindFreshness` consumes the oracle verdict and narrows it to the 2-state KnowledgeFreshness —
// NOT the oracle's hashing (owned by GROUND). No raw hashing, no line numbers.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asNodeKey } from "@atlas/kernel"
import type { Freshness as GroundingFreshness, StructRef } from "@atlas/contracts"
import type { Axes, IndexNode } from "@atlas/index"
import type { DriftApi, Grounding } from "@atlas/grounding"
import type { GroundedFact } from "@atlas/knowledge"
import { bindFreshness } from "../src/lifecycle/freshness.js"

// ── fixtures ────────────────────────────────────────────────────────────────

const emptyRoot = (axis: IndexNode["axis"]): IndexNode => ({
  axis,
  level: "repo",
  key: `${axis}:root`,
  subtreeHash: asSubtreeHash(`root-${axis}`),
  children: [],
  objects: [],
})

/** A built-index snapshot whose spatial rail carries each unit's CURRENT subtreeHash keyed by its
 *  qualifiedPath — the drift source-of-truth the oracle re-checks against. */
const mkTree = (current: Record<string, string>): Axes => ({
  spatial: {
    axis: "spatial",
    level: "repo",
    key: "spatial:root",
    subtreeHash: asSubtreeHash("root-spatial"),
    objects: [],
    children: Object.entries(current).map(
      ([key, h]): IndexNode => ({
        axis: "spatial",
        level: "item",
        key,
        subtreeHash: asSubtreeHash(h),
        children: [],
        objects: [],
      }),
    ),
  },
  territory: emptyRoot("territory"),
  dependency: emptyRoot("dependency"),
  edges: [],
})

/** A fixture oracle standing in for GROUND (`grounding/ref/subtree.ts`): FRESH iff EVERY anchor's
 *  `subtreeHash` equals the unit's CURRENT `subtreeHash` in `src` — an unresolvable anchor is DRIFTED
 *  (fail-closed, GROUND-3). Keys on `subtreeHash` alone: never a line number, never `displayLines`. */
const subtreeOracle: DriftApi = {
  driftDetect(grounding: Grounding, src: Axes): GroundingFreshness {
    const current = new Map(src.spatial.children.map((n) => [n.key, String(n.subtreeHash)]))
    const allMatch = grounding.entries.every((e) => {
      const cur = current.get(e.anchor.qualifiedPath)
      return cur !== undefined && cur === String(e.anchor.subtreeHash)
    })
    return allMatch ? "FRESH" : "DRIFTED"
  },
}

const anchor = (qualifiedPath: string, subtreeHash: string): StructRef => ({
  kind: "symbol",
  qualifiedPath,
  subtreeHash: asSubtreeHash(subtreeHash),
})

/** An advisory fact grounded at one anchor. `claims`/`freshness` legs are irrelevant to the binding —
 *  the served verdict is RECOMPUTED from the oracle, never read off the stored `freshness`. */
const factAt = (qualifiedPath: string, subtreeHash: string, displayLines?: string): GroundedFact => {
  const entry =
    displayLines === undefined
      ? { anchor: anchor(qualifiedPath, subtreeHash), path: "src/queue.ts" }
      : { anchor: anchor(qualifiedPath, subtreeHash), path: "src/queue.ts", displayLines }
  return {
    kind: "advisory",
    id: asNodeKey("nk-hdr"),
    tier: "T2",
    claimNorm: "cn-parseheader",
    grounding: { entries: [entry] } satisfies Grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
  }
}

// ── the binding under test ───────────────────────────────────────────────────

const freshness = bindFreshness(subtreeOracle)

describe("WP-4.10-a.KNOW — knowledge drift verdict binds to the grounding subtreeHash oracle", () => {
  it("SCN-KNOW-3a-1 — freshness is a function of the subtreeHash alone (FRESH on match)", () => {
    // fact grounded at st-77; the cited unit re-hashes to st-77 after normalize.
    const fact = factAt("fn parseHeader", "st-77")
    const tree = mkTree({ "fn parseHeader": "st-77" })
    expect(freshness(fact, tree)).toBe("FRESH")
  })

  it("SCN-KNOW-3a-1 — no line number enters the computation (displayLines is inert)", () => {
    // same fact + tree, but with a nav-only displayLines hint — the verdict MUST be identical.
    const tree = mkTree({ "fn parseHeader": "st-77" })
    const withLines = factAt("fn parseHeader", "st-77", "42-50")
    const withoutLines = factAt("fn parseHeader", "st-77")
    expect(freshness(withLines, tree)).toBe("FRESH")
    expect(freshness(withLines, tree)).toBe(freshness(withoutLines, tree))
  })

  // ⚠️ THIS CASE IS VACUOUS FOR THE PROPERTY IT NAMED, AND IS KEPT ONLY AS A BINDING CHECK.
  // It used to be titled "SCN-KNOW-3b-1 — reformat / rename / import-above stays FRESH (normalize
  // byte-unchanged)". Both the anchor key and the subtreeHash are pinned BY HAND on both sides (`st-77`
  // in the fact and `st-77` in the tree), no source text exists, and no reformat/rename is ever applied —
  // so it asserts `'st-77' === 'st-77'` and is byte-for-byte the same assertion as SCN-KNOW-3a-1 above.
  // It could never fail for the property in its title. Worse, that property was FALSE: measured through
  // the real mint, a reformat OF the cited unit reads DRIFTED and a rename OF the cited symbol reads
  // DRIFTED with the anchor key gone. REQ-KNOW-3b was amended 2026-08-02 accordingly.
  // The non-vacuous transcription lives in `freshness.know3.realmint.test.ts`, which runs all five edit
  // classes through the real `@atlas/index` build() mint and the real `@atlas/grounding` driftDetect.
  it("the binding is hash-equality on the anchor (NOT SCN-KNOW-3b-1 — see freshness.know3.realmint.test.ts)", () => {
    const fact = factAt("fn parseHeader", "st-77")
    const matchingTree = mkTree({ "fn parseHeader": "st-77" })
    expect(freshness(fact, matchingTree)).toBe("FRESH")
  })

  it("SCN-KNOW-3c-1 — a real change to the cited unit DRIFTs (subtreeHash st-77 → st-C9)", () => {
    // the unit's body semantically changed so its subtreeHash moved → the fact is DRIFTED.
    const fact = factAt("fn parseHeader", "st-77")
    const changedTree = mkTree({ "fn parseHeader": "st-C9" })
    expect(freshness(fact, changedTree)).toBe("DRIFTED")
  })

  it("a knowledge fact is 2-state — never surfaces the grounding STALE (fail-closed to DRIFTED)", () => {
    // an oracle returning the 3rd (advisory) state must narrow to DRIFTED at the 2-state knowledge leg.
    const staleOracle: DriftApi = { driftDetect: (): GroundingFreshness => "STALE" }
    const staleFreshness = bindFreshness(staleOracle)
    const fact = factAt("fn parseHeader", "st-77")
    expect(staleFreshness(fact, mkTree({ "fn parseHeader": "st-77" }))).toBe("DRIFTED")
  })
})
