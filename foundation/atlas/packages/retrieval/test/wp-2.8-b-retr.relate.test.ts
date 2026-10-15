// @atlas/retrieval — test/wp-2.8-b-retr.relate.test.ts  (WP-2.8-b.RETR)
//
// RED→GREEN transcription of the 11 VISIBLE `-1` goldens for the relate / blast-radius facet:
//   RETR-10a..10f (deterministic partitioned closure) + RETR-11a..11e (bounded blast radius).
// The facet is a SEAM CONSUMER: it READS the index axes + the correlational `coChanged` band (the frozen
// index/ref/depgraph.ts `ReverseClosure`) and only PARTITIONS → RANKS → CAPS — it never recomputes the
// closure. So every axis here is supplied AS A FIXTURE/INPUT; the closure itself is the index's job.
//
// SEAM/identity: `NodeKey`s are minted ONLY through the sealed @atlas/kernel `asNodeKey` constructor (no
// hand-rolled identity). The held-out `-2` fixtures are NOT transcribed. The rank ORACLE for the
// truncate-after-rank / same-K goldens is a TEST-LOCAL comparator (`specRank`), re-derived independently
// from the frozen spec rank `(tier-desc, ppr-desc, distance-asc, nodeKey-asc)` — never the facet's own.

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, it, expect } from "vitest"
import { asNodeKey } from "@atlas/kernel"
import type { NodeKey, PackInvariant, Tier } from "@atlas/contracts"
import type { RelatedFact, RelationKind, RelationSet } from "../src/types.js"
import { createRelate, RELATE_RANK, type RelateAxes } from "../src/relate.js"

// ── fixture builders ────────────────────────────────────────────────────────────────────────────────────

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

