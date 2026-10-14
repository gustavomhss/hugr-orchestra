// @atlas/knowledge — test/sameas-retraction.test.ts  (A-D3 / task #83 · the sameAs RETRACTION fold)
//
// The pure core of retraction: `unlinkSameAs` (the append-only symmetric reducer), the retraction-aware
// `deriveSameAs`, the deliberately retraction-BLIND `sameAsClassOf`, and `sameAsEdgeState` (the one
// definition the governed door consumes). Each `it` pins one clause and NAMES the mutant it kills — the
// mutation results are recorded in the seat report, not asserted here.
//
// ── THE MEASUREMENT THIS WHOLE FILE RESTS ON ─────────────────────────────────────────────────────────────
// `deriveSameAs` is REBUILD-PER-READ, not an incrementally maintained union-find: it mints a fresh `parent`
// map per call and the only persisted state is the per-node edge list. `it('is a pure function …')` below is
// the mechanical witness — the SAME projection object is folded twice with a mutation in between and the
// second fold reflects the mutation, which an incrementally-maintained structure could not do. That is why
// dropping a union is enough to SPLIT a class, and why classical union-find's missing delete never bites.

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { deriveSameAs, sameAsClassOf, sameAsEdgeState } from "../src/read/sameas.js"
import type { SameAs } from "../src/read/sameas.js"
import { linkSameAs, unlinkSameAs } from "../src/write/link.js"
import type { CurrentNode, StoreProjection } from "../src/write/router.js"

/** A minimal current node keyed `key`, carrying optional asserted + retracted peer lists. */
function node(key: string, sameAs?: readonly string[], sameAsRetracted?: readonly string[]): CurrentNode {
  return {
    nodeKey: key,
    family: "advisory",
    contentHash: `ch-${key}`,
    claims: [],
    ...(sameAs ? { sameAs } : {}),
    ...(sameAsRetracted ? { sameAsRetracted } : {}),
  }
}

function proj(...nodes: readonly CurrentNode[]): StoreProjection {
  return { current: new Map(nodes.map((n) => [n.nodeKey, n])), cas: new Set() }
}

const pairs = (es: readonly SameAs[]): string[] => es.map((e) => `${e.a}=${e.b}`)

/** The three-node CHAIN `kA — kB — kC`, built through the REAL reducer so no fixture hand-writes the edges
 *  the fold is asked about. `deriveSameAs` over it is the fully-merged class {kA,kB,kC}. */
function chain(): StoreProjection {
  const bare = proj(node("kA"), node("kB"), node("kC"))
  return unlinkNothing(linkSameAs(linkSameAs(bare, "kA", "kB"), "kB", "kC"))
}
/** Identity — makes the chain builder read as "no retraction applied" at its one call site. */
const unlinkNothing = (p: StoreProjection): StoreProjection => p

describe("the CRUX — deriveSameAs is REBUILD-PER-READ, not an incrementally-maintained union-find", () => {
  it("folds from the STORED edge list every call: mutating the store between two folds changes the second", () => {
    // The witness for the measurement the whole design rests on. If any class membership were memoised
    // across calls — a persisted `parent` map, a module-level cache, an incremental structure — the second
    // fold would still report the merged class and this would go red.
    const p = chain()
    expect(pairs(deriveSameAs(p))).toEqual(["kA=kB", "kA=kC", "kB=kC"]) // fold #1: fully merged

    const after = unlinkSameAs(p, "kB", "kC") // withdraw the ONLY bridge between {kA,kB} and {kC}
    expect(pairs(deriveSameAs(after))).toEqual(["kA=kB"]) //          fold #2: reflects the new edge list

    // and the ORIGINAL projection is untouched — the reducer is pure, so fold #1 is still reproducible.
    expect(pairs(deriveSameAs(p))).toEqual(["kA=kB", "kA=kC", "kB=kC"])
  })
})

