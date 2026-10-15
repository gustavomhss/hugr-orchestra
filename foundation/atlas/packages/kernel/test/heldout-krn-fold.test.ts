// @atlas/kernel — test/heldout-krn-fold.test.ts  (GATE — held-out fold fixtures, authored by the cold-review seat)
//
// Independent transcription of the HELD-OUT goldens SCN-KERNEL-5a-2 (replay of a set with a UNION node
// rebuilds byte-identically) and SCN-KERNEL-5b-2 (the forced-head query is snapshot-free) against the
// author's fold() UNCHANGED. Data is the golden's own: a union node {e1,e2} sharing one nodeKey with two
// DISTINCT contentHashes, plus two disjoint nodeKeys eX,eY. Assertions are RELATIONAL / encoder-agnostic
// (byte-identity of the sorted serialization; the max-by-contentHash capability recomputed FROM the fold),
// never pinned to a golden digest. `head` itself is EPIC-3-b (out of scope), so 5b-2 is asserted at the
// fold-level invariant it rests on: the union node is reconstructed identically before/after snapshot drop,
// so any max-by-contentHash head derived from the fold is stable — here e2 (its ch sorts last).

import { describe, it, expect } from "vitest"
import type { Hash, NodeKey } from "@atlas/contracts"
import type { AtlasState, Cas, Event, EventLog } from "../src/types.js"
import { createLog } from "../src/log.js"
import { exportCas, importCas } from "../src/portable.js"
import { fold } from "../src/fold.js"

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

function serializeState(s: AtlasState): string {
  return JSON.stringify(
    [...s.keys()].sort().map((nk) => ({
      nodeKey: nk,
      entries: [...s.get(nk)!.entries.keys()].sort().map((ch) => s.get(nk)!.entries.get(ch)),
    })),
  )
}

function roundTripFromEmpty(log: EventLog): EventLog {
  const fresh = importCas(exportCas(log as unknown as Cas))
  const replay = createLog()
  let out: EventLog = new Map()
  for (const obj of fresh.values()) out = replay.append(obj as Event)
  return out
}

// The golden's set: UNION node `claim:acme-arr-2024` = {e1,e2} (one nodeKey, two DISTINCT contentHashes),
// eX/eY two disjoint nodeKeys. ch-e2 chosen to sort LAST so the max-by-contentHash head is e2.
const UNION = "claim:acme-arr-2024"
function unionLog(): EventLog {
  const log = createLog()
  log.append(ev("id-e1", UNION, "ch-e1-aaa", { v: 1 })) // union entry 1
  log.append(ev("id-e2", UNION, "ch-e2-zzz", { v: 2 })) // union entry 2 (ch sorts last ⇒ head)
  log.append(ev("id-eX", "nk-X", "ch-eX", { x: 1 })) // disjoint node X
  return log.append(ev("id-eY", "nk-Y", "ch-eY", { y: 1 })) // disjoint node Y
}

describe("GATE SCN-KERNEL-5a-2 — replay of a set with a union node rebuilds byte-identically (held-out)", () => {
  it("the union node {e1,e2} survives export→import→replay-from-empty byte-identically", () => {
    const L = unionLog()
    const B0 = serializeState(fold(L))
    const rebuilt = fold(roundTripFromEmpty(L))

    // byte-identical replay, union node included
    expect(serializeState(rebuilt)).toBe(B0)
    // non-triviality: exactly 3 node buckets, and the union node carries BOTH e1 and e2 (not a dropped one)
    expect(rebuilt.size).toBe(3)
    const union = rebuilt.get(UNION as NodeKey)!
    expect([...union.entries.keys()].sort()).toEqual(["ch-e1-aaa", "ch-e2-zzz"])
    // order-independence: reversed-insertion set folds byte-identically (a mutant last-writer collapses this)
    const rev = createLog()
    for (const e of [...L.values()].reverse()) rev.append(e)
    let revLog: EventLog = new Map()
    const r2 = createLog()
    for (const e of [...L.values()].reverse()) revLog = r2.append(e)
    expect(serializeState(fold(revLog))).toBe(B0)
  })
})

describe("GATE SCN-KERNEL-5b-2 — the forced-head query is snapshot-free (held-out)", () => {
  // head = the max-by-contentHash among FRESH, non-superseded entries — recomputed FROM the fold here,
  // since head() is EPIC-3-b (out of scope). The fold-level invariant under test: this capability is
  // stable across a snapshot drop because the union node is reconstructed identically.
  const headByContentHash = (s: AtlasState, nk: string): string | undefined =>
    [...(s.get(nk as NodeKey)?.entries.values() ?? [])]
      .filter((e) => e.fresh && e.supersedes.length === 0)
      .map((e) => e.contentHash as string)
      .sort()
      .at(-1)

  it("head(claim:acme-arr-2024) is identical before and after discarding the in-memory snapshot", () => {
    const L = unionLog()
    const before = headByContentHash(fold(L), UNION) // in-memory snapshot live
    const after = headByContentHash(fold(roundTripFromEmpty(L)), UNION) // snapshot discarded → pure replay

    expect(after).toBe(before) // snapshot-free: same head across the drop
    expect(before).toBe("ch-e2-zzz") // the forced head is e2 (its contentHash sorts last)
    // witness the head derives from a live 2-entry union (a head-cache mutant would still pass a generic
    // non-head query but must reflect BOTH entries being present before max-selection):
    expect(
      [
        ...fold(L)
          .get(UNION as NodeKey)!
          .entries.keys(),
      ].sort(),
    ).toEqual(["ch-e1-aaa", "ch-e2-zzz"])
  })
})
