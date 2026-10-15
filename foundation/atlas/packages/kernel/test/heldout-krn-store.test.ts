// @atlas/kernel — test/heldout-krn-store.test.ts  (MICROSCOPE GATE — held-out leg for WP-1.2-a.KERNEL)
//
// Cold-review GATE fixtures the author was BLINDED to: SCN-KERNEL-3a-2, 3b-2, 4a-2, 4b-2, 7a-2, 7b-2
// (docs/requirements/goldens-krn.md, `held_out: true`). Authored fresh by the reviewer, run against the
// author's src UNCHANGED. Every assertion is RELATIONAL / encoder-agnostic — the content id is taken from
// the sealed seam `id`, never a hard-coded hex — so an overfit that memorised fixture-1's answer fails here.
// `merge` is NOT owned by this WP; the 7a-2/7b-2 corners are exercised against the entry points this WP
// DOES own (store.put/get, log.append), which is where the same total/honest-empty behaviour must hold.

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import type { Hash } from "@atlas/contracts"
import type { Event } from "../src/types.js"
import { id } from "../src/canonical.js"
import { createStore } from "../src/store.js"
import { createLog } from "../src/log.js"

const ev = (idStr: string, seq: number, contentHash: string, payload: unknown): Event => ({
  id: idStr as Hash,
  seq,
  contentHash: contentHash as Hash,
  fresh: true,
  supersedes: [],
  payload,
})

describe("GATE SCN-KERNEL-3a-2 — cross-kind identical content collapses to ONE hash slot", () => {
  it("two different-kind objects with byte-identical canonical content share the one content key", () => {
    const store = createStore()
    // N' (a "node") and K' (a "fact") whose canonical preimages are byte-identical: identity is content
    // ALONE — kind is not part of the key. (Distinct references, equal content.)
    const Nprime = { a: 1, nested: { m: 1, n: 2 } }
    const Kprime = { nested: { n: 2, m: 1 }, a: 1 } // same content, keys presented in a different order
    expect(id(Nprime)).toBe(id(Kprime)) // content-alone identity (seam), no kind namespace
    const hN = store.put(Nprime)
    const hK = store.put(Kprime)
    // both resolve at the ONE shared key
    expect(hK).toBe(hN)
    expect(hN).toBe(id(Nprime))
    expect(store.get(hN)).toEqual(Nprime)
    expect(store.get(hK)).toEqual(store.get(hN))
    // one slot: the second put stored nothing new (idempotent) — a kind-prefixed key would split into two
    expect(store.put(Kprime)).toBe(hN)
  })
})

describe("GATE SCN-KERNEL-3b-2 — an over-threshold blob does not spawn a second store", () => {
  it("a large payload is content-addressed in the SAME single store (no size-based side-store)", () => {
    const store = createStore()
    const fact = { kind: "fact", s: "small" }
    // a structural node whose payload exceeds any inline/blob threshold
    const bigBlob = { kind: "node", blob: Array.from({ length: 5000 }, (_, i) => i) }
    const hFact = store.put(fact)
    const hBig = store.put(bigBlob)
    // both round-trip through the one CAS keyed by their own content hash
    expect(hFact).toBe(id(fact))
    expect(hBig).toBe(id(bigBlob))
    expect(store.get(hFact)).toEqual(fact)
    expect(store.get(hBig)).toEqual(bigBlob)
    // structural teeth: exactly ONE backing Map — a size-triggered blob side-store would be a 2nd `new Map`
    const src = readFileSync(fileURLToPath(new URL("../src/store.ts", import.meta.url)), "utf8")
    expect((src.match(/new Map\b/g) ?? []).length).toBe(1)
  })
})

describe("GATE SCN-KERNEL-4a-2 — an idempotent re-append keeps size non-decreasing", () => {
  it("append eX, eY, eX-again → size 0→1→2→2 (the duplicate is a no-op, never lowers size)", () => {
    const log = createLog()
    const eX = ev("id-9b21", 7, "aa1101", { w: "A" })
    const eY = ev("id-7c44", 7, "bb2202", { w: "B" })
    const s1 = log.append(eX)
    const s2 = log.append(eY)
    const s3 = log.append(eX) // duplicate id → no-op
    expect(s1.size).toBe(1)
    expect(s2.size).toBe(2)
    expect(s3.size).toBe(2) // non-decreasing, no eviction/rebalance
    expect(s2.size).toBeLessThanOrEqual(s3.size)
    // no prior event's bytes changed by the re-append
    expect(s3.get("id-9b21" as Hash)).toEqual(eX)
    expect(s3.get("id-7c44" as Hash)).toEqual(eY)
  })
})

