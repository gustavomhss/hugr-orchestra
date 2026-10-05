// @atlas/knowledge — test/relations-seal-fold.test.ts  (#99 R6 — AR-11 + AR-26)
//
// AR-11 (read fold carries the seal): a `seal:'proven'` relation row must surface its seal through
// `relationsOf` — before R6 a proven relation was indistinguishable from an advisory one at the read fold
// (`RelationEdge` carried only nodeKey/kind/endpoints). AR-26 (reverse query pinned): querying B with
// direction `in` returns the A→B edge as an INBOUND dependent, DISTINCT from A's outbound `out` result, and
// the seal rides BOTH directions (the same edge, whichever endpoint you query from).

import { describe, it, expect } from "vitest"
import { relationsOf } from "../src/read/relations.js"
import type { StoreProjection } from "../src/write/router.js"
import type { CurrentNode } from "../src/write/upsert.js"

/** A relation row as the write door stamps it, OPTIONALLY sealed `proven` (the sound-relation minter's mark). */
function rel(nodeKey: string, a: string, b: string, seal?: "proven", kind = "depends-on"): CurrentNode {
  return {
    nodeKey,
    family: "relation",
    contentHash: "ch-" + nodeKey,
    claims: [],
    endpointA: a,
    endpointB: b,
    relationKind: kind,
    ...(seal !== undefined ? { seal } : {}),
  } as unknown as CurrentNode
}

function projectionOf(...nodes: CurrentNode[]): StoreProjection {
  return { current: new Map(nodes.map((n) => [n.nodeKey, n])), cas: new Set() }
}

const A = "src/a.ts::f"
const B = "src/b.ts::g"

describe("#99 R6 — AR-11: the read fold carries the relation seal", () => {
  it("a proven relation surfaces seal:proven; an unsealed relation surfaces no seal (distinguishable)", () => {
    const proj = projectionOf(
      rel("r-proven", A, B, "proven"), // A → B, sound-minted
      rel("r-advisory", B, A), //         B → A, no seal (advisory-class)
    )

    const [proven] = relationsOf(proj, A, "out") // A→B
    expect(proven).toBeDefined()
    expect(proven!.nodeKey).toBe("r-proven")
    // TEETH: before R6 the RelationEdge carried NO seal, so a proven relation read identically to advisory.
    expect(proven!.seal).toBe("proven")

    const [advisory] = relationsOf(proj, A, "in") // B→A
    expect(advisory).toBeDefined()
    expect(advisory!.nodeKey).toBe("r-advisory")
    expect(advisory!.seal).toBeUndefined() // an unsealed relation carries NO seal — never a silent 'proven'
  })
})

describe("#99 R6 — AR-26: reverse query is pinned and the seal rides both directions", () => {
  const proj = projectionOf(rel("r1", A, B, "proven")) // exactly one proven edge A → B

  it("querying B with `in` returns A→B as an INBOUND dependent, DISTINCT from A`s `out` result", () => {
    const bIn = relationsOf(proj, B, "in") //  who depends-on B  → the A→B edge, inbound to B
    const aOut = relationsOf(proj, A, "out") // what A depends-on → the A→B edge, outbound from A

    // Both queries reach the SAME directed edge from opposite endpoints.
    expect(bIn.map((e) => e.nodeKey)).toEqual(["r1"])
    expect(aOut.map((e) => e.nodeKey)).toEqual(["r1"])
    expect(bIn[0]!.endpointA).toBe(A)
    expect(bIn[0]!.endpointB).toBe(B)

    // DISTINCT: B has no OUTBOUND edge (B is the object, not the subject) and A has no INBOUND edge.
    expect(relationsOf(proj, B, "out")).toEqual([])
    expect(relationsOf(proj, A, "in")).toEqual([])
  })

  it("the seal rides BOTH directions — the same edge, whichever endpoint you query from", () => {
    const bIn = relationsOf(proj, B, "in")
    const aOut = relationsOf(proj, A, "out")
    expect(bIn[0]!.seal).toBe("proven")
    expect(aOut[0]!.seal).toBe("proven")
  })
})
