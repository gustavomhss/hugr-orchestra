// @atlas/kernel — test/merge-fold.test.ts  (WP-1.3-b.KERNEL)
//
// RED→GREEN transcription of the VISIBLE FSPEC-merge goldens SCN-KERNEL-10a-1 / 10b-1 / 10c-1 / 11-1 /
// 12b-1 / 12c-1 plus the FORMAL ∀-cluster PROP-KERNEL-10 (order-independent union + contentHash-alone
// tie-break) and PROP-KERNEL-11 (convergent commutative fold). All contentHash / nodeKey handles are
// SYMBOLIC — assertions are RELATIONAL / law-level (commutative · associative · idempotent · convergent ·
// no-drop · head = MAX-by-contentHash), never pinned to a golden digest. Identity / set-union / the base
// fold are CONSUMED from the sealed seam (eventId · combine · fold), never re-rolled here.
//
// SCN-KERNEL-12a-1 (self-installing merge driver) is `gen: residue` — it has NO pure-function oracle and is
// delegated to the PERSIST-11 integration test; it is recorded UNAVAILABLE (`it.todo`) below, never faked.
// Held-out `-2` fixtures (12b-2 disjoint add/add, 12c-2 counter-keyed) are NOT transcribed (GATE-only).

// The pinned convergence counterexamples (W1 `fresh`, W2 `seq`) live in `fold-convergence.test.ts`; the
// builders are shared through `event-builders.ts` so the two files cannot drift.
import { describe, it, expect } from "vitest"
import fc from "fast-check"
// `Node` is imported EXPLICITLY: with `lib` unset the DOM globals are in scope, so an un-imported `Node`
// silently resolves to lib.dom's `Node` — which is what the two annotations below were actually checked
// against before this file was typechecked at all.
import type { Event, Node } from "../src/types.js"
import { combine, eventId } from "../src/log.js"
import { fold, merge, mergeNode, head } from "../src/fold.js"
import { toJsonl, parseJsonl, lineMerge, isContentKeyed } from "../src/jsonl.js"
import { mkEvent, node, logOf, serNode, serState, nodeAt, ARR } from "./event-builders.js"

// ── SCN-KERNEL-10a-1 — two events on one nodeKey union into one node (happy) ─────────────────────────
describe("SCN-KERNEL-10a-1 — collision resolves by order-independent set-union (0 dropped)", () => {
  it("mergeNode / fold union [e1,e2] and [e2,e1] into the SAME node whose entries = {ch1,ch2}", () => {
    const e1 = mkEvent(ARR, "ch-1c9f2a", { v: 1 })
    const e2 = mkEvent(ARR, "ch-7e40bb", { v: 2 })

    // facet-direct: mergeNode is commutative and grow-only (no-drop).
    const ab = mergeNode(node(ARR, [e1]), node(ARR, [e2]))
    const ba = mergeNode(node(ARR, [e2]), node(ARR, [e1]))
    expect(serNode(ab)).toBe(serNode(ba)) // order-independent
    expect(ab.entries.size).toBe(2) // |entries| = 2 — 0 dropped
    expect([...ab.entries.keys()].sort()).toEqual(["ch-1c9f2a", "ch-7e40bb"])

    // fold-level: folding both orders onto one nodeKey yields the same union node.
    const f12 = nodeAt(fold(logOf([e1, e2])), ARR)
    const f21 = nodeAt(fold(logOf([e2, e1])), ARR)
    expect(serNode(f12)).toBe(serNode(f21))
    expect(f12.entries.size).toBe(2)
    // teeth: last-writer-wins would keep only ONE entry and the two orders would disagree.
  })
})

// ── SCN-KERNEL-10b-1 — forced head tie-break by MAX-contentHash (guard) ──────────────────────────────
describe("SCN-KERNEL-10b-1 — unordered fresh heads → MAX-by-contentHash wins (contentHash alone)", () => {
  it("head(node{e1,e2}) is the MAX-by-contentHash entry, neither superseding the other", () => {
    const e1 = mkEvent(ARR, "ch-1c9f2a", { v: 1 }) // smaller contentHash
    const e2 = mkEvent(ARR, "ch-7e40bb", { v: 2 }) // larger contentHash ⇒ head
    const n = mergeNode(node(ARR, [e1]), node(ARR, [e2]))

    const h = head(n)
    expect(h?.contentHash).toBe("ch-7e40bb") // MAX-by-contentHash, not min, not lowest seq
    // teeth: min-flipped tie-break (or lowest-seq) would return e1 (ch-1c9f2a).
    expect(h?.contentHash).not.toBe("ch-1c9f2a")
  })
})

