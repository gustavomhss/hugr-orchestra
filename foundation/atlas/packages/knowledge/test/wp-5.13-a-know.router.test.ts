// @atlas/knowledge — test/wp-5.13-a-know.router.test.ts  (WP-5.13-a.KNOW · EPIC-13-a)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the write-decision routing rules
// ("every write is an upsert"):
//   SCN-KNOW-4a-1 (every write routes to exactly one upsert cell, never an append),
//   4b-1 (identical fact idempotent — DEDUP), 4c-1 (advisory claims set-union — UPDATE),
//   4d-1 (changed advisory edited in place, not superseded), 4e-1 (changed predicate,
//   same check, new evidence — SUPERSEDE + lineage pointer), 4f-1 (different check is a
//   new node — CREATE), 4g-1 (a territory query returns one current node per key).
// Plus the exhaustive-enumeration teeth of INV-KNOW-4: the routing over the finite hash-state
// product is TOTAL · DETERMINISTIC · MUTUALLY-EXCLUSIVE (no LLM / clock / seq in the route).
//
// MODELING NOTE (disciplined judgment, flagged — cf. index/src/fold.ts precedent): the frozen
// `RouterApi.writeDecision(candidate, store)` FRONT DOOR consumes a `Candidate` + a store lookup,
// but the identity hashes (nodeKey VALUE = WP-5.13-b's excluded facet) and the CAS/store lookup
// (the OWNER-DEFINE composed store — StoreApi in types.ts: "NO concrete signature frozen") are UPSTREAM.
// Per the interface_contract (method-tags-knw INV-KNOW-4 down-model + INV-KNOW-5 note) this facet
// is the routing OVER the RESOLVED inputs; the goldens' `store S0` is therefore modeled by the
// session-internal store projection this WP reduces over — opaque nodeKey/contentHash ids supplied
// as VALUES (no hashing here — the sealed @atlas/kernel identity seam is not entered). SYMBOLIC
// golden ids ⇒ RELATIONAL assertions.

import { describe, it, expect } from "vitest"
import { routeWrite, upsert, emptyStore, currentNodes } from "../src/write/router.js"
import type { RouteInputs, WriteRequest, StoreProjection, NodeFamily } from "../src/write/router.js"

// ---- S0 fixture: ADV (advisory @ nk-adv, bytes ch-a00, claim {cn-eqbytes}) + PRD (predicate @
//      nk-prd, check chk-head folded into the nodeKey, bytes ch-p00) ----
function seedS0(): StoreProjection {
  let s = emptyStore()
  s = upsert(s, { nodeKey: "nk-adv", contentHash: "ch-a00", family: "advisory", claimNorm: "cn-eqbytes" }).store
  s = upsert(s, { nodeKey: "nk-prd", contentHash: "ch-p00", family: "predicate", claimNorm: "cn-head" }).store
  return s
}

// The candidate stream [W1..W5] of SCN-KNOW-4a-1 against store S0.
const W1: WriteRequest = { nodeKey: "nk-adv", contentHash: "ch-a00", family: "advisory", claimNorm: "cn-eqbytes" } // byte-identical
const W2: WriteRequest = { nodeKey: "nk-new", contentHash: "ch-b11", family: "advisory", claimNorm: "cn-fresh" } // new subject
const W3: WriteRequest = { nodeKey: "nk-adv", contentHash: "ch-c22", family: "advisory", claimNorm: "cn-latency" } // advisory hit
const W4: WriteRequest = { nodeKey: "nk-prd", contentHash: "ch-d33", family: "predicate", claimNorm: "cn-head2" } // same check, re-evidence
const W5: WriteRequest = { nodeKey: "nk-prd2", contentHash: "ch-e44", family: "predicate", claimNorm: "cn-tail" } // different check ⇒ different nodeKey

