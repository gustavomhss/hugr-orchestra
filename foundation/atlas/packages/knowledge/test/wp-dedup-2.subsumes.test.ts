// @atlas/knowledge — test/wp-dedup-2.subsumes.test.ts  (WP-DEDUP-2 · DP-2 · deriveSubsumes goldens)
//
// The READ-side `subsumes` derivation (dedup-identity.md DP-2, FROZEN). Each `it` pins ONE frozen clause
// as a tooth and NAMES the mutant it kills — dropping that clause from `deriveSubsumes` must RED the tooth.
// These are FRESH cases: the old all-slot `adjacencyNearDup` goldens took no slot arg and are NOT a
// template. `broader ⊃ narrower`, broader = the shorter/ancestor anchor. NO fuzzy τ, exact NFC+trim only.

import { describe, it, expect } from "vitest"
import { deriveSubsumes } from "../src/read/subsumes.js"
import type { Subsumes } from "../src/read/subsumes.js"
import type { CurrentNode, StoreProjection } from "../src/write/router.js"
import type { NodeFamily } from "../src/write/router.js"
import type { PredicateSlot } from "../src/types.js"

/** A current node at `primaryAnchor`/`slot`/`family` carrying `claims`, keyed `key`. Fields are set so a
 *  slot-less / family-swap / anchor-swap variant can be built per-tooth to prove each guard bites. */
function node(
  key: string,
  primaryAnchor: string | undefined,
  slot: PredicateSlot | undefined,
  claims: readonly string[],
  family: NodeFamily = "advisory",
): CurrentNode {
  return {
    nodeKey: key,
    family,
    contentHash: `ch:${key}`,
    claims,
    ...(primaryAnchor !== undefined ? { primaryAnchor } : {}),
    ...(slot !== undefined ? { slot } : {}),
  }
}
function projection(nodes: readonly CurrentNode[]): StoreProjection {
  return { current: new Map(nodes.map((n) => [n.nodeKey, n])), cas: new Set() }
}
/** Plain `{broader, narrower}` pairs for order-exact comparison. */
function pairs(subs: readonly Subsumes[]): { broader: string; narrower: string }[] {
  return subs.map((s) => ({ broader: s.broader as string, narrower: s.narrower as string }))
}