describe("unlinkSameAs — the APPEND-ONLY symmetric retraction reducer", () => {
  it("APPENDS the retraction to BOTH endpoints and REMOVES NOTHING — the assertion survives on the row", () => {
    // Kills the mutant that implements retraction as `sameAs.filter(p => p !== peer)`: that mutant makes
    // "never linked" and "linked then unlinked" the same bytes, destroying the evidence A-D3 exists to keep.
    const p = unlinkSameAs(linkSameAs(proj(node("kA"), node("kB")), "kA", "kB"), "kA", "kB")
    expect(p.current.get("kA")?.sameAs).toEqual(["kB"]) // the ASSERTION is still recorded
    expect(p.current.get("kB")?.sameAs).toEqual(["kA"])
    expect(p.current.get("kA")?.sameAsRetracted).toEqual(["kB"]) // and so is the WITHDRAWAL
    expect(p.current.get("kB")?.sameAsRetracted).toEqual(["kA"]) // symmetric — kills a one-sided write
  })

  it("is PURE — the input projection is never mutated", () => {
    const before = linkSameAs(proj(node("kA"), node("kB")), "kA", "kB")
    unlinkSameAs(before, "kA", "kB")
    expect(before.current.get("kA")?.sameAsRetracted).toBeUndefined()
  })

  it("keeps `sameAsRetracted` SORTED + de-duped, and is idempotent", () => {
    const base = proj(node("kA"), node("kB"), node("kC"))
    const linked = linkSameAs(linkSameAs(base, "kA", "kC"), "kA", "kB")
    const twice = unlinkSameAs(unlinkSameAs(unlinkSameAs(linked, "kA", "kC"), "kA", "kB"), "kA", "kC")
    expect(twice.current.get("kA")?.sameAsRetracted).toEqual(["kB", "kC"]) // sorted, each peer once
  })

  it("TOTAL: a self-pair or an absent endpoint returns the projection UNCHANGED (never a throw)", () => {
    const p = proj(node("kA"), node("kB"))
    expect(unlinkSameAs(p, "kA", "kA")).toBe(p) // no self-equivalence ever existed
    expect(unlinkSameAs(p, "kA", "kGHOST")).toBe(p) // absent endpoint — the DOOR refuses, this no-ops
    expect(unlinkSameAs(p, "kGHOST", "kA")).toBe(p) // …in either argument position
  })

  it("preserves every other field of both rows, and every other node", () => {
    const p = unlinkSameAs(linkSameAs(proj(node("kA"), node("kB"), node("kZ")), "kA", "kB"), "kA", "kB")
    expect(p.current.get("kA")?.contentHash).toBe("ch-kA")
    expect(p.current.get("kZ")).toEqual(node("kZ")) // untouched third party
  })
})

