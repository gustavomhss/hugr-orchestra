// @atlas/knowledge — test/wp-9.x-adjacency-a.carrier.test.ts  (ADJACENCY-A · WP-9.x)
//
// ADDITIVE carrier: `WriteRequest`/`CurrentNode` gained OPTIONAL `primaryAnchor?`/`slot?`; `upsert` COPIES
// them onto the minted/updated node so a later sibling-adjacency scan (WP-B) reads the anchor+slot off the
// projection WITHOUT re-deriving. This WP adds DATA to the node, never a routing decision — the s05 §6a
// route sequence stays byte-identical (asserted below alongside the carry goldens).
//
// TEETH: a mutant that drops the copy in the CREATE (or UPDATE / SUPERSEDE) arm leaves the field ABSENT →
// the carry golden goes RED. The route-sequence golden is a REGRESSION guard: the carrier must not perturb
// the decision.

import { describe, it, expect } from "vitest"
import { upsert, emptyStore, currentNodes } from "../src/write/router.js"
import type { WriteRequest, StoreProjection } from "../src/write/router.js"

const ANCHOR_A = "pkg::mod::fnA"
const ANCHOR_B = "pkg::mod::fnB"

describe("ADJACENCY-A — upsert carries primaryAnchor + slot onto the current node", () => {
  it("CREATE mints a node carrying the request primaryAnchor + slot", () => {
    const req: WriteRequest = {
      nodeKey: "nk-adv",
      contentHash: "ch-a00",
      family: "advisory",
      claimNorm: "cn-a",
      primaryAnchor: ANCHOR_A,
      slot: "invariant",
    }
    const node = upsert(emptyStore(), req).store.current.get("nk-adv")
    expect(node).toBeDefined()
    // TEETH: dropping the copy in the CREATE arm leaves these undefined → RED.
    expect(node!.primaryAnchor).toBe(ANCHOR_A)
    expect(node!.slot).toBe("invariant")
  })

  it("CREATE with no anchor/slot mints the field ABSENT (forward-compat, no explicit undefined)", () => {
    const req: WriteRequest = { nodeKey: "nk-bare", contentHash: "ch-b00", family: "advisory", claimNorm: "cn-b" }
    const node = upsert(emptyStore(), req).store.current.get("nk-bare")!
    expect("primaryAnchor" in node).toBe(false) // the key is absent, not present-with-undefined
    expect("slot" in node).toBe(false)
  })

  it("UPDATE preserves the prior anchor/slot when the request omits them", () => {
    let s: StoreProjection = emptyStore()
    s = upsert(s, {
      nodeKey: "nk-adv",
      contentHash: "ch-a00",
      family: "advisory",
      claimNorm: "cn-a",
      primaryAnchor: ANCHOR_A,
      slot: "invariant",
    }).store
    // an advisory re-write at the same nodeKey, DIFFERENT bytes, req OMITS anchor/slot → UPDATE.
    const r = upsert(s, { nodeKey: "nk-adv", contentHash: "ch-a11", family: "advisory", claimNorm: "cn-a2" })
    expect(r.decision).toBe("UPDATE")
    const node = r.store.current.get("nk-adv")!
    // TEETH: an UPDATE arm that forgets `?? prior` drops these to undefined → RED.
    expect(node.primaryAnchor).toBe(ANCHOR_A)
    expect(node.slot).toBe("invariant")
    expect(new Set(node.claims)).toEqual(new Set(["cn-a", "cn-a2"])) // set-union unchanged
  })

  it("UPDATE lets the request anchor/slot WIN when supplied", () => {
    let s: StoreProjection = emptyStore()
    s = upsert(s, {
      nodeKey: "nk-adv",
      contentHash: "ch-a00",
      family: "advisory",
      claimNorm: "cn-a",
      primaryAnchor: ANCHOR_A,
      slot: "invariant",
    }).store
    const r = upsert(s, {
      nodeKey: "nk-adv",
      contentHash: "ch-a11",
      family: "advisory",
      claimNorm: "cn-a2",
      primaryAnchor: ANCHOR_B,
      slot: "gotcha",
    })
    expect(r.decision).toBe("UPDATE")
    const node = r.store.current.get("nk-adv")!
    expect(node.primaryAnchor).toBe(ANCHOR_B)
    expect(node.slot).toBe("gotcha")
  })

  it("SUPERSEDE carries the anchor/slot (req wins, else preserves prior) onto the new predicate node", () => {
    let s: StoreProjection = emptyStore()
    s = upsert(s, {
      nodeKey: "nk-prd",
      contentHash: "ch-p00",
      family: "predicate",
      claimNorm: "cn-p",
      primaryAnchor: ANCHOR_A,
      slot: "contract",
    }).store
    // same predicate nodeKey, new bytes, req OMITS anchor/slot → SUPERSEDE, preserves prior.
    const r = upsert(s, { nodeKey: "nk-prd", contentHash: "ch-p11", family: "predicate", claimNorm: "cn-p2" })
    expect(r.decision).toBe("SUPERSEDE")
    const node = r.store.current.get("nk-prd")!
    expect(node.supersededBy).toBe("ch-p00") // lineage unchanged
    // TEETH: a SUPERSEDE arm that omits the carry drops these to undefined → RED.
    expect(node.primaryAnchor).toBe(ANCHOR_A)
    expect(node.slot).toBe("contract")
  })

  it("DEDUP mints no node — the carrier adds no node where the route does not (byte-identical short-circuit)", () => {
    let s: StoreProjection = emptyStore()
    s = upsert(s, {
      nodeKey: "nk-adv",
      contentHash: "ch-a00",
      family: "advisory",
      claimNorm: "cn-a",
      primaryAnchor: ANCHOR_A,
      slot: "invariant",
    }).store
    const before = currentNodes(s).length
    const r = upsert(s, {
      nodeKey: "nk-adv",
      contentHash: "ch-a00",
      family: "advisory",
      claimNorm: "cn-a",
      primaryAnchor: ANCHOR_B, // even a DIFFERENT anchor cannot mint on a byte-identical dedup
      slot: "gotcha",
    })
    expect(r.decision).toBe("DEDUP")
    expect(currentNodes(r.store).length).toBe(before)
  })

  it("REGRESSION — carrying anchor/slot leaves the s05 §6a route sequence byte-identical", () => {
    // mirror the s05 stream [W1..W5] but with the carrier populated: the DECISIONS must not move.
    let s: StoreProjection = emptyStore()
    s = upsert(s, {
      nodeKey: "nk-adv",
      contentHash: "ch-a00",
      family: "advisory",
      claimNorm: "cn-eqbytes",
      primaryAnchor: ANCHOR_A,
      slot: "invariant",
    }).store
    s = upsert(s, {
      nodeKey: "nk-prd",
      contentHash: "ch-p00",
      family: "predicate",
      claimNorm: "cn-head",
      primaryAnchor: ANCHOR_A,
      slot: "contract",
    }).store
    const stream: WriteRequest[] = [
      {
        nodeKey: "nk-adv",
        contentHash: "ch-a00",
        family: "advisory",
        claimNorm: "cn-eqbytes",
        primaryAnchor: ANCHOR_A,
        slot: "invariant",
      },
      {
        nodeKey: "nk-new",
        contentHash: "ch-b11",
        family: "advisory",
        claimNorm: "cn-fresh",
        primaryAnchor: ANCHOR_B,
        slot: "rationale",
      },
      {
        nodeKey: "nk-adv",
        contentHash: "ch-c22",
        family: "advisory",
        claimNorm: "cn-latency",
        primaryAnchor: ANCHOR_A,
        slot: "invariant",
      },
      {
        nodeKey: "nk-prd",
        contentHash: "ch-d33",
        family: "predicate",
        claimNorm: "cn-head2",
        primaryAnchor: ANCHOR_A,
        slot: "contract",
      },
      {
        nodeKey: "nk-prd2",
        contentHash: "ch-e44",
        family: "predicate",
        claimNorm: "cn-tail",
        primaryAnchor: ANCHOR_B,
        slot: "definition",
      },
    ]
    const routes: string[] = []
    for (const w of stream) {
      const r = upsert(s, w)
      routes.push(r.decision)
      s = r.store
    }
    expect(routes).toEqual(["DEDUP", "CREATE", "UPDATE", "SUPERSEDE", "CREATE"])
  })
})
