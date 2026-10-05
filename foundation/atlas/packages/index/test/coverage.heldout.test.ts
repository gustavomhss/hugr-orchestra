// @atlas/index — test/coverage.heldout.test.ts
//
// HELD-OUT gate for INDEX-16 (cold-review). Transcribes the frozen held-out `-2` goldens:
//   docs/requirements/goldens-idx.md § SCN-INDEX-16a-2, 16b-2, 16c-2 (territory:net, ratio 0.25).
// Run against the EXISTING src/coverage.ts. Polarity per WP ruling: true=PASS ⇒ FAIL === false.

import { describe, expect, it } from "vitest"
import type { Territory } from "@atlas/contracts"
import { createCoverage } from "../src/coverage.js"

const net = (tier: Territory["tier"]): Territory => ({
  name: "net",
  owner: "seat:index",
  tier,
  globs: [],
})

describe("INDEX-16 held-out (-2) — territory:net", () => {
  it("SCN-INDEX-16a-2: publishes ratio(net) = 5/20 = 0.25 per-territory", () => {
    const cov = createCoverage([{ territory: "net", unresolved: 5, total: 20 }])
    expect(cov.ratio(net("T0"))).toBe(0.25)
  })

  it("SCN-INDEX-16b-2: T0 net ratio 0.25 (>0.15) — standing gate active, evaluates ceiling", () => {
    const cov = createCoverage([{ territory: "net", unresolved: 5, total: 20 }])
    const t0 = net("T0")
    expect(cov.ratio(t0)).toBe(0.25)
    expect(cov.gate(t0)).toBe(false) // crossing ⇒ FAIL (=== false under true=PASS)
  })

  it("SCN-INDEX-16c-2: T0 net crossing ceiling FAILs the gate", () => {
    const cov = createCoverage([{ territory: "net", unresolved: 5, total: 20 }])
    expect(cov.gate(net("T0"))).toBe(false)
  })
})
