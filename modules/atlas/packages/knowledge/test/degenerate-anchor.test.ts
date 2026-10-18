// @atlas/knowledge — test/degenerate-anchor.test.ts  (SEAT ANCHOR — the wildcard-identity regression)
//
// THE DEFECT, in one sentence: `deepestCommonUnit` returns `''` for any grounding whose anchors share no
// `::` prefix, so `nodeKey = hash(primaryAnchorId ‖ predicateSlot [‖ check])` collapsed EVERY such fact onto
// ONE address per slot, and the advisory set-union merged unrelated claims into whichever fact arrived first.
// No hash weakness was involved: the precondition is grounding a claim at two symbols in two files.
//
// WHY THE DIGESTS BELOW ARE WRITTEN OUT AS LITERALS. This suite is otherwise structurally BLIND to a moved
// identity: every other identity assertion recomputes BOTH sides with the product formula, so a change to the
// formula moves the expectation with the value and the test stays green while every stored node is orphaned.
// A moved `nodeKey` is a silent data migration — a worse defect than the one this file closes — so the
// CONTROL cases pin the digests CAPTURED FROM THE PRE-FIX BUILD (commit 80318d0) as constants. If a future
// edit moves any of them, this file fails, and that is the entire point of it.

import { describe, expect, it } from "vitest"
import { DEGENERATE_ANCHOR_REASON, DegenerateAnchorError, nodeKey, primaryAnchorId } from "../src/write/router.js"
import type { Candidate, PredicateSlot } from "../src/types.js"

const sym = (p: string): unknown => ({ anchor: { kind: "symbol", qualifiedPath: p, subtreeHash: "st" }, path: p })
const file = (p: string): unknown => ({ anchor: { kind: "file", qualifiedPath: p, subtreeHash: "st" }, path: p })

/** A `Candidate` VIEW over hand-built entries. Cast exactly as both production write paths cast (`as unknown
 *  as Candidate`) — which is precisely why the guard must be total over `unknown` rather than trust the type. */
function cand(entries: readonly unknown[], slot: PredicateSlot = "invariant", check?: unknown): Candidate {
  return {
    claimText: "c",
    claimNorm: "c",
    slot,
    tier: "T1",
    provenance: { source: "test", trusted: true },
    grounding: { entries },
    ...(check !== undefined ? { check } : {}),
  } as unknown as Candidate
}

