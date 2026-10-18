// @atlas/cli — test/resolve-mine-slots.test.ts  (SOUND-DEFAULT-MINE AC-B1 — the DEFAULT is the multi-arm SET)
//
// `resolveMineSlot` (singular) answers "which ONE arm" for the bench's per-axis harness; `resolveMineSlots`
// (plural) answers "which arms does a DEFAULT run mine". Unset ⇒ the SOUND-by-default union
// (advisory + dependency + count); an explicit single arm isolates to just that arm (the bench's teeth); a
// typo THROWS with the SAME message `resolveMineSlot` uses — a misconfiguration must never degrade silently.

import { describe, expect, it } from "vitest"
import { MINE_SLOT_ENV, resolveMineSlot, resolveMineSlots } from "../src/mine-proposer.js"

const withSlot = (v: string | undefined): NodeJS.ProcessEnv => (v === undefined ? {} : { [MINE_SLOT_ENV]: v })

describe("AC-B1 — resolveMineSlots: DEFAULT is the union, explicit isolates, typo throws", () => {
  it("unset OR empty ⇒ the full SOUND-by-default union [advisory, dependency, count]", () => {
    expect(resolveMineSlots({})).toEqual(["advisory", "dependency", "count"])
    expect(resolveMineSlots(withSlot(""))).toEqual(["advisory", "dependency", "count"])
    expect(resolveMineSlots(withSlot("   "))).toEqual(["advisory", "dependency", "count"])
  })

  it.each(["advisory", "dependency", "count"])("an explicit valid arm %j ⇒ the singleton [%j]", (arm) => {
    expect(resolveMineSlots(withSlot(arm))).toEqual([arm])
  })

  it.each([" Dependency ", "COUNT", "ADVISORY"])("trims + lowercases the explicit arm %j to its singleton", (v) => {
    expect(resolveMineSlots(withSlot(v))).toEqual([v.trim().toLowerCase()])
  })

  it.each(["dependncy", "relation", "dep", "counts"])("THROWS on the unknown arm %j (no silent fallback)", (v) => {
    expect(() => resolveMineSlots(withSlot(v))).toThrow(/not a known mining arm/)
  })

  it("the singular resolveMineSlot is UNCHANGED — unset still ⇒ advisory (the frozen single-pass contract)", () => {
    expect(resolveMineSlot({})).toBe("advisory")
  })
})
