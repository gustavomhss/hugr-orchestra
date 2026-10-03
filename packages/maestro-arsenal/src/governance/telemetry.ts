// Reuses host-supplied Session observations; replaces audit-trail.py, roi-telemetry.py, cost-governor.py, mission-control.py.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
// No transcript copy, invented rates, live-cap enforcement or claimed event-store integrity.
import { createHash } from "node:crypto"
import { type GovernanceContext, type Usage, type Price, type Observations, observationsSchema, validateProvenance, validateCapture, requireValue, revisionDiagnostics } from "./contracts.ts"
import { validateArgs } from "../validate.ts"
export type { Usage, Price, Observations } from "./contracts.ts"
export { usageSchema, priceSchema, observationsSchema } from "./contracts.ts"
export function validateObservations(projectID: string, observations: Observations) {
  requireValue(observations && observations.complete === true, "OBSERVATION_ACQUISITION_INCOMPLETE")
  requireValue(Array.isArray(observations.usage) && Array.isArray(observations.actions) && observations.usage.length <= 2048 && observations.actions.length <= 2048, "OBSERVATION_OVERFLOW_OR_INVALID")
  requireValue(observations.usage.length + observations.actions.length > 0, "OBSERVATION_ACQUISITION_EMPTY")
  const keys = new Set<string>()
  ;[...observations.usage, ...observations.actions].forEach((observation) => {
    validateProvenance(observation.provenance, projectID)
    const key = `${"tool" in observation ? "action" : "usage"}:${observation.provenance.sessionID}:${observation.provenance.eventID}`
    requireValue(!keys.has(key), "OBSERVATION_DUPLICATE")
    keys.add(key)
  })
  observations.actions.forEach((action) => requireValue(action.tool.length > 0 && action.tool.length <= 4096 && ["succeeded", "failed", "denied"].includes(action.outcome), "ACTION_OBSERVATION_INVALID"))
  observations.usage.forEach((usage) => {
    requireValue(usage.provider.length > 0 && usage.model.length > 0, "USAGE_MODEL_MISSING")
    ;[usage.input, usage.output, usage.cacheRead, usage.cacheWrite].forEach((count) => requireValue(Number.isSafeInteger(count) && count >= 0, "USAGE_COUNT_INVALID"))
  })
  if (observations.checks) validateCapture(observations.checks, projectID)
}
export function pricedUsage(usage: readonly Omit<Usage, "provenance">[], prices: readonly Price[]) {
  requireValue(prices.length <= 512 && usage.length <= 2048 && usage.length > 0, "PRICING_INPUT_EMPTY_OR_OVERFLOW")
  requireValue(new Set(prices.map((price) => `${price.provider}\0${price.model}`)).size === prices.length, "PRICING_DUPLICATE")
  prices.forEach((price) => {
    requireValue(price.currency === "USD" && price.source.length > 0 && price.asOf.length > 0, "PRICING_PROVENANCE_MISSING")
    ;[price.input, price.output, price.cacheRead, price.cacheWrite].forEach((rate) => requireValue(Number.isFinite(rate) && rate >= 0, "PRICING_RATE_INVALID"))
  })
  const rows = usage.map((record) => {
    ;[record.input, record.output, record.cacheRead, record.cacheWrite].forEach((count) => requireValue(Number.isSafeInteger(count) && count >= 0, "USAGE_COUNT_INVALID"))
    const price = prices.find((price) => price.provider === record.provider && price.model === record.model)
    return { provider: record.provider, model: record.model, tokens: record.input + record.output + record.cacheRead + record.cacheWrite,
      costUSD: price ? (record.input * price.input + record.output * price.output + record.cacheRead * price.cacheRead + record.cacheWrite * price.cacheWrite) / 1_000_000 : null,
      pricing: price ? { source: price.source, asOf: price.asOf } : null,
    }
  })
  const holds = [...new Set(rows.filter((row) => row.costUSD === null).map((row) => `PRICING_UNKNOWN: ${row.provider}/${row.model}`))].sort()
  const total = rows.reduce((total, row) => total + (row.costUSD ?? 0), 0)
  requireValue(Number.isFinite(total), "PRICING_TOTAL_OVERFLOW")
  const totalTokens = rows.reduce((total, row) => total + row.tokens, 0)
  requireValue(Number.isSafeInteger(totalTokens), "USAGE_TOTAL_OVERFLOW")
  const byModel = [...new Set(rows.map((row) => JSON.stringify([row.provider, row.model])))].sort().map((key) => {
    const matching = rows.filter((row) => JSON.stringify([row.provider, row.model]) === key)
    return { provider: matching[0].provider, model: matching[0].model, tokens: matching.reduce((total, row) => total + row.tokens, 0), costUSD: matching.some((row) => row.costUSD === null) ? null : matching.reduce((total, row) => total + row.costUSD!, 0) }
  })
  return { status: holds.length ? "HOLD" : "KNOWN", holds, rows, byModel, totalTokens, costUSD: holds.length ? null : total }
}
export function telemetry(projectID: string, observations: Observations, prices: readonly Price[] = []) {
  validateObservations(projectID, observations)
  const audit = observations.actions.map((action) => ({ ...action }))
  const diagnostics = revisionDiagnostics([...observations.usage, ...observations.actions, ...(observations.checks?.results ?? [])].map((observation) => observation.provenance))
  return {
    audit: { actions: audit, digest: createHash("sha256").update(JSON.stringify(audit)).digest("hex"), integrityClaim: "digest-of-supplied-observations-only", persisted: false, diagnostics },
    usage: { ...(observations.usage.length ? pricedUsage(observations.usage, prices) : { status: "HOLD", holds: ["USAGE_MISSING"], costUSD: null }), diagnostics },
    checks: observations.checks?.results ?? null,
    source: "host-session-observations",
    diagnostics,
  }
}
/** Host supplies captured immutable facts; this validates/copies them, never acquires or fabricates events. */
export function validateHostSnapshot(context: GovernanceContext, sessionID: string, supplied: Observations): Observations {
  requireValue(validateArgs(observationsSchema, supplied).ok, "HOST_SNAPSHOT_SCHEMA_INVALID")
  validateObservations(context.projectID, supplied)
  ;[...supplied.usage, ...supplied.actions, ...(supplied.checks?.results ?? [])].forEach((observation) => requireValue(observation.provenance.sessionID === sessionID, "HOST_SNAPSHOT_SESSION_MISMATCH"))
  const freeze = <T extends { provenance: import("./contracts.ts").Provenance }>(record: T) => Object.freeze({ ...record, provenance: Object.freeze({ ...record.provenance }) })
  return Object.freeze({ ...supplied,
    usage: Object.freeze(supplied.usage.map(freeze)), actions: Object.freeze(supplied.actions.map(freeze)),
    ...(supplied.checks ? { checks: Object.freeze({ ...supplied.checks, results: Object.freeze(supplied.checks.results.map(freeze)) }) } : {}),
  })
}
export function estimate(usage: readonly Omit<Usage, "provenance">[], prices: readonly Price[], budgetUSD?: number) {
  requireValue(budgetUSD === undefined || (Number.isFinite(budgetUSD) && budgetUSD >= 0), "BUDGET_INVALID")
  const result = pricedUsage(usage, prices)
  const holds = [...result.holds, ...(budgetUSD === undefined ? ["BUDGET_MISSING"] : [])]
  // Stricter than source cost-governor.py's four-decimal rounding: compare raw finite USD, so no excess rounds away.
  return { ...result, kind: "estimate", budgetUSD: budgetUSD ?? null, status: holds.length ? "HOLD" : result.costUSD! > budgetUSD! ? "OVER_ESTIMATE" : "WITHIN_ESTIMATE", holds, liveCapEnforced: false }
}
