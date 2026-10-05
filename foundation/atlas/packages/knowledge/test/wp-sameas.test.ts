// @atlas/knowledge — test/wp-sameas.test.ts  (WP-SAMEAS · #43 · deriveSameAs + sameAsClassOf + linkSameAs)
//
// The pure core of the human-asserted `sameAs` equivalence: the read-side union-find fold (`deriveSameAs`),
// the write-door's class query (`sameAsClassOf`), and the write-side symmetric reducer (`linkSameAs`). Fast
// white-box teeth — a red→green guard on the union-find + reducer INDEPENDENT of the ~27s s16 subprocess
// blackbox (coverage parity with the sibling `wp-dedup-2.subsumes.test.ts`). Each `it` pins one frozen
// clause and names the mutant it kills.

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { deriveSameAs, sameAsClassOf } from "../src/read/sameas.js"
import type { SameAs } from "../src/read/sameas.js"
import { linkSameAs } from "../src/write/link.js"
import type { CurrentNode, StoreProjection } from "../src/write/router.js"

/** A minimal current node keyed `key`, carrying an optional `sameAs` edge list (the only fields the fold +
 *  reducer read). family/contentHash/claims are inert filler the shapes require. */
function node(key: string, sameAs?: readonly string[]): CurrentNode {
  return { nodeKey: key, family: "advisory", contentHash: `ch-${key}`, claims: [], ...(sameAs ? { sameAs } : {}) }
}

/** A projection over the given nodes (cas/builtAt inert — the fold/reducer never read them). */
function proj(...nodes: readonly CurrentNode[]): StoreProjection {
  return { current: new Map(nodes.map((n) => [n.nodeKey, n])), cas: new Set() }
}

const pairs = (es: readonly SameAs[]): string[] => es.map((e) => `${e.a}=${e.b}`)

describe("deriveSameAs — union-find equivalence fold (WP-SAMEAS read side)", () => {
  it("a symmetric edge A↔B yields exactly the one canonical pair {a<b}", () => {
    const p = proj(node("kA", ["kB"]), node("kB", ["kA"]))
    expect(pairs(deriveSameAs(p))).toEqual(["kA=kB"]) // a<b canonical, emitted once (not kB=kA too)
  })

  it("TRANSITIVE closure: A≡B, B≡C ⇒ the fold derives A≡C (the union-find tooth)", () => {
    // Only A-B and B-C are stored; A-C is NEVER a stored edge. A plain edge-lister would emit 2 pairs;
    // the union-find fold must emit all THREE intra-class canonical pairs.
    const p = proj(node("kA", ["kB"]), node("kB", ["kA", "kC"]), node("kC", ["kB"]))
    expect(pairs(deriveSameAs(p))).toEqual(["kA=kB", "kA=kC", "kB=kC"]) // sorted, transitive, no dups
  })

  it("a dangling edge to a NON-current nodeKey is ignored — no throw, no phantom class", () => {
    const p = proj(node("kA", ["kGHOST"])) // kGHOST is not in `current`
    expect(deriveSameAs(p)).toEqual([]) // singleton after ignoring the dangling peer
  })

  it("a node with no sameAs is a singleton — emits nothing", () => {
    expect(deriveSameAs(proj(node("kA"), node("kB")))).toEqual([])
  })

  it("two DISJOINT classes each emit their own pair, globally sorted", () => {
    const p = proj(node("kA", ["kB"]), node("kB", ["kA"]), node("kC", ["kD"]), node("kD", ["kC"]))
    expect(pairs(deriveSameAs(p))).toEqual(["kA=kB", "kC=kD"])
  })
})

describe("linkSameAs — pure symmetric reducer (WP-SAMEAS write side)", () => {
  it("a===b is a total no-op (a node never names itself)", () => {
    const p = proj(node("kA"))
    expect(linkSameAs(p, "kA", "kA")).toBe(p) // unchanged reference OR structurally equal — no self-edge
    expect(deriveSameAs(linkSameAs(p, "kA", "kA"))).toEqual([])
  })

  it("an absent endpoint is a total no-op (the door decides rejection; the reducer stays total)", () => {
    const p = proj(node("kA"))
    expect(deriveSameAs(linkSameAs(p, "kA", "kGHOST"))).toEqual([]) // kGHOST absent ⇒ no edge written
  })

  it("links SYMMETRICALLY: both endpoints gain the peer, and the fold then derives the pair", () => {
    const p = proj(node("kA"), node("kB"))
    const next = linkSameAs(p, "kB", "kA") // order-independent
    expect(next.current.get("kA")?.sameAs).toEqual(["kB"])
    expect(next.current.get("kB")?.sameAs).toEqual(["kA"])
    expect(pairs(deriveSameAs(next))).toEqual(["kA=kB"])
  })

  it("is IDEMPOTENT and INPUT-PURE: re-linking changes nothing and never mutates the input projection", () => {
    const p = proj(node("kA"), node("kB"))
    const once = linkSameAs(p, "kA", "kB")
    const twice = linkSameAs(once, "kA", "kB")
    expect(twice.current.get("kA")?.sameAs).toEqual(["kB"]) // no duplicate peer
    expect(p.current.get("kA")?.sameAs).toBeUndefined() // the ORIGINAL projection was never mutated
  })
})

