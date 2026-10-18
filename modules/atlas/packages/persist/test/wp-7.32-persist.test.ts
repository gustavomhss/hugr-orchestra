// @atlas/persist — test/wp-7.32-persist.test.ts  (WP-7.32.PERSIST · EPIC-32 · atlas-diff version-delta)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the version-delta = read-only fold-diff
// (PERSIST-14 a–f, goldens-pst.md:885-961). `diff(shaA,shaB) = partition(fold(shaA), fold(shaB))`: a
// deterministic, READ-ONLY fold-comparison over two folded AtlasStates that partitions the changed facts
// into {added, edited, superseded, decayed}, each entry carrying its provenance — 0 mutation, byte-
// identical across runs, well-defined regardless of fold/event order. The fold/head algebra is the SEALED
// @atlas/kernel oracle (`fold`/`head`) — never re-implemented here. Facet imported DIRECTLY from ../src/*
// (the barrel is wired by the lead at SEAL). Golden ids/hashes are SYMBOLIC (mint via the sealed `asHash`/
// `asNodeKey` seam). Held-out `-2` legs (14c-2 / 14d-2) are NOT transcribed.

import { describe, it, expect } from "vitest"
import { asHash, asNodeKey } from "@atlas/kernel"
import type { Event, EventLog } from "@atlas/kernel"
// `NodeKey` is a @atlas/contracts type; @atlas/kernel does not re-export it. It was imported from
// @atlas/kernel here, which esbuild erased as a type-only import — so the suite never saw the bad specifier.
import type { Hash, NodeKey } from "@atlas/contracts"
import type { DiffApi } from "../src/diff.js"
import type { VersionDelta, VersionDeltaEntry } from "../src/types.js"
import { createDiff, serializeDelta } from "../src/diff.js"

// ---- fixture builders (SYMBOLIC ids; the concrete two-version universe of goldens-pst.md:871-883) --------

interface Opts {
  readonly value?: string
  readonly prov?: string
  readonly fresh?: boolean
  readonly supersedes?: readonly string[]
  readonly seq?: number
}

/** Mint one folded-in event through the sealed brand seam (no hand-rolled hash). `contentHash` is the
 *  OR-Set entry key the kernel `fold`/`head` resolve on; `payload.prov` is the persist-local provenance. */
function ev(nodeKey: string, contentHash: string, o: Opts = {}): Event {
  return {
    id: asHash(`id-${contentHash}`),
    seq: o.seq ?? 0,
    nodeKey: asNodeKey(nodeKey),
    contentHash: asHash(contentHash),
    fresh: o.fresh ?? true,
    supersedes: (o.supersedes ?? []).map(asHash),
    payload: { value: o.value, prov: o.prov },
  }
}

/** Assemble a content-keyed EventLog from a flat stream (insertion order = the arg order — used to shuffle). */
function log(...events: readonly Event[]): EventLog {
  const m = new Map<Hash, Event>()
  for (const e of events) m.set(e.id, e)
  return m
}

// The two folded versions A (shaA) and B (shaB). B ⊇ A (append-only event SET); every re-grounding /
// supersede / decay is a NEW content-addressed event, never an in-place mutation of an A-event.
const K = {
  arr: "claim:acme-arr-2024",
  ceo: "claim:acme-ceo",
  vp: "claim:acme-vp",
  ttl: "pred:auth-token-ttl",
  hq19: "claim:acme-hq-2019",
  hq: "claim:acme-hq",
} as const

// shaA events (the "before" set).
const A_EVENTS: readonly Event[] = [
  ev(K.arr, "arr-v1", { value: "$4.2M", prov: "WP-a0@sha" }), // edited-from
  ev(K.ttl, "ttl-v1", { value: "v1", prov: "WP-a1@sha" }), // superseded-from
  ev(K.hq19, "hq19-v1", { value: "present", prov: "WP-a3@sha" }), // decayed-from
  ev(K.hq, "hq-nyc", { value: "NYC", prov: "WP-a6@sha" }), // unchanged
]

