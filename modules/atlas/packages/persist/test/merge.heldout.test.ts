// @atlas/persist — test/merge.heldout.test.ts  (WP-1.3-b.PERSIST — HELD-OUT GATE)
//
// Anti-overfit teeth: compiles the HELD-OUT goldens SCN-PERSIST-11a-2 and SCN-PERSIST-11g-2
// (goldens-pst.md, held_out: true) into executable assertions against the EXISTING merge.ts.
// The builder was blinded to these. merge.ts is NOT modified. Handles are symbolic; every
// assertion is RELATIONAL (id-union, one-whole-event-per-line, byte-identity, head-by-contentHash).

import { describe, it, expect } from "vitest"
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
} from "../src/merge.js"

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

const set = (events: readonly Event[]): EventLog => {
  const m = new Map<Hash, Event>()
  for (const e of events) if (!m.has(e.id)) m.set(e.id, e)
  return m
}

// The same colliding fixture as the visible goldens: e1/e2 collide on one nodeKey with distinct
// contentHashes (ch-7e40bb > ch-1c9f2a ⇒ head = e2); e3 an independent node.
const e1 = ev("id-1c9f2a", "claim:acme-arr-2024", "ch-1c9f2a")
const e2 = ev("id-7e40bb", "claim:acme-arr-2024", "ch-7e40bb")
const e3 = ev("id-e3", "nk-3", "ch-e3")

describe("SCN-PERSIST-11a-2 (held-out) — a SECOND branch pair (feat/main) log path is not text/line-merged", () => {
  it("feat + main both modify the log path; the registered driver set-unions + re-folds — no line-splice, nothing dropped", () => {
    // Independent branch pair, independent event set (distinct from 11a-1): feat carries {e1,e3}, main {e3,e2}.
    // e3 shared across the pair; a distinct overlap partner from 11a-1 (which shared e2 over {e1,e2}/{e2,e3}).
    const attr = gitattributesEntry()
    expect(attr).toContain(ATLAS_LOG_PATH)
    expect(attr).toContain(`merge=${MERGE_DRIVER_NAME}`)

    const featJsonl = toJsonl(set([e1, e3]))
    const mainJsonl = toJsonl(set([e3, e2]))
    const merged = mergeDriver(featJsonl, mainJsonl)

    const lines = merged.split("\n").filter((l) => l.trim().length > 0)
    const reparsed = parseJsonl(merged)

    // teeth: no driver ⇒ git line-merges as text ⇒ a feat line + a main line splice into one corrupt event.
    // Every output line re-parses to exactly one whole event, and the set is the id-union {e1,e2,e3}.
    expect(lines.length).toBe(reparsed.length) // one whole event per line — no splice
    expect(new Set(reparsed.map((e) => e.id))).toEqual(new Set(["id-1c9f2a", "id-7e40bb", "id-e3"]))
    expect(reparsed.length).toBe(3) // e3 deduped by id — nothing dropped or duplicated
  })
})

describe("SCN-PERSIST-11g-2 (held-out) — a SECOND bypassed 3-way text merge degrades to a lossless id-union", () => {
  it("ours=[e1,e3], theirs=[e1,e2] (e1 shared) bypassed ⇒ dedup-by-id union {e1,e2,e3}, arr node head = e2", () => {
    const oursJsonl = toJsonl(set([e1, e3])) // [line(e1), line(e3)]
    const theirsJsonl = toJsonl(set([e1, e2])) // [line(e1), line(e2)] — e1 shared

    const degraded = degradeMerge(oursJsonl, theirsJsonl) // driver bypassed → line-union deduped by id
    const viaDriver = mergeAtlas(set([e1, e3]), set([e1, e2])) // the real RefLog.merge fold

    // dedup-by-id union = {e1,e2,e3}, nothing lost, e1 not duplicated.
    expect(new Set(degraded.keys())).toEqual(new Set(["id-1c9f2a", "id-7e40bb", "id-e3"]))
    expect(degraded.size).toBe(3)

    // the claim:acme-arr-2024 node = union {ch-1c9f2a, ch-7e40bb}, head = max-by-contentHash = e2.
    const node = fold(degraded).get("claim:acme-arr-2024" as NodeKey)
    expect(node).toBeDefined()
    expect(new Set(node!.entries.keys())).toEqual(new Set(["ch-1c9f2a", "ch-7e40bb"]))
    expect(head(node!)?.id).toBe("id-7e40bb") // max-by-contentHash head preserved on the independent line set

    // teeth: single nested-array line ⇒ text merge splices e2/e3 into one corrupt line and fold fails.
    // Instead re-fold(lineMerge) is byte-identical to fold(RefLog.merge).
    expect(serializeState(fold(degraded))).toBe(serializeState(fold(viaDriver)))
  })
})