// ── SCN-KERNEL-10c-1 — collision path lossless & deterministic (no clock / seq / LLM) (guard) ─────────
describe("SCN-KERNEL-10c-1 — head invariant under reseq/reclock; 0 dropped every fold", () => {
  it("two folds under different seq assignments retain both entries and pick the identical head", () => {
    const runA = [mkEvent(ARR, "ch-1c9f2a", { v: 1 }, { seq: 1 }), mkEvent(ARR, "ch-7e40bb", { v: 2 }, { seq: 2 })]
    const runB = [mkEvent(ARR, "ch-1c9f2a", { v: 1 }, { seq: 99 }), mkEvent(ARR, "ch-7e40bb", { v: 2 }, { seq: 5 })]

    const nA = nodeAt(fold(logOf(runA)), ARR)
    const nB = nodeAt(fold(logOf(runB)), ARR)

    expect(nA.entries.size).toBe(2) // |entries| = 2 — never drops the lower-contentHash entry
    expect(nB.entries.size).toBe(2)
    expect(head(nA)?.contentHash).toBe("ch-7e40bb") // identical head across the two reseq runs
    expect(head(nB)?.contentHash).toBe("ch-7e40bb")
    // teeth: a wall-clock/seq-reading head would flip between the runs (nondeterministic).
  })
})

// ── SCN-KERNEL-11-1 — permutation, re-batching, branch-union all fold byte-identically (happy) ───────
describe("SCN-KERNEL-11-1 — convergent fold: same set folds byte-identically under any delivery", () => {
  it("fold([e1,e2,e3]) ≡ fold([e2,e1,e3]) ≡ fold(branch-union) — byte-identical, head=MAX in every order", () => {
    const e1 = mkEvent(ARR, "ch-1c9f2a", { v: 1 })
    const e2 = mkEvent(ARR, "ch-7e40bb", { v: 2 })
    const e3 = mkEvent("claim:acme-hq", "ch-hq", { v: 3 })

    const i = serState(fold(logOf([e1, e2, e3]))) // (i) natural order
    const ii = serState(fold(logOf([e2, e1, e3]))) // (ii) colliding pair reversed
    const iii = serState(fold(merge(logOf([e2, e3]), logOf([e1])))) // (iii) re-batched branch-union, e1 last

    expect(ii).toBe(i)
    expect(iii).toBe(i) // all three serialize to the same bytes
    // the arr node is the union {e1,e2} with head = MAX-by-contentHash in every ordering
    for (const L of [
      [e1, e2, e3],
      [e2, e1, e3],
    ]) {
      const n = nodeAt(fold(logOf(L)), ARR)
      expect(n.entries.size).toBe(2)
      expect(head(n)?.contentHash).toBe("ch-7e40bb")
    }
    // teeth: mergeNode overwriting (LWW) would resolve the arr node to e1 under order (ii)/(iii) ⇒ diverge.
  })
})

// ── SCN-KERNEL-12a-1 — self-installing merge driver (RESIDUE — no pure-function oracle) ──────────────
// gen: residue (goldens-krn §SCN-KERNEL-12a-1) — NO pure-function oracle; the fresh-clone git-config
// bootstrap is a hand-written integration test delegated to PERSIST-11. Recorded UNAVAILABLE, never faked.
describe("SCN-KERNEL-12a-1 — merge driver self-installing (residue → PERSIST-11)", () => {
  it.todo("a fresh clone re-registers merge=orchestra-atlas with no manual step — integration, delegated to PERSIST-11")
})

// ── SCN-KERNEL-12b-1 — plain git line-merge degrades to a lossless id-union (guard) ──────────────────
describe("SCN-KERNEL-12b-1 — a bypassed text merge degrades to a lossless dedup-by-id union", () => {
  it("re-fold(lineMerge(ours,theirs)) ≡ fold(RefLog.merge(ours,theirs)); no event spliced", () => {
    const e1 = mkEvent(ARR, "ch-e1", { v: 1 })
    const e2 = mkEvent(ARR, "ch-e2", { v: 2 })
    const e3 = mkEvent("claim:acme-hq", "ch-e3", { v: 3 })
    const ours = toJsonl(logOf([e1, e2])) // [line(e1), line(e2)]
    const theirs = toJsonl(logOf([e2, e3])) // [line(e2), line(e3)] — e2 shared

    const merged = lineMerge(ours, theirs) // dedup-by-id(lines(ours) ∪ lines(theirs))
    const reFold = serState(fold(logOf(merged)))
    const refFold = serState(fold(combine(logOf([e1, e2]), logOf([e2, e3]))))

    expect(reFold).toBe(refFold) // re-fold(lineMerge) ≡ fold(RefLog.merge)
    expect(new Set(merged.map((e) => e.id)).size).toBe(3) // {e1,e2,e3} — e2 deduped, 0 lost
    // teeth: a single-blob/array log would splice e1 & e3 into one corrupt line and fail to parse.
  })
})

