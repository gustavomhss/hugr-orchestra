// @atlas/index — test/depgraph-honest.test.ts
//
// WP-2.8-b.INDEX — the honest-edge facet conformance suite. RED→GREEN transcription of the VISIBLE goldens
// SCN-INDEX-13a-1..13f-1 (REQ-INDEX-13a..13f), governed by INV-INDEX-13 + PROP-INDEX-13 (honest
// under-approximation): every unresolvable import/call and every cross-language boundary is an explicit
// `unresolved`/`dynamic` edge — never silently omitted, never a fabricated target; a reverse closure over a
// node with an unresolved edge in scope is reportable `under-approximate` and, when so flagged, UNIONS the
// node's `coChanged` band into a SEPARATE field, labeled correlational — never presented as a static edge.
// Fixture hashes are SYMBOLIC (minted only through the sealed kernel seam) ⇒ relational assertions only.
// Held-out `-2` fixtures are NOT transcribed (the lead's cold-review authors that GATE).

import { describe, it, expect } from "vitest"
import { asHash } from "@atlas/kernel"
import type { Hash } from "@atlas/contracts"
import type { DepEdge } from "@atlas/index"
import { createDepgraph } from "../src/depgraph.js"

const H = (s: string): Hash => asHash(s)

describe("WP-2.8-b.INDEX — honest-edge facet (visible goldens SCN-INDEX-13a-1..13f-1)", () => {
  // SCN-INDEX-13a-1 (happy) — a dynamic-dispatch call `C ⇢ ?` AND a cross-language `TS→Rust binary` edge
  // both appear as explicit `unresolved`/`dynamic` edges in the graph (present, tagged). Reverse chain so
  // both unresolvable sources land inside a queryable scope: A ← B ← C(⇢?) ← TS(→Rust).
  it("SCN-INDEX-13a-1: dynamic-dispatch + cross-language edges are explicit unresolved/dynamic (present, tagged)", () => {
    const edges: DepEdge[] = [
      { from: H("B"), to: H("A"), kind: "resolved" },
      { from: H("C"), to: H("B"), kind: "resolved" },
      { from: H("TS"), to: H("C"), kind: "resolved" },
      { from: H("C"), to: null, kind: "dynamic" }, // dynamic dispatch  C ⇢ ?
      { from: H("TS"), to: null, kind: "unresolved" }, // cross-language  TS → Rust binary (FFI)
    ]
    // the ledger records both, explicitly TAGGED, target never invented (to: null) — never omitted.
    const dyn = edges.filter((e) => e.kind === "dynamic")
    const xlang = edges.filter((e) => e.kind === "unresolved")
    expect(dyn.length).toBe(1)
    expect(xlang.length).toBe(1)
    for (const e of [...dyn, ...xlang]) expect(e.to).toBeNull()
    // and the graph HONORS them: a closure whose scope covers both unresolvable sources is under-approximate
    // (proof the edges are present in the graph's honesty accounting, not silently dropped).
    const rc = createDepgraph(edges).reverseClosure(H("A"))
    expect([...rc.closure].sort()).toEqual(["B", "C", "TS"])
    expect(rc.underApprox).toBe(true)
    // teeth: dropping the dynamic edge would leave the closure `underApprox:false` — a real coupling vanished.
  })

  // SCN-INDEX-13b-1 (guard) — a reflection-based call the SCIP indexer cannot resolve is present as
  // `unresolved`, 0 silent omissions. Differential: the ledger's unresolvable edge is observable (its
  // presence flips `underApprox`); an omission would make it indistinguishable from the fully-resolved graph.
  it("SCN-INDEX-13b-1: an unresolvable reflection edge is never silently omitted (0 omissions vs reference)", () => {
    const resolvedOnly: DepEdge[] = [
      { from: H("B"), to: H("A"), kind: "resolved" },
      { from: H("R"), to: H("B"), kind: "resolved" },
    ]
    const reflectionEdge: DepEdge = { from: H("R"), to: null, kind: "unresolved" } // reflection: unresolvable
    const withReflection: DepEdge[] = [...resolvedOnly, reflectionEdge]

    // reference (no reflection edge) ⇒ complete; adding the reflection edge is NOT absorbed silently.
    expect(createDepgraph(resolvedOnly).reverseClosure(H("A")).underApprox).toBe(false)
    expect(createDepgraph(withReflection).reverseClosure(H("A")).underApprox).toBe(true)
    // edge-count parity: the honest graph carries exactly one more (unresolved) edge than the reference.
    const unresolvedCount = withReflection.filter((e) => e.kind !== "resolved").length
    expect(unresolvedCount).toBe(1)
    // teeth: omitting the reflection edge ⇒ underApprox:false ⇒ edge-count short by one (silent omission).
  })

  // SCN-INDEX-13c-1 (guard) — the cross-language `TS→Rust` edge's target is `unresolved`, NEVER a guessed
  // concrete node. The graph must not fabricate a resolved target: the unresolvable source contributes NO
  // invented closure member, and no `resolved` edge ever carries a null target.
  it("SCN-INDEX-13c-1: an unresolvable edge never gets a fabricated resolved target", () => {
    const edges: DepEdge[] = [
      { from: H("X"), to: H("TS"), kind: "resolved" }, // X really depends on TS
      { from: H("TS"), to: null, kind: "unresolved" }, // TS → Rust binary, target unknowable
    ]
    // the ledger never invents a target: a `resolved` edge with a null `to` would be a fabrication.
    expect(edges.some((e) => e.kind === "resolved" && e.to === null)).toBe(false)
    // the graph invents nothing: TS's blast radius is its REAL dependents only ({X}); the unresolved edge
    // from TS adds no phantom node, and TS's own closure never contains a guessed target.
    const rcTs = createDepgraph(edges).reverseClosure(H("TS"))
    expect([...rcTs.closure].sort()).toEqual(["X"])
    // every closure member is a real node named in the input ledger — never an invented one.
    const realNodes = new Set(edges.flatMap((e) => (e.to === null ? [String(e.from)] : [String(e.from), String(e.to)])))
    for (const m of rcTs.closure) expect(realNodes.has(String(m))).toBe(true)
    // teeth: a fabricated `resolved` edge to an invented node would surface a phantom closure member.
  })

  // SCN-INDEX-13d-1 (happy) — reverse closure of A includes C, and C has an `unresolved` edge in scope ⇒
  // reverseClosure(A) reports `{ underApprox: true }`. Chain A ← B ← C ← D ← E, C carries C ⇢ ?.
  it("SCN-INDEX-13d-1: a closure with an unresolved edge in scope reports under-approximate", () => {
    const chain: DepEdge[] = [
      { from: H("B"), to: H("A"), kind: "resolved" },
      { from: H("C"), to: H("B"), kind: "resolved" },
      { from: H("D"), to: H("C"), kind: "resolved" },
      { from: H("E"), to: H("D"), kind: "resolved" },
      { from: H("C"), to: null, kind: "unresolved" },
    ]
    const rc = createDepgraph(chain).reverseClosure(H("A"))
    expect([...rc.closure].sort()).toEqual(["B", "C", "D", "E"])
    expect(rc.underApprox).toBe(true)
    // teeth: reporting `underApprox:false` here would present an incomplete closure as complete.
  })

  // SCN-INDEX-13e-1 (happy) — an under-approximate reverseClosure(A) unions C's `coChanged` band {P,Q},
  // each labeled `correlational` (a separate field), never a static edge.
  it("SCN-INDEX-13e-1: an under-approximate closure unions the coChanged band, labeled correlational", () => {
    const chain: DepEdge[] = [
      { from: H("B"), to: H("A"), kind: "resolved" },
      { from: H("C"), to: H("B"), kind: "resolved" },
      { from: H("C"), to: null, kind: "unresolved" },
    ]
    const coChanged = new Map<Hash, readonly Hash[]>([[H("C"), [H("P"), H("Q")]]])
    const rc = createDepgraph(chain, coChanged).reverseClosure(H("A"))
    expect(rc.underApprox).toBe(true)
    // the {P,Q} band rides in through the SEPARATE `coChanged` field (correlational), not the static closure.
    expect([...rc.coChanged].sort()).toEqual(["P", "Q"])
    // and a fully-resolved closure never unions a correlational band (no conflation).
    const resolvedOnly = chain.filter((e) => e.kind === "resolved")
    const clean = createDepgraph(resolvedOnly, coChanged).reverseClosure(H("A"))
    expect(clean.underApprox).toBe(false)
    expect(clean.coChanged).toEqual([])
    // teeth: labeling {P,Q} as static resolved edges would let correlational hits masquerade as static.
  })

  // SCN-INDEX-13f-1 (guard) — the under-approximate closure carries the `under-approximate` flag AND the
  // `correlational` labels; the coChanged band is NEVER presented as a complete/static blast radius.
  it("SCN-INDEX-13f-1: an under-approximate closure is never presented as complete or as static edges", () => {
    const chain: DepEdge[] = [
      { from: H("B"), to: H("A"), kind: "resolved" },
      { from: H("C"), to: H("B"), kind: "resolved" },
      { from: H("C"), to: null, kind: "unresolved" },
    ]
    const coChanged = new Map<Hash, readonly Hash[]>([[H("C"), [H("P"), H("Q")]]])
    const rc = createDepgraph(chain, coChanged).reverseClosure(H("A"))
    // the flag survives presentation.
    expect(rc.underApprox).toBe(true)
    // the correlational band is a SEPARATE field — no coChanged member is smuggled into the static closure.
    const staticClosure = new Set(rc.closure.map((h) => String(h)))
    for (const c of rc.coChanged) expect(staticClosure.has(String(c))).toBe(false)
    // and the static closure holds only the resolved reverse-reachable set (B, C) — not the correlational band.
    expect([...rc.closure].sort()).toEqual(["B", "C"])
    // teeth: stripping the flag / folding coChanged into `closure` would show it as a complete static radius.
  })
})
