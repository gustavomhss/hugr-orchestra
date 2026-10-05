// @atlas/adapter-io — test/projection-query-index.test.ts   (WIRE-LOOP Seam-1: emit→query readback)
//
// The projection-query decorator folds emitted facts (read back from CAS) into the covering pack, closing
// GAP-C (`index-adapter.ts:76` hardcoded `invariants:[]` — an emitted fact was invisible to `atlas query`).
// Each tooth NAMES the mutant it kills. The structural leg is a STUB here (territory resolution stays in
// @atlas/index; this facet only proves the readback fold), and the store is a REAL disk store populated via
// the REAL knowledge `upsert` + `put` — never a hand-forged projection.

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Hash } from "@atlas/contracts"
import type { QueryIndex } from "@atlas/tools"
import { upsert, emptyStore } from "@atlas/knowledge"
import type { StoreProjection, WriteRequest } from "@atlas/knowledge"
import { createDiskStore } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
import { createProjectionQueryIndex, underScope } from "../src/projection-query-index.js"

let tmp: string | undefined
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  tmp = undefined
})

/** A fresh temp disk store (CAS root under a temp dir; projection sidecar lands beside it). */
function freshStore(): DiskStore {
  tmp = mkdtempSync(join(tmpdir(), "atlas-pqi-"))
  return createDiskStore(join(tmp, "cas"))
}

/** The structural leg STUB — a fixed covering territory skeleton; it NEVER supplies invariants (that is
 *  precisely what the decorator must fold in). Distinct territory/axisHash so a passthrough is provable. */
const structuralStub: QueryIndex = {
  cover: () => ({ territory: "the-territory", axisHash: "axhash" as unknown as Hash, invariants: [], stale: false }),
}

/** Emit one fact `F` durably: put the WHOLE fact into CAS (so `store.get(contentHash)` reads back tier +
 *  freshness — "the CAS bytes ARE the fact"), then route it into the projection via the REAL `upsert`. */
function emit(
  store: DiskStore,
  proj: StoreProjection,
  fact: { kind: "advisory"; tier: string; freshness: string; body: string },
  req: Omit<WriteRequest, "contentHash">,
): StoreProjection {
  const contentHash = store.put(fact) as string
  return upsert(proj, { ...req, contentHash }).store
}