// shaB events = A_EVENTS ∪ the lifecycle deltas.
const B_DELTA: readonly Event[] = [
  ev(K.arr, "arr-v2", { value: "$4.5M", prov: "WP-a2@sha" }), // edited: re-grounding wins by max-contentHash
  ev(K.ceo, "ceo-v1", { value: "Jane Roe", prov: "WP-a4@sha" }), // added
  ev(K.vp, "vp-v1", { value: "Bob Lee", prov: "WP-a5@sha" }), // added
  ev(K.ttl, "ttl-v2", { value: "v2", prov: "WP-a7@sha", supersedes: ["ttl-v1"] }), // superseded
  ev(K.hq19, "hq19-decay", { prov: "WP-a9@sha", fresh: false, supersedes: ["hq19-v1"] }), // decayed
]

const SHA_A = asHash("sha-A")
const SHA_B = asHash("sha-B")

/** A read-only two-version store: sha → EventLog. `diff` only ever reads it. */
function makeStore(a: readonly Event[], b: readonly Event[]): Map<Hash, EventLog> {
  return new Map<Hash, EventLog>([
    [SHA_A, log(...a)],
    [SHA_B, log(...b)],
  ])
}

const nodeKeysOf = (xs: readonly VersionDeltaEntry[]): string[] =>
  xs.map((e) => (e.fact as { nodeKey: NodeKey }).nodeKey as string)

// ======================================================================================================
// REQ-PERSIST-14-a — version-delta partitioned by lifecycle   (SCN-PERSIST-14a-1, happy)
// ======================================================================================================
describe("PERSIST-14-a — diff partitions changed facts into the four lifecycle classes", () => {
  it("SCN-PERSIST-14a-1: {added:[ceo,vp], edited:[arr], superseded:[ttl], decayed:[hq19]}, hq unchanged", () => {
    const store = makeStore(A_EVENTS, [...A_EVENTS, ...B_DELTA])
    const diff: DiffApi = createDiff((sha) => store.get(sha) ?? new Map())
    const d = diff.diff(SHA_A, SHA_B)

    // a total, disjoint partition — superseded is NOT collapsed into edited, decayed is NOT dropped (teeth).
    expect(nodeKeysOf(d.added)).toEqual([K.ceo, K.vp])
    expect(nodeKeysOf(d.edited)).toEqual([K.arr])
    expect(nodeKeysOf(d.superseded)).toEqual([K.ttl])
    expect(nodeKeysOf(d.decayed)).toEqual([K.hq19])
    // the unchanged fact is in 0 partitions.
    const all = [...d.added, ...d.edited, ...d.superseded, ...d.decayed]
    expect(nodeKeysOf(all)).not.toContain(K.hq)
    // disjoint: each changed nodeKey appears in exactly one class.
    expect(new Set(nodeKeysOf(all)).size).toBe(all.length)
  })
})

// ======================================================================================================
// REQ-PERSIST-14-b — delta is a fold-comparison, not a stored diff   (SCN-PERSIST-14b-1, happy)
// ======================================================================================================
describe("PERSIST-14-b — delta is recomputed from the two folds, never a materialized diff", () => {
  it("SCN-PERSIST-14b-1: diff ≡ partition over the on-the-fly folds (no stored diff blob to drift)", () => {
    // no `delta` blob exists anywhere — only the event logs at shaA/shaB. The store holds ZERO diff object.
    const store = makeStore(A_EVENTS, [...A_EVENTS, ...B_DELTA])
    for (const l of store.values()) for (const e of l.values()) expect(e.payload).not.toHaveProperty("delta")
    const diff = createDiff((sha) => store.get(sha) ?? new Map())
    const d = diff.diff(SHA_A, SHA_B)
    // the partition is produced by comparing the two folded AtlasStates on the fly (5 changed facts).
    expect(d.added.length + d.edited.length + d.superseded.length + d.decayed.length).toBe(5)
  })
})

