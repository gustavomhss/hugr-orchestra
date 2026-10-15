// @atlas/cli — test/mine-slot-gating.test.ts  (#196a — the ATLAS_MINE_SLOT arm selector, tested not inspected)
//
// The dependency mining arm is off by default and must stay a MEASURED flip. `resolveMineSlot` is the sole
// gate; a MISSPELLED value must THROW (never silently degrade to advisory — the fail-silent trap #167). And
// that throw must fire on the REAL CLI path (`resolveProposer`) EVEN WITH NO MODEL CONFIGURED — the Luna
// cold-review F4 gap: the arm is validated BEFORE the no-model early return, so a typo cannot be swallowed
// as a clean zero-config abstention.

import { describe, expect, it } from "vitest"
import { MINE_SLOT_ENV, resolveMineSlot, resolveProposer } from "../src/mine-proposer.js"

const withSlot = (v: string | undefined): NodeJS.ProcessEnv => (v === undefined ? {} : { [MINE_SLOT_ENV]: v })

describe("#196a — resolveMineSlot gates the arm, default advisory", () => {
  it("is advisory when unset or empty", () => {
    expect(resolveMineSlot({})).toBe("advisory")
    expect(resolveMineSlot(withSlot(""))).toBe("advisory")
    expect(resolveMineSlot(withSlot("  "))).toBe("advisory")
  })

  it.each(["advisory", "dependency", "DEPENDENCY", " Dependency ", "count", "COUNT", " Count "])(
    "accepts the known arm %j (trimmed, case-insensitive)",
    (v) => {
      expect(resolveMineSlot(withSlot(v))).toBe(v.trim().toLowerCase())
    },
  )

  it.each(["dependncy", "relation", "advisor", "dep", "cont", "counts"])(
    "THROWS on the unknown arm %j (no silent advisory fallback)",
    (v) => {
      expect(() => resolveMineSlot(withSlot(v))).toThrow(/not a known mining arm/)
    },
  )

  it("resolveProposer THROWS on an unknown arm EVEN with no model configured (Luna F4 — validated before the no-model return)", () => {
    // The throw fires in `resolveMineSlot` BEFORE `loadModelConfig` is consulted, so no repo/model is needed;
    // a bogus repoPath is fine — it is never read. Teeth: with the validation AFTER the early return, this
    // would return `defaultProposer()` and swallow the typo.
    expect(() => resolveProposer("/nonexistent-repo-for-slot-gate", withSlot("dependncy"))).toThrow(
      /not a known mining arm/,
    )
  })
})
