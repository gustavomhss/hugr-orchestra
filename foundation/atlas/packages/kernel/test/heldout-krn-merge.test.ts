// @atlas/kernel — test/heldout-krn-merge.test.ts  (COLD-REVIEW GATE — held-out leg, WP-1.3-b.KERNEL)
//
// Authored by the MICROSCOPE cold-review seat WITHOUT the author's conversation, from the FROZEN held-out
// `-2` fixtures (goldens-krn.md, held_out:true) + a re-witness of the PBT-only ∀-laws with GENUINELY
// INDEPENDENT concrete data (different contentHashes / nodeKeys than the author's visible fixtures). Tests
// the UNCHANGED author src (fold.ts merge/mergeNode/head + jsonl.ts). An overfit that hard-codes fixture-1's
// answer must fail here.
//   held-out -2:  SCN-KERNEL-12b-2 (disjoint add/add, NO shared line) · SCN-KERNEL-12c-2 (counter-keyed line)
//   PBT re-witness (held_out:n/a, subsumed by ∀-gen upstream): 10a/10b/10c union+head · 11 convergence

import { describe, it, expect } from "vitest"
import type { Hash, NodeKey } from "@atlas/contracts"
import type { AtlasState, Event, EventLog, Node } from "../src/types.js"
import { createLog, eventId, combine } from "../src/log.js"
import { fold, merge, mergeNode, head } from "../src/fold.js"
import { toJsonl, parseJsonl, lineMerge, isContentKeyed } from "../src/jsonl.js"

// independent builders (do not reuse the author's test helpers)
const ev = (
  nodeKey: string | undefined,
  ch: string,
  payload: unknown,
  opts: { fresh?: boolean; supersedes?: string[]; seq?: number } = {},
): Event => {
  // spread-in, not `nodeKey: undefined`: `Event.nodeKey?` is exactOptionalPropertyTypes-optional. The two
  // forms are id-IDENTICAL (canonical.ts drops undefined-valued keys before sorting the preimage).
  const content: Omit<Event, "id"> = {
    seq: opts.seq ?? 0,
    ...(nodeKey === undefined ? {} : { nodeKey: nodeKey as NodeKey }),
    contentHash: ch as Hash,
    fresh: opts.fresh ?? true,
    supersedes: (opts.supersedes ?? []).map((s) => s as Hash),
    payload,
  }
  return { ...content, id: eventId(content) }
}
const mkNode = (nk: string, es: readonly Event[]): Node => ({
  nodeKey: nk as NodeKey,
  entries: new Map(es.map((e) => [e.contentHash, e])),
})
const logOf = (es: readonly Event[]): EventLog => {
  const l = createLog()
  let out: EventLog = new Map()
  for (const e of es) out = l.append(e)
  return out
}
const serNode = (n: Node): string =>
  JSON.stringify({ nk: n.nodeKey, e: [...n.entries.keys()].sort().map((h) => n.entries.get(h)) })
const serState = (s: AtlasState): string => JSON.stringify([...s.keys()].sort().map((nk) => serNode(s.get(nk)!)))

// independent data universe — NONE of the author's handles (no 1c9f2a/7e40bb/acme-arr-2024)
const NK = "claim:globex-headcount-q3"

// ── GATE SCN-KERNEL-12b-2 — disjoint add/add conflict hunk still degrades to a lossless union (held-out) ──
describe("GATE SCN-KERNEL-12b-2 — NO shared line: disjoint add/add unions losslessly", () => {
  it("re-fold(lineMerge(ours,theirs)) ≡ fold(RefLog.merge); {e1,eX,eY,e3} all four retained", () => {
    const e1 = ev(NK, "zz-alpha", { v: 1 })
    const eX = ev(NK, "mm-bravo", { v: 2 })
    const eY = ev("claim:globex-hq", "kk-charlie", { v: 3 })
    const e3 = ev("claim:globex-hq", "aa-delta", { v: 4 })
    const ours = toJsonl(logOf([e1, eX])) // [line(e1), line(eX)]
    const theirs = toJsonl(logOf([eY, e3])) // [line(eY), line(e3)] — NO overlap with ours

    const merged = lineMerge(ours, theirs)
    const reFold = serState(fold(logOf(merged)))
    const refFold = serState(fold(combine(logOf([e1, eX]), logOf([eY, e3]))))

    expect(reFold).toBe(refFold) // disjoint union ≡ RefLog.merge fold
    expect(new Set(merged.map((e) => e.id)).size).toBe(4) // all four distinct — 0 dropped (ours-wins would lose eY,e3)
    // both nodeKeys present with their full entry sets
    const st = fold(logOf(merged))
    expect(st.get(NK as NodeKey)!.entries.size).toBe(2) // {e1,eX}
    expect(st.get("claim:globex-hq" as NodeKey)!.entries.size).toBe(2) // {eY,e3}
  })
})