// ── SCN-KERNEL-12c-1 — the log path is append-only, one content-keyed event per line (happy) ─────────
describe("SCN-KERNEL-12c-1 — append-only JSONL, one content-keyed event per line", () => {
  it("toJsonl({e1,e2,e3}) is exactly 3 lines and each line L satisfies eventId(parse(L)) == parse(L).id", () => {
    const e1 = mkEvent(ARR, "ch-e1", { v: 1 })
    const e2 = mkEvent(ARR, "ch-e2", { v: 2 })
    const e3 = mkEvent("claim:acme-hq", "ch-e3", { v: 3 })
    const text = toJsonl(logOf([e1, e2, e3]))

    const lines = text.split("\n")
    expect(lines.length).toBe(3) // one JSON event per line — NOT a single nested array
    for (const line of lines) {
      const parsed = JSON.parse(line) as Event
      expect(isContentKeyed(parsed)).toBe(true) // eventId(parse(L)) == parse(L).id (content-keyed)
      expect(eventId(parsed)).toBe(parsed.id)
    }
    expect(parseJsonl(text).length).toBe(3)
    // teeth: a single nested-array log form is not one-event-per-line JSONL and a line-merge corrupts it.
  })
})

// ══ PROP-KERNEL-10 — deterministic order-independent union + contentHash-alone tie-break (∀-law) ══════
// law (verbatim, fspec-merge §UP KERNEL-10 + §escalation-ladder):
//   commutative  : mergeNode(x,y) ≡ mergeNode(y,x)
//   grow-only    : x ⊑ mergeNode(x,y) ∧ |entries(mergeNode(x,y))| ≥ max(|x|,|y|)   (0 dropped)
//   head-tiebreak: head(n) = max-by-contentHash among FRESH ∧ ¬superseded — contentHash ALONE
//                  (never seq/clock/LLM); reseq/reclock leaves head unchanged
describe("PROP-KERNEL-10 — order-independent union + MAX-by-contentHash tie-break (∀-law)", () => {
  // an arbitrary Node on one nodeKey: distinct contentHashes (unique index), random fresh flags, and an
  // optional supersede edge — the observed-remove arm. seq is randomized to probe reseq/reclock invariance.
  const entrySpecArb = fc.record({
    ch: fc.integer({ min: 0, max: 999 }),
    fresh: fc.boolean(),
    seq: fc.integer({ min: 0, max: 1000 }),
    supIdx: fc.option(fc.integer({ min: 0, max: 9 }), { nil: undefined }),
  })
  const nodeSpecArb = fc.uniqueArray(entrySpecArb, {
    minLength: 1,
    maxLength: 8,
    selector: (s) => s.ch,
  })

  // `supIdx: number | undefined` (a PRESENT key that may hold undefined), not `supIdx?: number` — that is
  // what `fc.option(..., { nil: undefined })` actually generates, and under exactOptionalPropertyTypes the
  // two are different types. The body already discriminates on `!== undefined`.
  const buildNode = (
    specs: readonly { ch: number; fresh: boolean; seq: number; supIdx: number | undefined }[],
  ): Node => {
    const chOf = (i: number) => `ch-${String(specs[i]!.ch).padStart(4, "0")}`
    const events = specs.map((s, i) => {
      const supersedes = s.supIdx !== undefined && s.supIdx < specs.length && s.supIdx !== i ? [chOf(s.supIdx)] : []
      return mkEvent("nk", chOf(i), { i }, { fresh: s.fresh, supersedes, seq: s.seq })
    })
    return node("nk", events)
  }

  // independent reference: max-by-contentHash among FRESH, non-superseded entries.
  const expectedHead = (n: Node): string | undefined => {
    const superseded = new Set<string>()
    for (const e of n.entries.values()) for (const s of e.supersedes) superseded.add(s as string)
    return [...n.entries.values()]
      .filter((e) => e.fresh && !superseded.has(e.contentHash as string))
      .map((e) => e.contentHash as string)
      .sort()
      .at(-1)
  }

  it("mergeNode is commutative and grow-only (0 dropped) — DISJOINT contentHash spaces", () => {
    fc.assert(
      fc.property(nodeSpecArb, nodeSpecArb, (xs, ys) => {
        // disjoint contentHash spaces so |union| = |x| + |y| exactly (probes no-drop hardest).
        // NOTE: disjointness is what makes the EXACT size assertion meaningful — and it is also what makes
        // commutativity trivially true here (nothing to resolve). The OVERLAPPING arm below is the one that
        // actually exercises commutativity; do not delete it in favour of this one.
        const x = buildNode(xs)
        const y = node(
          "nk",
          [...buildNode(ys).entries.values()].map((e) =>
            mkEvent("nk", `y-${e.contentHash}`, e.payload, { fresh: e.fresh, seq: e.seq }),
          ),
        )
        const xy = mergeNode(x, y)
        const yx = mergeNode(y, x)
        expect(serNode(xy)).toBe(serNode(yx)) // commutative
        expect(xy.entries.size).toBeGreaterThanOrEqual(Math.max(x.entries.size, y.entries.size)) // grow-only
        expect(xy.entries.size).toBe(x.entries.size + y.entries.size) // 0 dropped (disjoint)
        for (const h of x.entries.keys()) expect(xy.entries.has(h)).toBe(true) // x ⊑ mergeNode(x,y)
      }),
    )
  })

  it("mergeNode is commutative and grow-only — OVERLAPPING contentHash spaces (the real union)", () => {
    fc.assert(
      fc.property(nodeSpecArb, nodeSpecArb, (xs, ys) => {
        // SHARED contentHash space: x and y may carry DIFFERENT events (differing fresh/supersedes/payload)
        // on the SAME entry slot. This is the only shape on which `mergeNode` has to choose, so it is the
        // only shape on which "commutative" says anything. `mergeNode` still may not drop a SLOT.
        const x = buildNode(xs)
        const y = buildNode(ys.map((s) => ({ ...s, fresh: !s.fresh, seq: s.seq + 1 })))
        const xy = mergeNode(x, y)
        const yx = mergeNode(y, x)
        expect(serNode(xy)).toBe(serNode(yx)) // commutative — ON AN ACTUAL OVERLAP
        expect(xy.entries.size).toBeGreaterThanOrEqual(Math.max(x.entries.size, y.entries.size)) // grow-only
        const slots = new Set([...x.entries.keys(), ...y.entries.keys()])
        expect(xy.entries.size).toBe(slots.size) // 0 SLOT dropped
        for (const h of slots) expect(xy.entries.has(h)).toBe(true) // x ⊔ y ⊒ x, y
      }),
      // 5000 runs, not the fast-check default of 100: this law READ GREEN while it was false, so the run
      // count is part of the evidence, not a tuning knob. See the generator-width note on the arbitrary.
      { numRuns: 5000 },
    )
  })

  it("head = MAX-by-contentHash among FRESH ∧ ¬superseded, invariant under reseq/reclock", () => {
    fc.assert(
      fc.property(nodeSpecArb, fc.integer({ min: 0, max: 100000 }), (specs, k) => {
        const n = buildNode(specs)
        const h = head(n)
        expect(h?.contentHash).toBe(expectedHead(n)) // contentHash ALONE, MAX direction

        // reseq: relabel every entry's seq (a pure content perturbation) — head must not move.
        const reseqed = node(
          "nk",
          [...n.entries.values()].map((e) =>
            mkEvent("nk", e.contentHash as string, e.payload, {
              fresh: e.fresh,
              supersedes: [...e.supersedes], // copy, not a cast: `supersedes` is `readonly Hash[]`
              seq: (Number(e.seq) + k) % 7,
            }),
          ),
        )
        expect(head(reseqed)?.contentHash).toBe(h?.contentHash) // invariant under reseq/reclock
      }),
    )
  })
})

