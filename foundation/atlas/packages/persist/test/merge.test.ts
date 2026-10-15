// @atlas/persist — test/merge.test.ts  (WP-1.3-b.PERSIST)
//
// RED→GREEN transcription of the VISIBLE goldens for the git merge-driver (PERSIST-11): the driver unions
// the two event sets by content-hash + re-folds (never line-merges the log), colliding `seq` is never a
// conflict, a shared nodeKey resolves by the deterministic KERNEL-10 fold-merge (head = max-by-contentHash),
// the merge is direction-independent (byte-identical), the driver is self-installing, and a bypassed plain
// 3-way text merge degrades to a lossless id-union. Plus the ∀-law PROP-PERSIST-11 (merge-direction
// independence = the KERNEL-11 commutativity law at the git seam).
//
// `id-…`/`ch-…`/`nk-…` handles are SYMBOLIC — every assertion is RELATIONAL (union size, byte-identity of
// the serialized AtlasState, head-by-contentHash, degrade≡union), never pinned to a golden digest. The
// merge/fold/head/JSONL/lineMerge algebra is CONSUMED from the SEALED @atlas/kernel seam — never re-rolled.
// Held-out `-2` fixtures (SCN-PERSIST-11a-2 / 11g-2) are NOT transcribed here (GATE runs those).

import { describe, it, expect } from "vitest"
import fc from "fast-check"
import type { Hash, NodeKey } from "@atlas/contracts"
import type { Event, EventLog } from "@atlas/kernel"
import { fold, head, toJsonl, parseJsonl } from "@atlas/kernel"
import { serializeState } from "../src/reconstruct.js"
import {
  ATLAS_LOG_PATH,
  MERGE_DRIVER_NAME,
  degradeMerge,
  gitattributesEntry,
  mergeAtlas,
  mergeDriver,
  mergeDriverRegistration,
  setupHook,
} from "../src/merge.js"

/** Build one well-formed Event. `seq` is a LOCAL hint (outside the algebra); identity/entry keys symbolic. */
const ev = (id: string, node: string | undefined, ch: string, seq = 0, supersedes: string[] = []): Event => ({
  id: id as Hash,
  seq,
  // spread-in, not `nodeKey: undefined`: `Event.nodeKey?` is exactOptionalPropertyTypes-optional.
  ...(node === undefined ? {} : { nodeKey: node as NodeKey }),
  contentHash: ch as Hash,
  fresh: true,
  supersedes: supersedes as Hash[],
  payload: { ch },
})

/** Lift a flat event list into a content-keyed set (first-write-wins on id) — the array→set adapter. */
const set = (events: readonly Event[]): EventLog => {
  const m = new Map<Hash, Event>()
  for (const e of events) if (!m.has(e.id)) m.set(e.id, e)
  return m
}

// e1/e2 collide on the SAME nodeKey with DISTINCT contentHashes (`ch-7e40bb` > `ch-1c9f2a`); e3 an
// independent node. e2 shared-by-id across ours/theirs in the union fixture.
const e1 = ev("id-1c9f2a", "claim:acme-arr-2024", "ch-1c9f2a")
const e2 = ev("id-7e40bb", "claim:acme-arr-2024", "ch-7e40bb")
const e3 = ev("id-e3", "nk-3", "ch-e3")

describe("REQ-PERSIST-11-a — merge never line-merges the log (visible goldens)", () => {
  it("SCN-PERSIST-11a-1: the log path is handled by the registered driver (set-union + re-fold), not line-merged as text", () => {
    // `.gitattributes: <atlas-log> merge=orchestra-atlas` is registered for the log path.
    const attr = gitattributesEntry()
    expect(attr).toContain(ATLAS_LOG_PATH)
    expect(attr).toContain(`merge=${MERGE_DRIVER_NAME}`)

    // ours + theirs both modify the JSONL log path; the driver runs set-union + re-fold (no line splice).
    const oursJsonl = toJsonl(set([e1, e2]))
    const theirsJsonl = toJsonl(set([e2, e3]))
    const merged = mergeDriver(oursJsonl, theirsJsonl)
    const lines = merged.split("\n").filter((l) => l.trim().length > 0)

    // teeth (breaks-on "the log has no driver and git line-merges as text — a line from ours and a line from
    // theirs splice into one corrupt event"): every output line re-parses to exactly one whole event, and the
    // set is the id-union {e1,e2,e3} — no spliced/half line, nothing dropped.
    const reparsed = parseJsonl(merged)
    expect(lines.length).toBe(reparsed.length) // one whole event per line — no splice
    expect(new Set(reparsed.map((e) => e.id))).toEqual(new Set(["id-1c9f2a", "id-7e40bb", "id-e3"]))
  })
})

