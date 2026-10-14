// @atlas/cli — test/mine-semantic-arm.test.ts  (196c — the ATLAS_MINE_SLOT=semantic arm)
//
// The semantic arm is the OPT-IN general justified arm: valid as an explicit single arm, but DELIBERATELY absent
// from the sound-by-default SET (every semantic slot lands `justified`, not `proven`). This suite pins:
//   • `resolveMineSlot('semantic')` resolves the arm (trimmed, case-insensitive) — the singular selector accepts it
//   • an UNKNOWN arm still THROWS (no silent fallback — the fail-silent trap #167 stays closed for semantic too)
//   • the DEFAULT `resolveMineSlots` set is UNCHANGED — still [advisory, dependency, count], semantic NOT added
//   • the throw fires on the REAL CLI path (`resolveProposer`) even with no model configured (Luna F4)

import { describe, expect, it } from "vitest"
import { MINE_SLOT_ENV, resolveMineSlot, resolveMineSlots, resolveProposer } from "../src/mine-proposer.js"

const withSlot = (v: string | undefined): NodeJS.ProcessEnv => (v === undefined ? {} : { [MINE_SLOT_ENV]: v })

describe("the semantic arm: opt-in single arm, NOT in the sound-by-default set", () => {
  it.each(["semantic", "SEMANTIC", " Semantic "])(
    "resolveMineSlot accepts the semantic arm %j (trimmed, case-insensitive)",
    (v) => {
      expect(resolveMineSlot(withSlot(v))).toBe("semantic")
    },
  )

  it("resolveMineSlot STILL throws on an unknown arm (semantic is added, the typo guard is not weakened)", () => {
    expect(() => resolveMineSlot(withSlot("semantics"))).toThrow(/not a known mining arm/)
    expect(() => resolveMineSlot(withSlot("gotcha"))).toThrow(/not a known mining arm/) // gotcha is now a SLOT VALUE, not an arm
  })

  it("the message names semantic as a valid arm (so the misconfiguration is self-correcting)", () => {
    expect(() => resolveMineSlot(withSlot("bogus"))).toThrow(/semantic/)
  })

  it("resolveMineSlots as an EXPLICIT arm ⇒ the singleton [semantic] (opt-in, isolated to itself)", () => {
    expect(resolveMineSlots(withSlot("semantic"))).toEqual(["semantic"])
  })

  it("the DEFAULT set is UNCHANGED — still [advisory, dependency, count], semantic is NOT sound-by-default", () => {
    // teeth: the whole point of the opt-in — a default `atlas mine` must NOT silently start emitting justified
    // semantic facts. If semantic were added to the default union, this would read four arms.
    expect(resolveMineSlots({})).toEqual(["advisory", "dependency", "count"])
    expect(resolveMineSlots(withSlot(""))).toEqual(["advisory", "dependency", "count"])
    expect(resolveMineSlots({})).not.toContain("semantic")
  })

  it("resolveProposer STILL throws on an unknown arm even with no model configured (Luna F4 — validated first)", () => {
    expect(() => resolveProposer("/nonexistent-repo-for-semantic-gate", withSlot("semantics"))).toThrow(
      /not a known mining arm/,
    )
  })
})
