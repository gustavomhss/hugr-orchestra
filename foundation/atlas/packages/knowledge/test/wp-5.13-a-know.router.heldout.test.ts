// @atlas/knowledge — test/wp-5.13-a-know.router.heldout.test.ts  (COLD-REVIEW held-out gate)
//
// HELD-OUT STATUS: REQ-KNOW-4 (SCN-KNOW-4a..4g) is an EXHAUSTIVE SCN. goldens-knw.md:1055
// declares its held-out leg MOOT — "there is nothing to hold out of a complete enumeration".
// So NO frozen `SCN-KNOW-4x-2` fixtures exist. This file is therefore NOT a transcription of a
// hidden golden; it is an INDEPENDENT overfit probe authored by the reviewer against the EXISTING
// src, using entirely FRESH concrete data (different nodeKeys / contentHashes / claimNorms / order
// than the visible -1 fixtures). The route function is a total enumeration so it cannot be overfit;
// the risk surface is the `upsert` reducer + `StoreProjection` over opaque string VALUES — this
// probe confirms the reducer generalises past the specific fixture strings.

import { describe, it, expect } from "vitest"
import { routeWrite, upsert, emptyStore, currentNodes } from "../src/write/router.js"
import type { RouteInputs, WriteRequest, NodeFamily } from "../src/write/router.js"

// Fresh S0': advisory @ K-alpha (bytes H-a0, claim c-init) + predicate @ K-beta (check folded, bytes H-b0)
function seed(): ReturnType<typeof emptyStore> {
  let s = emptyStore()
  s = upsert(s, { nodeKey: "K-alpha", contentHash: "H-a0", family: "advisory", claimNorm: "c-init" }).store
  s = upsert(s, { nodeKey: "K-beta", contentHash: "H-b0", family: "predicate", claimNorm: "c-verd0" }).store
  return s
}