// ======================================================================================================
// REQ-PERSIST-14-c — every delta entry carries its provenance   (SCN-PERSIST-14c-1, guard)
// ======================================================================================================
describe("PERSIST-14-c — a provenance-less entry never surfaces in the delta", () => {
  it("SCN-PERSIST-14c-1: every surfaced entry carries its prov (entriesMissingProvenance == 0)", () => {
    const store = makeStore(A_EVENTS, [...A_EVENTS, ...B_DELTA])
    const diff = createDiff((sha) => store.get(sha) ?? new Map())
    const d = diff.diff(SHA_A, SHA_B)
    const all = [...d.added, ...d.edited, ...d.superseded, ...d.decayed]
    const missing = all.filter((e) => e.provenance === undefined || e.provenance === "")
    expect(missing.length).toBe(0)
    // teeth: the `edited:[acme-arr-2024]` entry traces to its WP (not a bare, provenance-less entry).
    expect(d.edited[0]?.provenance).toBe("WP-a2@sha")
    expect(d.superseded[0]?.provenance).toBe("WP-a7@sha")
    expect(d.decayed[0]?.provenance).toBe("WP-a9@sha")
    expect(nodeKeysOf(d.added)).toEqual([K.ceo, K.vp])
    expect(d.added.map((e) => e.provenance)).toEqual(["WP-a4@sha", "WP-a5@sha"])
  })
})

// ======================================================================================================
// REQ-PERSIST-14-d — diff is a pure read, zero mutation   (SCN-PERSIST-14d-1, guard)
// ======================================================================================================
describe("PERSIST-14-d — computing the diff mutates no Atlas state", () => {
  it("SCN-PERSIST-14d-1: store bytes Σ are byte-identical before/after the diff (mutations == 0)", () => {
    const store = makeStore(A_EVENTS, [...A_EVENTS, ...B_DELTA])
    const snap = (): string => {
      const rows: Record<string, unknown> = {}
      for (const [sha, l] of store) rows[sha as string] = [...l.values()]
      return JSON.stringify(rows)
    }
    const before = snap()
    const diff = createDiff((sha) => store.get(sha) ?? new Map())
    diff.diff(SHA_A, SHA_B)
    const after = snap()
    // the diff writes/archives/decays nothing — no `lastDiffedAt` marker, no in-place archive.
    expect(after).toBe(before)
    expect(store.size).toBe(2)
  })
})

// ======================================================================================================
// REQ-PERSIST-14-e — diff is byte-identical across runs   (SCN-PERSIST-14e-1, guard)
// ======================================================================================================
describe("PERSIST-14-e — the same two shas diff to the same bytes twice", () => {
  it("SCN-PERSIST-14e-1: two runs serialize byte-identically; the 2-elt added[] is in nodeKey order", () => {
    const store = makeStore(A_EVENTS, [...A_EVENTS, ...B_DELTA])
    const diff = createDiff((sha) => store.get(sha) ?? new Map())
    const s1 = serializeDelta(diff.diff(SHA_A, SHA_B))
    const s2 = serializeDelta(diff.diff(SHA_A, SHA_B))
    expect(s1).toBe(s2)
    // teeth: `added:[acme-ceo, acme-vp]` is emitted in canonical nodeKey order, NOT wall-clock discovery.
    const d = diff.diff(SHA_A, SHA_B)
    expect(nodeKeysOf(d.added)).toEqual([K.ceo, K.vp])
  })
})

// ======================================================================================================
// REQ-PERSIST-14-f — well-defined regardless of fold/event order   (SCN-PERSIST-14f-1, guard)
// ======================================================================================================
describe("PERSIST-14-f — shuffling either side fold order leaves the delta byte-identical", () => {
  it("SCN-PERSIST-14f-1: partition(fold(shuffle S1), fold(shuffle S2)) ≡ partition(fold S1, fold S2)", () => {
    const canonical = makeStore(A_EVENTS, [...A_EVENTS, ...B_DELTA])
    const rev = <T>(xs: readonly T[]): T[] => [...xs].reverse()
    const shuffled = makeStore(rev(A_EVENTS), rev([...A_EVENTS, ...B_DELTA]))
    const dCanonical = createDiff((s) => canonical.get(s) ?? new Map()).diff(SHA_A, SHA_B)
    const dShuffled = createDiff((s) => shuffled.get(s) ?? new Map()).diff(SHA_A, SHA_B)
    // the diff keys on the SET (KERNEL-11), not the arrival/commit order — reordered delta is identical.
    expect(serializeDelta(dShuffled)).toBe(serializeDelta(dCanonical))
    expect(nodeKeysOf(dShuffled.edited)).toEqual([K.arr])
  })
})
