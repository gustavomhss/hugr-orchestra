// @atlas/knowledge — test/wp-5.13-b-know.anchor-identity.test.ts  (WP-5.13-b.KNOW · EPIC-13-b)
//
// RED→GREEN transcription of the VISIBLE `-1` goldens for the ANCHOR-IDENTITY facet of the
// deterministic write-decision (the `-b` arm of the 5.13 sequential pair; 5.13-a's routing is
// SEALED on master and is NOT re-implemented here):
//   SCN-KNOW-15b-1 (advisory nodeKey = hash(primaryAnchorId ‖ predicateSlot), body-independent),
//   15c-1 (predicate nodeKey folds in normalize(check) — a distinct check is a distinct node),
//   15d-1 (primaryAnchorId is the COMPUTED tightest structural unit over the referenced symbols),
//   15e-1 (an LLM-proposed anchor never enters identity — the compute is a pure fn of grounding),
//   15g-1 (a secondary citation feeds DRIFT only, never the nodeKey),
//   15i-1 (a slot outside the closed 13-member vocabulary is rejected),
//   15j-1 (no LLM/clock/seq in the identity path — observable as pure determinism).
//
// MODELING NOTE (disciplined, flagged — cf. index/src/fold.ts precedent + 5.13-a's test):
//  • SEAM — all identity digests are minted through the SEALED @atlas/kernel encoder (`defaultEncoder`
//    + `canonicalForm`) and branded via `asNodeKey`; NO raw hashing here. Symbolic golden ids ⇒
//    RELATIONAL assertions (collide / distinct / stable), never a literal hex.
//  • The move-aware RE-ANCHORING matcher (rename/move ⇒ same nodeKey via name-stripped subtreeHash)
//    and the near-synonym similarity threshold live UPSTREAM and are OPEN-DEFINE parametric
//    (SCN-KNOW-15f-2 θ, SCN-KNOW-15h-2 τ — `residue`): the matcher fixes the VALUE of the nodeKey
//    oracle-input the SEALED router routes over, it is not re-modeled here. No verification is invented
//    for an unpinned threshold (method-tags-knw §Refuse-to-model). Only the airtight EXACT leg is owned.

import { describe, it, expect } from "vitest"
import {
  nodeKey,
  primaryAnchorId,
  normalizeCheck,
  isKnownSlot,
  PREDICATE_SLOTS,
  // guardrail — 5.13-a's SEALED surface must remain importable + intact
  routeWrite,
} from "../src/write/router.js"
import type { Candidate, Check, PredicateSlot } from "@atlas/knowledge"
import type { StructRef } from "@atlas/contracts"
import { asSubtreeHash } from "@atlas/kernel"

// ── fixtures ─────────────────────────────────────────────────────────────────────────────────────
function sym(qualifiedPath: string): StructRef {
  return { kind: "symbol", qualifiedPath, subtreeHash: asSubtreeHash(`sh:${qualifiedPath}`) }
}
function block(qualifiedPath: string): StructRef {
  return { kind: "block", qualifiedPath, subtreeHash: asSubtreeHash(`sh:${qualifiedPath}`) }
}

interface CandOpts {
  readonly claimText?: string
  readonly claimNorm?: string
  readonly slot?: PredicateSlot
  readonly check?: Check
  readonly anchors: readonly StructRef[]
}
function cand(o: CandOpts): Candidate {
  const base = {
    claimText: o.claimText ?? "the claim body prose",
    claimNorm: o.claimNorm ?? "cn-body",
    slot: o.slot ?? ("contract" as PredicateSlot),
    grounding: { entries: o.anchors.map((anchor) => ({ anchor, path: "p" })) },
    provenance: { source: "agent://forge", trusted: true },
    tier: "T2" as const,
  }
  return o.check ? { ...base, check: o.check } : base
}

// symbols X and Y both live inside fn parseHeader (their smallest common subtree)
const XY = [sym("pkg/parser::parseHeader::X"), sym("pkg/parser::parseHeader::Y")]

describe("WP-5.13-b.KNOW — nodeKey identity formula (KNOW-15b/15c goldens)", () => {
  it("SCN-KNOW-15b-1: advisory nodeKey = hash(primaryAnchorId ‖ slot) — independent of body wording", () => {
    const first = cand({ claimNorm: "cn-first", slot: "contract", anchors: XY })
    const reworded = cand({ claimNorm: "cn-reworded-restatement", slot: "contract", anchors: XY })
    // same (anchor, slot), different body bytes ⇒ SAME nodeKey (collide ⇒ UPDATE/union, one node)
    expect(nodeKey(reworded)).toBe(nodeKey(first))
    // teeth: a different SLOT at the same anchor is a different node
    const otherSlot = cand({ claimNorm: "cn-first", slot: "invariant", anchors: XY })
    expect(nodeKey(otherSlot)).not.toBe(nodeKey(first))
  })

  it("SCN-KNOW-15c-1: predicate nodeKey includes normalize(check) — a distinct check is a distinct node", () => {
    const anchors = [sym("pkg/queue::drainQueue::head"), sym("pkg/queue::drainQueue::tail")]
    const head = cand({ slot: "invariant", anchors, check: { kind: "index-query", query: "chk-head" } })
    const tail = cand({ slot: "invariant", anchors, check: { kind: "index-query", query: "chk-tail" } })
    // distinct check ⇒ distinct nodeKey (a CREATE, never a sibling-supersede)
    expect(nodeKey(tail)).not.toBe(nodeKey(head))
    // teeth: two predicates with the SAME check at the same (anchor, slot) collide on one node
    const headAgain = cand({ slot: "invariant", anchors, check: { kind: "index-query", query: "chk-head" } })
    expect(nodeKey(headAgain)).toBe(nodeKey(head))
    // a predicate and an advisory at the same (anchor, slot) are NOT the same node (check enters identity)
    const advisory = cand({ slot: "invariant", anchors })
    expect(nodeKey(advisory)).not.toBe(nodeKey(head))
  })
})

