// @atlas/retrieval — test/wp-2.8-b-retr.heldout.test.ts  (WP-2.8-b.RETR · HELD-OUT GATE, Wave H `-2` leg)
//
// Cold held-out transcription of the `-2` goldens for the relate / blast-radius facet, authored by the
// REVIEWER against the EXISTING src (no builder input). It overfits nothing: fixtures are the held-out
// `w`-unit twins (NOT the visible `-1` billing fixtures), and the rank ORACLE is re-derived LOCALLY from
// the frozen spec `(tier-desc, ppr-desc, distance-asc, nodeKey-asc)` — never the facet's own comparator.
//
// COVERAGE (per docs/requirements/goldens-ret.md, Wave H):
//   RETR-11a-2..11e-2 — `gen: conformance` → held-out `-2` fixtures EXIST → transcribed here.
//   RETR-10a-2..10f-2 — DO NOT EXIST. RETR-10 is `gen: PBT` and is explicitly held-out-EXEMPT by design
//     (goldens-ret.md "Skipped … RETR-2/6/10/12 → held-out assurance = the PBT law-witness"). No `-2`.

import { describe, it, expect } from "vitest"
import { asNodeKey } from "@atlas/kernel"
import type { NodeKey, PackInvariant, Tier } from "@atlas/contracts"
import type { RelatedFact, RelationKind } from "../src/types.js"
import { createRelate, RELATE_RANK, type RelateAxes } from "../src/relate.js"

const nk = (s: string): NodeKey => asNodeKey(s)

function rf(
  id: string,
  o: { relation?: RelationKind; distance?: number; tier?: Tier; ppr?: number } = {},
): RelatedFact {
  return {
    nodeId: nk(id),
    relation: o.relation ?? "dependents",
    distance: o.distance ?? 1,
    tier: o.tier ?? "T1",
    ppr: o.ppr ?? 0.5,
    claim: id,
    stale: false,
  }
}

function axesOf(parts: {
  enclosing?: readonly PackInvariant[]
  reverse?: readonly RelatedFact[]
  coChanged?: readonly RelatedFact[]
  forward?: readonly RelatedFact[]
  governing?: readonly PackInvariant[]
  underApprox?: boolean
}): RelateAxes {
  return {
    enclosing: () => parts.enclosing ?? [],
    reverse: () => ({
      facts: parts.reverse ?? [],
      coChanged: parts.coChanged ?? [],
      underApprox: parts.underApprox ?? false,
    }),
    forward: () => parts.forward ?? [],
    governing: () => parts.governing ?? [],
  }
}

// Rank ORACLE — re-derived independently from the frozen spec; used to prove truncate-AFTER-rank.
const TIER: Record<Tier, number> = { T0: 0, T1: 1, T2: 2 }
function specRank(a: RelatedFact, b: RelatedFact): number {
  if (TIER[a.tier] !== TIER[b.tier]) return TIER[a.tier] - TIER[b.tier]
  if (a.ppr !== b.ppr) return b.ppr - a.ppr
  if (a.distance !== b.distance) return a.distance - b.distance
  return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0
}
const idsOf = (facts: readonly { nodeId: NodeKey }[]): string[] => facts.map((f) => String(f.nodeId))

const W = "w"

describe("HELD-OUT · REQ-RETR-11 — bounded blast radius (`-2` twins over unit `w`)", () => {
  it("SCN-RETR-11a-2 — dependents are cut at maxHops = 2 (e_far@3 excluded)", () => {
    const rev: RelatedFact[] = [
      rf("e_near_a", { ppr: 0.6, distance: 1 }),
      rf("e_near_b", { ppr: 0.5, distance: 1 }),
      rf("e_near_c", { ppr: 0.4, distance: 2 }),
      rf("e_far", { ppr: 0.99, distance: 3 }), // beyond the cut — high ppr must NOT save it
    ]
    const r = createRelate(axesOf({ reverse: rev })).relate(W)
    expect(idsOf(r.dependents)).not.toContain("e_far") // distance 3 excluded
    expect(r.dependents_meta.maxHops).toBe(2)
    expect(r.dependents_meta.total).toBe(3) // only the within-2-hop nodes counted
    expect(r.dependents_meta.truncated).toBe(false)
  })

  it("SCN-RETR-11b-2 — dependents ranked by the deterministic total order (e_hub before e_leaf)", () => {
    const rev: RelatedFact[] = [
      rf("e_leaf", { ppr: 0.3, distance: 1 }), // closer…
      rf("e_hub", { ppr: 0.85, distance: 2 }), // …but higher ppr wins: hub outranks leaf
    ]
    const r = createRelate(axesOf({ reverse: rev })).relate(W)
    expect(idsOf(r.dependents)).toEqual(["e_hub", "e_leaf"]) // distance demoted to a tiebreak
  })

  it("SCN-RETR-11c-2 — dependents capped at K = 8 (M = 15 within-hop)", () => {
    const rev = Array.from({ length: 15 }, (_, i) =>
      rf(`w_dep:${String(i).padStart(2, "0")}`, { ppr: (i + 1) / 100, distance: (i % 2) + 1 }),
    )
    const r = createRelate(axesOf({ reverse: rev })).relate(W)
    expect(r.dependents).toHaveLength(8) // top-8 by rank, the hard count
  })

  it("SCN-RETR-11d-2 — closure > K → truncate AFTER ranking, honest meta {truncated,total:15,returned:8}", () => {
    const rev = Array.from({ length: 15 }, (_, i) =>
      rf(`w_dep:${String(i).padStart(2, "0")}`, { ppr: (i + 1) / 100, distance: (i % 2) + 1 }),
    )
    const r = createRelate(axesOf({ reverse: rev })).relate(W)
    expect(r.dependents_meta).toEqual({
      maxHops: 2,
      rank: RELATE_RANK,
      total: 15, // honest pre-truncation count — never == returned
      returned: 8,
      truncated: true,
    })
    const oracleTop8 = idsOf([...rev].sort(specRank).slice(0, 8)) // independent rank-prefix oracle
    expect(idsOf(r.dependents)).toEqual(oracleTop8) // the 8 ARE the top-8 by rank (not insertion order)
  })

  it("SCN-RETR-11e-2 — forward dependencies use the same rank and K = 8 (M = 11)", () => {
    const fwd = Array.from({ length: 11 }, (_, i) =>
      rf(`w_fwd:${String(i).padStart(2, "0")}`, {
        relation: "dependencies",
        ppr: (i + 1) / 100,
        distance: (i % 2) + 1,
      }),
    )
    const r = createRelate(axesOf({ forward: fwd })).relate(W)
    expect(r.dependencies).toHaveLength(8) // same K = 8 bound (not unbounded)
    const oracleTop8 = idsOf([...fwd].sort(specRank).slice(0, 8))
    expect(idsOf(r.dependencies)).toEqual(oracleTop8) // same deterministic total order
  })
})
