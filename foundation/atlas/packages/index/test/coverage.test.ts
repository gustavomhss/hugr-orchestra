// @atlas/index — test/coverage.test.ts
//
// Conformance suite for the INDEX-16 standing coverage gate (facet: coverage.ts).
// Transcribes the frozen VISIBLE goldens ONLY:
//   docs/requirements/goldens-idx.md § SCN-INDEX-16a-1, 16b-1, 16c-1.
// Held-out `-2` fixtures are NOT read here. Invariant: invariant-register.md INDEX-16
// (T0 unresolved/total > 15% ⇒ build fails; ratio published).
//
// The unresolved-edge set + territory assignment are FROZEN UPSTREAM INPUTS (EXCLUSIONS):
// this facet neither records/resolves edges (EPIC-8-b/13) nor assigns territory (EPIC-9-a/14-15).
// They enter here as fixtures / factory inputs — no sibling src is imported.
//
// gate() boolean polarity — the ref FLAGS that the boolean encoding is not pinned. The goldens pin the
// SEMANTIC ("FAILs the build") but are silent on the bit. Per the resolution rule we adopt the ref's
// recommendation `true`=PASS (gate reads as a predicate), so a FAILing gate returns `false`. FLAGGED.

import { describe, expect, it } from "vitest"
import type { Territory } from "@atlas/contracts"
import { createCoverage } from "../src/coverage.js"

const cas = (tier: Territory["tier"]): Territory => ({
  name: "cas",
  owner: "seat:index",
  tier,
  globs: [],
})

describe("INDEX-16 — standing coverage gate (coverage.ts)", () => {
  it("SCN-INDEX-16a-1: publishes the unresolved-edge ratio per-territory on every rollup", () => {
    // Given `territory:cas` with 3 unresolved of 20 total edges.
    const cov = createCoverage([{ territory: "cas", unresolved: 3, total: 20 }])
    // Then the rollup publishes ratio(cas) = 3/20 = 0.15 as a readable per-territory health metric.
    expect(cov.ratio(cas("T0"))).toBe(0.15)
  })

  it("SCN-INDEX-16b-1: enforces the T0 ceiling as a standing gate from day one", () => {
    // Given a T0 territory with ratio 0.20 (> 0.15) at first build.
    const cov = createCoverage([{ territory: "cas", unresolved: 4, total: 20 }])
    const t0 = cas("T0")
    // The gate is active from day one and evaluates the ceiling (not deferred to the `functional` axis):
    // it returns a real verdict now, and a crossing ratio yields FAIL (=== false under true=PASS).
    expect(cov.ratio(t0)).toBe(0.2)
    expect(cov.gate(t0)).toBe(false)
  })

  it("SCN-INDEX-16c-1: a T0 territory crossing the ceiling FAILs the gate", () => {
    // Given T0 `territory:cas` with unresolved/total = 0.20 > 0.15.
    const cov = createCoverage([{ territory: "cas", unresolved: 4, total: 20 }])
    // Then gate(cas) FAILs the build (not merely schedules the `functional` axis).
    // true=PASS polarity ⇒ FAIL is encoded as `false` (the gate-fires assertion).
    expect(cov.gate(cas("T0"))).toBe(false)
  })
})