function pi(id: string, tier: Tier = "T1"): PackInvariant {
  return { nodeId: nk(id), tier, claim: id, freshness: "FRESH" }
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

/** The rank ORACLE — re-derived independently from the frozen spec `(tier-desc, ppr-desc, distance-asc,
 *  nodeKey-asc)`; used to check the facet truncates AFTER ranking (never the facet's own comparator). */
const TIER: Record<Tier, number> = { T0: 0, T1: 1, T2: 2 }
function specRank(a: RelatedFact, b: RelatedFact): number {
  if (TIER[a.tier] !== TIER[b.tier]) return TIER[a.tier] - TIER[b.tier]
  if (a.ppr !== b.ppr) return b.ppr - a.ppr
  if (a.distance !== b.distance) return a.distance - b.distance
  return a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0
}
const idsOf = (facts: readonly { nodeId: NodeKey }[]): string[] => facts.map((f) => String(f.nodeId))

const UNIT = "crates/billing/src/charge.rs"

// ── Fixture A — the `charge` unit over the billing territory (RETR-10) ───────────────────────────────────
const ENC_A: readonly PackInvariant[] = [pi("module:billing/charge"), pi("crate:billing")]
const GOV_A: readonly PackInvariant[] = [pi("territory:billing", "T0")]
const DEP_A: readonly RelatedFact[] = [
  rf("inv:billing-retry", { ppr: 0.9, distance: 1 }),
  rf("inv:billing-refund", { ppr: 0.7, distance: 1 }),
  rf("inv:billing-audit", { ppr: 0.5, distance: 2 }),
  rf("inv:billing-currency", { ppr: 0.5, distance: 2 }),
  rf("inv:billing-legacy", { ppr: 0.3, distance: 2 }),
]
const FWD_A: readonly RelatedFact[] = [
  rf("dep:ledger", { relation: "dependencies", ppr: 0.8, distance: 1 }),
  rf("dep:tax", { relation: "dependencies", ppr: 0.4, distance: 1 }),
]
const CC_A: readonly RelatedFact[] = [
  rf("cc:billing-report", { relation: "coChanged", ppr: 0.6, distance: 1 }),
  rf("inv:billing-retry", { relation: "coChanged", ppr: 0.9, distance: 1 }), // collides w/ a structural dependent
]
const AXES_A = axesOf({ enclosing: ENC_A, reverse: DEP_A, coChanged: CC_A, forward: FWD_A, governing: GOV_A })

// permuted-construction twin for RETR-10c: the CLOSURE/adjacency axes (reverse + forward + coChanged) are
// built in a DIFFERENT insertion order (same multiset of edges) — this is exactly the golden's teeth ("the
// closure emits in insertion/iteration order"). The `enclosing` spatial roll-up + `governing` territory rule
// are NOT closures: the index supplies them in a deterministic hierarchy/order that `relate` passes through,
// so they are held fixed (permuting them would test a scenario the index never produces).
const AXES_A_PERM = axesOf({
  enclosing: ENC_A,
  reverse: [...DEP_A].reverse(),
  coChanged: [...CC_A].reverse(),
  forward: [...FWD_A].reverse(),
  governing: GOV_A,
})

// ── REQ-RETR-10 — deterministic partitioned closure ─────────────────────────────────────────────────────

describe("REQ-RETR-10 — deterministic partitioned closure", () => {
  it("SCN-RETR-10a-1 — relate = the exact set from the three index axes", () => {
    const r = createRelate(AXES_A).relate(UNIT)
    const got = new Set<string>([
      ...idsOf(r.enclosing),
      ...idsOf(r.dependents),
      ...idsOf(r.dependencies),
      ...idsOf(r.governing),
    ])
    const expected = new Set<string>([...idsOf(ENC_A), ...idsOf(DEP_A), ...idsOf(FWD_A), ...idsOf(GOV_A)])
    expect(got).toEqual(expected) // no node missing, none extra
    expect(idsOf(r.enclosing)).toContain("crate:billing") // spatial roll-up axis not dropped (teeth)
  })

  it("SCN-RETR-10b-1 — the set is partitioned by relation kind", () => {
    const r = createRelate(AXES_A).relate(UNIT)
    // dependents (reverse) and dependencies (forward) are DISTINCT bands, not one flat `related` band
    expect(Array.isArray(r.dependents)).toBe(true)
    expect(Array.isArray(r.dependencies)).toBe(true)
    const dep = new Set(idsOf(r.dependents))
    const dependencyOverlap = idsOf(r.dependencies).filter((x) => dep.has(x))
    expect(dependencyOverlap).toEqual([]) // each node in exactly one structural band
    expect(r.dependents.every((f) => f.relation === "dependents")).toBe(true)
    expect(r.dependencies.every((f) => f.relation === "dependencies")).toBe(true)
  })

  it("SCN-RETR-10c-1 — relate is byte-identical for equal input (permuted construction)", () => {
    const a = createRelate(AXES_A).relate(UNIT)
    const b = createRelate(AXES_A_PERM).relate(UNIT)
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b)) // byte-identical despite permuted build
    expect(idsOf(a.dependents)).toEqual([
      "inv:billing-retry",
      "inv:billing-refund",
      "inv:billing-audit", // audit < currency breaks the 0.5-ppr tie by nodeKey-asc
      "inv:billing-currency",
      "inv:billing-legacy",
    ])
  })

  it("SCN-RETR-10d-1 — relate consults no LLM (0 model calls in the path)", () => {
    const src = readFileSync(fileURLToPath(new URL("../src/relate.ts", import.meta.url)), "utf8")
    for (const forbidden of [
      /\bfetch\b/,
      /openai/i,
      /anthropic/i,
      /\bclaude\b/i,
      /\bhttps?:\/\//,
      /\basync\b/,
      /\bawait\b/,
      /\bPromise\b/,
      /import\s*\(/,
      /\bWebSocket\b/,
    ]) {
      expect(src).not.toMatch(forbidden) // no network / async / model-call surface in the closure
    }
    const out = createRelate(AXES_A).relate(UNIT)
    expect(out instanceof Promise).toBe(false) // synchronous — deterministic, index-derived only
  })

  it("SCN-RETR-10e-1 — coChanged is opt-in (absent unless requested)", () => {
    const r = createRelate(AXES_A).relate(UNIT)
    expect("coChanged" in r).toBe(false) // correlational band never leaks in unrequested
    expect(r.coChanged).toBeUndefined()
  })

  it("SCN-RETR-10f-1 — coChanged is labeled and never mixed into the structural bands", () => {
    const r = createRelate(AXES_A).relate(UNIT, { coChanged: true })
    expect(r.coChanged).toBeDefined()
    const cc = r.coChanged as readonly RelatedFact[]
    expect(cc.every((f) => f.relation === "coChanged")).toBe(true) // its own labeled band
    const structural = new Set<string>([
      ...idsOf(r.enclosing),
      ...idsOf(r.dependents),
      ...idsOf(r.dependencies),
      ...idsOf(r.governing),
    ])
    expect(idsOf(cc).filter((x) => structural.has(x))).toEqual([]) // coChanged ∩ structuralBands = ∅
    expect(idsOf(cc)).toContain("cc:billing-report") // the genuinely-correlational node survives
    expect(idsOf(cc)).not.toContain("inv:billing-retry") // the structural collision is dropped
  })
})