// ── sameAsClassOf — the WRITE DOOR's class query, and why it is DELIBERATELY wider ─────────────────────
//
// `deriveSameAs` answers "what does a READER observe"; `sameAsClassOf` answers "what does a WRITE DOOR have
// to gate on". They are not the same question, so they are not the same fold, and the difference is the
// whole security argument of `governed-link.ts`: the door joins the governance class of every member this
// query returns, so returning a member TOO MANY only ever asks for a stronger signature, while returning
// one too FEW is a bypass. Two halves of the widening had NO killer of their own — a mutation review
// removed EITHER one alone and the entire suite stayed green (removing BOTH reddened `SCN-GL-8` at the
// door, so that coverage was accidental, not designed). One case per half, below.

describe("sameAsClassOf — the class a governed link must clear (WP-SAMEAS door side)", () => {
  it("SCN-SA-1 — a key with no relation is its own singleton, and an UNKNOWN key never throws", () => {
    expect(sameAsClassOf(proj(node("kA")), "kA")).toEqual(["kA"])
    expect(sameAsClassOf(proj(node("kA")), "kNOBODY")).toEqual(["kNOBODY"]) // total: not a current node
  })

  it("SCN-SA-2 — a DANGLING peer is IN the class: a retired node still widens what a link must clear", () => {
    // MUTANT: drop `...peers` from `for (const k of [node.nodeKey, ...peers])` — the class then contains
    // only CURRENT node keys and this goes RED. That widening is what makes SCN-SA-4 (below) possible: a
    // non-current key is the BRIDGE by which two live nodes belong to one governed class, and a gate that
    // silently dropped it would sign the merge of two classes it never joined.
    const p = proj(node("kA", ["kRETIRED"])) // kRETIRED is not in `current` — the peer outlived the node
    expect(sameAsClassOf(p, "kA")).toEqual(["kA", "kRETIRED"])
    expect(deriveSameAs(p)).toEqual([]) // …while the READ fold ignores it entirely (no phantom pair)
  })

  it("SCN-SA-3 — the relation is followed in REVERSE too: a half-written edge still widens the class", () => {
    // MUTANT: drop the `|| peers.some((p) => members.has(p))` half of `touches` — the expansion then only
    // ever walks OUT of a node already in the class, never INTO one that names a member, and this goes RED.
    // The stored edge is symmetric when the door writes it; it is NOT symmetric after a partial restore, a
    // hand-edited `.atlas/`, or any writer that is not this door — and a gate may not assume its input is
    // well-formed.
    // DELIBERATELY one-directional: only the query FROM `kA` is asserted. Querying from `kB` would also
    // exercise the `...peers` widening (SCN-SA-2's half), and a case that reds for either mutant cannot tell
    // the two apart — which is exactly the accidental coverage this pair of cases replaces.
    const p = proj(node("kA"), node("kB", ["kA"])) // only kB names kA; kA names nobody
    expect(sameAsClassOf(p, "kA")).toEqual(["kA", "kB"])
  })

  it("SCN-SA-4 — a RETIRED peer BRIDGES two live nodes into one class (the over-approximation, exhibited)", () => {
    // The witness that `sameAsClassOf` ⊋ `deriveSameAs`, and the reason the door uses the wider one. kA and
    // kB both name a peer that is no longer current. NOTHING the reader observes connects them — but a link
    // touching kA is, on the stored relation, a link touching kB's governance class too. Requires BOTH
    // widenings above (SCN-SA-2 puts kRETIRED into the class; SCN-SA-3 walks back out of it into kB).
    const p = proj(node("kA", ["kRETIRED"]), node("kB", ["kRETIRED"]))
    expect(deriveSameAs(p)).toEqual([]) // the read side merges nothing
    expect(sameAsClassOf(p, "kA")).toEqual(["kA", "kB", "kRETIRED"]) // the door merges all three
  })

  it("SCN-SA-5 — TRANSITIVE and order-independent: every member of the chain, from ANY member (the F3 bypass)", () => {
    // MUTANT: replace the fixed-point loop with a single pass and the far end of the chain drops out —
    // which is the two-hop bypass `SCN-GL-8` reproduces at the door (T0 ← T2 ← attacker).
    const p = proj(node("kA", ["kB"]), node("kB", ["kA", "kC"]), node("kC", ["kB"]))
    for (const from of ["kA", "kB", "kC"]) {
      expect(sameAsClassOf(p, from), `class from ${from}`).toEqual(["kA", "kB", "kC"])
    }
  })
})

