// @atlas/index — test/fold-drift.test.ts  (WP-2.7-b.INDEX · drift-state arm)
//
// RED→GREEN transcription of the VISIBLE (`-1`) drift-state goldens (held-out `-2` NOT read):
//   INDEX-5:  5a-1 (stale entry visible at query time), 5b-1 (excluded/flagged, never served clean),
//             5c-1 (0 re-embedding, 0 sweep — decided by a subtreeHash comparison).
//   INDEX-12: 12g-1 (dirty-bit eager across the WHOLE reverse closure), 12h-1 (rState lazy on-read),
//             12i-1 (eager re-hash capped at maxHops=2), 12j-1 (deeper node state-suspect),
//             12k-1 (state-suspect resolved only on query).
// Golden ids are SYMBOLIC ⇒ RELATIONAL assertions only. The STRUCTURAL fold (Delta / rId / bounded
// eager re-hash — 2.7-a) is exercised in test/fold.test.ts and is NOT re-tested here.
//
// MODELING NOTE (disciplined-judgment, flagged non-blocking): the frozen `IndexNode`/`Rollup` carry no
// separate `rState`/status field and `propagateDirty`/`rehashState` return `void`, so the drift carrier
// (dirty-bit / state-suspect / resolved-rState side-indexes) is fold-INTERNAL state keyed by node
// identity (`node.key`), owned by a `createDriftFold(edges,nodes)` session — no field added to the
// frozen types. The dependency-axis identity of a node == its `key`, the same identity `Axes.edges`'
// Hash endpoints are keyed by (matching 2.7-a's `eagerRehashState`, keyed on `edge.to`/`edge.from`).

import { describe, it, expect } from "vitest"
import { asHash, asSubtreeHash } from "@atlas/kernel"
import type { Hash, SubtreeHash } from "@atlas/contracts"
import type { Axis, DepEdge, IndexNode } from "../src/types.js"
import { createDriftFold, MAX_HOPS } from "../src/fold.js"

const sh = (s: string): SubtreeHash => asSubtreeHash(s)
const h = (s: string): Hash => asHash(s)

function nd(
  key: string,
  level: string,
  subtree: string,
  children: IndexNode[] = [],
  objects: Hash[] = [],
  axis: Axis = "dependency",
): IndexNode {
  return { axis, level, key, subtreeHash: sh(subtree), children, objects }
}

/** The reverse-closure chain `A←B←C←D←E`: `from` depends on `to`, so B depends on A … E depends on D.
 *  An edit at A ⇒ reverse closure {B,C,D,E}; hop1=B, hop2=C, hop3=D, hop4=E. */
function chainABCDE(): DepEdge[] {
  return [
    { from: h("B"), to: h("A"), kind: "resolved" },
    { from: h("C"), to: h("B"), kind: "resolved" },
    { from: h("D"), to: h("C"), kind: "resolved" },
    { from: h("E"), to: h("D"), kind: "resolved" },
  ]
}
const A = nd("A", "item", "st-A")
const B = nd("B", "item", "st-B")
const C = nd("C", "item", "st-C")
const D = nd("D", "item", "st-D")
const E = nd("E", "item", "st-E")

// ---- INDEX-5 — drift is the index's job (query-time, no re-embed, no sweep) ----

describe("INDEX-5 — stale-at-query-time (drift-state, visible goldens)", () => {
  it("SCN-INDEX-5a-1: an entry whose anchor hash ≠ current is visible + marked stale at query time", () => {
    // fact F anchored at item:put with anchor hash bk-11; item:put edited so current = bk-11x.
    const fold = createDriftFold([])
    const view = fold.queryStale("F", "bk-11", "bk-11x") // `byScope` surfaces F, decided inline
    expect(view.value).toBe("F") // still VISIBLE at query time
    expect(view.stale).toBe(true) // marked stale (anchor bk-11 ≠ current bk-11x)
    expect(view.anchor).not.toBe(view.current)
    // teeth (breaks-on comparing nothing → FRESH): a matching anchor==current would be stale===false.
    expect(fold.queryStale("F", "bk-11", "bk-11").stale).toBe(false)
  })

  it("SCN-INDEX-5b-1: the stale entry is flagged (excluded from the FRESH set), never served clean", () => {
    const fold = createDriftFold([])
    const views = [
      fold.queryStale("F", "bk-11", "bk-11x"), // drifted
      fold.queryStale("H", "bk-77", "bk-77"), // clean
    ]
    const fresh = views.filter((v) => !v.stale).map((v) => v.value)
    expect(views.find((v) => v.value === "F")!.stale).toBe(true) // F flagged stale
    expect(fresh).not.toContain("F") // F excluded from the FRESH set
    expect(fresh).toContain("H") // the clean fact still served
    // teeth (breaks-on F served in FRESH set with no flag): F would appear in `fresh`.
  })

  it("SCN-INDEX-5c-1: drift is decided by a subtreeHash comparison — 0 re-embedding, 0 sweep", () => {
    const fold = createDriftFold([])
    fold.queryStale("F", "bk-11", "bk-11x") // staleness decided by the anchor≠current comparison
    expect(fold.comparisons).toBeGreaterThan(0) // drift WAS decided (by a comparison)
    expect(fold.reembedCount).toBe(0) // no re-embedding
    expect(fold.sweepCount).toBe(0) // no separate staleness sweep
    // teeth (breaks-on a background sweep marking entries → sweep-count == 1): sweepCount stays 0.
  })
})