// ── GATE SCN-KERNEL-12c-2 — a counter-keyed line fails the content-keyed predicate (held-out) ────────────
describe("GATE SCN-KERNEL-12c-2 — content-keyed predicate: eventId(parse(L)) == parse(L).id", () => {
  it("genuine content-keyed {eX,eY,e3} pass; a counter-keyed line (id = appended position) fails", () => {
    const eX = ev("claim:globex-hq", "p-uno", { v: 1 })
    const eY = ev("claim:globex-hq", "q-dos", { v: 2 })
    const e3 = ev("claim:globex-ap", "r-tres", { v: 3 })
    const text = toJsonl(logOf([eX, eY, e3]))
    const lines = text.split("\n")
    expect(lines.length).toBe(3) // one event per line, append-only

    for (const line of lines) {
      const parsed = JSON.parse(line) as Event
      expect(isContentKeyed(parsed)).toBe(true)
      expect(eventId(parsed)).toBe(parsed.id) // stored id IS the content hash
    }

    // teeth: a line keyed by an appended counter / seq instead of content — id ≠ eventId(content)
    const counterKeyed: Event = { ...eX, id: "line-0001" as Hash }
    expect(isContentKeyed(counterKeyed)).toBe(false) // predicate catches the non-content key
    expect(eventId(counterKeyed)).not.toBe(counterKeyed.id)
  })
})

// ── PBT re-witness (10a/10b/10c) — MAX-by-contentHash head + no-drop union, INDEPENDENT concrete data ────
describe("GATE re-witness KERNEL-10 — union + MAX-by-contentHash head (independent data)", () => {
  it("mergeNode is commutative + 0-dropped; head = MAX-by-contentHash among FRESH ∧ ¬superseded", () => {
    // three fresh entries; MAX contentHash is "gg-high" (> "cc-mid" > "aa-low" lexicographically)
    const lo = ev(NK, "aa-low", { v: 1 })
    const mid = ev(NK, "cc-mid", { v: 2 })
    const hi = ev(NK, "gg-high", { v: 3 })

    const ab = mergeNode(mkNode(NK, [lo, mid]), mkNode(NK, [hi]))
    const ba = mergeNode(mkNode(NK, [hi]), mkNode(NK, [lo, mid]))
    expect(serNode(ab)).toBe(serNode(ba)) // commutative
    expect(ab.entries.size).toBe(3) // 0 dropped

    expect(head(ab)?.contentHash).toBe("gg-high") // MAX, not min (min would be aa-low)
    expect(head(ab)?.contentHash).not.toBe("aa-low")

    // 10c: head invariant under reseq (seq is a pure content perturbation, never a selection key)
    const reseqed = mkNode(NK, [
      ev(NK, "aa-low", { v: 1 }, { seq: 900 }),
      ev(NK, "cc-mid", { v: 2 }, { seq: 3 }),
      ev(NK, "gg-high", { v: 3 }, { seq: 41 }),
    ])
    expect(head(reseqed)?.contentHash).toBe("gg-high") // unchanged under reseq/reclock

    // FRESH-only + supersede arm: if the MAX is stale OR superseded, the next eligible wins.
    const staleMax = mkNode(NK, [lo, mid, ev(NK, "gg-high", { v: 3 }, { fresh: false })])
    expect(head(staleMax)?.contentHash).toBe("cc-mid") // stale gg-high excluded → cc-mid
    const supersededMax = mkNode(NK, [
      lo,
      mid,
      ev(NK, "gg-high", { v: 3 }),
      ev(NK, "zz-tomb", { v: 9 }, { supersedes: ["gg-high"] }),
    ])
    // zz-tomb (fresh, MAX overall) supersedes gg-high; head is zz-tomb, and gg-high is excluded
    expect(head(supersededMax)?.contentHash).toBe("zz-tomb")
    const supNoTomb = mkNode(NK, [
      lo,
      mid,
      ev(NK, "gg-high", { v: 3 }, { fresh: false }),
      ev(NK, "bb-x", { v: 8 }, { supersedes: ["gg-high"] }),
    ])
    expect(head(supNoTomb)?.contentHash).toBe("cc-mid") // gg-high stale AND superseded → cc-mid is MAX-eligible
  })
})

// ── PBT re-witness (11) — convergent commutative+associative fold, INDEPENDENT concrete data ─────────────
describe("GATE re-witness KERNEL-11 — convergent fold under permutation/re-batch/union (independent data)", () => {
  it("fold is order-independent + merge commutative/associative/idempotent (byte-identical)", () => {
    const a = ev(NK, "aa-low", { v: 1 })
    const b = ev(NK, "gg-high", { v: 2 }) // collides with a on NK
    const c = ev("claim:globex-hq", "hq-1", { v: 3 })
    const d = ev("claim:globex-ap", "ap-1", { v: 4 })
    const base = serState(fold(logOf([a, b, c, d])))

    expect(serState(fold(logOf([d, c, b, a])))).toBe(base) // permutation (reverse)
    expect(serState(fold(logOf([b, a, d, c])))).toBe(base) // colliding pair reversed
    expect(serState(fold(merge(logOf([b, c]), logOf([a, d]))))).toBe(base) // re-batched branch-union
    expect(serState(fold(merge(logOf([a, b, c, d]), logOf([a, b, c, d]))))).toBe(base) // idempotent S∪S=S

    // associativity on disjoint id spaces
    const x = logOf([a, b])
    const y = logOf([c])
    const z = logOf([d])
    expect(serState(fold(merge(merge(x, y), z)))).toBe(serState(fold(merge(x, merge(y, z)))))
    // commutativity
    expect(serState(fold(merge(x, y)))).toBe(serState(fold(merge(y, x))))

    // the collision node keeps both + surfaces MAX head in every ordering
    for (const L of [
      [a, b, c, d],
      [b, a, d, c],
    ]) {
      const n = fold(logOf(L)).get(NK as NodeKey)!
      expect(n.entries.size).toBe(2)
      expect(head(n)?.contentHash).toBe("gg-high") // MAX(aa-low, gg-high)
    }
  })
})