// ── REQ-RETR-11 — bounded blast radius ──────────────────────────────────────────────────────────────────

describe("REQ-RETR-11 — bounded blast radius (ranked bounder)", () => {
  it("SCN-RETR-11a-1 — dependents are cut at maxHops = 2", () => {
    const rev: RelatedFact[] = [
      rf("d_near1", { ppr: 0.6, distance: 1 }),
      rf("d_near2", { ppr: 0.5, distance: 2 }),
      rf("d_far", { ppr: 0.99, distance: 3 }), // beyond the cut — high ppr must NOT save it
    ]
    const r = createRelate(axesOf({ reverse: rev })).relate("u")
    expect(idsOf(r.dependents)).not.toContain("d_far") // distance 3 excluded
    expect(r.dependents_meta.maxHops).toBe(2)
    expect(r.dependents_meta.total).toBe(2) // only within-hop nodes counted
    expect(r.dependents_meta.truncated).toBe(false)
  })

  it("SCN-RETR-11b-1 — dependents ranked by the deterministic total order (ppr over distance)", () => {
    const rev: RelatedFact[] = [
      rf("d_leaf", { ppr: 0.2, distance: 1 }), // closer…
      rf("d_hub", { ppr: 0.9, distance: 2 }), // …but lower ppr loses: hub outranks leaf
    ]
    const r = createRelate(axesOf({ reverse: rev })).relate("u")
    expect(idsOf(r.dependents)).toEqual(["d_hub", "d_leaf"]) // distance demoted to a tiebreak
  })

  it("SCN-RETR-11c-1 — dependents capped at K = 8", () => {
    const rev = Array.from({ length: 20 }, (_, i) =>
      rf(`dep:${String(i).padStart(2, "0")}`, { ppr: (i + 1) / 100, distance: (i % 2) + 1 }),
    )
    const r = createRelate(axesOf({ reverse: rev })).relate("u")
    expect(r.dependents).toHaveLength(8) // top-8 by rank, the hard count
  })

  it("SCN-RETR-11d-1 — closure > K → truncate AFTER ranking, honest meta", () => {
    const rev = Array.from({ length: 20 }, (_, i) =>
      rf(`dep:${String(i).padStart(2, "0")}`, { ppr: (i + 1) / 100, distance: (i % 2) + 1 }),
    )
    const r = createRelate(axesOf({ reverse: rev })).relate("u")
    expect(r.dependents_meta).toEqual({
      maxHops: 2,
      rank: RELATE_RANK,
      total: 20, // honest pre-truncation count — never == returned
      returned: 8,
      truncated: true,
    })
    const oracleTop8 = idsOf([...rev].sort(specRank).slice(0, 8)) // independent rank-prefix oracle
    expect(idsOf(r.dependents)).toEqual(oracleTop8) // returned 8 ARE the top-8 by rank (not insertion order)
  })

  it("SCN-RETR-11e-1 — forward dependencies use the same rank and K = 8", () => {
    const fwd = Array.from({ length: 15 }, (_, i) =>
      rf(`fwd:${String(i).padStart(2, "0")}`, { relation: "dependencies", ppr: (i + 1) / 100, distance: (i % 2) + 1 }),
    )
    const r = createRelate(axesOf({ forward: fwd })).relate("u")
    expect(r.dependencies).toHaveLength(8) // same K = 8 bound (not unbounded)
    const oracleTop8 = idsOf([...fwd].sort(specRank).slice(0, 8))
    expect(idsOf(r.dependencies)).toEqual(oracleTop8) // same deterministic total order
  })
})