describe("WP-5.13-a.KNOW — write-decision routing (KNOW-4 visible goldens)", () => {
  it("SCN-KNOW-4a-1: every write routes to exactly one upsert cell — never an append", () => {
    let s = seedS0()
    const routes: string[] = []
    for (const w of [W1, W2, W3, W4, W5]) {
      const r = upsert(s, w)
      routes.push(r.decision)
      s = r.store
    }
    expect(routes).toEqual(["DEDUP", "CREATE", "UPDATE", "SUPERSEDE", "CREATE"])
    // teeth: no write appends a second node under an existing nodeKey — nk-adv still ONE node
    expect(currentNodes(s).filter((n) => n.nodeKey === "nk-adv")).toHaveLength(1)
  })

  it("SCN-KNOW-4b-1: an identical fact is idempotent (DEDUP) — mints no node, no CAS object", () => {
    const s0 = seedS0()
    const r = upsert(s0, W1)
    expect(r.decision).toBe("DEDUP")
    // no-op: no node minted, no second CAS object for one fact
    expect(currentNodes(r.store).length).toBe(currentNodes(s0).length)
    expect(r.store.cas.size).toBe(s0.cas.size)
  })

  it("SCN-KNOW-4c-1: an advisory subject’s claims set-union (UPDATE)", () => {
    const r = upsert(seedS0(), W3)
    expect(r.decision).toBe("UPDATE")
    const adv = currentNodes(r.store).find((n) => n.nodeKey === "nk-adv")
    expect(adv).toBeDefined()
    expect(new Set(adv!.claims)).toEqual(new Set(["cn-eqbytes", "cn-latency"])) // set-union in place
    // teeth: not last-writer-wins — the prior claim is NOT dropped
    expect(adv!.claims).toContain("cn-eqbytes")
  })

  it("SCN-KNOW-4d-1: a changed advisory fact is edited in place, not superseded", () => {
    const r = upsert(seedS0(), W3)
    const advNodes = currentNodes(r.store).filter((n) => n.nodeKey === "nk-adv")
    expect(advNodes).toHaveLength(1) // no new node
    expect(advNodes[0]!.supersededBy).toBeUndefined() // advisory keeps NO lineage pointer (git holds prior)
    // teeth: a changed advisory is NOT routed to SUPERSEDE
    expect(r.decision).toBe("UPDATE")
  })

  it("SCN-KNOW-4e-1: a changed predicate (same check, new evidence) supersedes", () => {
    const r = upsert(seedS0(), W4)
    expect(r.decision).toBe("SUPERSEDE")
    const prd = currentNodes(r.store).find((n) => n.nodeKey === "nk-prd")
    expect(prd!.contentHash).toBe("ch-d33") // a new node is minted
    expect(prd!.supersededBy).toBe("ch-p00") // with a supersededBy pointer to the prior bytes
    // teeth: prior predicate bytes stay addressable in CAS (not lost)
    expect(r.store.cas.has("ch-p00")).toBe(true)
    expect(r.store.cas.has("ch-d33")).toBe(true)
  })

  it("SCN-KNOW-4f-1: a different check is a new node (CREATE), sibling never retired", () => {
    let s = upsert(seedS0(), W4).store // supersede @ nk-prd first (chk-head sibling now current)
    const r = upsert(s, W5)
    expect(r.decision).toBe("CREATE")
    const keys = new Set(currentNodes(r.store).map((n) => n.nodeKey))
    expect(keys.has("nk-prd2")).toBe(true) // the new check coexists as its own node
    // teeth: the sibling chk-head node (nk-prd) is NEVER retired by the new check
    expect(keys.has("nk-prd")).toBe(true)
  })

  it("SCN-KNOW-4g-1: a territory query returns exactly one current node per key (0 duplicates)", () => {
    let s = seedS0()
    for (const w of [W3, W4, W5]) s = upsert(s, w).store
    const nodes = currentNodes(s)
    const keys = nodes.map((n) => n.nodeKey)
    expect(new Set(keys).size).toBe(keys.length) // one current node per key, no duplicates
    for (const k of ["nk-adv", "nk-prd", "nk-prd2"]) {
      expect(nodes.filter((n) => n.nodeKey === k)).toHaveLength(1)
    }
    // teeth: a superseded key does NOT dump history — nk-prd yields 1 (the superseder), not 2
    expect(nodes.filter((n) => n.nodeKey === "nk-prd")).toHaveLength(1)
  })
})

describe("WP-5.13-a.KNOW — routeWrite exhaustive product (INV-KNOW-4: total · deterministic · mutually-exclusive)", () => {
  const bools = [false, true] as const
  const families: readonly NodeFamily[] = ["advisory", "predicate"]

  it("every cell of the finite hash-state product routes to exactly one decision (no LLM/clock/seq)", () => {
    const valid = new Set(["DEDUP", "CREATE", "UPDATE", "SUPERSEDE"]) // never REJECT (admission is KNOW-2, not the route)
    for (const contentHashHit of bools)
      for (const nodeKeyHit of bools)
        for (const family of families)
          for (const checkSame of bools) {
            const inputs: RouteInputs = { contentHashHit, nodeKeyHit, family, checkSame }
            const d = routeWrite(inputs)
            expect(valid.has(d)).toBe(true) // totality — lands in exactly one cell
            expect(routeWrite(inputs)).toBe(d) // determinism — pure, repeatable over identical inputs
          }
  })

  it("the decision-table cells match KNOW-4 (dedup precedence · advisory UPDATE · predicate SUPERSEDE)", () => {
    expect(routeWrite({ contentHashHit: true, nodeKeyHit: true, family: "advisory", checkSame: true })).toBe("DEDUP")
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: false, family: "advisory", checkSame: false })).toBe(
      "CREATE",
    )
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: true, family: "advisory", checkSame: false })).toBe("UPDATE")
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: true, family: "predicate", checkSame: true })).toBe(
      "SUPERSEDE",
    )
    // a different check ⇒ a different nodeKey ⇒ a miss ⇒ CREATE (the sibling-retire bug is impossible)
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: false, family: "predicate", checkSame: false })).toBe(
      "CREATE",
    )
    // the drift leg (subtreeHash) is absent by construction — it never enters this decision
  })
})