describe("WP-DEDUP-2 — deriveSubsumes: the DP-2 read-side coverage relation", () => {
  it("DIRECTION: mod⊃fn emits {broader: mod, narrower: fn} — broader is the SHORTER/ancestor anchor", () => {
    const store = projection([node("fn", "m::f", "invariant", ["cn"]), node("mod", "m", "invariant", ["cn"])])
    expect(pairs(deriveSubsumes(store))).toEqual([{ broader: "mod", narrower: "fn" }])
    // teeth (MUTANT: reverse the emit to {broader: q, narrower: p}, i.e. fn⊃mod) → this flips: the ancestor
    // 'mod' would land as `narrower`, failing the direction assertion.
  })

  it("EQUAL-ANCHOR EXCLUDED: two DISTINCT nodeKeys at the SAME anchor+slot+family+claim ⇒ no subsumes", () => {
    // distinct nodeKeys proves the anchor-equality guard (not merely nodeKey identity) is what excludes them.
    const store = projection([node("a1", "m::f", "invariant", ["cn"]), node("a2", "m::f", "invariant", ["cn"])])
    expect(deriveSubsumes(store)).toEqual([])
    // teeth (MUTANT: relax the PROPER prefix to `isPrefix` alone — drop `segP.length < segQ.length`) → equal
    // anchors would satisfy containment both ways ⇒ spurious a1⊃a2 + a2⊃a1, flipping this off []. Also proves
    // no `X ⊃ X`.
  })

  it("SAME-SLOT REQUIRED: mod⊃fn same claim but DIFFERENT slots ⇒ no subsumes (the DP-2 all-slot fix)", () => {
    const store = projection([node("fn", "m::f", "gotcha", ["cn"]), node("mod", "m", "invariant", ["cn"])])
    expect(deriveSubsumes(store)).toEqual([])
    // teeth (MUTANT: drop the `p.slot === q.slot` clause — span ALL slots, the old bug) → mod⊃fn would fire
    // across slots, flipping this off []. This is exactly the regression DP-2 fixes.
  })

  it("SAME-SLOT: a slot-LESS node never participates (undefined!==undefined must NOT match)", () => {
    const store = projection([node("fn", "m::f", undefined, ["cn"]), node("mod", "m", undefined, ["cn"])])
    expect(deriveSubsumes(store)).toEqual([])
    // teeth (MUTANT: use `p.slot === q.slot` WITHOUT the `p.slot !== undefined` guard) → undefined===undefined
    // is true ⇒ two slot-less nodes would spuriously subsume, flipping this off [].
  })

  it("SAME-FAMILY REQUIRED: advisory⊃predicate prefix pair sharing a claim string ⇒ no subsumes", () => {
    const store = projection([
      node("fn", "m::f", "invariant", ["cn"], "predicate"),
      node("mod", "m", "invariant", ["cn"], "advisory"),
    ])
    expect(deriveSubsumes(store)).toEqual([])
    // teeth (MUTANT: drop the `p.family === q.family` clause) → the cross-family pair would subsume,
    // flipping this off []. (advisory claimNorm vs predicate check are different value spaces.)
  })

  it("SHARED-CLAIM REQUIRED: DISJOINT claim-sets ⇒ no subsumes; overlapping ⇒ subsumes", () => {
    const disjoint = projection([node("fn", "m::f", "invariant", ["x"]), node("mod", "m", "invariant", ["y"])])
    expect(deriveSubsumes(disjoint)).toEqual([])
    const overlap = projection([
      node("fn", "m::f", "invariant", ["x", "shared"]),
      node("mod", "m", "invariant", ["shared", "z"]),
    ])
    expect(pairs(deriveSubsumes(overlap))).toEqual([{ broader: "mod", narrower: "fn" }])
    // teeth (MUTANT: drop the `shareExactClaim` clause — always true) → the disjoint pair would subsume,
    // flipping the first assertion off []. The overlap half proves ONE shared claim (not identical sets) fires.
  })

  it("SHARED-CLAIM is EXACT (NFC+trim): a whitespace/near variant does NOT share", () => {
    const store = projection([node("fn", "m::f", "invariant", ["cn extra"]), node("mod", "m", "invariant", ["cn"])])
    expect(deriveSubsumes(store)).toEqual([])
    // teeth (MUTANT: replace claimSimilarity's exact compare with a substring/`includes`) → 'cn extra' would
    // "share" 'cn', flipping this off []. Pins the exact (no fuzzy τ) leg.
  })

  it("SHARED-CLAIM normalizes (NFC+trim): a whitespace-only variant DOES share", () => {
    const store = projection([
      node("fn", "m::f", "invariant", ["cn "]), // trailing whitespace — equal to 'cn' only after trim
      node("mod", "m", "invariant", ["cn"]),
    ])
    expect(pairs(deriveSubsumes(store))).toEqual([{ broader: "mod", narrower: "fn" }])
    // teeth (MUTANT: drop the NFC+trim normalization from the shared claimSimilarity — raw `===`) → 'cn ' !== 'cn'
    // ⇒ no shared claim ⇒ this flips OFF the subsumes edge to []. Pins the normalization leg (positive direction).
  })

  it("FULL TRANSITIVE SET: crate⊃mod⊃fn (same slot+family+claim) ⇒ exactly 3 edges incl. crate⊃fn", () => {
    const store = projection([
      node("fn", "c::m::f", "invariant", ["cn"]),
      node("mod", "c::m", "invariant", ["cn"]),
      node("crate", "c", "invariant", ["cn"]),
    ])
    expect(pairs(deriveSubsumes(store))).toEqual([
      { broader: "crate", narrower: "fn" },
      { broader: "crate", narrower: "mod" },
      { broader: "mod", narrower: "fn" },
    ])
    // teeth (MUTANT: emit only the NEAREST/direct target — transitive reduction, the old merge artifact) →
    // the transitive crate⊃fn edge would vanish, flipping this off the 3-edge set. Also pins the sort.
  })

  it("DETERMINISTIC SORT + NO SELF-PAIRS: output is (broader,narrower)-ascending and self-pair-free", () => {
    // seeded out of order (fn, crate, mod) to prove the sort, not insertion order, decides.
    const store = projection([
      node("fn", "c::m::f", "invariant", ["cn"]),
      node("crate", "c", "invariant", ["cn"]),
      node("mod", "c::m", "invariant", ["cn"]),
    ])
    const out = deriveSubsumes(store)
    const flat = pairs(out)
    const sorted = [...flat].sort((a, b) =>
      a.broader < b.broader
        ? -1
        : a.broader > b.broader
          ? 1
          : a.narrower < b.narrower
            ? -1
            : a.narrower > b.narrower
              ? 1
              : 0,
    )
    expect(flat).toEqual(sorted) // total deterministic order
    for (const e of flat) expect(e.broader).not.toBe(e.narrower) // no (X,X)
    // teeth (MUTANT: remove the `edges.sort(...)`) → insertion order (fn-seeded) diverges from the sorted
    // order, flipping the equality. Self-pair check pins strict-containment's self-exclusion.
  })

  it("PURE: repeated calls agree and the projection is untouched", () => {
    const store = projection([node("fn", "m::f", "invariant", ["cn"]), node("mod", "m", "invariant", ["cn"])])
    const size = store.current.size
    expect(deriveSubsumes(store)).toEqual(deriveSubsumes(store))
    expect(store.current.size).toBe(size)
  })

  it("ANCHORLESS node never participates (no primaryAnchor ⇒ dormant)", () => {
    const store = projection([node("bare", undefined, "invariant", ["cn"]), node("mod", "m", "invariant", ["cn"])])
    expect(deriveSubsumes(store)).toEqual([])
    // teeth (MUTANT: treat a missing anchor as '' and split it) → '' would be a prefix of 'm', spuriously
    // subsuming, flipping this off []. Pins clause-1's anchorless guard.
  })
})