// ---- INDEX-12 — dual rollup drift arm: eager bit / lazy hash / maxHops=2 cap ----

describe("INDEX-12 — drift dirty-bit + lazy rState + maxHops=2 (visible goldens)", () => {
  it("SCN-INDEX-12g-1: an edit propagates the drift dirty-bit eagerly across the WHOLE reverse closure", () => {
    const fold = createDriftFold(chainABCDE())
    fold.propagateDirty(A) // edit at A
    for (const n of [B, C, D, E]) expect(fold.isDirty(n)).toBe(true) // whole closure {B,C,D,E} marked
    expect(fold.isDirty(A)).toBe(false) // the edited node itself is not its own dependent
    // teeth (breaks-on stopping at maxHops=2): D (hop3) and E (hop4) MUST still carry the bit.
    expect(fold.isDirty(D)).toBe(true)
    expect(fold.isDirty(E)).toBe(true)
  })

  it("SCN-INDEX-12h-1: the rState hash is recomputed lazily, on read — not eagerly for a deep node", () => {
    const fold = createDriftFold(chainABCDE(), [A, B, C, D, E])
    fold.propagateDirty(A)
    fold.rehashState(A) // eager fold at edit time
    expect(fold.isDirty(D)).toBe(true) // D carries the dirty-bit (beyond maxHops)
    expect(fold.rStateResolved(D)).toBe(false) // …but its rState is NOT eagerly recomputed
    const resolvesBefore = fold.onReadResolves
    const hD = fold.queryState(D) // recomputation happens only on the READ of D
    expect(hD).toBeTruthy()
    expect(fold.rStateResolved(D)).toBe(true)
    expect(fold.onReadResolves).toBe(resolvesBefore + 1)
    // teeth (breaks-on eager recompute for D at edit time): rStateResolved(D) would be true pre-query.
  })

  it("SCN-INDEX-12i-1: the eager re-hash is capped at exactly maxHops=2 (only B and C)", () => {
    const fold = createDriftFold(chainABCDE(), [A, B, C, D, E])
    fold.rehashState(A)
    expect(new Set(fold.eagerRehashed)).toEqual(new Set(["B", "C"])) // hop1=B, hop2=C only
    expect(fold.eagerRehashed.length).toBeLessThanOrEqual(2) // cap == maxHops=2
    expect(fold.rStateResolved(B)).toBe(true)
    expect(fold.rStateResolved(C)).toBe(true)
    // teeth (breaks-on raising the cap to 3): D (hop3) would appear in the eager set.
    expect(fold.rStateResolved(D)).toBe(false)
    expect(MAX_HOPS).toBe(2)
  })

  it("SCN-INDEX-12j-1: a node deeper than maxHops=2 is marked state-suspect (neither FRESH nor resolved)", () => {
    const fold = createDriftFold(chainABCDE(), [A, B, C, D, E])
    fold.rehashState(A)
    for (const n of [D, E]) {
      expect(fold.isStateSuspect(n)).toBe(true) // beyond the cap → state-suspect
      expect(fold.rStateResolved(n)).toBe(false) // not eagerly resolved
    }
    expect(fold.isStateSuspect(B)).toBe(false) // within the cap — resolved, not suspect
    expect(fold.isStateSuspect(C)).toBe(false)
    // teeth (breaks-on leaving D unmarked → silently FRESH): D is state-suspect, not clean.
  })

  it("SCN-INDEX-12k-1: a state-suspect node is resolved only when queried (not before)", () => {
    const fold = createDriftFold(chainABCDE(), [A, B, C, D, E])
    fold.rehashState(A)
    expect(fold.isStateSuspect(D)).toBe(true)
    expect(fold.rStateResolved(D)).toBe(false) // stays unresolved while never queried
    // …later queried:
    const hD = fold.queryState(D)
    expect(hD).toBeTruthy()
    expect(fold.rStateResolved(D)).toBe(true) // resolved AT the query
    expect(fold.isStateSuspect(D)).toBe(false) // no longer suspect once resolved
    // teeth (breaks-on a background pass resolving suspects pre-query): D was unresolved until queryState.
  })
})
