// @atlas/knowledge — test/test-vacuity-fold.test.ts  (ADR-0015 D5 / #95 — the testVacuitiesOf read fold)
//
// The read surface of the single-anchor PROVEN family, tested over a SEEDED projection (no dependence on the
// admit door): a grounded test-vacuity fact lives in `current` (family:'test-vacuity') with its identity legs
// (`unitKey`/`testName`) + proven `shape` + `seal` on the frozen carriers. The teeth: the fold surfaces the
// facts on a unit, is empty for a unit that has none, returns ALL for an empty `unit`, is deterministic, and
// is TOTAL over noise / malformed rows / an empty projection (never a throw).

import { describe, it, expect } from "vitest"
import { testVacuitiesOf } from "../src/read/test-vacuity.js"
import type { StoreProjection } from "../src/write/router.js"
import type { CurrentNode } from "../src/write/upsert.js"

/** A grounded test-vacuity row as the admit door WOULD stamp it: family:'test-vacuity', unitKey/testName on the
 *  frozen carriers, shape the proven property, seal:'proven' the ADR-0017 provenance. */
function tv(
  nodeKey: string,
  unitKey: string,
  testName: string,
  opts: { seal?: string } = { seal: "proven" },
): CurrentNode {
  return {
    nodeKey,
    family: "test-vacuity",
    contentHash: "ch-" + nodeKey,
    claims: [],
    unitKey,
    testName,
    shape: "assertion-only-in-catch",
    ...(opts.seal !== undefined ? { seal: opts.seal } : {}),
  } as unknown as CurrentNode
}
/** A plain advisory row — must be invisible to the test-vacuity fold. */
function adv(nodeKey: string): CurrentNode {
  return { nodeKey, family: "advisory", contentHash: "ch-" + nodeKey, claims: [] } as unknown as CurrentNode
}

function projectionOf(nodes: CurrentNode[]): StoreProjection {
  return { current: new Map(nodes.map((n) => [n.nodeKey, n])), cas: new Set() }
}

const U = "src/payments/charge.ts::chargeSuite"
const V = "src/orders/place.ts::placeSuite"

describe("testVacuitiesOf — the grounded test-vacuity read fold (ADR-0015 D5)", () => {
  const proj = projectionOf([
    tv("t1", U, "swallows on decline"),
    tv("t2", U, "ignores gateway timeout"), // same unit, second independent vacuous test — each its own node
    tv("t3", V, "no-op on empty cart"),
    adv("a1"), // noise — never a test-vacuity fact
  ])

  it("returns the proven test-vacuity facts FOR A UNIT, off the frozen carriers", () => {
    const onU = testVacuitiesOf(proj, U)
    expect(onU.map((f) => f.nodeKey)).toEqual(["t2", "t1"]) // sorted by (testName: "ignores…" < "swallows…")
    expect(onU.find((f) => f.nodeKey === "t1")).toMatchObject({
      unitKey: U,
      testName: "swallows on decline",
      shape: "assertion-only-in-catch",
      seal: "proven",
    })
    // a unit holds MANY independent vacuous tests — no lineage, both stand (single-anchor).
    expect(onU).toHaveLength(2)
  })

  it("returns EMPTY for a unit with none, and for a unit not in the projection at all", () => {
    expect(testVacuitiesOf(projectionOf([tv("t3", V, "no-op on empty cart")]), U)).toEqual([])
    expect(testVacuitiesOf(proj, "src/nowhere.ts::missing")).toEqual([])
  })

  it("returns ALL facts for an empty/absent `unit`", () => {
    // sorted by (unitKey, testName): V=src/orders < U=src/payments, so t3 first, then t2/t1 by testName.
    expect(testVacuitiesOf(proj).map((f) => f.nodeKey)).toEqual(["t3", "t2", "t1"])
    expect(testVacuitiesOf(proj, "")).toEqual(testVacuitiesOf(proj)) // empty string ⇒ no filter
  })

  it("advisory rows are invisible; an empty projection yields [], never a throw", () => {
    expect(testVacuitiesOf(projectionOf([adv("a1"), adv("a2")]))).toEqual([])
    expect(testVacuitiesOf(projectionOf([]))).toEqual([])
  })

  it("SEAL is additive/absent-tolerant — an unsealed row omits it, never a fabricated proven", () => {
    const unsealed = testVacuitiesOf(projectionOf([tv("t9", U, "unsealed", {})]))
    expect(unsealed).toHaveLength(1)
    expect(unsealed[0]).not.toHaveProperty("seal")
  })

  it("TOTAL over a malformed row (identity leg not a string) ⇒ SKIPPED, never a throw", () => {
    const bad = {
      nodeKey: "tbad",
      family: "test-vacuity",
      contentHash: "ch",
      claims: [],
      testName: "x",
      shape: "assertion-only-in-catch",
    } as unknown as CurrentNode // no unitKey
    expect(testVacuitiesOf(projectionOf([bad, tv("t1", U, "ok")]))).toHaveLength(1)
  })

  it("deterministic: byte-identical output for equal input", () => {
    expect(testVacuitiesOf(proj, U)).toEqual(testVacuitiesOf(proj, U))
    expect(testVacuitiesOf(proj)).toEqual(testVacuitiesOf(proj))
  })
})
