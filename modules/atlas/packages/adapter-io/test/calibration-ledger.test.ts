// WP-3-RETR — the PRODUCTION legs (`calibration-ledger.ts`): `budgetLeg`/`territoriesLeg`. These are the
// composition-root bindings that turn the frozen @atlas/retrieval `ledgerFrom`/`offAtlasFrom` into running
// code. The tooth: the served-injection / served-turn FEED must be the honest zero today — a leg that
// fabricated a feed (invented served records, invented rates) must FAIL here. The legs' behaviour is
// `ledgerFrom`/`offAtlasFrom`'s own covered domain (wp-6.18-retr.test.ts); this file covers the WIRING:
// no fabrication, no invented rate, deterministic known-territory vocabulary.

import { describe, it, expect } from "vitest"
import { budgetLeg, territoriesLeg, OFF_ATLAS_THRESHOLD } from "../src/calibration-ledger.js"
import { defaultPolicy } from "../src/policy.js"

describe("WP-3-RETR — budgetLeg reports the honest-zero served feed", () => {
  it("reports 0 served records today (the RETR-8 writer is the next WP — nothing fabricated)", () => {
    const report = budgetLeg()()
    expect(report.servedRecords).toBe(0)
    // every kind still renders at its ratified floor via ledgerFrom — never NaN, never an invented rate.
    const kinds = report.ledger.budget()
    expect(kinds.length).toBeGreaterThan(0)
    for (const row of kinds) {
      expect(Number.isFinite(row.hitRate)).toBe(true)
      expect(row.hits).toBe(0)
      expect(row.capTokens).toBeGreaterThan(0) // the ratified BASE_CAP floor
    }
  })
})

describe("WP-3-RETR — territoriesLeg renders the registered territories at rate 0 on no history, never throws", () => {
  it("registers the admin-declared authz scopes as known territories, each rate 0 (SCN-RETR-13d/e)", () => {
    const policy = defaultPolicy()
    const api = territoriesLeg(policy)()
    const rows = api.offAtlas()
    expect(api.crossesThreshold("no-such-territory", OFF_ATLAS_THRESHOLD)).toBe(false)
    for (const row of rows) {
      expect(row.offAtlasRate).toBe(0) // no served history ⇒ 0, never NaN
      expect(row.served).toBe(0)
    }
  })
})
