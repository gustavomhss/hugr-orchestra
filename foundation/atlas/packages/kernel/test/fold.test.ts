// @atlas/kernel — test/fold.test.ts  (WP-1.2-b.KERNEL)
//
// RED→GREEN transcription of the VISIBLE fold goldens SCN-KERNEL-5a-1 (replay-from-empty rebuilds a
// byte-identical Atlas) + SCN-KERNEL-5b-1 (no capability reads a mutable in-place snapshot) and the ∀-law
// PROP-KERNEL-5 (fold round-trip). `id-…`/`ch-…`/`nk-…` handles are SYMBOLIC — assertions are RELATIONAL
// (byte-identity of the serialized AtlasState, presence of a node, equality across a snapshot drop), never
// pinned to a golden digest. Hashing/store/log/portable are CONSUMED from the sealed seam, never re-rolled.
// Held-out `-2` fixtures (collision node / snapshot-free head) are NOT transcribed.

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import type { Hash, NodeKey } from "@atlas/contracts"
import type { AtlasState, Cas, Event, EventLog } from "../src/types.js"
import { createLog } from "../src/log.js"
import { exportCas, importCas } from "../src/portable.js"
import { fold } from "../src/fold.js"

/** Build one well-formed Event. `seq` is a local hint; identity/entry keys are the symbolic handles. */
const ev = (id: string, node: string | undefined, ch: string, payload: unknown): Event => ({
  id: id as Hash,
  seq: 0,
  // spread-in, not `nodeKey: undefined`: `Event.nodeKey?` is exactOptionalPropertyTypes-optional.
  ...(node === undefined ? {} : { nodeKey: node as NodeKey }),
  contentHash: ch as Hash,
  fresh: true,
  supersedes: [],
  payload,
})

/** Deterministic, insertion-order-independent serialization of an AtlasState: nodeKeys then per-node
 *  entry contentHashes are sorted, so equal CONTENT ⇒ byte-identical string regardless of Map order. */
function serializeState(s: AtlasState): string {
  return JSON.stringify(
    [...s.keys()].sort().map((nk) => ({
      nodeKey: nk,
      entries: [...s.get(nk)!.entries.keys()].sort().map((ch) => s.get(nk)!.entries.get(ch)),
    })),
  )
}

/** Export the log through the sealed OKF seam, import into a FRESH store, and replay the events from empty
 *  into a fresh append-only log — the golden's "exported, imported into a fresh empty store, fold replayed". */
function roundTripFromEmpty(log: EventLog): EventLog {
  const fresh = importCas(exportCas(log as unknown as Cas))
  const replay = createLog()
  let out: EventLog = new Map()
  for (const obj of fresh.values()) out = replay.append(obj as Event)
  return out
}

describe("KERNEL-5 — fold reconstruction over the event log (visible goldens)", () => {
  it("SCN-KERNEL-5a-1: replay from empty rebuilds a byte-identical Atlas", () => {
    const log = createLog()
    log.append(ev("id-e1", "nk-1", "ch-e1", { v: 1 }))
    log.append(ev("id-e2", "nk-2", "ch-e2", { v: 2 }))
    const L = log.append(ev("id-e3", "nk-3", "ch-e3", { v: 3 }))

    const A0 = serializeState(fold(L)) // the original serialized AtlasState
    const rebuilt = fold(roundTripFromEmpty(L)) // export → import → replay-from-empty → fold
    const A1 = serializeState(rebuilt)

    expect(A1).toBe(A0) // byte-identical replay (KERNEL-5a)
    // teeth (breaks-on "fold seeds from a cached mutable snapshot — replay-from-empty omits e3's node and
    // diverges from A0"): the rebuilt state must carry e3's node in full, not a snapshot-truncated subset.
    expect(rebuilt.size).toBe(3)
    expect(rebuilt.has("nk-3" as NodeKey)).toBe(true)
    expect([...rebuilt.get("nk-3" as NodeKey)!.entries.keys()]).toContain("ch-e3")
  })

  it("SCN-KERNEL-5b-1: no capability reads a mutable in-place snapshot", () => {
    const log = createLog()
    log.append(ev("id-a", "nk-A", "ch-a", { v: 1 }))
    const L = log.append(ev("id-b", "nk-A", "ch-b", { v: 2 })) // one node, two OR-Set entries
    const other = createLog().append(ev("id-x", "nk-Z", "ch-x", {})) // an unrelated log

    // a capability = node nk-A's sorted entry keys, DERIVED from the fold (never a stored snapshot).
    const query = (s: AtlasState): string[] => [...(s.get("nk-A" as NodeKey)?.entries.keys() ?? [])].sort()

    const before = query(fold(L)) // answered while the in-memory snapshot is live
    const after = query(fold(roundTripFromEmpty(L))) // in-memory snapshot discarded → pure replay fold

    expect(after).toEqual(before) // both answers identical — every capability derives from the fold
    // non-trivial witness: the answer actually reflects both entries (a no-op fold could not satisfy this).
    expect(before).toEqual(["ch-a", "ch-b"])
    // teeth (breaks-on "a capability reads a stale mutable snapshot — the answer changes once the snapshot
    // is dropped and rebuilt"): folding an unrelated log must not poison a shared snapshot; re-answer holds.
    fold(other)
    expect(query(fold(L))).toEqual(before)
  })
})

describe("PROP-KERNEL-5 — fold round-trip (∀-law)", () => {
  // Each discriminator `k` FULLY determines its event (id/nodeKey/contentHash/seq/payload), so distinct
  // entries in a node never share a contentHash (that collision is EPIC-3-b, held out) and equal `k`s are
  // byte-identical — keeping the OR-Set union genuinely order-independent without any head-resolution.
  const build = (k: number): Event => ev(`id-${k}`, `nk-${k % 3}`, `ch-${k}`, { k })
  const ksArb = fc.array(fc.integer({ min: 0, max: 7 }), { maxLength: 30 })

  const foldKs = (ks: readonly number[]): EventLog => {
    const log = createLog()
    let out: EventLog = new Map()
    for (const k of ks) out = log.append(build(k))
    return out
  }

  it("∀ log L: fold is order-independent ∧ serialize∘fold survives export→import→replay-from-empty", () => {
    fc.assert(
      fc.property(ksArb, (ks) => {
        const L = foldKs(ks)
        const Lrev = foldKs([...ks].reverse())
        const base = serializeState(fold(L))

        expect(serializeState(fold(Lrev))).toBe(base) // order-independent reconstruction (KERNEL-11)
        expect(serializeState(fold(roundTripFromEmpty(L)))).toBe(base) // round-trip byte-identical (5a)
        expect(serializeState(fold(L))).toBe(base) // pure: re-fold of the same set is identical (5b)

        // non-triviality: the projection materializes exactly the distinct node buckets present.
        const nodes = new Set(ks.map((k) => k % 3)).size
        expect(fold(L).size).toBe(nodes)
      }),
    )
  })
})
