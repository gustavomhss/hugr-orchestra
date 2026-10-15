// @atlas/knowledge — test/tier.test.ts  (task #84 · the governance-class LATTICE, at the layer that owns it)
//
// `tier.ts` shipped with NO test of its own. Every tooth it had was borrowed from a door two layers up
// (`SCN-GE-I6/I7` at emit, `SCN-GL-9` at link), and a door only ever asks the lattice the questions THAT
// door happens to ask. A mutation review proved the gap: splitting `isWeakerTier`'s guard so an
// unrecognized INCUMBENT returns `false` instead of `true` left the ENTIRE suite green. The doc comment
// states that half of the contract in words ("an unrecognized incumbent always strictest — a node whose
// class cannot be read is never written") and nothing executed it.
//
// Why the two halves of that guard are NOT symmetric, and why one of them had no cover:
//   · the DECLARED class is validated at gate 0 of the emit door (`isTier(raw.tier)`), so the "declared is
//     off-lattice" half is reachable only under a mutant — SCN-GE-I6/I7 already stand in front of it;
//   · the INCUMBENT class is read back off CAS bytes and is validated NOWHERE. `.atlas/` is a COMMITTED,
//     shared directory, and `mine`'s durable write path (`cli/src/mine.ts` — `d.store.put(f)`) puts the
//     fact its injected `EmitGate` returned with no `isTier` check at all. So an off-lattice stored class
//     sitting behind a projection row is the reachable side, and it was the untested one.
// Each case names the mutant it kills.

import { describe, it, expect } from "vitest"
import { isTier, tierRank, isWeakerTier, strictestTier } from "../src/ratify/tier.js"
import type { Tier } from "@atlas/contracts"

/** The three real governance classes, STRICTEST-FIRST — written as a LITERAL here, not imported, so the
 *  test states the order independently of whatever the module derives it from. */
const TIERS: readonly Tier[] = ["T0", "T1", "T2"]

/** Every shape a class field can carry that is NOT one of the three real governance classes: the
 *  near-misses (`'T3'`, case/whitespace variants), the PROTOTYPE members (an `in`-based guard admits all of
 *  these), and the JSON-shaped holes (`null`/number/absent/empty). None may ever read as a real class. */
const OFF_LATTICE: readonly unknown[] = [
  "T3",
  "t0",
  " T0",
  "T0 ",
  "T00",
  "",
  "toString",
  "__proto__",
  "constructor",
  "valueOf",
  "hasOwnProperty",
  null,
  undefined,
  0,
  1,
  true,
  {},
  ["T0"],
  new String("T0"),
  Symbol("T0"),
]

