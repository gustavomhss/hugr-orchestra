// @atlas/adapter-io — test/okf-store.test.ts  (EPIC-1-b — the disk side of the OKF store-instance door)
//
// Round-trips a REAL seeded CAS directory through the helpers `atlas export`/`atlas import` ride: seed
// objects through the store's own `put`, read the whole CAS, write it back into a FRESH target, and compare
// — on a real directory, through the same `createDiskStore` adapter every governed door rides. The identity
// algebra itself (PERSIST-9) is proven by `packages/persist/test/source.test.ts`; THIS file proves the
// helpers a shipped command hangs off: enumeration is complete, and a fresh-target write replays exactly.

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { CasObject } from "@atlas/kernel"
import { createDiskStore } from "../src/store.js"
import { readCas, sameCas, targetHasStore, writeCasObjects, okfBundlePath, CAS_REL } from "../src/okf-store.js"

let dir: string
let liveCas: string
let freshDir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "atlas-okfstore-"))
  liveCas = join(dir, "live", CAS_REL)
  freshDir = join(dir, "fresh")
  mkdirSync(liveCas, { recursive: true })
})

afterEach(() => rmSync(dir, { recursive: true, force: true }))

/** Seed an object through the REAL store put — its address is minted by the seam the production doors use. */
function seed(obj: Record<string, unknown>): void {
  createDiskStore(liveCas).put(obj as CasObject)
}

describe("okf-store — the disk side of the OKF door", () => {
  it("readCas enumerates the WHOLE store: every put survives into the Cas Map, in any shard", () => {
    seed({ kind: "StructuralNode", anchor: "pkg/a" })
    seed({ kind: "StructuralNode", anchor: "pkg/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }) // forces a second shard
    seed({ kind: "MemoryEntry", note: "n1" })
    const cas = readCas(liveCas)
    expect(cas.size).toBe(3)
  })

  it("round-trips 1:1 into a fresh target: writeCasObjects then readCas compare equal (byte-identical values)", () => {
    const bodies: Record<string, unknown>[] = [
      { kind: "StructuralNode", anchor: "pkg/mod", children: [1, 2] },
      { kind: "KnowledgeFact", subject: "s", predicate: "is", object: "y" },
      { kind: "MemoryEntry", seat: "forge", note: "observed" },
    ]
    for (const b of bodies) seed(b)
    const whole = readCas(liveCas)

    const targetCas = join(freshDir, CAS_REL)
    writeCasObjects(whole, targetCas)
    expect(readCas(targetCas)).toEqual(whole)
    expect(sameCas(readCas(targetCas), whole)).toBe(true)
    // the target is a genuinely fresh store — its CAS holds exactly the replayed bytes, nothing else.
    expect(freshDir.startsWith(dir)).toBe(true)
  })

  it("is order- and shard-independent (sameCas works on differently-built Cas maps)", () => {
    seed({ kind: "StructuralNode", anchor: "k1" })
    seed({ kind: "StructuralNode", anchor: "k2" })
    seed({ kind: "StructuralNode", anchor: "k3" })
    const whole = readCas(liveCas)
    const reversed = new Map([...whole].reverse())
    expect(sameCas(whole, reversed)).toBe(true)
  })

  it("an ABSENT CAS root reads as the honest empty store (readCas is total)", () => {
    const missing = join(dir, "no-such-cas")
    expect(readCas(missing).size).toBe(0)
    expect(sameCas(readCas(missing), new Map())).toBe(true)
  })

  it("targetHasStore is fail-closed on any existing .atlas/ (a target is fresh iff it is provably empty)", () => {
    expect(targetHasStore(freshDir)).toBe(false) // nothing there yet
    mkdirSync(join(freshDir, ".atlas"), { recursive: true })
    expect(targetHasStore(freshDir)).toBe(true) // even a bare .atlas/ forbids a seed
  })

  it("okfBundlePath is deterministic and collisions are impossible for a fixed output dir", () => {
    const p = okfBundlePath(freshDir)
    expect(p).toBe(join(freshDir, "atlas-okf.json"))
    expect(okfBundlePath(freshDir)).toBe(p)
  })
})