describe("REQ-PERSIST-11-b — driver unions by content-hash and re-folds (visible goldens)", () => {
  it("SCN-PERSIST-11b-1: the union of {e1,e2} and {e2,e3} is exactly {e1,e2,e3}, e2 deduped by id", () => {
    const merged = mergeAtlas(set([e1, e2]), set([e2, e3]))
    expect(merged.size).toBe(3) // e2 deduped by content-hash — nothing dropped or duplicated
    expect(new Set(merged.keys())).toEqual(new Set(["id-1c9f2a", "id-7e40bb", "id-e3"]))

    // teeth (breaks-on "the driver concatenates — e2 twice (size 4); or keeps one branch and drops e1"):
    expect(merged.size).not.toBe(4)
    expect(merged.has("id-1c9f2a" as Hash)).toBe(true)
  })
})

describe("REQ-PERSIST-11-c — colliding seq is never a conflict (visible goldens)", () => {
  it("SCN-PERSIST-11c-1: a cross-branch seq=5 collision (distinct ids) retains both events, never a conflict", () => {
    const a = ev("id-a7f0", "nk-a", "ch-a7f0", 5)
    const b = ev("id-c3d1", "nk-b", "ch-c3d1", 5) // same seq=5, distinct content id
    const merged = mergeAtlas(set([a]), set([b]))

    // teeth (breaks-on "colliding seq treated as a conflict — merge halts / collapses two seq=5 events to one
    // slot"): `seq` is outside the algebra, so both events are retained (size 2), no conflict.
    expect(merged.size).toBe(2)
    expect(new Set(merged.keys())).toEqual(new Set(["id-a7f0", "id-c3d1"]))
  })
})

describe("REQ-PERSIST-11-d — shared nodeKey resolves by fold-merge (visible goldens)", () => {
  it("SCN-PERSIST-11d-1: a nodeKey on both branches resolves by KERNEL-10 mergeNode; head = max-by-contentHash = e2", () => {
    const merged = mergeAtlas(set([e1]), set([e2])) // same nodeKey, distinct contentHashes
    const state = fold(merged)
    const node = state.get("claim:acme-arr-2024" as NodeKey)
    expect(node).toBeDefined()

    // entries = {1c9f2a, 7e40bb} (grow-only OR-Set, 0 dropped) — resolved by the deterministic fold-merge.
    expect(new Set(node!.entries.keys())).toEqual(new Set(["ch-1c9f2a", "ch-7e40bb"]))

    // teeth (breaks-on "the driver surfaces the shared nodeKey as a manual <<<<<<< conflict / a hand edit"):
    // head is the deterministic max-by-contentHash = e2 (`ch-7e40bb` > `ch-1c9f2a`), never by hand.
    expect(head(node!)?.id).toBe("id-7e40bb")
  })
})

describe("REQ-PERSIST-11-e — merge is direction-independent (visible goldens)", () => {
  it("SCN-PERSIST-11e-1: mergeAtlas(ours,theirs) ≡ mergeAtlas(theirs,ours) byte-identical (the reversible colliding pair)", () => {
    // e1/e2: same nodeKey, colliding seq=5 — the reversible colliding pair.
    const ours = set([ev("id-1c9f2a", "claim:acme-arr-2024", "ch-1c9f2a", 5)])
    const theirs = set([ev("id-7e40bb", "claim:acme-arr-2024", "ch-7e40bb", 5)])

    const forward = serializeState(fold(mergeAtlas(ours, theirs)))
    const reverse = serializeState(fold(mergeAtlas(theirs, ours)))

    // teeth (breaks-on "last-writer-wins by branch order — forward heads e2 while reverse heads e1, the two
    // directions diverge byte-wise"): both serialize to the SAME bytes (0 lost events, head = e2 both ways).
    expect(forward).toBe(reverse)
    expect(head(fold(mergeAtlas(ours, theirs)).get("claim:acme-arr-2024" as NodeKey)!)?.id).toBe("id-7e40bb")
    expect(head(fold(mergeAtlas(theirs, ours)).get("claim:acme-arr-2024" as NodeKey)!)?.id).toBe("id-7e40bb")
  })
})

