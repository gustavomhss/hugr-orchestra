// @atlas/genesis — src/verify-negation.test.ts  (spike/verify-fact — the NEGATION class)
//
// `verifyNegation` over the SAME in-memory `SymbolReverseApi` fake + identity `pathOfHash` the dependency
// and count oracles use. The soundness the fixtures pin is the DUAL of the dependency oracle: REFUTE is the
// any-world-sound direction (a witnessed caller in scope), PROVE is the closed-world one (no caller AND no
// hole in the SAME scope). A phantom target abstains (#220) — never a vacuous proven. SINGLE scope: caller
// absence and hole absence are checked against the same region (lucy cold-review — a separate under-sized
// world would admit a false proven).

import { describe, it, expect } from "vitest"
import type { Hash } from "@atlas/contracts"
import type { SymbolReverseApi } from "@atlas/index"
import { verifyNegation } from "./verify-negation.js"
import type { NegationClaim } from "./verify-negation.js"

const TARGET = "scip:X#"
const SCOPE = "src/pay"

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

const claim = (over: Partial<NegationClaim> = {}): NegationClaim => ({
  scope: SCOPE,
  target: TARGET,
  ...over,
})

describe("verifyNegation — the DUAL of the dependency oracle (refute any-world, prove closed-world), single scope", () => {
  it("refuted: a witnessed caller under scope — the negation is false, SOUND IN ANY WORLD (even with holes)", () => {
    const reverse = feed({ callers: ["src/pay/a.ts"], holes: ["src/pay/hole.ts"] }) // hole present, yet refute still sound
    expect(verifyNegation(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "refuted",
      oracle: "symbol-reverse",
    })
  })

  it("proven: no caller under scope AND the scope is hole-free", () => {
    const reverse = feed({ callers: [], holes: ["other/unrelated.ts"] }) // hole OUTSIDE scope='src/pay'
    expect(verifyNegation(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "proven",
      oracle: "symbol-reverse",
    })
  })

  it("abstain('scope-open'): no caller, but a hole lies UNDER the scope — an unseen caller could exist", () => {
    const reverse = feed({ callers: [], holes: ["src/pay/hole.ts"] }) // hole IS under scope='src/pay'
    expect(verifyNegation(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "scope-open",
      oracle: "symbol-reverse",
    })
  })

  // SOUNDNESS TEETH (lucy cold-review): the hole check ranges over EXACTLY the claim's scope — not a separate,
  // possibly under-sized world. A hole INSIDE the very scope the negation ranges over MUST block `proven`.
  // Under the old two-scope shape, a caller could pass a `worldScope` narrower than `sourceScope`, hiding this
  // hole and emitting a false `proven`. With one scope that is impossible: the hole under `src/pay` here is in
  // the scope by construction, so the verdict is abstain, never proven.
  it("SINGLE-SCOPE TEETH: a hole inside the claim's own scope always blocks proven (no under-sized world can hide it)", () => {
    const reverse = feed({ callers: [], holes: ["src/pay/deep/hidden.ts"] })
    expect(verifyNegation(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "scope-open",
      oracle: "symbol-reverse",
    })
  })

  it("abstain('target-unresolvable'): a phantom target (#220) — reverseCallers is [] by construction, so 'no caller' must NOT prove the negation", () => {
    const reverse = feed({ callers: [], resolvesTarget: false })
    expect(verifyNegation(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "target-unresolvable",
      oracle: "symbol-reverse",
    })
  })

  it("abstain('target-not-global'): a `local ` SCIP symbol (document-scoped, #99b v1)", () => {
    const reverse = feed({ callers: [] })
    expect(verifyNegation(claim({ target: "local 3" }), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "target-not-global",
      oracle: "symbol-reverse",
    })
  })

  it("abstain('malformed'): an empty scope or target", () => {
    const reverse = feed({ callers: [] })
    for (const bad of [{ scope: "" }, { target: "" }] as Partial<NegationClaim>[]) {
      expect(verifyNegation(claim(bad), reverse, pathOfHash, isLocal)).toEqual({
        verdict: "abstain",
        reason: "malformed",
        oracle: "symbol-reverse",
      })
    }
  })

  // TEETH (0-FP floor): the REFUTE branch's scope containment MUST be segment-wise, never a substring. A
  // caller in a SIBLING dir that only STRING-prefixes scope (`src/pay` ⊂ `src/paycheck`, the #153 trap) is
  // NOT under `src/pay`, so it must NOT refute the negation over `src/pay`. With that sibling not a hole
  // either, the honest verdict is PROVEN, not a false REFUTE. Kills the `underScope`→`.includes` drift mutant.
  it("NOT refuted: a caller in a sibling dir that only STRING-prefixes scope does not refute (#153)", () => {
    const reverse = feed({ callers: ["src/paycheck/billing.ts"] }) // caller exists, but NOT under 'src/pay'
    expect(verifyNegation(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "proven", // no caller under scope, scope hole-free (the sibling is a resolved caller, not a hole)
      oracle: "symbol-reverse",
    })
  })

  // TEETH: the same segment-wise discipline on the hole test. A hole in a sibling dir that only string-prefixes
  // scope must NOT open the scope — else a `.includes` drift flips a provable negation to a false 'scope-open'.
  it("proven, not 'scope-open': a hole in a sibling dir only STRING-prefixing scope does not open it (#153)", () => {
    const reverse = feed({ callers: [], holes: ["src/paycheck/hole.ts"] }) // hole NOT under scope='src/pay'
    expect(verifyNegation(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "proven",
      oracle: "symbol-reverse",
    })
  })

  it("determinism: identical inputs ⇒ identical verdict", () => {
    const reverse = feed({ callers: ["src/pay/a.ts"] })
    const a = verifyNegation(claim(), reverse, pathOfHash, isLocal)
    const b = verifyNegation(claim(), reverse, pathOfHash, isLocal)
    expect(a).toEqual(b)
  })
})
