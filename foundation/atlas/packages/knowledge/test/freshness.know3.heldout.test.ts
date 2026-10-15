// WP-4.10-a.KNOW · HELD-OUT gate — authored by COLD REVIEW against the EXISTING src (not seen by the
// builder). Transcribes the held_out:true `-2` goldens SCN-KNOW-3a-2 / 3b-2 / 3c-2
// (docs/requirements/goldens-knw.md) over the unit `fn popTail` (subtreeHash st-42). Same FROZEN
// grounding seam: the oracle is a fixture `DriftApi` simulating GROUND's `grounding/ref/subtree.ts`
// (subtreeHash-only, never a line-range). Verifies the KNOWLEDGE-LAYER binding narrows the oracle
// verdict to the 2-state KnowledgeFreshness. No raw hashing, no line numbers.
//
// STALE PREMISE, same as the non-held-out twin: this was written when `@atlas/grounding` shipped zero
// runtime. It does not any more, and there is no `normalize` step in the real oracle. The fixture is
// therefore evidence about the BINDING only — never about the hashing. The real-mint leg is
// `freshness.know3.realmint.test.ts`.

import { describe, it, expect } from "vitest"
import { asSubtreeHash, asNodeKey } from "@atlas/kernel"
import type { Freshness as GroundingFreshness, StructRef } from "@atlas/contracts"
import type { Axes, IndexNode } from "@atlas/index"
import type { DriftApi, Grounding } from "@atlas/grounding"
import type { GroundedFact } from "@atlas/knowledge"
import { bindFreshness } from "../src/lifecycle/freshness.js"

const emptyRoot = (axis: IndexNode["axis"]): IndexNode => ({
  axis,
  level: "repo",
  key: `${axis}:root`,
  subtreeHash: asSubtreeHash(`root-${axis}`),
  children: [],
  objects: [],
})

// A built-index snapshot carrying each unit's CURRENT subtreeHash keyed by qualifiedPath. A file-offset
// (200-line downward shift) is NOT represented here — the oracle keys on subtreeHash alone.
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

// Fixture oracle standing in for GROUND: FRESH iff every anchor's subtreeHash equals the unit's CURRENT
// subtreeHash in src; unresolvable anchor → DRIFTED (fail-closed). Keys on subtreeHash, never a line.
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

const factAt = (qualifiedPath: string, subtreeHash: string, displayLines?: string): GroundedFact => {
  const entry =
    displayLines === undefined
      ? { anchor: anchor(qualifiedPath, subtreeHash), path: "src/queue.ts" }
      : { anchor: anchor(qualifiedPath, subtreeHash), path: "src/queue.ts", displayLines }
  return {
    kind: "advisory",
    id: asNodeKey("nk-poptail"),
    tier: "T2",
    claimNorm: "cn-poptail",
    grounding: { entries: [entry] } satisfies Grounding,
    freshness: "FRESH",
    claims: [],
    authoring: "ADVISORY",
  }
}

const freshness = bindFreshness(subtreeOracle)

describe("WP-4.10-a.KNOW — HELD-OUT (-2 goldens, fn popTail @ st-42)", () => {
  it("SCN-KNOW-3a-2 — freshness ignores a 200-line downward shift (subtreeHash st-42 unchanged → FRESH)", () => {
    // unit shifted 200 lines down (unrelated code inserted above); the offset enters nothing — the
    // stored displayLines is even the OLD range, and it is inert.
    const fact = factAt("fn popTail", "st-42", "10-24")
    const shiftedTree = mkTree({ "fn popTail": "st-42" })
    expect(freshness(fact, shiftedTree)).toBe("FRESH")
  })

  it("SCN-KNOW-3b-2 — reindent + rename pop→dequeue + import-above stays FRESH (normalize byte-unchanged)", () => {
    // cosmetic edit leaves normalize(unit) byte-unchanged → subtreeHash still st-42 → FRESH.
    const fact = factAt("fn popTail", "st-42")
    const cosmeticTree = mkTree({ "fn popTail": "st-42" })
    expect(freshness(fact, cosmeticTree)).toBe("FRESH")
  })

  it("SCN-KNOW-3c-2 — a real body change (added early-return) DRIFTs (subtreeHash st-42 → st-D1)", () => {
    const fact = factAt("fn popTail", "st-42")
    const changedTree = mkTree({ "fn popTail": "st-D1" })
    expect(freshness(fact, changedTree)).toBe("DRIFTED")
  })
})