describe("GATE SCN-KERNEL-4b-2 — bulk truncate / same-nodeKey replace of an extant event is rejected", () => {
  it("e3 survives a bulk truncate and a same-nodeKey contentHash-changing replace; size unchanged", () => {
    const log = createLog()
    const e3 = ev("id-f009", 3, "3d81ee", { orig: true })
    const snap = log.append(e3)
    expect(snap.size).toBe(1)
    // bulk truncate attempt = clearing a RETURNED snapshot must never touch authoritative state
    snap.clear()
    // same-nodeKey replace = re-append the SAME id carrying a DIFFERENT contentHash → not overwritten
    const e3prime = ev("id-f009", 3, "999999", { orig: false })
    const after = log.append(e3prime)
    expect(after.size).toBe(1) // size unchanged — neither truncate nor replace mutated the log
    expect(after.get("id-f009" as Hash)).toEqual(e3) // e3's original bytes intact (first-write-wins)
    expect((after.get("id-f009" as Hash) as Event).contentHash).toBe("3d81ee")
  })
})

describe("GATE SCN-KERNEL-7a-2 — held-out fuzz seed + a pinned deep-nesting corner stays total", () => {
  it("a fresh-seed fuzz stream + a ~10k-deep valid object never throw on the owned entry points", async () => {
    const fc = (await import("fast-check")).default
    const store = createStore()
    const log = createLog()
    // (a) a corner-biased fuzz stream at a seed RESERVED for the GATE (not the author's default seed)
    fc.assert(
      fc.property(fc.anything(), (x) => {
        expect(() => store.put(x)).not.toThrow()
        expect(() => store.get(x as Hash)).not.toThrow()
        expect(() => log.append(x as Event)).not.toThrow()
      }),
      { numRuns: 600, seed: 987654321, endOnFailure: true },
    )
    // (b) a pinned deep-but-valid nesting corner: the canonical recursion must not let a RangeError escape
    let deep: unknown = 0
    for (let i = 0; i < 12000; i++) deep = { n: deep }
    expect(() => store.put(deep)).not.toThrow() // honest-empty on stack overflow, never a thrown RangeError
  })
})

describe("GATE SCN-KERNEL-7b-2 — a cyclic / NaN-bearing input yields honest-empty, never an exception", () => {
  it("store.put on a cyclic object and on a NaN-bearing object returns honest-empty and stores nothing", () => {
    const store = createStore()
    // self-referential (a cycle) — the canonical recursion overflows internally but MUST NOT throw
    const cyclic: Record<string, unknown> = { a: 1 }
    cyclic["self"] = cyclic
    let hCyclic: Hash | undefined
    expect(() => {
      hCyclic = store.put(cyclic)
    }).not.toThrow()
    expect(store.get(hCyclic as Hash)).toBeUndefined() // honest empty: nothing stored, non-resolving key
    // a NaN float in place of a real value — a canonical-form violation → honest-empty, not a throw
    let hNaN: Hash | undefined
    expect(() => {
      hNaN = store.put({ contentHash: Number.NaN })
    }).not.toThrow()
    expect(store.get(hNaN as Hash)).toBeUndefined()
  })

  it("log.append on a cyclic / NaN-typed event is a no-op rejection, never an exception", () => {
    const log = createLog()
    // an event with a wrong-typed (NaN) seq — a malformed event
    const badSeq = {
      id: "id-bad",
      seq: Number.NaN,
      contentHash: "c",
      fresh: true,
      supersedes: [],
      payload: 1,
    } as unknown as Event
    let out: Map<Hash, Event> | undefined
    expect(() => {
      out = log.append(badSeq)
    }).not.toThrow()
    expect(out?.has("id-bad" as Hash)).toBe(false) // rejected, not inserted
    expect(out?.size).toBe(0)
    // a self-referential (cyclic) event payload must likewise not throw and not corrupt the log
    const cyclicEv: Record<string, unknown> = { id: "id-cyc", seq: 1, contentHash: "c", fresh: true, supersedes: [] }
    cyclicEv["payload"] = cyclicEv
    let out2: Map<Hash, Event> | undefined
    expect(() => {
      out2 = log.append(cyclicEv as unknown as Event)
    }).not.toThrow()
    expect(out2 instanceof Map).toBe(true)
  })
})
