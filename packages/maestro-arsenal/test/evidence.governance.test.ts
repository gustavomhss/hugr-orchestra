import { expect, test } from "bun:test"
import { join } from "node:path"
import { acceptance } from "../src/governance/acceptance.ts"
import { telemetry, estimate, type Observations, type Price } from "../src/governance/telemetry.ts"
import relay, { evaluateCompletion, type CompletionContract } from "../src/tools/relay-arm.ts"
import { fixture, capture, check, provenance, operation, result } from "./fixtures.governance.ts"
import { rethrow } from "./rejection.ts"
const price: Price = { provider: "provider", model: "model", input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5, currency: "USD", source: "provider-contract", asOf: "2026-09-30" }
function observations(): Observations {
  return Object.freeze({ complete: true, usage: Object.freeze([{ provider: "provider", model: "model", input: 1000000, output: 100000, cacheRead: 100000, cacheWrite: 100000, provenance: provenance("usage") }]), actions: Object.freeze([{ tool: "native-tool", outcome: "succeeded" as const, provenance: provenance("action") }]), checks: capture(check("suite")) })
}
test("acceptance proves red-green and explicit source-pre-green preservation", () => {
  expect(acceptance("project", capture(check("new", "fail"), check("source")), capture(check("new"), check("source")), [{ name: "new", mode: "red-green" }, { name: "source", mode: "preserve-source-green" }]).status).toBe("PASS")
  expect(acceptance("project", capture(check("new")), capture(check("new")), [{ name: "new", mode: "red-green" }]).failures).toContain("BASELINE_PASS: new")
})
test("acceptance names skipped/missing/regressed checks and refuses empty/incomplete acquisition", () => {
  const before = capture(check("new", "fail"), check("old"))
  const after = capture(check("new", "skip"), check("different"))
  const report = acceptance("project", before, after, [{ name: "new", mode: "red-green" }])
  expect(report.status).toBe("FAIL")
  expect(report.failures).toContain("FINAL_SKIP: new")
  expect(report.failures).toContain("REGRESSION_MISSING: old")
  expect(() => acceptance("project", before, { complete: false, results: [] }, [{ name: "new", mode: "red-green" }])).toThrow("CHECK_ACQUISITION_INCOMPLETE")
  expect(() => acceptance("project", capture(), after, [{ name: "new", mode: "red-green" }])).toThrow("CHECK_ACQUISITION_EMPTY_OR_OVERFLOW")
  expect(() => acceptance("project", before, after, [])).toThrow("ACCEPTANCE_EMPTY_OR_OVERFLOW")
})
test("evidence rejects fabricated green without actual exit, duplicates and project mismatch", () => {
  const forged = { ...check("suite"), exitCode: undefined }
  expect(() => acceptance("project", capture(forged), capture(check("suite")), [{ name: "suite", mode: "preserve-source-green" }])).toThrow("CHECK_EXIT_MISSING: suite")
  expect(() => acceptance("project", capture(check("suite"), check("suite")), capture(check("suite")), [{ name: "suite", mode: "preserve-source-green" }])).toThrow("CHECK_DUPLICATE: suite")
  expect(() => acceptance("other", capture(check("suite")), capture(check("suite")), [{ name: "suite", mode: "preserve-source-green" }])).toThrow("OBSERVATION_PROJECT_MISMATCH")
  expect(() => acceptance("project", capture({ ...check("suite"), exitCode: 1 }), capture(check("suite")), [{ name: "suite", mode: "preserve-source-green" }])).toThrow("CHECK_EXIT_CONTRADICTION: suite")
})
test("usage exact provider rates/cache buckets, missing prices HOLD, audit stores no transcript", async () => {
  const f = await fixture()
  const supplied = observations()
  const report = telemetry("project", supplied, [price])
  expect(report.usage.costUSD).toBeCloseTo(3.27)
  expect(report.audit.persisted).toBe(false)
  expect(report.audit.integrityClaim).toBe("digest-of-supplied-observations-only")
  const missing = telemetry("project", supplied)
  expect(missing.usage.status).toBe("HOLD")
  expect(missing.usage.costUSD).toBeNull()
  for (const name of ["audit", "usage", "status"] as const) {
    const native = await operation<Record<string, unknown>>({ operation: name, observations: supplied, ...(name === "audit" ? {} : { prices: [price] }) }, f.context)
    expect(native).toBeDefined()
  }
  expect(f.permissions.length).toBe(0)
  expect(await Bun.file(join(f.state, "project", "audit.jsonl")).exists()).toBe(false)
})
test("telemetry names duplicate, empty, incomplete and unknown exact model", () => {
  const supplied = observations()
  expect(() => telemetry("project", { ...supplied, complete: false })).toThrow("OBSERVATION_ACQUISITION_INCOMPLETE")
  expect(() => telemetry("project", { complete: true, usage: [], actions: [] })).toThrow("OBSERVATION_ACQUISITION_EMPTY")
  expect(() => telemetry("project", { ...supplied, usage: [...supplied.usage, ...supplied.usage] })).toThrow("OBSERVATION_DUPLICATE")
  expect(telemetry("project", { ...supplied, usage: supplied.usage.map((record) => ({ ...record, model: "other-model" })) }, [price]).usage.holds).toContain("PRICING_UNKNOWN: provider/other-model")
})
test("cost estimates need explicit budget and prices, never live-cap success", async () => {
  const f = await fixture()
  const tokens = observations().usage.map(({ provenance: ignored, ...record }) => record)
  expect(estimate(tokens, [price], 1).status).toBe("OVER_ESTIMATE")
  expect(estimate(tokens, [price]).holds).toContain("BUDGET_MISSING")
  expect(estimate(tokens, [], 10).status).toBe("HOLD")
  const native = await operation<{ status: string; liveCapEnforced: boolean }>({ operation: "cost-estimate", estimates: tokens, prices: [price], budgetUSD: 10 }, f.context)
  expect(native.status).toBe("WITHIN_ESTIMATE")
  expect(native.liveCapEnforced).toBe(false)
})
test("Relay stores canonical project contract, host must bind checks; no Claude hook claim", async () => {
  const f = await fixture()
  const contract: CompletionContract = { sessionID: "session", label: "review", retryBudget: 3, chain: [{ id: "verify", checks: [{ id: "suite", hostCheck: "bun-tests" }] }] }
  const armed = result<{ token: string; enforced: boolean }>(await relay.handler({ action: "arm", contract }, f.context))
  expect(armed.enforced).toBe(false)
  expect(result<{ token: string }>(await relay.handler({ action: "arm", contract }, f.context)).token).toBe(armed.token)
  expect(result<{ contract: CompletionContract }>(await relay.handler({ action: "read", token: armed.token }, f.context)).contract).toEqual(contract)
  const missing = evaluateCompletion("project", contract, capture(check("suite")), [])
  expect(missing.failures).toContain("HOST_CHECK_UNBOUND: bun-tests")
  expect(missing.currentGate).toBe("verify")
  const green = await operation<{ status: string; hookInstalled: boolean }>({ operation: "completion-check", contract, checks: capture(check("suite")), bindings: ["bun-tests"] }, f.context)
  expect(green.status).toBe("PASS")
  expect(green.hookInstalled).toBe(false)
  expect(evaluateCompletion("project", contract, capture(check("suite", "skip")), ["bun-tests"]).status).toBe("FAIL")
  expect(await rethrow(relay.handler({ action: "arm", contract: { ...contract, chain: [] } }, f.context))).toThrow("COMPLETION_CHAIN_EMPTY_OR_OVERFLOW")
})
test("native acceptance operation executes exact contract", async () => {
  const f = await fixture()
  expect((await operation<{ status: string }>({ operation: "acceptance", baseline: capture(check("suite", "fail")), final: capture(check("suite")), acceptance: [{ name: "suite", mode: "red-green" }] }, f.context)).status).toBe("PASS")
})