describe("deriveSameAs — the read fold honours retraction, and the class SPLITS", () => {
  it("THE SPLIT: in the chain kA—kB—kC, retracting kB—kC leaves {kA,kB} and {kC}, NOT {kA,kB,kC}", () => {
    // THE tooth of the whole task. A retraction door that leaves the class merged retracts NOTHING and is a
    // false promise. Kills: (a) any fold that ignores `sameAsRetracted`; (b) a "remove the edge from a
    // maintained union-find" implementation, which cannot split a merged class at all.
    const after = unlinkSameAs(chain(), "kB", "kC")
    expect(pairs(deriveSameAs(after))).toEqual(["kA=kB"]) // kC is its OWN singleton now
  })

  it("retracting a MIDDLE edge splits into two live classes, both still derived", () => {
    const bare = proj(node("kA"), node("kB"), node("kC"), node("kD"))
    const linked = linkSameAs(linkSameAs(linkSameAs(bare, "kA", "kB"), "kB", "kC"), "kC", "kD")
    expect(pairs(deriveSameAs(linked))).toHaveLength(6) // one class of 4 ⇒ C(4,2) pairs
    const split = unlinkSameAs(linked, "kB", "kC")
    expect(pairs(deriveSameAs(split))).toEqual(["kA=kB", "kC=kD"]) // exactly two classes of 2
  })

  it("a class held together by a SECOND edge does NOT split when one edge is retracted", () => {
    // Non-vacuity in the other direction: retraction must remove ONE edge, not collapse the whole class.
    // Kills a mutant that drops every union for a node that appears anywhere in `sameAsRetracted`.
    const bare = proj(node("kA"), node("kB"), node("kC"))
    const triangle = linkSameAs(linkSameAs(linkSameAs(bare, "kA", "kB"), "kB", "kC"), "kA", "kC")
    const after = unlinkSameAs(triangle, "kB", "kC") // kB still reaches kC via kA
    expect(pairs(deriveSameAs(after))).toEqual(["kA=kB", "kA=kC", "kB=kC"]) // class intact
  })

  it("a HALF-WRITTEN retraction (marked on ONE endpoint only) still SPLITS — fail closed", () => {
    // The projection is untrusted input (`ratify/tier.ts`). Under "either endpoint marks it" a half-written
    // marker splits (bounded, local harm); under "both must mark it" a withdrawn edge would stay live and
    // transitively contagious — the exact harm A-D3 was opened about. Kills a `&&` mutant of that predicate.
    const p = proj(node("kA", ["kB"], ["kB"]), node("kB", ["kA"])) // only kA records the retraction
    expect(deriveSameAs(p)).toEqual([])
  })

  it("a retraction naming a peer that was never asserted changes nothing observable", () => {
    const p = proj(node("kA", undefined, ["kB"]), node("kB"))
    expect(deriveSameAs(p)).toEqual([]) // nothing was merged; nothing to split
  })

  it("output stays SORTED and canonical (a<b, each pair once) after a retraction", () => {
    const bare = proj(node("kD"), node("kA"), node("kC"), node("kB"))
    const linked = linkSameAs(linkSameAs(linkSameAs(bare, "kD", "kA"), "kA", "kC"), "kC", "kB")
    const after = unlinkSameAs(linked, "kA", "kC")
    expect(pairs(deriveSameAs(after))).toEqual(["kA=kD", "kB=kC"]) // globally sorted, no kD=kA form
  })
})

describe("sameAsClassOf — the GATE fold is deliberately BLIND to retraction", () => {
  it("a retracted member is STILL in the door class — the gate never under-charges", () => {
    // The decision, pinned: retraction restores the OBSERVED relation, it does not buy back a cheaper
    // signature. Kills a "make both folds agree" refactor, which would let a hand-written `sameAsRetracted`
    // marker in the (untrusted) projection SHRINK a class and cheapen the door's authz + ratify gates.
    const after = unlinkSameAs(chain(), "kB", "kC")
    expect(deriveSameAs(after).length).toBe(1) //         the READ relation split…
    expect(sameAsClassOf(after, "kA")).toEqual(["kA", "kB", "kC"]) // …the GATE class did not
  })
})

describe("sameAsEdgeState — the ONE pair-state definition the governed door consumes", () => {
  it("absent ⇒ asserted ⇒ retracted, and `retracted` DOMINATES (the peer is still in sameAs)", () => {
    const bare = proj(node("kA"), node("kB"))
    expect(sameAsEdgeState(bare, "kA", "kB")).toBe("absent")
    const linked = linkSameAs(bare, "kA", "kB")
    expect(sameAsEdgeState(linked, "kA", "kB")).toBe("asserted")
    const retracted = unlinkSameAs(linked, "kA", "kB")
    // Kills the mutant that checks `sameAs` BEFORE `sameAsRetracted`: a retraction is an APPEND, so the
    // peer is still in `sameAs` and that mutant reports every retracted edge as live — which would make the
    // door accept a re-link that the read fold goes on ignoring.
    expect(sameAsEdgeState(retracted, "kA", "kB")).toBe("retracted")
  })

  it("is ORDER-INDEPENDENT and total over unknown keys / self-pairs", () => {
    const retracted = unlinkSameAs(linkSameAs(proj(node("kA"), node("kB")), "kA", "kB"), "kA", "kB")
    expect(sameAsEdgeState(retracted, "kB", "kA")).toBe("retracted") // unordered
    expect(sameAsEdgeState(retracted, "kA", "kA")).toBe("absent") // no self-pair
    expect(sameAsEdgeState(retracted, "kA", "kGHOST")).toBe("absent") // unknown key
  })

  it("AGREES WITH THE FOLD: `retracted` iff the fold refuses to merge the pair on its own edge", () => {
    // The two must not drift, or the door refuses a pair the fold still merges (or the reverse). Checked
    // over the three states on an isolated two-node projection, where the pair's own edge is the only bridge.
    for (const [p, state, merged] of [
      [proj(node("kA"), node("kB")), "absent", false],
      [linkSameAs(proj(node("kA"), node("kB")), "kA", "kB"), "asserted", true],
      [unlinkSameAs(linkSameAs(proj(node("kA"), node("kB")), "kA", "kB"), "kA", "kB"), "retracted", false],
    ] as const) {
      expect(sameAsEdgeState(p, "kA", "kB")).toBe(state)
      expect(deriveSameAs(p).length > 0).toBe(merged)
    }
  })
})