describe("@atlas/knowledge tier — the governance-class lattice (isTier · tierRank · isWeakerTier · strictestTier)", () => {
  it("SCN-TIER-1 — `isTier` admits EXACTLY the three real classes, byte-exact, prototype-proof", () => {
    // MUTANT: weaken the own-property lookup to `v in STRICTNESS` and every prototype member below walks in
    // (the same mutant SCN-GE-I6 kills one layer up — pinned HERE at the module that makes the claim).
    for (const t of TIERS) expect(isTier(t), `${t} is a real class`).toBe(true)
    for (const bogus of OFF_LATTICE) {
      expect(isTier(bogus), `${String(bogus)} must not read as a governance class`).toBe(false)
    }
  })

  it("SCN-TIER-2 — `tierRank` IS the total order STRICTEST-FIRST: T0→0, T1→1, T2→2, contiguous", () => {
    // MUTANT: invert the derivation (rank straight off STRICTNESS, so T0→2) and every cross-class
    // comparator — `own.ts` (~153, ~168) and `relate.ts` — silently sorts the most-permissive class FIRST,
    // i.e. a `tier-desc` pack serves T2 ahead of a billy-ratified T0. The exact ordinals are pinned, not
    // just their relative order, because the off-lattice sentinel (SCN-TIER-3) is `TIERS.length` and only
    // a CONTIGUOUS 0..n-1 keeps "unrecognized ranks strictly last" true.
    expect(TIERS.map(tierRank)).toEqual([0, 1, 2])
    expect(tierRank("T0")).toBeLessThan(tierRank("T1"))
    expect(tierRank("T1")).toBeLessThan(tierRank("T2"))
  })

  it("SCN-TIER-3 — an off-lattice class ranks LAST, never `NaN` and never FIRST (a poisoned row sinks)", () => {
    // MUTANT: drop the `isTier` guard in `tierRank` and the `STRICTNESS` lookup yields `undefined` — so the
    // rank is `NaN`, `tierRank(a) - tierRank(b)` is `NaN`, and the sort order becomes undefined AROUND the
    // poisoned row instead of sinking it behind every real class.
    for (const bogus of OFF_LATTICE) {
      expect(tierRank(bogus), `${String(bogus)} ranks last`).toBe(TIERS.length)
      expect(Number.isNaN(tierRank(bogus))).toBe(false)
      for (const t of TIERS) expect(tierRank(t)).toBeLessThan(tierRank(bogus))
    }
  })

  it("SCN-TIER-4 — an UNRECOGNIZED INCUMBENT is ALWAYS strictest: a node whose class cannot be read is never written", () => {
    // THE BRANCH THE MUTATION REVIEW PROVED UNCOVERED. `isWeakerTier(declared, incumbent)` is TOTAL over
    // `unknown` and fails closed on BOTH sides — but only the DECLARED side was ever exercised, because the
    // emit door validates what a write declares and validates NOTHING about what it reads back from CAS.
    //
    // MUTANT: split the one guard into two so the incumbent side answers `false`:
    //     if (!isTier(incumbent)) return false;
    //     if (!isTier(declared)) return true;
    // Then a node whose STORED class is `'T3'` reads as "no write is weaker than this" — i.e. every write
    // is a permitted re-statement — and the downgrade guard that exists to keep a ratified class monotone
    // waves through the write that erases it. This case goes RED; nothing else in the repo does.
    for (const incumbent of OFF_LATTICE) {
      for (const declared of [...TIERS, ...OFF_LATTICE]) {
        expect(
          isWeakerTier(declared, incumbent),
          `declared=${String(declared)} vs UNREADABLE incumbent=${String(incumbent)} must refuse`,
        ).toBe(true)
      }
    }
  })

  it("SCN-TIER-5 — an UNRECOGNIZED DECLARED class is ALWAYS weaker (nothing off-lattice writes anything)", () => {
    // MUTANT: the mirror split — `if (!isTier(declared)) return false;` — and a payload declaring `'T3'`
    // is "not weaker than T0", which is the reproduced T0 → T3 → T2 erasure.
    for (const declared of OFF_LATTICE) {
      for (const incumbent of TIERS) {
        expect(isWeakerTier(declared, incumbent), `declared=${String(declared)} must be weaker`).toBe(true)
      }
    }
  })

  it("SCN-TIER-6 — ON the lattice it is the strict order: weaker DOWN only, never reflexive, never up", () => {
    // MUTANT: `<=` instead of `<` and re-stating a class becomes a downgrade (the door would refuse every
    // idempotent re-emit); `>` and strictness ratchets the wrong way.
    expect(isWeakerTier("T2", "T0")).toBe(true)
    expect(isWeakerTier("T2", "T1")).toBe(true)
    expect(isWeakerTier("T1", "T0")).toBe(true)
    for (const t of TIERS) expect(isWeakerTier(t, t), `${t} re-stated is not weaker`).toBe(false)
    expect(isWeakerTier("T0", "T2")).toBe(false) // RAISING strictness is never a downgrade
    expect(isWeakerTier("T0", "T1")).toBe(false)
    expect(isWeakerTier("T1", "T2")).toBe(false)
  })

  it("SCN-TIER-7 — the JOIN takes the stricter side, is commutative, and garbage joins to T0 (never dilutes)", () => {
    // MUTANT: return the OTHER argument on garbage (or `a` unconditionally) and an unreadable class makes a
    // governed act CHEAPER to sign — the dilution `SCN-GL-9` reproduces at the link door.
    const pairs: readonly (readonly [Tier, Tier, Tier])[] = [
      ["T0", "T2", "T0"],
      ["T1", "T2", "T1"],
      ["T0", "T1", "T0"],
      ["T2", "T2", "T2"],
      ["T1", "T1", "T1"],
      ["T0", "T0", "T0"],
    ]
    for (const [a, b, want] of pairs) {
      expect(strictestTier(a, b), `join(${a},${b})`).toBe(want)
      expect(strictestTier(b, a), `join is commutative`).toBe(want)
    }
    for (const bogus of OFF_LATTICE) {
      for (const t of TIERS) {
        expect(strictestTier(t, bogus), `join(${t}, ${String(bogus)})`).toBe("T0")
        expect(strictestTier(bogus, t), `join(${String(bogus)}, ${t})`).toBe("T0")
      }
      expect(strictestTier(bogus, bogus)).toBe("T0")
    }
  })
})
