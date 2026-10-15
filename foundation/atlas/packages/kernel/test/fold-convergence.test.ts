// @atlas/kernel — test/fold-convergence.test.ts  (PROP-KERNEL-11 regression witnesses)
//
// The two EXECUTED counterexamples to the ratified convergence law `fold(π(S)) ≡ fold(S)`, pinned as
// DETERMINISTIC unit witnesses. They live in their own file, apart from the ∀-laws in `merge-fold.test.ts`,
// for one reason: the law read GREEN for 3000 runs on the base commit while it was demonstrably false,
// because the ∀-generator had been narrowed (`uniqueArray(..., selector: s => s.ch)`) to exclude exactly
// these shapes. A pinned witness is the only part of the proof that a later edit to an arbitrary cannot
// silently re-narrow. Digests below are LITERAL and were measured on the base commit c76d26b.
//
// Builders are shared with `merge-fold.test.ts` via `event-builders.ts` — one definition of "a well-formed
// event", so the two files cannot drift apart.

import { describe, it, expect } from "vitest"
import type { Hash, NodeKey } from "@atlas/contracts"
import type { Event, EventLog } from "../src/types.js"
import { fold, merge, mergeNode } from "../src/fold.js"
import { mkEvent, logOf, serState, nodeAt } from "./event-builders.js"

