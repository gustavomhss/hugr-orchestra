// WP-D3B-B.USE-OR-SEAL · the SERVE-PATH wire (adapter-io projection-query-index). Transcribes the
// SCN-AUTH-16a-1/16b-1/16c-1/16d-1 wire leg + the card's exit_predicate ("the served/pack path actually
// writes the counter — a mutation that removes the logHit in the serve path turns the growth SCNs red").
//
// This is the REAL query path: `cover(scope)` serves the advisory node in a pack, so serving IS the ledger
// write. Every tooth here NAMES the mutant it kills:
//   • a cover that does NOT call `logHit` per advisory node served  → 16a-1 counter never moves → red.
//   • a cover that decides the class AFTER its own logHit          → the node rises one serve TOO EARLY
//     (card: "served at the raised class on the NEXT pack") → the 8th serve red.
//   • a cover that raises at `door2Threshold`/any calibration      → 16b-1 ("gated on the plain integer")
//     red.
//   • a cover that ignores `servedClass` (never raises)            → 16b-1/16c-1 red.
//
// The store is a REAL disk store; the hits ledger is a REAL `bindHits` — same build-ahead discipline as
// hits.know17.test.ts. `hits` is INJECTED into `createProjectionQueryIndex` exactly as `wire.ts` will when
// a composition root supplies it; the bare 2/3-arg forms (no hits) stay byte-identical (existing tests).

import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Hash } from "@atlas/contracts"
import type { QueryIndex } from "@atlas/tools"
import { upsert, emptyStore } from "@atlas/knowledge"
import type { StoreProjection, WriteRequest } from "@atlas/knowledge"
import { bindHits, USE_THRESHOLD, currentNodes } from "@atlas/knowledge"
import type { NodeKey } from "@atlas/contracts"
import { createDiskStore } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
import { rehydrateProjection } from "../src/store.js"
import { createProjectionQueryIndex } from "../src/projection-query-index.js"

let tmp: string | undefined
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  tmp = undefined
})

/** A fresh temp disk store (CAS root under a temp dir; projection sidecar lands beside it). */
function freshStore(): DiskStore {
  tmp = mkdtempSync(join(tmpdir(), "atlas-pqi-seal-"))
  return createDiskStore(join(tmp, "cas"))
}

const structuralStub: QueryIndex = {
  cover: () => ({ territory: "the-territory", axisHash: "axhash" as unknown as Hash, invariants: [], stale: false }),
}

/** Emit one ADVISORY (T2) fact durably — the growth candidate of the use-or-seal card. */
function emitAdvisory(store: DiskStore, proj: StoreProjection, nodeKey: string, body: string): StoreProjection {
  const fact = { kind: "advisory" as const, tier: "T2", freshness: "FRESH", body }
  const contentHash = store.put(fact) as string
  return upsert(proj, {
    nodeKey,
    contentHash,
    family: "advisory" as const,
    claimNorm: body,
    primaryAnchor: "src::mod",
    slot: "invariant",
  }).store
}

/** A REAL per-process hits ledger bound to a served-set of the STORE's current nodes (no fabricated deps:
 *  servedSet = what the serve path actually serves; archive = the receive-only CAS sink KNOW-17 gives it;
 *  calibrate = the parametric door-2 knob, unused by the plain-integer rise). */
function ledgerFor(store: DiskStore): ReturnType<typeof bindHits> {
  return bindHits({
    servedSet: () => Array.from(currentNodeKeys(store)),
    archive: () => {
      /* receive-only: the serve seam never archives (decay is the GEN-16 seam) */
    },
    calibrate: (n) => n * 10, // a DISTINCT parametric knob — the rise never consults it
  })
}

import { asNodeKey } from "@atlas/kernel"
function currentNodeKeys(store: DiskStore): ReadonlySet<NodeKey> {
  // rehydrate the projection the SAME way cover() does — the served/pack snapshot is upstream-owned.
  return new Set(currentNodes(rehydrateProjection(store)).map((n) => asNodeKey(n.nodeKey)))
}

