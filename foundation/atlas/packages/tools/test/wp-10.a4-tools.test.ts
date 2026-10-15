// @atlas/tools — test/wp-10.a4-tools.test.ts   (WP-10.A4.TOOLS — CAMPAIGN-10, AUTHOR-14)
//
// Pins the `EmitOut` receipt widening (AUTHOR-14, docs/reference/atlas-authoring.md#author-14): the value
// the governed emit door returns on success MUST carry the identity the per-node read door (`atlas node`,
// `NodeApi.node(nodeAddr: NodeKey)`) and the link door (`atlas-link`) consume, ADDITIVELY alongside the
// existing CAS `id`. Type-level only — WP-10.A4.TOOLS ships the WIDENED type, not the population (that is
// WP-10.A4.ADAPTER); the checks below are compile-time (a mistyped/missing field fails `tsc -b`) plus a
// runtime shape assertion over literal receipts, exactly as the goldens describe them.
//
// Goldens (docs/requirements/goldens-authoring.md): SCN-AUTH-14a-1 / 14b-1 / 14c-1.

import { describe, it, expect, expectTypeOf } from "vitest"
import type { Hash, NodeKey } from "@atlas/contracts"
import type { EmitOut, NodeApi } from "../src/types.js"

describe("WP-10.A4.TOOLS — EmitOut carries the read-door identity (AUTHOR-14)", () => {
  // SCN-AUTH-14a-1 — the receipt carries the read identity.
  it("SCN-AUTH-14a-1 — a successful receipt carries a `nodeKey` typed EXACTLY as NodeApi.node consumes", () => {
    // `nodeKey`'s type must be the SAME `NodeKey` the per-node read door (`NodeApi.node`) takes — imported,
    // never redefined. This is the compile-time half of the golden: if either type drifts, `tsc -b` breaks.
    expectTypeOf<EmitOut["nodeKey"]>().toEqualTypeOf<NodeKey | undefined>()
    expectTypeOf<Parameters<NodeApi["node"]>[0]>().toEqualTypeOf<NodeKey>()

    const receipt: EmitOut = { emitted: true, id: "h1" as Hash, nodeKey: "k1" as NodeKey }
    expect(receipt.nodeKey).toBe("k1")
  })

  // SCN-AUTH-14c-1 — the receipt serves BOTH consumers (the per-node read door AND the drift/doctor CAS
  // read-back). teeth: a receipt that carries `nodeKey` but DROPS the CAS `id` fails the read-back arm.
  it("SCN-AUTH-14c-1 — nodeKey is ADDITIVE: the existing CAS `id` field survives, same name, same type", () => {
    const receipt: EmitOut = { emitted: true, id: "h1" as Hash, nodeKey: "k1" as NodeKey }
    expect(receipt.id).toBe("h1") // CAS read-back arm — untouched by the widening
    expect(receipt.nodeKey).toBe("k1") // read-door arm

    // teeth: a receipt missing the CAS `id` (nodeKey-only) is NOT what AUTHOR-14 asks for — both consumers
    // must be served, so `id` staying present+typed is asserted independently of `nodeKey`'s presence.
    const idOnly: EmitOut = { emitted: true, id: "h2" as Hash }
    expect(idOnly.id).toBe("h2")
    expect(idOnly.nodeKey).toBeUndefined()
  })

  // Byte-unchanged existing shape: the pre-widening receipt literal (`{ emitted, id }`, no `nodeKey`) still
  // typechecks and round-trips its CAS id untouched — the exit_predicate every emit golden pins.
  it("pre-widening receipt shape ({ emitted, id }) is still valid EmitOut, byte-unchanged", () => {
    const legacy: EmitOut = { emitted: true, id: "deadbeef" as Hash }
    expect(legacy).toEqual({ emitted: true, id: "deadbeef" })
  })

  // A rejected emit still carries neither `id` nor `nodeKey` (both absent-on-reject under
  // `exactOptionalPropertyTypes`), plus a structured `rejected` reason — unchanged fail-closed shape.
  it("a rejected emit carries neither id nor nodeKey", () => {
    const rejected: EmitOut = { emitted: false, rejected: "drift" }
    expect(rejected.id).toBeUndefined()
    expect(rejected.nodeKey).toBeUndefined()
  })
})