// ── PROP-SAMEAS-1 — the SOUNDNESS law tying the two folds together ────────────────────────────────────
//
// The real contract of the link gate, and until now it lived only in a review transcript: for EVERY key,
// the class `deriveSameAs` derives is a SUBSET of the class `sameAsClassOf` returns. Not an equality —
// SCN-SA-4 is the counterexample — and the direction is the whole point. LARGER is safe (the door asks for
// a stronger signature than strictly needed); SMALLER is a bypass (the door signs a merge it never priced).
//
// The generator is built to make the law NON-VACUOUS: peers are drawn from a pool that includes keys which
// are NEVER current (dangling), and no edge is ever mirrored, so asymmetric half-edges are the norm rather
// than the exception. The witness counters below FAIL the test if the corpus degenerates into symmetric,
// fully-current projections where the two folds trivially agree.

describe("PROP-SAMEAS-1 — deriveSameAs ⊆ sameAsClassOf (the over-approximation is SOUND)", () => {
  /** The counterexample, rendered only when one exists (a 5000-run ∀ may not pay to format 5000 passes). */
  const dump = (p: StoreProjection): string =>
    JSON.stringify([...p.current.values()].map((n) => [n.nodeKey, n.sameAs ?? []]))

  const CURRENT = ["kA", "kB", "kC", "kD"]
  const GHOSTS = ["kG1", "kG2"] // never current: retired/absent peers, the dangling half of the relation
  const PEERS = [...CURRENT, ...GHOSTS]

  /** Projections over a subset of CURRENT, each node carrying an ARBITRARY peer list — never mirrored, so
   *  asymmetric edges and dangling peers arise by construction (a symmetric generator is the vacuous one). */
  const projections = fc
    .uniqueArray(
      fc.record({
        key: fc.constantFrom(...CURRENT),
        peers: fc.uniqueArray(fc.constantFrom(...PEERS), { maxLength: 3 }),
      }),
      { selector: (n) => n.key, minLength: 1, maxLength: CURRENT.length },
    )
    .map((ns) => proj(...ns.map((n) => node(n.key, n.peers))))

  it("∀ projection, ∀ current key: the DERIVED class ⊆ the DOOR class (and the door class holds the key)", () => {
    let withDerivedEdge = 0
    let withDanglingPeer = 0
    let withAsymmetricEdge = 0
    let strictlyWider = 0

    fc.assert(
      fc.property(projections, (p) => {
        const edges = deriveSameAs(p)
        if (edges.length > 0) withDerivedEdge++
        for (const n of p.current.values()) {
          for (const peer of n.sameAs ?? []) {
            if (!p.current.has(peer)) withDanglingPeer++
            else if (!(p.current.get(peer)?.sameAs ?? []).includes(n.nodeKey)) withAsymmetricEdge++
          }
        }
        // Collected, then asserted ONCE per run: a per-member `expect` inside a 5000-run ∀ costs more than
        // the fold it checks, and the escapee list is a better failure message than the first tripwire.
        const escaped: string[] = []
        for (const key of p.current.keys()) {
          // what a READER observes about `key`: itself plus every node the union-find pairs it with
          const derived = new Set<string>([key])
          for (const e of edges) {
            if (String(e.a) === key) derived.add(String(e.b))
            if (String(e.b) === key) derived.add(String(e.a))
          }
          const door = new Set(sameAsClassOf(p, key))
          for (const m of derived) {
            if (!door.has(m))
              escaped.push(`${m} is derived-equal to ${key} but OUTSIDE the door class of ${key}; stored: ${dump(p)}`)
          }
          if (door.size > derived.size) strictlyWider++
        }
        expect(escaped).toEqual([])
      }),
      { numRuns: 5000 },
    )

    // NON-VACUITY: the corpus must actually contain the shapes the law is about, else the ∀ above is
    // satisfied by projections on which the two folds cannot possibly disagree.
    expect(withDerivedEdge, "runs where the read fold derived at least one pair").toBeGreaterThan(0)
    expect(withDanglingPeer, "peers pointing at a NON-current key").toBeGreaterThan(0)
    expect(withAsymmetricEdge, "edges stored on ONE endpoint only").toBeGreaterThan(0)
    expect(strictlyWider, "keys where the door class is STRICTLY wider than the derived one").toBeGreaterThan(0)
  })
})
