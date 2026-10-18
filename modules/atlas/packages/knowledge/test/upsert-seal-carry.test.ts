// @atlas/knowledge — test/upsert-seal-carry.test.ts  (SEAL-CARRY-WRITE-DOOR — the durable seal projection)
//
// ADR-0017's `seal` (`proven`) is set by the admit path (genesis) and rides the whole GroundedFact into
// CAS — BUT the PROJECTION ROW (`CurrentNode`) is the durable surface `atlas mine`/read paths fold over,
// and it was DROPPING `seal` on the write. Measured: across every `atlas mine` run, 0 stored facts carry
// `seal`. This file pins the CREATE + UPDATE projection carriers, mirroring the `slot`/`answerRef` carriers
// EXACTLY. `seal` is PROVENANCE ONLY — never an identity/authority leg (nodeKey non-membership is pinned by
// wp-196a-seal.test.ts SCN-196a-2), so these cases assert the VALUE round-trips through the real reducer,
// not any gate.
//
// [RED before this WP] With no `seal` carrier in `upsert` (CREATE/UPDATE) the stored `CurrentNode` never
// carries a `seal`, so every `.toBe('proven')` below reads `undefined` → RED.

import { describe, it, expect } from "vitest"
import { emptyStore, upsert } from "../src/write/upsert.js"
import type { WriteRequest } from "../src/write/router.js"

const create = (seal?: "proven"): WriteRequest => ({
  nodeKey: "nk-adv",
  contentHash: "ch-v0",
  family: "advisory",
  claimNorm: "cn-v0",
  ...(seal !== undefined ? { seal } : {}),
})
const update = (seal?: "proven"): WriteRequest => ({
  nodeKey: "nk-adv", // SAME key ⇒ routes UPDATE (a re-mine of the same anchor·slot)
  contentHash: "ch-v1", // new bytes ⇒ not a DEDUP no-op
  family: "advisory",
  claimNorm: "cn-v1",
  ...(seal !== undefined ? { seal } : {}),
})

describe("upsert CREATE — SEAL-CARRY: the admit-path seal lands on the durable projection row", () => {
  it("AC-1 — a WriteRequest carrying `seal:proven` ⇒ the stored CurrentNode carries `seal:proven`", () => {
    const s = upsert(emptyStore(), create("proven")).store
    // ⚑ RED without the CREATE seal carrier: the row has no `seal` ⇒ undefined.
    expect(s.current.get("nk-adv")!.seal).toBe("proven")
  })

  it("AC-1 — a WriteRequest with NO seal ⇒ the stored CurrentNode has NO seal (absent, not undefined-property)", () => {
    const s = upsert(emptyStore(), create(undefined)).store
    const row = s.current.get("nk-adv")!
    expect(row.seal).toBeUndefined() // absent-tolerant: no fabricated default
    expect(Object.prototype.hasOwnProperty.call(row, "seal")).toBe(false) // truly ABSENT (conditional spread)
  })
})

describe("upsert UPDATE — SEAL-CARRY: the seal comes from THIS write only, NEVER carried forward (SEAL-PROMOTE-CARRY)", () => {
  it("AC-4 — re-writing a node that had `seal:proven` DROPS the seal when the re-mine omits it (no carry-forward)", () => {
    // SEAL-PROMOTE-CARRY (billy T0): a `proven` seal is trust in the WRITE that carried it, not in the
    // (anchor, slot) place. An authored operator UPDATE has its own seal stripped at the door ⇒ `req.seal`
    // absent ⇒ the node must NOT inherit the prior `proven` seal (that would be a forgery by omission).
    let s = upsert(emptyStore(), create("proven")).store
    expect(s.current.get("nk-adv")!.seal).toBe("proven")
    s = upsert(s, update(undefined)).store // a re-write with no seal ⇒ prior's seal is DROPPED, not carried
    // ⚑ RED if UPDATE carried `...prior`'s seal forward: this would read 'proven'.
    const row = s.current.get("nk-adv")!
    expect(row.seal).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(row, "seal")).toBe(false) // truly ABSENT, not undefined-property
    expect(row.contentHash).toBe("ch-v1") // control: the UPDATE really happened
  })

  it("AC-5 — a re-mine carrying a fresh seal RE-STATES it on UPDATE (present wins, like slot)", () => {
    let s = upsert(emptyStore(), create(undefined)).store
    expect(s.current.get("nk-adv")!.seal).toBeUndefined()
    s = upsert(s, update("proven")).store // absent → present is not blocked
    expect(s.current.get("nk-adv")!.seal).toBe("proven")
  })
})

// A predicate CREATE then a same-nodeKey re-evidence (new bytes, checkSame ⇒ SUPERSEDE — router.ts:139).
const predCreate = (seal?: "proven"): WriteRequest => ({
  nodeKey: "nk-pred",
  contentHash: "pch-v0",
  family: "predicate",
  claimNorm: "pcn-v0",
  ...(seal !== undefined ? { seal } : {}),
})
const predSupersede = (seal?: "proven"): WriteRequest => ({
  nodeKey: "nk-pred",
  contentHash: "pch-v1",
  family: "predicate",
  claimNorm: "pcn-v1", // new bytes ⇒ not DEDUP
  ...(seal !== undefined ? { seal } : {}),
})

describe("upsert SUPERSEDE — SEAL-CARRY: a new version takes its seal from THIS write only, never from prior", () => {
  it("AC-4 — superseding a `seal:proven` predicate node DROPS the seal when the new version omits it (no carry-forward)", () => {
    let s = upsert(emptyStore(), predCreate("proven")).store
    expect(s.current.get("nk-pred")!.seal).toBe("proven")
    const r = upsert(s, predSupersede(undefined))
    expect(r.decision).toBe("SUPERSEDE") // control: routed SUPERSEDE, not UPDATE
    s = r.store
    const row = s.current.get("nk-pred")!
    // ⚑ RED if SUPERSEDE carried `...prior`'s seal forward: this would read 'proven'.
    expect(row.seal).toBeUndefined()
    expect(Object.prototype.hasOwnProperty.call(row, "seal")).toBe(false)
    expect(row.supersededBy).toBe("pch-v0") // control: the SUPERSEDE really happened (lineage pointer)
  })

  it("AC-4 — a SUPERSEDE carrying its OWN `seal:proven` re-stamps it (a promote re-version keeps proven)", () => {
    let s = upsert(emptyStore(), predCreate(undefined)).store
    s = upsert(s, predSupersede("proven")).store
    expect(s.current.get("nk-pred")!.seal).toBe("proven")
  })
})
