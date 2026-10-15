// @atlas/knowledge — test/test-vacuity-key.test.ts  (SEAT ANCHOR — ADR-0015 D5 / #95 test-vacuity identity)
//
// THE CRUX this file pins: a single-anchor test-vacuity fact `(unitKey, testName)` gets a collision-free
// address from `testVacuityKey`, deterministic (pure, no clock/seq), with the `tv`-tagged preimage set
// DISJOINT from `negationKey`'s ({neg,t,s}) so a test-vacuity and a negation over the "same" strings never
// collide. The rest gives TEETH to the total-over-unknown refusals — a mutant that drops either guard fails.

import { describe, expect, it } from "vitest"
import {
  MALFORMED_TEST_VACUITY_REASON,
  MalformedTestVacuityError,
  negationKey,
  routeWrite,
  testVacuityKey,
} from "../src/write/router.js"

const U = "scip typescript . . `test/pay.test.ts`/charges-fail()." // the unit LINEAGE holding the test
const T = "charges when the gateway rejects" // the test name — the other identity leg
const OTHER_T = "refunds on a double charge" // a different test in the same unit

describe("test-vacuity identity — the single-anchor fact mints a deterministic, collision-free address (SEAT ANCHOR)", () => {
  it("THE CRUX: testVacuityKey mints a stable key for (unitKey, testName)", () => {
    const k = testVacuityKey(U, T)
    expect(typeof k).toBe("string")
    expect((k as string).length).toBeGreaterThan(0)
    // Determinism: same pair ⇒ same key (pure, no clock/seq).
    expect(testVacuityKey(U, T)).toBe(k)
  })

  it("TESTNAME is an identity leg: same unit, a DIFFERENT test is a DIFFERENT fact", () => {
    expect(testVacuityKey(U, T)).not.toBe(testVacuityKey(U, OTHER_T))
  })

  it("UNITKEY is an identity leg: the same test name in a DIFFERENT unit is a DIFFERENT fact", () => {
    expect(testVacuityKey(U, T)).not.toBe(testVacuityKey("scip typescript . . `test/ledger.test.ts`/x().", T))
  })

  it("CROSS-FAMILY DISJOINT (#103): the `tv` tag keeps a test-vacuity off negationKey's address", () => {
    // Even with structurally kin arguments, the tagged preimage sets ({tv,u,t} vs {neg,t,s}) cannot collide.
    expect(testVacuityKey(U, T) as string).not.toBe(negationKey("calls", U, T) as string)
  })

  describe("fail-closed refusals — MalformedTestVacuityError, never a raw TypeError (TEETH)", () => {
    it("empty / non-string UNITKEY is refused, TOTAL over unknown", () => {
      for (const bad of ["", 42, null, undefined, {}, [], Symbol("x")] as unknown[]) {
        expect(() => testVacuityKey(bad, T)).toThrow(MalformedTestVacuityError)
      }
    })
    it("empty / non-string TESTNAME is refused, TOTAL over unknown", () => {
      for (const bad of ["", 42, null, undefined, {}, [], Symbol("x")] as unknown[]) {
        expect(() => testVacuityKey(U, bad)).toThrow(MalformedTestVacuityError)
      }
    })
    it("a well-formed pair does NOT throw (the guards are not vacuous)", () => {
      expect(() => testVacuityKey(U, T)).not.toThrow()
    })
    it("the reason names the mechanism and tells the author what to do", () => {
      expect(MALFORMED_TEST_VACUITY_REASON).toMatch(/^malformed test-vacuity: /)
      expect(MALFORMED_TEST_VACUITY_REASON).toMatch(/unitKey/)
      expect(MALFORMED_TEST_VACUITY_REASON).toMatch(/testName/)
      expect(new MalformedTestVacuityError().name).toBe("MalformedTestVacuityError")
    })
  })
})

describe("routeWrite — the test-vacuity family cell (ADR-0015 D5)", () => {
  it("a test-vacuity nodeKey MISS ⇒ CREATE", () => {
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: false, family: "test-vacuity", checkSame: false })).toBe(
      "CREATE",
    )
  })
  it("a test-vacuity nodeKey HIT ⇒ UPDATE (claim set-union), never SUPERSEDE — it has no check", () => {
    expect(routeWrite({ contentHashHit: false, nodeKeyHit: true, family: "test-vacuity", checkSame: false })).toBe(
      "UPDATE",
    )
  })
  it("byte-identical test-vacuity ⇒ DEDUP (idempotent), regardless of nodeKey", () => {
    expect(routeWrite({ contentHashHit: true, nodeKeyHit: true, family: "test-vacuity", checkSame: false })).toBe(
      "DEDUP",
    )
  })
})
