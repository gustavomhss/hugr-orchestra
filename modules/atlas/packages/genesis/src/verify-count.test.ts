// @atlas/genesis — src/verify-count.test.ts  (spike/verify-fact — the COUNT class)
//
// `verifyCount` over the SAME in-memory `SymbolReverseApi` fake + identity `pathOfHash` the dependency
// oracle's tests use (`nodeHashOfPath = identity`, so a caller/hole is named by its path and `∩ S` reduces
// to `underScope`). Pure unit tests: no store, no disk. The soundness the fixtures pin is the LOWER-BOUND
// direction — a witnessed cardinality proves `truth ≥ N`, never `truth == N` outside a closed world.

import { describe, it, expect } from "vitest"
import type { Hash } from "@atlas/contracts"
import type { SymbolReverseApi } from "@atlas/index"
import { verifyCount } from "./verify-count.js"
import type { CountClaim } from "./verify-count.js"

const TARGET = "scip:X#"
const SOURCE = "src/pay"
const WORLD = "src"

const pathOfHash = (h: Hash): string | undefined => String(h)
const isLocal = (sym: string): boolean => sym.startsWith("local ")

function feed(opts: {
  callers?: readonly string[]
  holes?: readonly string[]
  resolvesTarget?: boolean
}): SymbolReverseApi {
  const { callers = [], holes = [], resolvesTarget = true } = opts
  return {
    reverseCallers: (sym: string) => (sym === TARGET ? (callers as unknown as readonly Hash[]) : []),
    holeSources: () => holes as unknown as readonly Hash[],
    opaqueRefSources: () => [],
    resolves: (sym: string) => sym === TARGET && resolvesTarget,
    definesAt: (sym: string) => (sym === TARGET && resolvesTarget ? ("src/def.ts" as unknown as Hash) : undefined),
  }
}

const claim = (over: Partial<CountClaim> = {}): CountClaim => ({
  sourceScope: SOURCE,
  target: TARGET,
  atLeast: 2,
  worldScope: WORLD,
  ...over,
})

const proven = { verdict: "proven", oracle: "symbol-reverse" }

describe("verifyCount — the CARDINALITY dual of the dependency oracle (sound lower bound)", () => {
  it("proven: witnessed callers under sourceScope MEET the lower bound (2 of 2)", () => {
    const reverse = feed({ callers: ["src/pay/a.ts", "src/pay/b.ts"] })
    expect(verifyCount(claim({ atLeast: 2 }), reverse, pathOfHash, isLocal)).toEqual(proven)
  })

  it("proven: witnessed callers EXCEED the lower bound (3 ≥ 2) — a lower bound, not an equality", () => {
    const reverse = feed({ callers: ["src/pay/a.ts", "src/pay/b.ts", "src/pay/c.ts"] })
    expect(verifyCount(claim({ atLeast: 2 }), reverse, pathOfHash, isLocal)).toEqual(proven)
  })

  it("abstain('below-witnessed-bound'): fewer witnessed than asserted — NOT refuted (an incomplete index cannot bound from above; #189 family)", () => {
    const reverse = feed({ callers: ["src/pay/a.ts"] }) // only 1 witnessed, claim asserts ≥ 2
    expect(verifyCount(claim({ atLeast: 2 }), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "below-witnessed-bound",
      oracle: "symbol-reverse",
    })
  })

  // TEETH (0-FP floor): the count MUST be segment-wise scoped, never a substring. A caller in a SIBLING dir
  // that only STRING-prefixes sourceScope (`src/pay` ⊂ `src/paycheck`, the #153 trap) is NOT under the scope
  // and must NOT be counted — else the bound is met by a fabricated in-scope caller (a false `proven`, the
  // worst outcome). With one real in-scope caller + one sibling, witnessed=1 < 2 ⇒ abstain, not proven.
  it("NOT proven: a sibling dir that only STRING-prefixes sourceScope is not counted (#153)", () => {
    const reverse = feed({ callers: ["src/pay/a.ts", "src/paycheck/b.ts"] }) // only a.ts is under src/pay
    expect(verifyCount(claim({ atLeast: 2 }), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "below-witnessed-bound",
      oracle: "symbol-reverse",
    })
  })

  it("abstain('target-unresolvable'): a phantom target (#220) — no count about it is groundable", () => {
    const reverse = feed({ callers: [], resolvesTarget: false })
    expect(verifyCount(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "target-unresolvable",
      oracle: "symbol-reverse",
    })
  })

  it("abstain('target-not-global'): a `local ` SCIP symbol (document-scoped, #99b v1)", () => {
    const reverse = feed({ callers: ["src/pay/a.ts", "src/pay/b.ts"] })
    expect(verifyCount(claim({ target: "local 3" }), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "target-not-global",
      oracle: "symbol-reverse",
    })
  })

  it("abstain('malformed'): atLeast is 0 (a vacuous '≥ 0' tautology), negative, or fractional", () => {
    const reverse = feed({ callers: ["src/pay/a.ts", "src/pay/b.ts"] })
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(verifyCount(claim({ atLeast: bad }), reverse, pathOfHash, isLocal)).toEqual({
        verdict: "abstain",
        reason: "malformed",
        oracle: "symbol-reverse",
      })
    }
  })

  describe("EXACT mode — an equality is a closed-world claim", () => {
    it("proven: witnessed EXACTLY equals atLeast and the world is CLOSED (no holes in worldScope)", () => {
      const reverse = feed({ callers: ["src/pay/a.ts", "src/pay/b.ts"], holes: ["other/x.ts"] }) // hole OUTSIDE world='src'
      expect(verifyCount(claim({ atLeast: 2, exact: true }), reverse, pathOfHash, isLocal)).toEqual(proven)
    })

    it("abstain('scope-open'): a hole lies UNDER worldScope — an unseen caller could exist, so exact cannot be proven", () => {
      const reverse = feed({ callers: ["src/pay/a.ts", "src/pay/b.ts"], holes: ["src/pay/hole.ts"] }) // hole IS under world='src'
      expect(verifyCount(claim({ atLeast: 2, exact: true }), reverse, pathOfHash, isLocal)).toEqual({
        verdict: "abstain",
        reason: "scope-open",
        oracle: "symbol-reverse",
      })
    })

    it("abstain('exact-count-mismatch'): closed world but witnessed (3) ≠ asserted (2) — no false exact", () => {
      const reverse = feed({ callers: ["src/pay/a.ts", "src/pay/b.ts", "src/pay/c.ts"] })
      expect(verifyCount(claim({ atLeast: 2, exact: true }), reverse, pathOfHash, isLocal)).toEqual({
        verdict: "abstain",
        reason: "exact-count-mismatch",
        oracle: "symbol-reverse",
      })
    })

    // TEETH: exact mode must ALSO segment-wise scope its world-hole test. A hole in a sibling dir that only
    // string-prefixes worldScope must NOT open the world — else a `.includes` drift flips a provable exact to
    // a false 'scope-open' abstain (a recall loss, not a soundness loss, but the mutant must still die).
    it("proven, not 'scope-open': a hole in a sibling dir only STRING-prefixing worldScope does not open the world (#153)", () => {
      const reverse = feed({ callers: ["src/pay/a.ts", "src/pay/b.ts"], holes: ["src/paycheck/hole.ts"] })
      // world = 'src/pay'; the hole 'src/paycheck/hole.ts' is NOT under it ⇒ world is closed ⇒ exact provable.
      expect(
        verifyCount(claim({ atLeast: 2, exact: true, worldScope: "src/pay" }), reverse, pathOfHash, isLocal),
      ).toEqual(proven)
    })
  })
})
