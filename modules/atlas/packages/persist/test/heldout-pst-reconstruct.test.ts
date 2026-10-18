// @atlas/persist — test/heldout-pst-reconstruct.test.ts  (COLD-REVIEW GATE · MICROSCOPE seat)
//
// HELD-OUT leg for WP-1.2-b.PERSIST. The 9 visible SCNs (2a/2b/2c, 5a-5d, 12a/12b) are `gen: PBT`
// and carry NO literal `-2` golden (the `-2` held-outs in goldens-pst.md all belong to the SIBLING
// `gen: conformance` reference-model WPs — PERSIST-1/3/4/6/7/8/9/…). So this file re-witnesses the
// SAME REQ-PERSIST-2/5/12 ∀-laws with fixtures STRUCTURALLY DIFFERENT from the author's (fresh
// nodeKeys, a 3-way collision, a multi-event rewind, non-linear commit layouts) — purely RELATIONAL,
// never pinned to a golden digest. Run against author `src` UNCHANGED. Overfit ⇒ these fail.

import { describe, it, expect } from "vitest"
import type { Hash, NodeKey } from "@atlas/contracts"
import type { AtlasState, Event, EventLog } from "@atlas/kernel"
import { fold } from "@atlas/kernel"
import {
  archive,
  collect,
  del,
  forget,
  mergeArchive,
  reconstruct,
  replayFromExport,
  respawn,
  rewind,
  serializeState,
} from "../src/reconstruct.js"

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
const set = (events: readonly Event[]): EventLog => {
  const m = new Map<Hash, Event>()
  for (const e of events) if (!m.has(e.id)) m.set(e.id, e)
  return m
}
const bucket = (s: AtlasState, nk: string): string[] => [...(s.get(nk as NodeKey)?.entries.keys() ?? [])].sort()

// Fresh, independent fixtures (NOT the author's e1/e2/e3 · claim:acme-arr-2024).
// THREE-way collision on `node:beta` (g,h,i) + a non-forming event `x` (no nodeKey) + a lone node `w`.
const g = ev("id-g", "node:beta", "ch-b1", { rev: "a" })
const h = ev("id-h", "node:beta", "ch-b2", { rev: "b" })
const i = ev("id-i", "node:beta", "ch-b3", { rev: "c" }) // 3rd colliding entry
const w = ev("id-w", "node:solo", "ch-w0", { note: "lone" })
const x = ev("id-x", undefined, "ch-x0", { meta: "non-forming" }) // nodeKey-less ⇒ not projected
const S = set([g, h, i, w, x])

describe("GATE REQ-PERSIST-2 — fold-of-the-set, snapshot/history-free (held-out)", () => {
  it("2a′: replay-from-empty is byte-identical to the live fold (independent 3-way set)", () => {
    const base = serializeState(fold(S))
    expect(serializeState(replayFromExport(S))).toBe(base) // fold(replay(export(S))) ≡ fold(S)
    // the lone node survives a from-empty rebuild (not snapshot-truncated):
    expect(serializeState(replayFromExport(S))).toContain("node:solo")
  })

  it("2b′: a 3-way collision unions ALL entries, order-independent (no last-writer-wins)", () => {
    const forward = serializeState(fold(set([g, h, i, w])))
    const shuffled = serializeState(fold(set([i, w, g, h]))) // arbitrary arrival order
    expect(shuffled).toBe(forward) // convergent bytes across the reorder
    // the collision node carries all THREE distinct contentHashes (a LWW fold would keep one):
    expect(bucket(fold(set([i, w, g, h])), "node:beta")).toEqual(["ch-b1", "ch-b2", "ch-b3"])
  })

  it("2c′: a non-nodeKey event never forms a node; answer stable snapshot-drop vs reorder", () => {
    const live = serializeState(fold(S))
    const dropped = serializeState(replayFromExport(S))
    const reordered = serializeState(fold(set([w, i, x, h, g])))
    expect(dropped).toBe(live)
    expect(reordered).toBe(live)
    // x contributed no bucket (nodeKey-less), and the collision query is non-vacuous:
    expect(fold(S).has("ch-x0" as unknown as NodeKey)).toBe(false)
    expect(bucket(fold(S), "node:beta")).toEqual(["ch-b1", "ch-b2", "ch-b3"])
  })
})