describe("degenerate anchor — an empty common unit REFUSES, it never mints (SEAT ANCHOR)", () => {
  it("THE ATTACK: two symbols in different files no longer mint an anchor at all", () => {
    const victim = cand([sym("src/billing.ts::7:fn:charge"), sym("src/ledger.ts::7:fn:post")])
    const attacker = cand([sym("vendor/evil.ts::7:fn:pwn"), sym("docs/readme.ts::7:fn:x")])
    // Pre-fix BOTH minted f4f8f1a0240a4685337d10abbd8c319e20904aec6124eafc6a64af113a5f2e18 — one address.
    expect(() => nodeKey(victim)).toThrow(DegenerateAnchorError)
    expect(() => nodeKey(attacker)).toThrow(DegenerateAnchorError)
    expect(() => primaryAnchorId(victim)).toThrow(DEGENERATE_ANCHOR_REASON)
  })

  it("BOTH halves of the identity pair refuse — the key and the stored anchor cannot disagree", () => {
    // The recent regression in this area validated one half of a pair and not the other, which left an
    // anchor that cleared one gate and failed another forever. One guard, both entry points.
    const c = cand([sym("a/x.ts::1:fn:f"), sym("b/y.ts::1:fn:g")])
    expect(() => nodeKey(c)).toThrow(DegenerateAnchorError)
    expect(() => primaryAnchorId(c)).toThrow(DegenerateAnchorError)
  })

  it("the refusal names the mechanism and tells the author what to do", () => {
    const c = cand([sym("a/x.ts::1:fn:f"), sym("b/y.ts::1:fn:g")])
    expect(() => nodeKey(c)).toThrow(/WILDCARD/)
    expect(DEGENERATE_ANCHOR_REASON).toMatch(/^degenerate anchor: /)
    expect(DEGENERATE_ANCHOR_REASON).toMatch(/Re-ground the claim at the single unit/)
  })

  it("TOTAL over `unknown`, fail-CLOSED: no malformed shape mints a key or throws a raw TypeError", () => {
    const shapes: readonly unknown[][] = [
      [], // no entries at all
      [sym("")], // empty qualifiedPath
      [{ anchor: { kind: "symbol" }, path: "p" }], // qualifiedPath absent
      [{ anchor: { kind: "symbol", qualifiedPath: 42 }, path: "p" }], // not a string
      [{ anchor: { kind: "symbol", qualifiedPath: ["a"] }, path: "p" }], // array that would COERCE on `.split`
      [{ anchor: null, path: "p" }], // no anchor object
      [null], // no entry object
      [sym("src/a.ts::1:fn:f"), sym("")], // one good, one empty — poisons the whole set
      [sym("src/a.ts::1:fn:f"), { anchor: { kind: "symbol", qualifiedPath: null }, path: "p" }],
    ]
    for (const entries of shapes) {
      expect(() => nodeKey(cand(entries)), JSON.stringify(entries)).toThrow(DegenerateAnchorError)
    }
    // and the non-array / absent grounding shapes a cast can deliver
    for (const g of [undefined, null, {}, { entries: undefined }, { entries: "nope" }, { entries: 7 }]) {
      const c = { claimText: "c", claimNorm: "c", slot: "invariant", tier: "T1", grounding: g } as unknown as Candidate
      expect(() => nodeKey(c), JSON.stringify(g)).toThrow(DegenerateAnchorError)
    }
  })

  // ── THE MANDATORY CONTROL — literal digests captured on the PRE-FIX build (80318d0). ───────────────────
  // A fix that MOVES an existing nodeKey is a silent data migration and a worse defect than the collision.
  describe("CONTROL — every legitimate grounding mints the digest it minted before the fix", () => {
    const CONTROLS: readonly (readonly [string, readonly unknown[], PredicateSlot, unknown, string, string])[] = [
      [
        "single FILE anchor",
        [file("src/billing.ts")],
        "invariant",
        undefined,
        "src/billing.ts",
        "3388e9f7d158649b0a6561171a1050111af0abd413e17f950a3909139d882847",
      ],
      [
        "single SYMBOL anchor",
        [sym("src/billing.ts::7:function_declaration:charge")],
        "invariant",
        undefined,
        "src/billing.ts::7:function_declaration:charge",
        "7936b796a5ed1484d72d7112741849a94930b68a244e57dca2e1de24eff3e2ab",
      ],
      [
        "two SYMBOLS in the same file (shared :: prefix)",
        [sym("src/a.ts::1:fn:f"), sym("src/a.ts::9:fn:g")],
        "contract",
        undefined,
        "src/a.ts",
        "cb6f3b5e58020297e4e29892df33a87b828a98ba49abc36c3741860a87930e32",
      ],
      [
        "nested item + its own block",
        [sym("src/a.ts::1:fn:f"), sym("src/a.ts::1:fn:f::4:block:")],
        "gotcha",
        undefined,
        "src/a.ts::1:fn:f",
        "86fd48c796ce8ab818a1dc77e91068d74ad0ed53434cc4c631d859618862bed8",
      ],
      [
        "two FILE anchors in different dirs — entries[0] is the primary, the rest feed drift",
        [file("src/billing.ts"), file("vendor/evil.ts")],
        "invariant",
        undefined,
        "src/billing.ts",
        "3388e9f7d158649b0a6561171a1050111af0abd413e17f950a3909139d882847",
      ],
      [
        "directory anchor",
        [file("src")],
        "ownership",
        undefined,
        "src",
        "fb73c960b0acd6e33c241d3ff1c8960e84ea2f8e4804e769198f93cb2b37008f",
      ],
      [
        "PREDICATE — single symbol + check",
        [sym("src/a.ts::1:fn:f")],
        "security-property",
        { kind: "assertion", expr: "x > 0" },
        "src/a.ts::1:fn:f",
        "b6f44e769befdee3df3bfe30d59bf947aa6b78983757d3dae8d14a739680ba6b",
      ],
      [
        "PREDICATE — two symbols same file + check",
        [sym("src/a.ts::1:fn:f"), sym("src/a.ts::9:fn:g")],
        "perf-bound",
        { kind: "index-query", query: "q" },
        "src/a.ts",
        "2a3e6a0c8cd3fb388b78efe046f9e7f264902247e5cb532cf901db919069d74a",
      ],
      [
        "symbol + file mixed — the symbol filter wins",
        [file("src"), sym("src/a.ts::1:fn:f")],
        "rationale",
        undefined,
        "src/a.ts::1:fn:f",
        "9caab892bc888b8194d8d034309668afae91bf32750d312b34e3493a84af991a",
      ],
    ]
    for (const [label, entries, slot, check, anchor, digest] of CONTROLS) {
      it(`UNCHANGED: ${label}`, () => {
        const c = cand(entries, slot, check)
        expect(String(primaryAnchorId(c))).toBe(anchor)
        expect(String(nodeKey(c))).toBe(digest)
      })
    }
  })

  it("NO BRICK: a refused grounding is writable the moment it is re-grounded at a containing unit", () => {
    const diffuse = cand([sym("src/billing.ts::7:fn:charge"), sym("src/ledger.ts::7:fn:post")], "invariant")
    expect(() => nodeKey(diffuse)).toThrow(DegenerateAnchorError)
    // Same claim, re-grounded at the file that contains one site — an ordinary write, no state to unstick.
    // The guard reads the payload's grounding and NOTHING else (no store, no policy, no incumbent), so a
    // refusal can never become a permanent property of an address.
    const regrounded = cand([file("src/billing.ts")], "invariant")
    expect(String(nodeKey(regrounded))).toBe("3388e9f7d158649b0a6561171a1050111af0abd413e17f950a3909139d882847")
    // ...and the refusal is not sticky: the diffuse candidate is still refused, the good one still mints.
    expect(() => nodeKey(diffuse)).toThrow(DegenerateAnchorError)
    expect(String(nodeKey(regrounded))).toBe("3388e9f7d158649b0a6561171a1050111af0abd413e17f950a3909139d882847")
  })
})