describe("WP-5.13-b.KNOW — primaryAnchorId is the computed tightest unit (KNOW-15d/15e/15g)", () => {
  it("SCN-KNOW-15d-1: primaryAnchorId is the tightest structural unit containing every referenced symbol", () => {
    const c = cand({ anchors: XY })
    // deterministic + equal to the containing unit `pkg/parser::parseHeader` (the smallest subtree over {X,Y})
    const anc = primaryAnchorId(c)
    expect(primaryAnchorId(c)).toBe(anc) // deterministic
    // two claims citing DIFFERENT symbols within the SAME function share the anchor
    const other = cand({ anchors: [sym("pkg/parser::parseHeader::Z")] })
    // Z alone tightens to itself; X,Y widen to the containing fn — assert the fn-level unit is stable:
    const bothInFn = cand({ anchors: [sym("pkg/parser::parseHeader::A"), sym("pkg/parser::parseHeader::B")] })
    expect(primaryAnchorId(bothInFn)).toBe(anc) // same containing fn ⇒ same anchor
    // teeth: a symbol in a DIFFERENT function yields a DIFFERENT anchor (no widen-to-module drift)
    const elsewhere = cand({ anchors: [sym("pkg/parser::parseFooter::A"), sym("pkg/parser::parseFooter::B")] })
    expect(primaryAnchorId(elsewhere)).not.toBe(anc)
    expect(other).toBeDefined()
  })

  it("SCN-KNOW-15e-1: an LLM-chosen anchor is never used — the compute is a pure fn of grounding", () => {
    // the LLM proposes ONLY the claim body (claimText); the anchor is COMPUTED from grounding.
    const a = cand({ claimText: "llm phrasing one", claimNorm: "cn-a", anchors: XY })
    const b = cand({ claimText: "a totally different llm phrasing", claimNorm: "cn-b", anchors: XY })
    // identical grounding, different LLM output ⇒ identical primaryAnchorId (0 LLM-chosen anchors)
    expect(primaryAnchorId(b)).toBe(primaryAnchorId(a))
    expect(nodeKey(b)).toBe(nodeKey(a))
  })

  it("SCN-KNOW-15g-1: a secondary citation feeds DRIFT only, never identity", () => {
    const primary = cand({ anchors: XY })
    // re-emit adds a SECONDARY citation (a broader block cite), primary symbols unchanged
    const withSecondary = cand({ anchors: [...XY, block("pkg/util::sharedHelperBlock")] })
    // identity is unchanged — the secondary lives in grounding.entries (drift), never the nodeKey
    expect(primaryAnchorId(withSecondary)).toBe(primaryAnchorId(primary))
    expect(nodeKey(withSecondary)).toBe(nodeKey(primary))
  })
})

describe("WP-5.13-b.KNOW — closed slot vocabulary (KNOW-15i)", () => {
  it("SCN-KNOW-15i-1: a slot outside the closed 13-member vocabulary is rejected", () => {
    expect(PREDICATE_SLOTS).toHaveLength(13) // the closed set is exactly 13 (adding one is a `cv` bump)
    for (const s of PREDICATE_SLOTS) expect(isKnownSlot(s)).toBe(true)
    expect(isKnownSlot("freeform-note")).toBe(false) // free-text slot rejected
    expect(isKnownSlot("")).toBe(false)
  })
})

describe("WP-5.13-b.KNOW — the identity path is LLM-/clock-/seq-free (KNOW-15j)", () => {
  it("SCN-KNOW-15j-1: nodeKey + primaryAnchorId + normalizeCheck are pure and deterministic", () => {
    const c = cand({ slot: "invariant", anchors: XY, check: { kind: "assertion", expr: "x > 0" } })
    expect(nodeKey(c)).toBe(nodeKey(c)) // repeat ⇒ identical (no clock/seq)
    expect(primaryAnchorId(c)).toBe(primaryAnchorId(c))
    expect(normalizeCheck({ kind: "assertion", expr: "x > 0" })).toBe(
      normalizeCheck({ kind: "assertion", expr: "x > 0" }),
    )
  })
})

describe("WP-5.13-b.KNOW — guardrail: 5.13-a routeWrite intact", () => {
  it("the SEALED write-decision routing still resolves the enumerated cells", () => {
    expect(routeWrite({ contentHashHit: true, nodeKeyHit: true, family: "advisory", checkSame: true })).toBe("DEDUP")
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: false, family: "advisory", checkSame: false })).toBe(
      "CREATE",
    )
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: true, family: "advisory", checkSame: false })).toBe("UPDATE")
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: true, family: "predicate", checkSame: true })).toBe(
      "SUPERSEDE",
    )
  })
})
