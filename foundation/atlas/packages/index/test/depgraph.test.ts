// @atlas/index — test/depgraph.test.ts
//
// The build facet's `depgraph.ts` implements `reverseClosure` (blast radius, INDEX-13) over the DAG the
// build derives. Its governing ∀-law is PROP-INDEX-13 (honest under-approximation): an `unresolved`/
// `dynamic` edge in scope ⇒ `underApprox: true`, and the correlational `coChanged` band is unioned in ONLY
// then (never labeled a static edge). Fixture hashes are SYMBOLIC ⇒ relational assertions only.

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import { asHash } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { DepEdge } from "@atlas/index"
import { createDepgraph } from "../src/depgraph.js"

const H = (s: string): Hash => asHash(s)

// Block-IDX §fixtures dependency DAG: A ← B ← C ← D ← E (blast-radius(A) = {B,C,D,E}); C carries an
// `unresolved` edge C ⇢ ? (dynamic dispatch); C's coChanged git-history band = {P, Q}.
const chain: DepEdge[] = [
  { from: H("B"), to: H("A"), kind: "resolved" },
  { from: H("C"), to: H("B"), kind: "resolved" },
  { from: H("D"), to: H("C"), kind: "resolved" },
  { from: H("E"), to: H("D"), kind: "resolved" },
  { from: H("C"), to: null, kind: "unresolved" },
]
const coChanged = new Map<Hash, readonly Hash[]>([[H("C"), [H("P"), H("Q")]]])

describe("INDEX-13 — reverseClosure honest under-approximation (fixture witness)", () => {
  it("blast-radius(A) = {B,C,D,E}, order-independent", () => {
    const dg = createDepgraph(chain, coChanged)
    const closure = [...dg.reverseClosure(H("A")).closure].sort()
    expect(closure).toEqual(["B", "C", "D", "E"])
  })

  it("an unresolved edge in scope ⇒ underApprox=true and the correlational coChanged band is unioned", () => {
    const rc = createDepgraph(chain, coChanged).reverseClosure(H("A"))
    expect(rc.underApprox).toBe(true)
    // result ⊇ coChanged(scope) — the {P,Q} band rides in, labeled correlational (separate field).
    expect([...rc.coChanged].sort()).toEqual(["P", "Q"])
  })

  it("a fully-resolved closure ⇒ underApprox=false and coChanged empty (no static/correlational conflation)", () => {
    const resolvedOnly = chain.filter((e) => e.kind === "resolved")
    const rc = createDepgraph(resolvedOnly, coChanged).reverseClosure(H("A"))
    expect(rc.underApprox).toBe(false)
    expect(rc.coChanged).toEqual([])
  })
})

// ── PROP-INDEX-13 — ∀ graphs seeded with unresolvable edges × reverse-closure queries ────────────────
const nodeArb = fc.constantFrom("A", "B", "C", "D", "E", "F", "G")
const edgeArb: fc.Arbitrary<DepEdge> = fc.oneof(
  fc.record({ from: nodeArb, to: nodeArb }).map((r): DepEdge => ({ from: H(r.from), to: H(r.to), kind: "resolved" })),
  nodeArb.map((n): DepEdge => ({ from: H(n), to: null, kind: "unresolved" })),
  nodeArb.map((n): DepEdge => ({ from: H(n), to: null, kind: "dynamic" })),
)

describe("PROP-INDEX-13 — ∀ graph, query: unresolved-in-scope ⇔ underApprox ∧ coChanged only when underApprox", () => {
  it("underApprox iff an unresolved/dynamic edge sources from a node in scope; coChanged gated on it", () => {
    fc.assert(
      fc.property(fc.array(edgeArb, { maxLength: 12 }), nodeArb, (edges, q) => {
        const bands = new Map<Hash, readonly Hash[]>([[H(q), [H("band")]]])
        const rc = createDepgraph(edges, bands).reverseClosure(H(q))
        // the query node is never in its own reverse-closure (blast radius excludes the origin).
        expect(rc.closure.includes(H(q))).toBe(false)
        const scope = new Set<string>([q, ...rc.closure.map((h) => String(h))])
        const anyUnresolved = edges.some(
          (e) => (e.kind === "unresolved" || e.kind === "dynamic") && scope.has(String(e.from)),
        )
        expect(rc.underApprox).toBe(anyUnresolved)
        // coChanged is non-empty ONLY when underApprox; never presented on a fully-resolved closure.
        if (!rc.underApprox) expect(rc.coChanged).toEqual([])
      }),
      { numRuns: 300 },
    )
  })
})