describe("REQ-PERSIST-11-f — merge driver self-installing (visible goldens)", () => {
  it("SCN-PERSIST-11f-1: the setup hook registers the driver + .gitattributes entry with no manual step", () => {
    const setup = setupHook()
    // `git config merge.orchestra-atlas.driver` is registered...
    const reg = mergeDriverRegistration()
    expect(reg.key).toBe(`merge.${MERGE_DRIVER_NAME}.driver`)
    expect(reg.value.length).toBeGreaterThan(0)
    expect(setup.config).toEqual(reg)

    // ...and `.gitattributes` carries `<atlas-log> merge=orchestra-atlas`.
    expect(setup.gitattributes).toContain(ATLAS_LOG_PATH)
    expect(setup.gitattributes).toContain(`merge=${MERGE_DRIVER_NAME}`)

    // teeth (breaks-on "the driver needs a manual `git config` — a fresh clone leaves it unregistered and
    // silently falls back to text merge"): both the config registration AND the attributes entry are present.
    expect(setup.gitattributes).toBe(gitattributesEntry())
  })
})

describe("REQ-PERSIST-11-g — bypassed driver loses no event (visible goldens)", () => {
  it("SCN-PERSIST-11g-1: a plain 3-way text merge degrades to a lossless id-union — re-fold(lineMerge) ≡ fold(RefLog.merge)", () => {
    const oursJsonl = toJsonl(set([e1, e2])) // [line(e1), line(e2)]
    const theirsJsonl = toJsonl(set([e2, e3])) // [line(e2), line(e3)] — e2 shared

    const degraded = degradeMerge(oursJsonl, theirsJsonl) // dedup-by-id union (driver bypassed)
    const viaDriver = mergeAtlas(set([e1, e2]), set([e2, e3])) // the real RefLog.merge fold

    // no event lost/corrupted: worst case a harmless duplicate line the fold dedups by id.
    expect(new Set(degraded.keys())).toEqual(new Set(["id-1c9f2a", "id-7e40bb", "id-e3"]))

    // teeth (breaks-on "the log is a single nested JSON array line — the 3-way text merge splices e1 and e3
    // into one corrupt line and fold fails to parse"): re-fold(lineMerge) is byte-identical to fold(merge).
    expect(serializeState(fold(degraded))).toBe(serializeState(fold(viaDriver)))
  })
})

// ── PROP-PERSIST-11 — merge-direction independence at the git seam (the KERNEL-11 commutativity ∀-law) ──
//
// ∀ ours, theirs ∈ RefLog. mergeAtlas(ours, theirs) ≡ mergeAtlas(theirs, ours) byte-identical, where
// mergeAtlas = fold(RefLog.merge(ours, theirs)). Arbitrary RefLog pairs with shared + colliding events
// (incl. the reversible colliding pair). Transcribed from properties-pst.md §PROP-PERSIST-11.

/** Build one event FULLY determined by its discriminator `k` — id/contentHash co-vary through `k` (faithful
 *  content-addressing: distinct content ⇒ distinct id AND contentHash; equal `k` ⇒ the SAME event). A small
 *  nodeKey space forces same-nodeKey collisions (exercising `mergeNode`/`head`) and `seq` varies over a small
 *  set so colliding `seq` across branches is surfaced — `seq` being outside the algebra. Decoupling id from
 *  contentHash would fabricate a physically-impossible event, so it is deliberately NOT done. */
const build = (k: number): Event => ev(`id-${k}`, `nk-${k % 2}`, `ch-${k}`, k % 3)
const ksArb = fc.array(fc.integer({ min: 0, max: 9 }), { maxLength: 8 })
const logArb = ksArb.map((ks) => set(ks.map(build)))

describe("PROP-PERSIST-11 — merge-direction independence (∀-law)", () => {
  it("mergeAtlas(ours,theirs) ≡ mergeAtlas(theirs,ours) byte-identical over arbitrary RefLog pairs", () => {
    fc.assert(
      fc.property(logArb, logArb, (ours, theirs) => {
        const forward = serializeState(fold(mergeAtlas(ours, theirs)))
        const reverse = serializeState(fold(mergeAtlas(theirs, ours)))
        return forward === reverse
      }),
      { numRuns: 400 },
    )
  })

  it("mergeAtlas is idempotent (merge(a,a) folds byte-identical to fold(a)) and grow-only (no event dropped)", () => {
    fc.assert(
      fc.property(logArb, (a) => {
        const idem = serializeState(fold(mergeAtlas(a, a))) === serializeState(fold(a))
        const grow = mergeAtlas(a, a).size >= a.size
        return idem && grow
      }),
      { numRuns: 300 },
    )
  })

  it("mergeAtlas is associative over the fold — merge(merge(a,b),c) ≡ merge(a,merge(b,c))", () => {
    fc.assert(
      fc.property(logArb, logArb, logArb, (a, b, c) => {
        const left = serializeState(fold(mergeAtlas(mergeAtlas(a, b), c)))
        const right = serializeState(fold(mergeAtlas(a, mergeAtlas(b, c))))
        return left === right
      }),
      { numRuns: 300 },
    )
  })
})