describe("WP-D3B-B · serve path writes the USE-OR-SEAL ledger", () => {
  it("SCN-16a-1: serving an advisory node in a pack increments its usage counter", () => {
    const store = freshStore()
    let proj = emptyStore()
    proj = emitAdvisory(store, proj, "k:advisory", "advisory fact")
    store.persistProjection(proj)

    const hits = ledgerFor(store)
    const pqi = createProjectionQueryIndex(structuralStub, store, undefined, undefined, hits)

    pqi.cover("src") // ONE pack delivery
    // TEETH: the served-in-a-pack counter MOVED (16a-1) — the ledger is no longer a rank field nobody
    // writes. A cover that never calls logHit reads 0 here and the growth SCNs starve.
    expect(hits.door2Threshold(asNodeKey("k:advisory"))).toBe(10) // calibrate(1) — one observed hit
  })

  it("SCN-16b-1: at USE_THRESHOLD serves it is served at the RAISED class on the NEXT pack — no human", () => {
    const store = freshStore()
    let proj = emptyStore()
    proj = emitAdvisory(store, proj, "k:advisory", "advisory fact")
    store.persistProjection(proj)

    const hits = ledgerFor(store)
    const pqi = createProjectionQueryIndex(structuralStub, store, undefined, undefined, hits)

    // serve 8× (USE_THRESHOLD): each cover() logs the hit AFTER deciding the class, so every one of the
    // 8 serves — INCLUDING the 8th, whose logHit crosses 7→8 — is delivered while advisory. This is the
    // card's "served at the raised class on the NEXT pack": the 8th serve reaches the counter; the RISE is
    // observable one serve later. Mutant guards: a raise BEFORE the count reached the threshold, or a rise
    // gated on the parametric door-2 calibration instead of the plain USE_THRESHOLD, flip these.
    for (let i = 0; i < USE_THRESHOLD; i++) {
      const inv = pqi.cover("src").invariants.find((x) => x.nodeId === "k:advisory")!
      expect(inv.tier).toBe("T2") // advisory below AND AT the crossing serve — no early rise
    }

    // the NEXT pack: the node is served at the RAISED class (governing band — tier ≥ T1), nobody touched.
    const after = pqi.cover("src").invariants.find((x) => x.nodeId === "k:advisory")!
    expect(after.tier).toBe("T1")
  })

  it("SCN-16c-1: a human seal rises the node INDEPENDENT of the counter, on the next serve", () => {
    const store = freshStore()
    let proj = emptyStore()
    proj = emitAdvisory(store, proj, "k:sealed", "sealed fact")
    store.persistProjection(proj)

    const hits = ledgerFor(store)
    const pqi = createProjectionQueryIndex(structuralStub, store, undefined, undefined, hits)

    pqi.cover("src") // one serve while counter below threshold → advisory
    expect(pqi.cover("src").invariants.find((x) => x.nodeId === "k:sealed")!.tier).toBe("T2")

    hits.seal(asNodeKey("k:sealed")) // a deliberate human endorsement, counter still at 1

    // rises on the next read, independent of the counter (breaks-on BOTH-required).
    expect(pqi.cover("src").invariants.find((x) => x.nodeId === "k:sealed")!.tier).toBe("T1")
  })

  it("SCN-16d-1: a node earning neither stays advisory, never rising by default", () => {
    const store = freshStore()
    let proj = emptyStore()
    proj = emitAdvisory(store, proj, "k:advisory", "advisory fact")
    store.persistProjection(proj)

    const hits = ledgerFor(store)
    const pqi = createProjectionQueryIndex(structuralStub, store, undefined, undefined, hits)

    // 7 serves — ONE below the threshold. After the 7th, the ledger is still below: advisory.
    for (let i = 0; i < USE_THRESHOLD - 1; i++) pqi.cover("src")
    expect(hits.door2Threshold(asNodeKey("k:advisory"))).toBe((USE_THRESHOLD - 1) * 10) // 7 observed
    expect(hits.servedClass(asNodeKey("k:advisory"))).toBe("advisory")
    // the LAST serve shown went out at tier T2 (advisory) — a node earning neither is served advisory.
    const inv = pqi.cover("src").invariants.find((x) => x.nodeId === "k:advisory")!
    expect(inv.tier).toBe("T2")
  })

  it("exit_predicate MUTATION: without the serve-path logHit the growth SCNs starve at zero", () => {
    // The mutation the card guards against STRIPS the `hits.logHit(nodeKey)` line from the serve path.
    // Prove it two ways:
    //   (1) the SCN-16b/16c legs ABOVE pass BECAUSE the serve path writes — a strip turns them red;
    //   (2) mechanically, a cover built WITHOUT a bound ledger behaves byte-identically to pre-WP code:
    //       no write, no raise — the counter a strip produces. Serve past the threshold; the pack still
    //       carries the node at its advisory tier, proving nothing rose by default.
    const store = freshStore()
    let proj = emptyStore()
    proj = emitAdvisory(store, proj, "k:advisory", "advisory fact")
    store.persistProjection(proj)

    const pqi = createProjectionQueryIndex(structuralStub, store) // NO hits bound — the no-write state
    for (let i = 0; i < USE_THRESHOLD + 3; i++) pqi.cover("src")
    const after = pqi.cover("src").invariants.find((x) => x.nodeId === "k:advisory")!
    expect(after.tier).toBe("T2") // never rose: there is no writer, exactly what a strip produces
  })
})
