// GEN-16 / KNOW-17 · the durable hits ledger (`hits-log.ts`) and the decay pass `atlas decay` runs over it.
//
// A REAL disk store and the REAL serve path (`createProjectionQueryIndex.cover`) write the ledger; the decay
// pass reads it back from `.atlas/hits.jsonl`. Every tooth names the mutant it kills:
//   • a ledger that lives in memory only                        → the cross-instance rise and decay reds.
//   • a first pass that decays on a cold ledger                 → the baseline tooth reds.
//   • a pass that closes before `window` hits accrued           → the open-window tooth reds.
//   • a pass that judges a node emitted mid-window              → the mid-window tooth reds.
//   • a serve path that keeps serving a decayed node            → the cover tooth reds.
//   • a decay that deletes the CAS bytes                        → the archive tooth reds.
//   • a later hit that does not bring the node back             → the restore tooth reds.

import { afterEach, describe, expect, it } from "vitest"
import { appendFileSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { Hash } from "@atlas/contracts"
import type { QueryIndex } from "@atlas/tools"
import { USE_THRESHOLD, emptyStore, upsert } from "@atlas/knowledge"
import type { StoreProjection } from "@atlas/knowledge"
import { asNodeKey } from "@atlas/kernel"
import { createDiskStore } from "../src/store.js"
import type { DiskStore } from "../src/store.js"
import { createProjectionQueryIndex } from "../src/projection-query-index.js"
import { HITS_REL, readHitsLog, storeHits } from "../src/hits-log.js"

let tmp: string | undefined
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true })
  tmp = undefined
})

function fresh(): { store: DiskStore; log: string } {
  tmp = mkdtempSync(join(tmpdir(), "atlas-hits-log-"))
  return { store: createDiskStore(join(tmp, "cas")), log: join(tmp, HITS_REL) }
}

const structuralStub: QueryIndex = {
  cover: () => ({ territory: "the-territory", axisHash: "axhash" as unknown as Hash, invariants: [], stale: false }),
}

function emitAdvisory(store: DiskStore, proj: StoreProjection, nodeKey: string): StoreProjection {
  const next = upsert(proj, {
    nodeKey,
    contentHash: store.put({ kind: "advisory" as const, tier: "T2", freshness: "FRESH", body: nodeKey }) as string,
    family: "advisory" as const,
    claimNorm: nodeKey,
    primaryAnchor: "src::mod",
    slot: "invariant",
  }).store
  store.persistProjection(next)
  return next
}

function served(store: DiskStore, log: string): string[] {
  return createProjectionQueryIndex(structuralStub, store, undefined, undefined, storeHits(store, log))
    .cover("src")
    .invariants.map((inv) => inv.nodeId)
}

const a = asNodeKey("k:a")
const b = asNodeKey("k:b")

describe("GEN-16 · the hits ledger is durable", () => {
  it("serves logged by one instance raise the node for the next instance", () => {
    const { store, log } = fresh()
    emitAdvisory(store, emptyStore(), "k:a")
    const first = createProjectionQueryIndex(structuralStub, store, undefined, undefined, storeHits(store, log))
    for (let i = 0; i < USE_THRESHOLD; i++) first.cover("src")
    // A fresh instance, as the next CLI invocation builds it, reads the same ledger back.
    const next = createProjectionQueryIndex(structuralStub, store, undefined, undefined, storeHits(store, log))
    expect(next.cover("src").invariants.find((inv) => inv.nodeId === "k:a")?.tier).toBe("T1")
    expect(readHitsLog(log).events.filter((event) => event.kind === "hit")).toHaveLength(USE_THRESHOLD + 1)
  })

  it("counts a line that does not parse as rejected, never as a hit", () => {
    const { store, log } = fresh()
    emitAdvisory(store, emptyStore(), "k:a")
    storeHits(store, log).logHit(a)
    appendFileSync(log, "{not json\n")
    const read = readHitsLog(log)
    expect(read.rejected).toBe(1)
    expect(read.events).toEqual([{ kind: "hit", node: "k:a" }])
  })
})

describe("GEN-16 · the decay pass", () => {
  it("the first pass opens the window and decays nothing", () => {
    const { store, log } = fresh()
    emitAdvisory(store, emitAdvisory(store, emptyStore(), "k:a"), "k:b")
    const pass = storeHits(store, log).decayPass(2)
    expect(pass.kind).toBe("baseline")
    expect(pass.decayed).toEqual([])
    expect([...pass.retained].sort()).toEqual(["k:a", "k:b"])
  })

  it("refuses to close a window that has not accrued `window` hits", () => {
    const { store, log } = fresh()
    emitAdvisory(store, emptyStore(), "k:a")
    const hits = storeHits(store, log)
    hits.decayPass(2)
    hits.logHit(a)
    const pass = hits.decayPass(2)
    expect(pass.kind).toBe("open")
    expect(pass.seen).toBe(1)
    expect(pass.decayed).toEqual([])
  })

  it("decays a zero-hit node, keeps its CAS bytes, and the serve path stops serving it", () => {
    const { store, log } = fresh()
    const proj = emitAdvisory(store, emitAdvisory(store, emptyStore(), "k:a"), "k:b")
    storeHits(store, log).decayPass(2)
    const hits = storeHits(store, log)
    hits.logHit(a)
    hits.logHit(a)
    const pass = storeHits(store, log).decayPass(2)
    expect(pass.kind).toBe("decayed")
    expect(pass.decayed).toEqual(["k:b"])
    expect(pass.retained).toEqual(["k:a"])
    // Archived, never deleted: the bytes are still addressable and the row is still current.
    const row = proj.current.get("k:b")
    expect(row).toBeDefined()
    expect(store.get(row!.contentHash as Hash)).toBeDefined()
    expect(storeHits(store, log).isDecayed(b)).toBe(true)
    expect(served(store, log)).toEqual(["k:a"])
  })

  it("never decays a node that became eligible mid-window", () => {
    const { store, log } = fresh()
    const proj = emitAdvisory(store, emptyStore(), "k:a")
    storeHits(store, log).decayPass(1)
    emitAdvisory(store, proj, "k:b")
    storeHits(store, log).logHit(a)
    const pass = storeHits(store, log).decayPass(1)
    expect(pass.decayed).toEqual([])
    expect([...pass.retained].sort()).toEqual(["k:a", "k:b"])
  })

  it("a later hit brings a decayed node back into the served set", () => {
    const { store, log } = fresh()
    emitAdvisory(store, emitAdvisory(store, emptyStore(), "k:a"), "k:b")
    storeHits(store, log).decayPass(1)
    storeHits(store, log).logHit(a)
    expect(storeHits(store, log).decayPass(1).decayed).toEqual(["k:b"])
    storeHits(store, log).logHit(b)
    expect(storeHits(store, log).isDecayed(b)).toBe(false)
    expect(served(store, log).sort()).toEqual(["k:a", "k:b"])
  })

  it("rejects a malformed window", () => {
    const { store, log } = fresh()
    expect(() => storeHits(store, log).decayPass(0)).toThrow(TypeError)
    expect(() => storeHits(store, log).decayPass(1.5)).toThrow(TypeError)
  })
})
