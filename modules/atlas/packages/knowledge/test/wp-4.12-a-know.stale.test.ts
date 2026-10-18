import { describe, expect, it } from "vitest"
import { resolveFactFreshness } from "../src/lifecycle/freshness.js"

describe("WP-4.12-a.KNOW — structural freshness routing", () => {
  it("SCN-GROUND-13a-1 — advisory structural DRIFTED resolves STALE", () => {
    expect(resolveFactFreshness("advisory", "DRIFTED")).toBe("STALE")
  })

  it("SCN-GROUND-13b-1 — predicate structural DRIFTED remains DRIFTED for KNOW-5", () => {
    expect(resolveFactFreshness("predicate", "DRIFTED")).toBe("DRIFTED")
  })

  it("SCN-GROUND-13c-1 — FRESH remains FRESH for both kinds", () => {
    expect(resolveFactFreshness("advisory", "FRESH")).toBe("FRESH")
    expect(resolveFactFreshness("predicate", "FRESH")).toBe("FRESH")
  })

  it("SCN-GROUND-13d-1 — advisory STALE remains STALE", () => {
    expect(resolveFactFreshness("advisory", "STALE")).toBe("STALE")
  })

  it("SCN-GROUND-13e-1 — unknown runtime kind never returns FRESH", () => {
    const unknownKind = "unknown" as Parameters<typeof resolveFactFreshness>[0]
    expect(resolveFactFreshness(unknownKind, "FRESH")).not.toBe("FRESH")
    expect(resolveFactFreshness(unknownKind, "DRIFTED")).toBe("DRIFTED")
  })
})