// ── PROP-SAMEAS-1 STILL HOLDS UNDER RETRACTION ───────────────────────────────────────────────────────────
// The soundness law tying the two folds (`derived ⊆ door`) is the direction the link gate may never lose.
// Retraction can only ever SHRINK the derived class and the door fold is blind to it, so the law is
// preserved BY CONSTRUCTION — this ∀ is the mechanical check of that argument over projections that carry
// retractions, which the original PROP-SAMEAS-1 generator (predating the field) cannot produce.

describe("PROP-SAMEAS-1 under retraction — deriveSameAs ⊆ sameAsClassOf still holds", () => {
  const CURRENT = ["kA", "kB", "kC", "kD"]
  const GHOSTS = ["kG1", "kG2"] // never current — the dangling half of the relation
  const PEERS = [...CURRENT, ...GHOSTS]

  const projections = fc
    .uniqueArray(
      fc.record({
        key: fc.constantFrom(...CURRENT),
        peers: fc.uniqueArray(fc.constantFrom(...PEERS), { maxLength: 3 }),
        // Retractions are drawn INDEPENDENTLY of the peer list and are never mirrored, so half-written
        // markers and retractions of unasserted peers are the norm rather than the exception.
        retracted: fc.uniqueArray(fc.constantFrom(...PEERS), { maxLength: 2 }),
      }),
      { selector: (n) => n.key, minLength: 1, maxLength: CURRENT.length },
    )
    .map((ns) => proj(...ns.map((n) => node(n.key, n.peers, n.retracted))))

  it("∀ projection carrying retractions, ∀ current key: the DERIVED class ⊆ the DOOR class", () => {
    let withRetractionThatBites = 0 // a retraction that actually removed a derivable pair
    let withDerivedEdge = 0

    fc.assert(
      fc.property(projections, (p) => {
        const edges = deriveSameAs(p)
        if (edges.length > 0) withDerivedEdge++
        // NON-VACUITY probe: fold the SAME projection with every retraction stripped; if that yields more
        // pairs, this sample is one where retraction genuinely changed the answer.
        const stripped = proj(...[...p.current.values()].map((n) => node(n.nodeKey, n.sameAs)))
        if (deriveSameAs(stripped).length > edges.length) withRetractionThatBites++

        const escaped: string[] = []
        for (const key of p.current.keys()) {
          const derived = new Set<string>([key])
          for (const e of edges) {
            if (String(e.a) === key) derived.add(String(e.b))
            if (String(e.b) === key) derived.add(String(e.a))
          }
          const door = new Set(sameAsClassOf(p, key))
          for (const m of derived) {
            if (!door.has(m)) escaped.push(`${m} derived-equal to ${key} but OUTSIDE its door class`)
          }
        }
        expect(escaped).toEqual([])
      }),
      { numRuns: 3000 },
    )

    // NON-VACUITY: a corpus in which no retraction ever changed a fold is a corpus this law is not about.
    expect(withDerivedEdge, "corpus contains projections with a derived class").toBeGreaterThan(100)
    expect(withRetractionThatBites, "corpus contains retractions that actually removed a pair").toBeGreaterThan(100)
  })
})