// ══ PROP-KERNEL-11 — convergent commutative fold / strong eventual consistency (∀-law) ═══════════════
// law (verbatim, fspec-merge §UP KERNEL-11 + §escalation-ladder):
//   convergence  : fold(π(S)) ≡ fold(S) for every set-preserving permutation / re-batch / branch-union π
//   associative  : merge(merge(a,b),c) ≡ merge(a,merge(b,c))
//   commutative  : merge(a,b) ≡ merge(b,a)
//   byte-identity: serialize(fold(·)) under the canonicalizer (sorted keys) equal across all orderings
describe("PROP-KERNEL-11 — convergent commutative fold (∀-law)", () => {
  // a random event set with COLLIDING nodeKeys (few buckets) so the fold exercises multi-entry union nodes,
  // not just singletons.
  //
  // GENERATOR WIDTH IS LOAD-BEARING — read before narrowing. This arbitrary was previously
  // `uniqueArray(..., selector: s => s.ch)`, which forced every contentHash DISTINCT and thereby excluded the
  // ONE input shape on which the fold has to make a choice: two DIFFERENT events landing on the SAME
  // (nodeKey, contentHash) OR-Set slot. A `selector` here does not "avoid duplicates", it deletes the law's
  // only interesting case — the property then held for 3000 runs while `fold` was demonstrably
  // order-dependent (witness: same nodeKey + same contentHash, differing `fresh` ⇒ distinct event ids ⇒ both
  // enter the log set ⇒ first-seen-wins returned whichever ARRIVED first).
  //
  // Two independent collision axes must therefore stay open, and both are `dedupeKey`ed only on the FULL
  // spec (i.e. a genuine SET of events, which is what the law quantifies over):
  //   • `ch` may repeat with a different `fresh`  ⇒ distinct ids colliding on one node entry slot;
  //   • `seq` may differ on otherwise-identical content ⇒ IDENTICAL ids (seq is pinned out of the preimage,
  //     KERNEL-9) whose retained `seq` value would otherwise leak arrival order into the folded state.
  const eventSpecArb = fc.uniqueArray(
    fc.record({
      ch: fc.integer({ min: 0, max: 8 }), // SMALL space on purpose: contentHash collisions must be frequent
      nk: fc.integer({ min: 0, max: 3 }),
      fresh: fc.boolean(),
      seq: fc.integer({ min: 0, max: 4 }),
    }),
    { minLength: 1, maxLength: 12 },
  )
  type EventSpec = { ch: number; nk: number; fresh: boolean; seq: number }
  const buildSet = (specs: readonly EventSpec[]): Event[] =>
    specs.map((s) =>
      mkEvent(`nk-${s.nk}`, `ch-${String(s.ch).padStart(3, "0")}`, { c: s.ch }, { fresh: s.fresh, seq: s.seq }),
    )

  it("fold(π(S)) ≡ fold(S) for permutation, reverse, and re-batched branch-union (byte-identical)", () => {
    fc.assert(
      fc.property(eventSpecArb, fc.integer({ min: 0, max: 12 }), (specs, cut) => {
        const S = buildSet(specs)
        const base = serState(fold(logOf(S)))

        expect(serState(fold(logOf([...S].reverse())))).toBe(base) // permutation (reverse)
        const at = Math.min(cut, S.length)
        const branchUnion = merge(logOf(S.slice(0, at)), logOf(S.slice(at))) // re-batched branch-union of SAME set
        expect(serState(fold(branchUnion))).toBe(base) // convergence
        expect(serState(fold(merge(logOf(S), logOf(S))))).toBe(base) // idempotent: S ∪ S = S
      }),
      // 5000 runs, not the fast-check default of 100: this law READ GREEN while it was false, so the run
      // count is part of the evidence, not a tuning knob. See the generator-width note on the arbitrary.
      { numRuns: 5000 },
    )
  })

  it("merge is commutative and associative on the event id (byte-identical fold)", () => {
    fc.assert(
      fc.property(eventSpecArb, eventSpecArb, eventSpecArb, (as, bs, cs) => {
        // The three branches SHARE one contentHash space on purpose. Offsetting them (`ch + 1000` /
        // `ch + 2000`, as this test previously did) makes the branches disjoint, so `merge` never has to
        // resolve anything and commutativity/associativity are true for free — vacuous, exactly like the
        // `selector` above. Overlapping branches are the real branch-union the law is about.
        const a = logOf(buildSet(as))
        const b = logOf(buildSet(bs))
        const c = logOf(buildSet(cs))
        expect(serState(fold(merge(a, b)))).toBe(serState(fold(merge(b, a)))) // commutative
        const left = serState(fold(merge(merge(a, b), c)))
        const right = serState(fold(merge(a, merge(b, c))))
        expect(left).toBe(right) // associative
      }),
      // 5000 runs, not the fast-check default of 100: this law READ GREEN while it was false, so the run
      // count is part of the evidence, not a tuning knob. See the generator-width note on the arbitrary.
      { numRuns: 5000 },
    )
  })
})
