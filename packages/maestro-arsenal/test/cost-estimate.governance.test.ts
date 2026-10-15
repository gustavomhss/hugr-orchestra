import { expect, test } from "bun:test"
import governance, { type GovernanceInput } from "../src/tools/governance.ts"
import { type GovernanceContext } from "../src/governance/contracts.ts"
import { estimate, type Price } from "../src/governance/telemetry.ts"
import { validateArgs } from "../src/validate.ts"
import { result } from "./fixtures.governance.ts"

const prices: Price[] = [{ provider: "provider", model: "model", input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75, currency: "USD", source: "explicit-provider-contract", asOf: "2026-10-02" }]
const estimates = [{ provider: "provider", model: "model", input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 }]
const context: GovernanceContext = {
  directory: "/unused-estimate-repository", stateDirectory: "/unused-estimate-state", projectID: "project",
  async authorize() { throw new Error("PURE_ESTIMATE_REQUESTED_IO") },
}

test.each([
  { label: "$3 over $1", budgetUSD: 1, input: 1_000_000, status: "OVER_ESTIMATE", costUSD: 3, error: true },
  { label: "$3 equals $3", budgetUSD: 3, input: 1_000_000, status: "WITHIN_ESTIMATE", costUSD: 3, error: false },
  { label: "$3.000003 over $3 without rounding", budgetUSD: 3, input: 1_000_001, status: "OVER_ESTIMATE", costUSD: 3.000003, error: true },
])("actual cost-estimate handler checks $label", async (entry) => {
  const input: GovernanceInput = { operation: "cost-estimate", estimates: [{ ...estimates[0], input: entry.input }], prices, budgetUSD: entry.budgetUSD }
  expect(validateArgs(governance.inputSchema, input).ok).toBe(true)
  const response = await governance.handler(input, context)
  expect(response.isError === true).toBe(entry.error)
  expect(result<ReturnType<typeof estimate>>(response)).toEqual(estimate(input.estimates!, prices, entry.budgetUSD))
  expect(result<{ status: string; costUSD: number; kind: string; liveCapEnforced: boolean }>(response)).toMatchObject({
    status: entry.status, costUSD: entry.costUSD, kind: "estimate", liveCapEnforced: false,
  })
})

test.each([
  { label: "missing exact price", prices: [], budgetUSD: 3, hold: "PRICING_UNKNOWN: provider/model", costUSD: null },
  { label: "different model price", prices: [{ ...prices[0], model: "other-model" }], budgetUSD: 3, hold: "PRICING_UNKNOWN: provider/model", costUSD: null },
  { label: "missing budget", prices, hold: "BUDGET_MISSING", costUSD: 3 },
])("actual cost-estimate handler refuses HOLD: $label", async (entry) => {
  const input: GovernanceInput = { operation: "cost-estimate", estimates, prices: entry.prices, ...("budgetUSD" in entry ? { budgetUSD: entry.budgetUSD } : {}) }
  expect(validateArgs(governance.inputSchema, input).ok).toBe(true)
  const response = await governance.handler(input, context)
  expect(response.isError).toBe(true)
  expect(result<{ status: string; holds: string[]; costUSD: number | null; liveCapEnforced: boolean }>(response)).toMatchObject({
    status: "HOLD", holds: [entry.hold], costUSD: entry.costUSD, liveCapEnforced: false,
  })
})
