// @atlas/knowledge — test/negation-key.test.ts  (SEAT ANCHOR — ADR-0015 D3 / #99b negation identity)
//
// THE CRUX this file pins: a scoped negative `(¬relationKind, target, scope)` gets a collision-free address
// from `negationKey`, DIRECTED (target and scope are not interchangeable), with the `neg`-tagged preimage set
// DISJOINT from `relationKey`'s ({a,k,b}) so a negation and a relation over the "same" strings never collide.
// The rest gives TEETH to the total-over-unknown refusals — a mutant that drops any guard must fail here.

import { describe, expect, it } from "vitest"
import {
  MALFORMED_NEGATION_REASON,
  MalformedNegationError,
  negationKey,
  relationKey,
  routeWrite,
} from "../src/write/router.js"
import type { RelationKind } from "../src/types.js"

const X = "scip typescript . . `src/pay.ts`/charge()." // a GLOBAL symbol key the negative is ABOUT
const S = "src/pay" // a DIRECTORY scope key the witness ranges over
const OTHER = "src/ledger" // a different scope

describe("negation identity — the scoped negative mints a directed, collision-free address (SEAT ANCHOR)", () => {
  it("THE CRUX: negationKey mints a stable key for (kind, target, scope)", () => {
    const k = negationKey("calls", X, S)
    expect(typeof k).toBe("string")
    expect((k as string).length).toBeGreaterThan(0)
    // Determinism: same triple ⇒ same key (pure, no clock/seq).
    expect(negationKey("calls", X, S)).toBe(k)
  })

  it("DIRECTED: target and scope are NOT interchangeable — swapping them is a different key", () => {
    expect(negationKey("calls", X, S)).not.toBe(negationKey("calls", S, X))
  })

  it("SCOPE is an identity leg: same (kind, target) at a DIFFERENT scope is a DIFFERENT fact", () => {
    expect(negationKey("calls", X, S)).not.toBe(negationKey("calls", X, OTHER))
  })

  it("KIND discriminates: (¬calls, X, S) ≠ (¬depends-on, X, S)", () => {
    expect(negationKey("calls", X, S)).not.toBe(negationKey("depends-on", X, S))
  })

  it("CROSS-FAMILY DISJOINT (#103): the `neg` tag keeps a negation off relationKey's address", () => {
    // Even with structurally kin arguments, the tagged preimage sets ({neg,t,s} vs {a,k,b}) cannot collide.
    expect(negationKey("calls", X, S) as string).not.toBe(relationKey(X, "calls", S) as string)
  })

  describe("fail-closed refusals — MalformedNegationError, never a raw TypeError (TEETH)", () => {
    it("empty / non-string TARGET is refused, TOTAL over unknown", () => {
      for (const bad of ["", 42, null, undefined, {}, [], Symbol("x")] as unknown[]) {
        expect(() => negationKey("calls", bad, S)).toThrow(MalformedNegationError)
      }
    })
    it("empty / non-string SCOPE is refused, TOTAL over unknown", () => {
      for (const bad of ["", 42, null, undefined, {}, [], Symbol("x")] as unknown[]) {
        expect(() => negationKey("calls", X, bad)).toThrow(MalformedNegationError)
      }
    })
    it("off-vocabulary KIND is refused (mutant dropping the isKnownRelationKind guard fails here)", () => {
      for (const bad of ["implements", "CALLS", "negation", "", 1, null, undefined, {}] as unknown[]) {
        expect(() => negationKey(bad, X, S)).toThrow(MalformedNegationError)
      }
    })
    it("a well-formed triple does NOT throw (the guards are not vacuous)", () => {
      const kinds: readonly RelationKind[] = ["calls", "depends-on"]
      for (const k of kinds) expect(() => negationKey(k, X, S)).not.toThrow()
    })
    it("the reason names the mechanism and tells the author what to do", () => {
      expect(MALFORMED_NEGATION_REASON).toMatch(/^malformed negation: /)
      expect(MALFORMED_NEGATION_REASON).toMatch(/GLOBAL symbol/)
      expect(MALFORMED_NEGATION_REASON).toMatch(/scope/)
      expect(new MalformedNegationError().name).toBe("MalformedNegationError")
    })
  })
})

describe("routeWrite — the negation family cell (ADR-0015 D3)", () => {
  it("a negation nodeKey MISS ⇒ CREATE", () => {
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: false, family: "negation", checkSame: false })).toBe(
      "CREATE",
    )
  })
  it("a negation nodeKey HIT ⇒ UPDATE (claim set-union), never SUPERSEDE — a negation has no check", () => {
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: true, family: "negation", checkSame: false })).toBe("UPDATE")
  })
  it("byte-identical negation ⇒ DEDUP (idempotent), regardless of nodeKey", () => {
    expect(routeWrite({ contentHashHit: true, nodeKeyHit: true, family: "negation", checkSame: false })).toBe("DEDUP")
  })
})
