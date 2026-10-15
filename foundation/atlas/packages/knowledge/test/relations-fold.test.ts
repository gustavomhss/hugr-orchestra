// @atlas/knowledge — test/relations-fold.test.ts  (ADR-0015 D2 / #99a — relationsOf bidirectional read)

import { describe, it, expect } from "vitest"
import { relationsOf } from "../src/read/relations.js"
import type { StoreProjection } from "../src/write/router.js"
import type { CurrentNode } from "../src/write/upsert.js"

/** A relation row as the write door stamps it (family:'relation' + the endpoint carriers). */
function rel(nodeKey: string, a: string, b: string, kind = "depends-on"): CurrentNode {
  return {
    nodeKey,
    family: "relation",
    contentHash: "ch-" + nodeKey,
    claims: [],
    endpointA: a,
    endpointB: b,
    relationKind: kind,
  } as unknown as CurrentNode
}
/** A plain advisory row — must be invisible to the relation fold. */
function adv(nodeKey: string): CurrentNode {
  return { nodeKey, family: "advisory", contentHash: "ch-" + nodeKey, claims: [] } as unknown as CurrentNode
}

function projectionOf(...nodes: CurrentNode[]): StoreProjection {
  return { current: new Map(nodes.map((n) => [n.nodeKey, n])), cas: new Set() }
}

const A = "src/a.ts::f"
const B = "src/b.ts::g"
const C = "src/c.ts::h"

describe("relationsOf — the bidirectional grounded-relation read fold (ADR-0015 D2)", () => {
  const proj = projectionOf(
    rel("r1", A, B, "depends-on"), // A → B
    rel("r2", A, C, "calls"), //      A → C
    rel("r3", C, A, "depends-on"), // C → A
    adv("a1"), // noise: advisory row, never a relation
  )

  it("OUT: only relations where the unit is the SUBJECT (endpointA)", () => {
    const out = relationsOf(proj, A, "out")
    expect(out.map((e) => e.nodeKey)).toEqual(["r2", "r1"]) // sorted by (kind: calls<depends-on), then endpoints
    expect(out.every((e) => e.endpointA === A)).toBe(true)
  })

  it("IN: only relations where the unit is the OBJECT (endpointB)", () => {
    const inc = relationsOf(proj, A, "in")
    expect(inc.map((e) => e.nodeKey)).toEqual(["r3"]) // C → A
    expect(inc.every((e) => e.endpointB === A)).toBe(true)
  })

  it("BOTH (default): union of out and in", () => {
    expect(
      relationsOf(proj, A)
        .map((e) => e.nodeKey)
        .sort(),
    ).toEqual(["r1", "r2", "r3"])
  })

  it("advisory/predicate rows are invisible; a unit with no relations yields empty", () => {
    expect(relationsOf(proj, "src/unrelated.ts::z")).toEqual([])
    expect(relationsOf(projectionOf(adv("a1"), adv("a2")), A)).toEqual([])
  })

  it("TOTAL: a non-string / empty unit yields empty, never a throw", () => {
    for (const bad of ["", 42, null, undefined, {}] as unknown[]) {
      expect(relationsOf(proj, bad as string)).toEqual([])
    }
  })

  it("deterministic: byte-identical output for equal input", () => {
    expect(relationsOf(proj, A, "both")).toEqual(relationsOf(proj, A, "both"))
  })
})