describe("held-out (overfit probe) — upsert reducer over FRESH data", () => {
  it("DEDUP: a byte-identical advisory re-emit mints nothing (fresh strings)", () => {
    const s0 = seed()
    const r = upsert(s0, { nodeKey: "K-alpha", contentHash: "H-a0", family: "advisory", claimNorm: "c-init" })
    expect(r.decision).toBe("DEDUP")
    expect(currentNodes(r.store).length).toBe(currentNodes(s0).length)
    expect(r.store.cas.size).toBe(s0.cas.size)
  })

  it("CREATE: a brand-new advisory subject with never-seen bytes", () => {
    const r = upsert(seed(), { nodeKey: "K-gamma", contentHash: "H-g9", family: "advisory", claimNorm: "c-new" })
    expect(r.decision).toBe("CREATE")
    const n = currentNodes(r.store).find((x) => x.nodeKey === "K-gamma")
    expect(n!.claims).toEqual(["c-new"])
    expect(n!.supersededBy).toBeUndefined()
  })

  it("UPDATE: three distinct claims accrete by set-union, prior never dropped, dup idempotent", () => {
    let s = seed()
    s = upsert(s, { nodeKey: "K-alpha", contentHash: "H-a1", family: "advisory", claimNorm: "c-two" }).store
    const r = upsert(s, { nodeKey: "K-alpha", contentHash: "H-a2", family: "advisory", claimNorm: "c-three" })
    expect(r.decision).toBe("UPDATE")
    const n = currentNodes(r.store).find((x) => x.nodeKey === "K-alpha")!
    expect(new Set(n.claims)).toEqual(new Set(["c-init", "c-two", "c-three"]))
    expect(n.supersededBy).toBeUndefined()
    expect(currentNodes(r.store).filter((x) => x.nodeKey === "K-alpha")).toHaveLength(1)
    // idempotent set-union: re-adding an existing claim adds no element
    const dup = upsert(r.store, { nodeKey: "K-alpha", contentHash: "H-a3", family: "advisory", claimNorm: "c-two" })
    expect(dup.decision).toBe("UPDATE")
    expect(dup.store.current.get("K-alpha")!.claims).toHaveLength(3)
  })

  it("SUPERSEDE chain: two predicate re-evidences, every prior byte stays addressable", () => {
    let s = seed()
    const r1 = upsert(s, { nodeKey: "K-beta", contentHash: "H-b1", family: "predicate", claimNorm: "c-verd1" })
    expect(r1.decision).toBe("SUPERSEDE")
    expect(r1.store.current.get("K-beta")!.supersededBy).toBe("H-b0")
    const r2 = upsert(r1.store, { nodeKey: "K-beta", contentHash: "H-b2", family: "predicate", claimNorm: "c-verd2" })
    expect(r2.decision).toBe("SUPERSEDE")
    const cur = r2.store.current.get("K-beta")!
    expect(cur.contentHash).toBe("H-b2")
    expect(cur.supersededBy).toBe("H-b1")
    for (const h of ["H-b0", "H-b1", "H-b2"]) expect(r2.store.cas.has(h)).toBe(true)
    expect(currentNodes(r2.store).filter((x) => x.nodeKey === "K-beta")).toHaveLength(1)
  })

  it("CREATE (different check): a sibling predicate nodeKey coexists, original never retired", () => {
    let s = seed()
    s = upsert(s, { nodeKey: "K-beta", contentHash: "H-b1", family: "predicate", claimNorm: "c-verd1" }).store // supersede first
    const r = upsert(s, { nodeKey: "K-beta-tail", contentHash: "H-t0", family: "predicate", claimNorm: "c-tail" })
    expect(r.decision).toBe("CREATE")
    const keys = new Set(currentNodes(r.store).map((n) => n.nodeKey))
    expect(keys.has("K-beta")).toBe(true)
    expect(keys.has("K-beta-tail")).toBe(true)
  })

  it("one-current-node-per-key holds across a mixed fresh stream", () => {
    let s = seed()
    const stream: WriteRequest[] = [
      { nodeKey: "K-alpha", contentHash: "H-a1", family: "advisory", claimNorm: "c-two" }, // UPDATE
      { nodeKey: "K-beta", contentHash: "H-b1", family: "predicate", claimNorm: "c-verd1" }, // SUPERSEDE
      { nodeKey: "K-delta", contentHash: "H-d0", family: "predicate", claimNorm: "c-d" }, // CREATE
      { nodeKey: "K-alpha", contentHash: "H-a0", family: "advisory", claimNorm: "c-init" }, // DEDUP
    ]
    const routes: string[] = []
    for (const w of stream) {
      const r = upsert(s, w)
      routes.push(r.decision)
      s = r.store
    }
    expect(routes).toEqual(["UPDATE", "SUPERSEDE", "CREATE", "DEDUP"])
    const keys = currentNodes(s).map((n) => n.nodeKey)
    expect(new Set(keys).size).toBe(keys.length) // uniqueness
  })

  it("routeWrite: full 16-cell product is total, never REJECT, and re-derives the KNOW-4 table independently", () => {
    const bools = [false, true] as const
    const families: readonly NodeFamily[] = ["advisory", "predicate"]
    const valid = new Set(["DEDUP", "CREATE", "UPDATE", "SUPERSEDE"])
    for (const contentHashHit of bools)
      for (const nodeKeyHit of bools)
        for (const family of families)
          for (const checkSame of bools) {
            const i: RouteInputs = { contentHashHit, nodeKeyHit, family, checkSame }
            const d = routeWrite(i)
            expect(valid.has(d)).toBe(true) // total, never REJECT in the upsert route
            expect(d).not.toBe("REJECT")
            // independent expected-cell derivation (precedence: DEDUP > miss-CREATE > advisory UPDATE > predicate same-check SUPERSEDE)
            const expected = contentHashHit
              ? "DEDUP"
              : !nodeKeyHit
                ? "CREATE"
                : family === "advisory"
                  ? "UPDATE"
                  : checkSame
                    ? "SUPERSEDE"
                    : "CREATE"
            expect(d).toBe(expected)
          }
  })
})
