// @atlas/genesis — test/capped-budget.test.ts  (MINE-BUDGET-CAP · AC-5)
//
// RED→GREEN transcription of the caller-chosen site ceiling. `cappedBudget(N)` is the ONE source of the
// single-pass budget shape (all deepening loops off); `defaultBudget` is now `cappedBudget(min(frontier,
// CEILING_CAP))`, so the refactor is behaviour-preserving — the existing `defaultBudget` goldens
// (wp-8.30-gen.test.ts) stay green, and this file pins the new helper + the refactor's invariant.

import { describe, it, expect } from "vitest"
import { cappedBudget, defaultBudget, CEILING_CAP } from "../src/run-controller.js"

describe("MINE-BUDGET-CAP — cappedBudget (AC-5)", () => {
  it("cappedBudget(7) returns ceiling 7 with all deepening loops off", () => {
    const b = cappedBudget(7)
    expect(b.ceiling).toBe(7)
    expect([b.deepening.review.enabled, b.deepening.enrich.enabled, b.deepening.expand.enabled]).toEqual([
      false,
      false,
      false,
    ])
  })

  it("defaultBudget(1000) still caps at CEILING_CAP (200) via the refactor — behaviour-preserving", () => {
    expect(defaultBudget(1000).ceiling).toBe(CEILING_CAP)
    expect(defaultBudget(3).ceiling).toBe(3) // below the cap, the frontier size passes through
  })

  it("cappedBudget shares the SAME shape defaultBudget returns (one source)", () => {
    expect(cappedBudget(5)).toEqual(defaultBudget(5)) // frontier 5 < 200 ⇒ min is 5, identical shape
  })
})