describe("createProjectionQueryIndex — Seam-1 emit→query projection readback", () => {
  it("a fact emitted UNDER scope appears as a PackInvariant with the fact tier (kills invariants:[] mutant)", () => {
    const store = freshStore()
    let proj = emptyStore()
    proj = emit(
      store,
      proj,
      { kind: "advisory", tier: "T0", freshness: "FRESH", body: "m" },
      {
        nodeKey: "k:covered",
        family: "advisory",
        claimNorm: "io path is covered",
        primaryAnchor: "src::mod",
        slot: "invariant",
      },
    )
    store.persistProjection(proj)

    const pqi = createProjectionQueryIndex(structuralStub, store)
    const cover = pqi.cover("src")

    // TEETH: the original bug returned `invariants: []` for every scope — an emitted fact was invisible.
    expect(cover.invariants).toHaveLength(1)
    expect(cover.invariants[0]!.nodeId).toBe("k:covered")
    // TEETH: `tier` must come from the FULL fact read back from CAS (CurrentNode carries no tier) — a mutant
    // hardcoding 'T2' or reading a projection field flips here.
    expect(cover.invariants[0]!.tier).toBe("T0")
    expect(cover.invariants[0]!.claim).toBe("io path is covered")
    // the structural skeleton (territory/axisHash) is delegated UNCHANGED (SCN-5b purity preserved).
    expect(cover.territory).toBe("the-territory")
  })

  it("an OUT-OF-scope fact is excluded — segment-wise, not raw startsWith (kills the startsWith mutant)", () => {
    const store = freshStore()
    let proj = emptyStore()
    proj = emit(
      store,
      proj,
      { kind: "advisory", tier: "T1", freshness: "FRESH", body: "in" },
      {
        nodeKey: "k:in",
        family: "advisory",
        claimNorm: "inside",
        primaryAnchor: "src::a",
        slot: "invariant",
      },
    )
    proj = emit(
      store,
      proj,
      { kind: "advisory", tier: "T1", freshness: "FRESH", body: "out" },
      {
        nodeKey: "k:out",
        family: "advisory",
        claimNorm: "outside",
        primaryAnchor: "other::b",
        slot: "invariant",
      },
    )
    store.persistProjection(proj)

    const pqi = createProjectionQueryIndex(structuralStub, store)
    // only the under-`src` node appears; `other::b` is excluded.
    expect(pqi.cover("src").invariants.map((i) => i.nodeId)).toEqual(["k:in"])
    // TEETH (segment-wise): scope 'sr' must NOT cover anchor 'src::a' — a raw `startsWith('src')` mutant
    // would wrongly include it. Segment-wise ['sr'] is not a prefix of ['src'].
    expect(pqi.cover("sr").invariants).toHaveLength(0)
    // an anchorless node never leaks in either (belt-and-braces on the skip).
    expect(underScope("src::a", "src")).toBe(true)
    expect(underScope("src::a", "sr")).toBe(false)
    expect(underScope("src/foo::bar", "src")).toBe(true)
    expect(underScope("src/foo::bar", "src/foo")).toBe(true)
  })

  it("invariants are SORTED by nodeId ascending (kills the insertion-order mutant)", () => {
    const store = freshStore()
    let proj = emptyStore()
    // emit in DESCENDING key order so an unsorted impl would surface [z, a].
    proj = emit(
      store,
      proj,
      { kind: "advisory", tier: "T1", freshness: "FRESH", body: "z" },
      {
        nodeKey: "k:zzz",
        family: "advisory",
        claimNorm: "z claim",
        primaryAnchor: "src::z",
        slot: "invariant",
      },
    )
    proj = emit(
      store,
      proj,
      { kind: "advisory", tier: "T1", freshness: "FRESH", body: "a" },
      {
        nodeKey: "k:aaa",
        family: "advisory",
        claimNorm: "a claim",
        primaryAnchor: "src::a",
        slot: "invariant",
      },
    )
    store.persistProjection(proj)

    const ids = createProjectionQueryIndex(structuralStub, store)
      .cover("src")
      .invariants.map((i) => i.nodeId)
    expect(ids).toEqual(["k:aaa", "k:zzz"]) // deterministic ascending, NOT emit order [k:zzz, k:aaa]
  })

  it("stale is TRUE iff an under-scope fact is DRIFTED (kills the hardcoded stale:false mutant)", () => {
    const store = freshStore()
    let fresh = emptyStore()
    fresh = emit(
      store,
      fresh,
      { kind: "advisory", tier: "T1", freshness: "FRESH", body: "f" },
      {
        nodeKey: "k:fresh",
        family: "advisory",
        claimNorm: "fresh",
        primaryAnchor: "src::f",
        slot: "invariant",
      },
    )
    store.persistProjection(fresh)
    expect(createProjectionQueryIndex(structuralStub, store).cover("src").stale).toBe(false)

    // now add a DRIFTED fact under scope → stale flips true.
    let drifted = fresh
    drifted = emit(
      store,
      drifted,
      { kind: "advisory", tier: "T1", freshness: "DRIFTED", body: "d" },
      {
        nodeKey: "k:drift",
        family: "advisory",
        claimNorm: "drift",
        primaryAnchor: "src::d",
        slot: "invariant",
      },
    )
    store.persistProjection(drifted)
    expect(createProjectionQueryIndex(structuralStub, store).cover("src").stale).toBe(true)
  })

  it("a node whose CAS bytes are absent is SKIPPED, never thrown on (totality)", () => {
    const store = freshStore()
    // route a node into the projection WITHOUT putting its fact into CAS (contentHash resolves to nothing).
    const proj = upsert(emptyStore(), {
      nodeKey: "k:ghost",
      contentHash: "deadbeef",
      family: "advisory",
      claimNorm: "ghost",
      primaryAnchor: "src::g",
      slot: "invariant",
    }).store
    store.persistProjection(proj)
    const pqi = createProjectionQueryIndex(structuralStub, store)
    expect(() => pqi.cover("src")).not.toThrow()
    expect(pqi.cover("src").invariants).toHaveLength(0) // the un-readable fact is skipped, not surfaced
  })
})
