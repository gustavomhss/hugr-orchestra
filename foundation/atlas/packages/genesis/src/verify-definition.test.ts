// @atlas/genesis — src/verify-definition.test.ts  (#196d — the DEFINITION class of the PROVEN family)
//
// The oracle's verdicts, over an in-memory `SymbolReverseApi` fake + an identity `pathOfHash` fake — the SAME
// fixture shape `verify-fact.test.ts` uses (`nodeHashOfPath = identity`, so a def-doc is named directly by its
// path and `∩ S` reduces to `underScope(path, S)`). Pure unit tests: no store, no disk — `verifyDefinition`
// alone. A definition is a witnessed EXISTENCE (the def-occurrence lies under the scope), sound in ANY world.

import { describe, it, expect } from "vitest"
import type { Hash } from "@atlas/contracts"
import type { SymbolReverseApi } from "@atlas/index"
import { verifyDefinition } from "./verify-fact.js"
import type { DefClaim } from "./verify-fact.js"

const TARGET = "scip:X#" // a GLOBAL SCIP symbol (not `local `)
const SCOPE = "src/pay" // the scope the claim asserts the definition lives under

/** identity `pathOfHash`: the "hash" of a path IS the path (mirrors the negation-door / verify-fact fixture). */
const pathOfHash = (h: Hash): string | undefined => String(h)

/** `isLocal`: the real `local ` SCIP-symbol grammar (mirrors `@atlas/index`'s `isLocalSymbol`). */
const isLocal = (sym: string): boolean => sym.startsWith("local ")

/** A fake N0 feed: `definesAt(target)` names the def-doc PATH (identity-hashed); `resolves(target)` is true iff
 *  the symbol has a def-site (`defPath !== undefined`). A phantom is `defPath: undefined` ⇒ resolves false. */
function feed(opts: { defPath?: string | undefined }): SymbolReverseApi {
  const { defPath } = opts
  return {
    reverseCallers: () => [],
    holeSources: () => [],
    opaqueRefSources: () => [],
    resolves: (sym: string) => sym === TARGET && defPath !== undefined,
    definesAt: (sym: string) => (sym === TARGET && defPath !== undefined ? (defPath as unknown as Hash) : undefined),
  }
}

const claim = (over: Partial<DefClaim> = {}): DefClaim => ({ sourceScope: SCOPE, target: TARGET, ...over })

describe("verifyDefinition — the DEFINITION class of the PROVEN fact family", () => {
  it("proven: the symbol is DEFINED under sourceScope", () => {
    const reverse = feed({ defPath: "src/pay/charge.ts" })
    expect(verifyDefinition(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "proven",
      oracle: "symbol-reverse",
    })
  })

  it("abstain('def-out-of-scope'): the symbol is defined ELSEWHERE, outside sourceScope", () => {
    const reverse = feed({ defPath: "src/other/charge.ts" }) // defined, but NOT under 'src/pay'
    expect(verifyDefinition(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "def-out-of-scope",
      oracle: "symbol-reverse",
    })
  })

  it("abstain('target-unresolvable'): the target has no in-index definition (#220 — a phantom)", () => {
    const reverse = feed({ defPath: undefined })
    expect(verifyDefinition(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "target-unresolvable",
      oracle: "symbol-reverse",
    })
  })

  it("abstain('target-not-global'): the target is a `local ` SCIP symbol (document-scoped, #189)", () => {
    const reverse = feed({ defPath: "src/pay/charge.ts" })
    expect(verifyDefinition(claim({ target: "local 3" }), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "target-not-global",
      oracle: "symbol-reverse",
    })
  })

  it("abstain('malformed'): empty target OR empty scope", () => {
    const reverse = feed({ defPath: "src/pay/charge.ts" })
    expect(verifyDefinition(claim({ target: "" }), reverse, pathOfHash, isLocal).reason).toBe("malformed")
    expect(verifyDefinition(claim({ sourceScope: "" }), reverse, pathOfHash, isLocal).reason).toBe("malformed")
  })

  // TEETH (0-FP floor): the proven branch's `sourceScope` containment MUST be segment-wise, never a substring.
  // A def in a SIBLING dir whose name has `sourceScope` as a string prefix (`src/pay` ⊂ `src/paycheck`, the
  // #153 trap) is NOT under `src/pay` — asserting NOT-proven here kills the `underScope`→`.includes` drift
  // mutant (which would return `proven`) and the "drop the scope containment" mutant (a false `proven`).
  it("NOT proven: the def sits in a sibling dir that only STRING-prefixes sourceScope (#153)", () => {
    const reverse = feed({ defPath: "src/paycheck/charge.ts" }) // defined, but NOT under 'src/pay'
    expect(verifyDefinition(claim(), reverse, pathOfHash, isLocal)).toEqual({
      verdict: "abstain",
      reason: "def-out-of-scope",
      oracle: "symbol-reverse",
    })
  })
})
