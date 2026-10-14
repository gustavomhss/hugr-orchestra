// @atlas/knowledge — test/negations-fold.test.ts  (ADR-0015 D3 / #99b — negationsOf + abstentionsOf read folds)
//
// The read surface of the honesty core, tested over a SEEDED projection (no dependence on the N2 door): a
// grounded NEGATION lives in `current` (family:'negation'), an ABSTENTION lives in the `abstained` ledger.
// The teeth: BOTH surface correctly, scope containment is segment-wise (#153), and a fired abstention is
// readable end to end (the #202 close).

import { describe, it, expect } from "vitest"
import { negationsOf, abstentionsOf } from "../src/read/negations.js"
import type { StoreProjection } from "../src/write/router.js"
import type { CurrentNode } from "../src/write/upsert.js"
import type { AbstainedRecord } from "../src/negation-types.js"

/** A grounded-negation row as the door WOULD stamp it: family:'negation', target on `endpointB`, scope on the
 *  governance carrier, kind on the relation carrier (the existing frozen carriers — NOTHING new needed). */
function neg(nodeKey: string, target: string, scope: string, kind = "calls"): CurrentNode {
  return {
    nodeKey,
    family: "negation",
    contentHash: "ch-" + nodeKey,
    claims: [],
    endpointB: target,
    relationKind: kind,
    scope,
  } as unknown as CurrentNode
}
/** A plain advisory row — must be invisible to the negation fold. */
function adv(nodeKey: string): CurrentNode {
  return { nodeKey, family: "advisory", contentHash: "ch-" + nodeKey, claims: [] } as unknown as CurrentNode
}
/** An abstention record as the door WOULD file it into the ledger. */
function abst(
  id: string,
  target: string,
  scope: string,
  reason: AbstainedRecord["reason"] = "scope-open",
): AbstainedRecord {
  return {
    kind: "abstained",
    id,
    relationKind: "calls",
    target,
    scope,
    reason,
    witness: { underApproxSources: ["src/x.ts::dyn"] },
  } as unknown as AbstainedRecord
}

function projectionOf(nodes: CurrentNode[], abstentions: AbstainedRecord[] = []): StoreProjection {
  const base: StoreProjection = { current: new Map(nodes.map((n) => [n.nodeKey, n])), cas: new Set() }
  return abstentions.length === 0 ? base : { ...base, abstained: new Map(abstentions.map((a) => [a.id, a])) }
}

const X = "src/payments/charge.ts::charge"
const Y = "src/orders/place.ts::place"

describe("negationsOf — the grounded-negation read fold (ADR-0015 D3)", () => {
  const proj = projectionOf([
    neg("n1", X, "src/payments", "calls"),
    neg("n2", Y, "src/orders", "depends-on"),
    adv("a1"), // noise — never a negation
  ])

  it("folds the family:negation rows, surfacing target/scope/relationKind off the frozen carriers", () => {
    const all = negationsOf(proj)
    expect(all.map((n) => n.nodeKey)).toEqual(["n2", "n1"]) // sorted by (scope: src/orders < src/payments)
    expect(all.find((n) => n.nodeKey === "n1")).toMatchObject({
      relationKind: "calls",
      target: X,
      scope: "src/payments",
    })
  })

  it("SCOPE FILTER: only negations whose scope is UNDER the query scope (segment-wise, #153-safe)", () => {
    expect(negationsOf(proj, "src").map((n) => n.nodeKey)).toEqual(["n2", "n1"]) // src covers both
    expect(negationsOf(proj, "src/payments").map((n) => n.nodeKey)).toEqual(["n1"]) // only the payments one
    expect(negationsOf(proj, "src/pay")).toEqual([]) // NOT a segment prefix — string containment is not containment
  })

  it("advisory rows are invisible; a miss and an empty projection both yield []", () => {
    expect(negationsOf(projectionOf([adv("a1"), adv("a2")]))).toEqual([])
    expect(negationsOf(projectionOf([]))).toEqual([])
    expect(negationsOf(proj, "lib")).toEqual([])
  })

  it("deterministic: byte-identical output for equal input", () => {
    expect(negationsOf(proj, "src")).toEqual(negationsOf(proj, "src"))
  })
})

describe("abstentionsOf — the honest-abstention read fold (#202 observability)", () => {
  const proj = projectionOf(
    [neg("n1", X, "src/payments", "calls")],
    [abst("n2", Y, "src/orders", "scope-open"), abst("n3", X, "src/payments", "target-not-global")],
  )

  it("folds the abstained ledger, surfacing the record with its reason + witness", () => {
    const all = abstentionsOf(proj)
    expect(all.map((a) => a.id)).toEqual(["n2", "n3"]) // sorted by (scope: src/orders < src/payments)
    const scopeOpen = all.find((a) => a.reason === "scope-open")
    expect(scopeOpen).toMatchObject({ target: Y, scope: "src/orders" })
    expect(scopeOpen?.witness.underApproxSources).toEqual(["src/x.ts::dyn"]) // the evidence that opened the scope
  })

  it("a fired abstention is OBSERVABLE beside the grounded negation — the #202 close", () => {
    // ONE projection holds BOTH a grounded negation (in `current`) AND abstentions (in `abstained`); both surface.
    expect(negationsOf(proj).length).toBe(1)
    expect(abstentionsOf(proj).length).toBe(2)
  })

  it("SCOPE FILTER applies the same segment-wise containment", () => {
    expect(abstentionsOf(proj, "src/orders").map((a) => a.id)).toEqual(["n2"])
    expect(abstentionsOf(proj, "src").map((a) => a.id)).toEqual(["n2", "n3"])
  })

  it("TOTAL over an ABSENT ledger and an empty projection ⇒ [], never a throw", () => {
    expect(abstentionsOf(projectionOf([neg("n1", X, "src/payments")]))).toEqual([]) // no `abstained` map at all
    expect(abstentionsOf(projectionOf([]))).toEqual([])
    expect(abstentionsOf(proj, "lib")).toEqual([])
  })
})