// ══ REGRESSION — the two convergence witnesses the ∀-generators used to exclude ═══════════════════════
//
// Both were EXECUTED against the base commit (c76d26b) and both returned `false`. They are pinned as
// DETERMINISTIC unit witnesses (not left to the random stream) because the whole reason PROP-KERNEL-11 read
// green for 3000 runs is that a `selector:`/offset in the generator deleted exactly these shapes. A pinned
// witness cannot be re-narrowed by a future edit to an arbitrary.
describe("REGRESSION PROP-KERNEL-11 — fold is a function of the event SET, not of arrival order", () => {
  it("W1: same nodeKey + same contentHash + DIFFERENT fresh ⇒ two ids, one slot, ONE folded state", () => {
    const x = mkEvent("nk-0", "ch-001", { c: 1 }, { fresh: true })
    const y = mkEvent("nk-0", "ch-001", { c: 1 }, { fresh: false })

    // the premise: `fresh` IS in the id preimage, so BOTH events survive the id-keyed log set.
    expect(x.id).toBe("87d9f7fd8af1f3e64bc5fab751dfd2f2ee0f6a962280010abdb28f7e65d4944d")
    expect(y.id).toBe("e956c48c5761aecbedb5d74b710c5fde9ba0d2be44670d06f955809c7827d705")
    expect(logOf([x, y]).size).toBe(2) // two DISTINCT events colliding on ONE contentHash slot

    // the law: the folded state is identical under either delivery order, and under either branch-union.
    expect(serState(fold(logOf([y, x])))).toBe(serState(fold(logOf([x, y]))))
    expect(serState(fold(merge(logOf([y]), logOf([x]))))).toBe(serState(fold(merge(logOf([x]), logOf([y])))))

    // and the winner is the PINNED one (MAX-by-id), not "whichever arrived first":
    // e956c48c… > 87d9f7fd… lexicographically ⇒ y wins in BOTH orders.
    for (const order of [
      [x, y],
      [y, x],
    ]) {
      const entry = nodeAt(fold(logOf(order)), "nk-0").entries.get("ch-001" as Hash)!
      expect(entry.id).toBe("e956c48c5761aecbedb5d74b710c5fde9ba0d2be44670d06f955809c7827d705")
      expect(entry.fresh).toBe(false)
    }
    // teeth: first-seen-wins returns fresh:true for [x,y] and fresh:false for [y,x] — the two orders diverge.
  })

  it("W2: identical content at a DIFFERENT seq ⇒ one id, and the retained seq never reaches the state", () => {
    const p = mkEvent("nk-0", "ch-001", { c: 1 }, { seq: 1 })
    const q = mkEvent("nk-0", "ch-001", { c: 1 }, { seq: 2 })

    // the premise: `seq` is pinned OUT of the preimage (KERNEL-9), so p and q share ONE id and the log's
    // first-write-wins keeps whichever ARRIVED first — a different OBJECT under the same key.
    expect(p.id).toBe(q.id)
    expect(p.id).toBe("87d9f7fd8af1f3e64bc5fab751dfd2f2ee0f6a962280010abdb28f7e65d4944d")
    expect(logOf([p, q]).get(p.id)!.seq).toBe(1)
    expect(logOf([q, p]).get(p.id)!.seq).toBe(2) // the LOG legitimately keeps the local hint verbatim

    // the law: the FOLD normalizes it away, so `AtlasState` is order-independent regardless.
    expect(serState(fold(logOf([q, p])))).toBe(serState(fold(logOf([p, q]))))
    expect(nodeAt(fold(logOf([q, p])), "nk-0").entries.get("ch-001" as Hash)!.seq).toBe(0)
    // teeth: projecting the event verbatim folds to "seq":1 or "seq":2 by delivery order — and this witness
    // is upstream of the slot rule, so a slot tie-break ALONE does not catch it.
  })

  it("W3: fold stays pure and total — no clock, no throw, no mutation of the input log (KERNEL-7)", () => {
    // a malformed/hostile event: a float payload (a canonical-form VIOLATION that `eventId` would throw on),
    // a BigInt-free but symbol-keyed payload, and a hand-rolled id. `fold` must not hash and must not throw.
    const hostile = {
      id: "not-a-hash",
      seq: 7,
      nodeKey: "nk-h" as NodeKey,
      contentHash: "ch-h" as Hash,
      fresh: true,
      supersedes: [] as readonly Hash[],
      payload: { f: 1.5, u: undefined, nested: { deep: [1, 2, 3] } },
    } as unknown as Event
    const log: EventLog = new Map([[hostile.id, hostile]])
    const before = JSON.stringify([...log.entries()])

    expect(() => fold(log)).not.toThrow() // total
    expect(() => mergeNode(nodeAt(fold(log), "nk-h"), nodeAt(fold(log), "nk-h"))).not.toThrow()
    expect(serState(fold(log))).toBe(serState(fold(log))) // pure: same input ⇒ same output, no clock
    expect(JSON.stringify([...log.entries()])).toBe(before) // the input log is not mutated
    expect(hostile.seq).toBe(7) // the source event object itself is not mutated by the seq normalization
  })

  it("W4: RAW Map iteration order of the folded state is arrival-independent too, not just the sorted bytes", () => {
    // The ratified byte-identity notion serializes through the KERNEL-1 canonicalizer, which SORTS keys
    // (fspec-merge §DOWN closing note) — so `serState`/`serializeState` would agree even if the underlying
    // `Map` iterated in arrival order. That is a projection hiding a real order-dependence from any consumer
    // that walks `fold(...)` directly. This asserts the stronger, unprojected form.
    const a = mkEvent("nk-A", "ch-1", { v: 1 })
    const b = mkEvent("nk-B", "ch-2", { v: 2 })
    const c = mkEvent("nk-A", "ch-3", { v: 3 })
    const raw = (order: readonly Event[]): string =>
      [...fold(logOf(order)).entries()].map(([nk, n]) => `${nk}:${[...n.entries.keys()].join(",")}`).join(";")

    expect(raw([a, b, c])).toBe("nk-A:ch-1,ch-3;nk-B:ch-2")
    for (const order of [
      [c, b, a],
      [b, c, a],
      [c, a, b],
    ])
      expect(raw(order)).toBe(raw([a, b, c]))
    // teeth: inserting slots as they arrive yields `nk-A:ch-3,ch-1` for [c,b,a] — same sorted bytes, different
    // Map. NOTE this is STRONGER than the ratified law requires; drop it if the extra guarantee is unwanted.
  })
})