describe("GATE REQ-PERSIST-5 — nothing dies (held-out, independent entries)", () => {
  const m1 = ev("id-m1", "mem:note", "ch-m1", { body: "first" })
  const m2 = ev("id-m2", "mem:note", "ch-m2", { body: "second" }) // supersedes m1
  const m3 = ev("id-m3", "know:rule", "ch-m3", { body: "rule" })

  it("5a′: del is a no-op — archive never shrinks (multi-entry archive)", () => {
    let A: EventLog = new Map()
    A = archive(A, m1)
    A = archive(A, m3)
    const before = A.size
    const after = del(A, m1)
    for (const id of A.keys()) expect(after.has(id)).toBe(true)
    expect(after.size).toBeGreaterThanOrEqual(before)
    expect(after.has("id-m1" as Hash)).toBe(true)
  })

  it("5b′: supersede archives both; merge(A,A) ≡ A (dedup-idempotent, loses nothing)", () => {
    let A: EventLog = new Map()
    A = archive(A, m1)
    A = archive(A, m2) // m1 retained despite being superseded
    expect(A.has("id-m1" as Hash)).toBe(true)
    expect(A.has("id-m2" as Hash)).toBe(true)
    const rerun = mergeArchive(A, A)
    expect([...rerun.keys()].sort()).toEqual([...A.keys()].sort())
    expect(rerun.size).toBe(A.size)
  })

  it("5c′: a superseded entry round-trips byte-identically (no lossy digest)", () => {
    const A = archive(new Map() as EventLog, m1)
    const revived = respawn(A, m1)
    expect(revived).not.toBeNull()
    expect(revived).toEqual(m1) // full entry, not a digest
    expect(revived!.payload).toEqual({ body: "first" })
    expect(respawn(new Map() as EventLog, m1)).toBeNull() // total: absent ⇒ null
  })

  it("5d′: forget prunes the active set only; the grow-only archive is untouched", () => {
    const active = set([m1, m2, m3])
    const arch = archive(new Map() as EventLog, m1)
    const after = forget(active, m1)
    expect(after.has("id-m1" as Hash)).toBe(false) // gone from active
    expect(after.has("id-m2" as Hash)).toBe(true) // siblings intact
    expect(after.has("id-m3" as Hash)).toBe(true)
    expect(arch.has("id-m1" as Hash)).toBe(true) // archive unchanged
    expect(respawn(arch, m1)).toEqual(m1) // still re-spawnable
  })
})

describe("GATE REQ-PERSIST-12 — reorder invariance on non-linear history (held-out)", () => {
  it("12a′: rebase re-parenting the 3-way collision leaves AtlasState byte-identical", () => {
    // same event SET carried across DIFFERENT commit layouts / parentage.
    const original = reconstruct([[g], [h], [i], [w]])
    const rebased = reconstruct([
      [w, i],
      [h, g],
    ]) // reversed & re-clustered into 2 commits
    const cherry = reconstruct([[i, w, h, g]]) // all squashed into one commit
    expect(serializeState(rebased)).toBe(serializeState(original))
    expect(serializeState(cherry)).toBe(serializeState(original))
    expect(bucket(rebased, "node:beta")).toEqual(["ch-b1", "ch-b2", "ch-b3"])
    // collect() is genuinely the union of ALL commits (not just one):
    expect(collect([[g, h], [i], [w]]).size).toBe(4)
  })

  it("12b′: rewinding a MULTI-event PR = fold(S \\ P), order/parentage-independent", () => {
    const full = set([g, h, i, w])
    const P = [h, i] // a 2-event PR removed from the 3-way collision node
    const rewound = rewind(full, P)
    const expected = serializeState(fold(set([g, w])))
    expect(serializeState(rewound)).toBe(expected)
    // only g's entry survives in the collision node; h & i are gone:
    expect(bucket(rewound, "node:beta")).toEqual(["ch-b1"])
    // rewinding an event that isn't present is a harmless identity:
    expect(serializeState(rewind(full, [x]))).toBe(serializeState(fold(full)))
  })
})
