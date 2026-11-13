import { expect, test } from "bun:test"
import { ReviewCatalog } from "../../src/review/catalog"
import { ReviewRoute } from "../../src/review/route"

const settings = { acceptedUnavailable: [] }
const base = { files: ["package.json", "src/a.ts"] }
const head = { files: base.files, changes: [{ path: "src/a.ts", added: [{ line: 1, text: "export const n = 1" }], removed: 1 }] }

test("production Deep runs its own budget for explicit requests, pins and release", () => {
  const tier = ReviewCatalog.current.route.tiers.find((entry) => entry.id === "deep")
  expect(tier).toMatchObject({ built: true, runs: "deep" })
  for (const request of [
    { stage: "code" as const, tier: "deep", settings },
    { stage: "code" as const, settings: { ...settings, tier: "deep" } },
    { stage: "code" as const, profile: "release", settings },
  ]) {
    const record = ReviewRoute.route(request, base, head, ReviewCatalog.current)
    expect(record.tier.id).toBe("deep")
    expect(record.tier.requested).toBeUndefined()
    expect(record.budget).toMatchObject({ samples: 2, probeAttempts: 3, verifiers: 10, toolCallsPerSession: 50, itemsPerLens: 30 })
  }
})

test("risk-triggered Deep activates while explicit Quick and Standard retain their budgets", () => {
  const risk = { files: ["package.json", "src/auth/login.ts"], changes: [{ path: "src/auth/login.ts", added: [{ line: 1, text: "const auth = 1" }], removed: 1 }] }
  const triggered = ReviewRoute.route({ stage: "code", settings }, base, risk, ReviewCatalog.current)
  expect(triggered.tier.id).toBe("deep")
  expect(triggered.tier.signals.length).toBeGreaterThan(0)
  expect(triggered.budget.samples).toBe(2)
  for (const tier of ["quick", "standard"]) {
    const record = ReviewRoute.route({ stage: "code", tier, settings }, base, risk, ReviewCatalog.current)
    expect(record.tier.id).toBe(tier)
    expect(record.budget.samples).toBe(1)
  }
})

test("a genuinely unbuilt catalog still records the requested tier and falls back", () => {
  const catalog: ReviewCatalog.Catalog = { ...ReviewCatalog.current,
    route: { ...ReviewCatalog.current.route, tiers: ReviewCatalog.current.route.tiers.map((tier) => tier.id === "deep" ? { ...tier, built: false, runs: "standard" } : tier) },
  }
  const record = ReviewRoute.route({ stage: "code", tier: "deep", settings }, base, head, catalog)
  expect(record.tier).toMatchObject({ id: "standard", requested: "deep" })
  expect(record.budget.samples).toBe(1)
})
