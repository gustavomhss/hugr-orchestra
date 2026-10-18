// @atlas/grounding — test/wp-4.10-b-grd.multiset.test.ts   (WP-4.10-b.GROUND · EPIC-10-b · GROUND-11)
//
// WHY THIS FILE EXISTS. `closureInterfaceUnchanged` (src/freshness.ts) compared the pinned vs current
// forward closure as LENGTH-PLUS-PER-MEMBER-LOOKUP: `pinned.length === current.length` then "every pinned
// member is found in a map built from current". That is a multiset comparison implemented as
// length-plus-membership, which is UNSOUND whenever a `node` (dependency-axis `Hash`) repeats in the
// closure: a duplicate on the PINNED side is looked up against a `Map` keyed by `node`, so it can match
// the SAME current entry twice while a genuinely different member on the current side is never visited.
// Concretely: pinned `[A, A]` vs current `[A, B]` — same length (2), and the map lookup for pinned's two
// `A` entries both resolve against current's single `A` entry, so the loop never inspects `B` at all and
// the fold reports FRESH despite the membership having genuinely changed (B replaced the second A).
//
// This is the SAME CLASS of defect as two prior freshness-oracle findings in this repo (see MEMORY:
// "reference-model-vs-shipped-path", "isGrounded fail-open") — an oracle that structurally CANNOT witness
// a real membership change. The fix makes the comparison a genuine multiset equality: count occurrences
// of each (node, interfaceRState) pair on both sides and require them to match exactly (see src/freshness.ts).
//
// CONSTRUCTIBILITY (traced 2026-08-03, this WP): as of origin/master `38f3f4b`, `freshness()` /
// `ClosureMember` / `FreshnessSnapshot` have NO production caller anywhere in the tree. The only wired
// drift oracle is `driftDetect` (src/drift.ts, WP-4.10-a.GROUND — LOCAL grounding-set only, never reads
// `closure`); `knowledge`'s `bindFreshness` delegates to THAT oracle, not to this fold. This module's own
// docstring says "the barrel is wired by the lead at SEAL" — SEAL has not happened. So a duplicate-`node`
// pinned closure is NOT constructible through any shipped path today; this suite proves the FUNCTION is
// unsound over its declared domain (any `readonly ClosureMember[]`), independent of whether a caller
// currently sends it a duplicate.

import { describe, it, expect } from "vitest"
import { asHash, asSubtreeHash } from "@atlas/kernel"
import type { Freshness } from "@atlas/contracts"
import { freshness } from "../src/freshness.js"
import type { FreshnessSnapshot, ClosureMember } from "../src/freshness.js"

const SH_OWN = asSubtreeHash("sh-own-01")
const SH_BODY = asSubtreeHash("sh-body-01")
const NODE_A = asHash("u-a")
const NODE_B = asHash("u-b")
const IR = "ir-01" // shared interface rState — irrelevant to this defect, held constant

const member = (node: string, interfaceRState = IR): ClosureMember => ({
  node: asHash(node),
  interfaceRState,
  bodySubtreeHash: SH_BODY,
})

describe("WP-4.10-b.GROUND — closure multiset soundness (GROUND-11, sameClosure)", () => {
  // THE TEETH: pinned [A, A] vs current [A, B] — same length, and A is present in current, but the
  // membership genuinely changed (a real A dropped out, replaced by B). A sound multiset comparison
  // MUST read this as DRIFTED. The length-plus-lookup implementation reads it as FRESH (fails RED on
  // unpatched code — see report for the `cp`-backup verification).
  it("a duplicated pinned member masking a real membership change reads DRIFTED, not FRESH", () => {
    const pinned: FreshnessSnapshot = {
      ownSubtreeHashes: [SH_OWN],
      closure: [member("u-a"), member("u-a")], // [A, A]
    }
    const current: FreshnessSnapshot = {
      ownSubtreeHashes: [SH_OWN],
      closure: [member("u-a"), member("u-b")], // [A, B] — B genuinely replaced the second A
    }
    expect(freshness(pinned, current)).toBe<Freshness>("DRIFTED")
  })

  // Symmetric direction: current holds the duplicate, pinned does not — membership still changed and
  // must not be masked by matching the single pinned A against either current A.
  it("a duplicated current member masking a real membership change reads DRIFTED, not FRESH", () => {
    const pinned: FreshnessSnapshot = {
      ownSubtreeHashes: [SH_OWN],
      closure: [member("u-a"), member("u-b")], // [A, B]
    }
    const current: FreshnessSnapshot = {
      ownSubtreeHashes: [SH_OWN],
      closure: [member("u-a"), member("u-a")], // [A, A] — B vanished, A doubled
    }
    expect(freshness(pinned, current)).toBe<Freshness>("DRIFTED")
  })

  // NEGATIVE DIRECTION (must NOT regress): genuinely identical closures, including ones with a legitimate
  // duplicate `node` on BOTH sides in the SAME order and out of order, must still read FRESH. A multiset
  // fix that over-corrects into "any duplicate ⇒ DRIFTED" or that is order-sensitive would fail this.
  it("genuinely identical closures — including legitimate duplicates on both sides — read FRESH", () => {
    const pinned: FreshnessSnapshot = {
      ownSubtreeHashes: [SH_OWN],
      closure: [member("u-a"), member("u-a"), member("u-b")], // [A, A, B]
    }
    const currentSameOrder: FreshnessSnapshot = {
      ownSubtreeHashes: [SH_OWN],
      closure: [member("u-a"), member("u-a"), member("u-b")], // [A, A, B]
    }
    expect(freshness(pinned, currentSameOrder)).toBe<Freshness>("FRESH")

    const currentReordered: FreshnessSnapshot = {
      ownSubtreeHashes: [SH_OWN],
      closure: [member("u-b"), member("u-a"), member("u-a")], // [B, A, A] — same multiset, different order
    }
    expect(freshness(pinned, currentReordered)).toBe<Freshness>("FRESH")
  })

  // A count-only fix (drop the interfaceRState from the comparison key) would falsely read this FRESH:
  // same node multiset {A, A} on both sides, but ONE of the two A's changed its interfaceRState. That is
  // a real signature/contract change on one call site of A and MUST drift (GROUND-11c, interface-fold).
  it("same node-multiset but one duplicate member changed interfaceRState reads DRIFTED (11c)", () => {
    const pinned: FreshnessSnapshot = {
      ownSubtreeHashes: [SH_OWN],
      closure: [member("u-a", "ir-01"), member("u-a", "ir-01")],
    }
    const current: FreshnessSnapshot = {
      ownSubtreeHashes: [SH_OWN],
      closure: [member("u-a", "ir-01"), member("u-a", "ir-02")], // one A's interface changed
    }
    expect(freshness(pinned, current)).toBe<Freshness>("DRIFTED")
  })
})
