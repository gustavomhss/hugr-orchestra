// @atlas/genesis — src/verify-fact.test.ts  (spike/verify-fact)
//
// The oracle's five verdicts, over an in-memory `SymbolReverseApi` fake + an identity `pathOfHash` fake —
// the SAME fixture shape `adapter-io/test/negation-door.test.ts` uses for the negation door's gate-1
// (`nodeHashOfPath = identity`, so a caller/hole is named directly by its file path and `∩ S` reduces to
// `underScope(path, S)`). Pure unit tests: no store, no disk, no policy — `verifyDependency` alone.

import { describe, it, expect } from "vitest"
import type { Hash } from "@atlas/contracts"
import type { SymbolReverseApi } from "@atlas/index"
import { verifyDependency } from "./verify-fact.js"
import type { DepClaim } from "./verify-fact.js"

const TARGET = "scip:X#" // a GLOBAL SCIP symbol (not `local `)
const SOURCE = "src/pay" // the scope the claim asserts the caller lives under
const WORLD = "src" // the closed-world scope a REFUTE must see completely

/** identity `pathOfHash`: the "hash" of a path IS the path (mirrors the negation-door fixture). */
const pathOfHash = (h: Hash): string | undefined => String(h)

/** `isLocal`: the real `local ` SCIP-symbol grammar (mirrors `@atlas/index`'s `isLocalSymbol`). */
const isLocal = (sym: string): boolean => sym.startsWith("local ")

/** A fake N0 feed: `reverseCallers(target)` and `holeSources()` name paths (identity-hashed);
 *  `resolves(target)` defaults to true (the target IS in-index-defined) unless overridden. */
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

const claim = (over: Partial<DepClaim> = {}): DepClaim => ({
  sourceScope: SOURCE,
  target: TARGET,
  worldScope: WORLD,
  ...over,
})

describe("verifyDependency — the positive dual of the #99b negation door gate-1", () => {
  it("proven: a real caller of the target lies under sourceScope", () => {
    const reverse = feed({ callers: ["src/pay/a.ts"] })
    expect(verifyDependency(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "proven",
      oracle: "symbol-reverse",
    })
  })

  it("abstain('no-caller-in-scope'): no caller under sourceScope, world closed — NOT refuted (cross-pkg completeness not guaranteed, PV-recall 2026-08-12)", () => {
    const reverse = feed({ callers: [], holes: ["other/unrelated.ts"] }) // hole exists but OUTSIDE worldScope='src'
    expect(verifyDependency(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "no-caller-in-scope",
      oracle: "symbol-reverse",
    })
  })

  it("abstain('target-unresolvable'): the target has no in-index definition (#220 — a phantom)", () => {
    const reverse = feed({ callers: [], resolvesTarget: false })
    expect(verifyDependency(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "target-unresolvable",
      oracle: "symbol-reverse",
    })
  })

  it("abstain('scope-open'): a hole lies under worldScope — absence of a caller cannot be trusted", () => {
    const reverse = feed({ callers: [], holes: ["src/pay/hole.ts"] }) // hole IS under worldScope='src'
    expect(verifyDependency(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "scope-open",
      oracle: "symbol-reverse",
    })
  })

  it("abstain('target-not-global'): the target is a `local ` SCIP symbol (document-scoped, #99b v1)", () => {
    const reverse = feed({ callers: [] })
    const localClaim = claim({ target: "local 3" })
    expect(verifyDependency(localClaim, reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "target-not-global",
      oracle: "symbol-reverse",
    })
  })

  // TEETH (0-FP floor): the proven branch's `sourceScope` containment MUST be segment-wise, never a
  // substring. A real caller in a SIBLING dir whose name has `sourceScope` as a string prefix
  // (`src/pay` ⊂ `src/paycheck`, the #153 trap) is NOT under `src/pay` — asserting NOT-proven here kills
  // both the `underScope`→`.includes` drift mutant (which would return `proven`) and the "drop the
  // sourceScope containment" mutant that the original 5 fixtures left alive (a false `proven`, the worst
  // outcome this oracle exists to prevent).
  it("NOT proven: a real caller sits in a sibling dir that only STRING-prefixes sourceScope (#153)", () => {
    const reverse = feed({ callers: ["src/paycheck/billing.ts"] }) // caller exists, but NOT under 'src/pay'
    expect(verifyDependency(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain", // no caller under sourceScope ⇒ abstain (never refuted — see FactVerdict)
      reason: "no-caller-in-scope",
      oracle: "symbol-reverse",
    })
  })

  // TEETH: the same segment-wise discipline on the `worldScope` containment (the scope-open diagnostic). A
  // hole in a sibling dir that only string-prefixes `worldScope` must NOT count as in-scope — else a
  // `.includes` drift flips the abstain reason from 'no-caller-in-scope' to 'scope-open'. The verdict is
  // abstain either way (never proven), but the reason discriminates and kills the mutant.
  it("abstain 'no-caller-in-scope', not 'scope-open': a hole sits in a sibling dir that only STRING-prefixes worldScope (#153)", () => {
    const reverse = feed({ callers: [], holes: ["src/paycheck/hole.ts"] }) // hole NOT under worldScope='src/pay'
    expect(verifyDependency(claim({ worldScope: "src/pay" }), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "no-caller-in-scope",
      oracle: "symbol-reverse",
    })
  })
})
