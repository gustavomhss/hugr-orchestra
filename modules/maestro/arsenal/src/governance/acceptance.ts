// Source: governance/acceptance-gate.py. Strengthened missing/skips/regression; preserves source-pre-green contracts.
// Adapted from TechLead a68e7af. Copyright 2026 HuGR Labs. Apache-2.0.
import { type Capture, validateCapture, requireValue } from "./contracts.ts"
export interface Acceptance {
  name: string
  mode: "red-green" | "preserve-source-green"
}
export function acceptance(projectID: string, baseline: Capture, final: Capture, expected: readonly Acceptance[]) {
  validateCapture(baseline, projectID)
  validateCapture(final, projectID)
  requireValue(expected.length > 0 && expected.length <= 512, "ACCEPTANCE_EMPTY_OR_OVERFLOW")
  requireValue(new Set(expected.map((item) => item.name)).size === expected.length, "ACCEPTANCE_DUPLICATE")
  const before = new Map(baseline.results.map((item) => [item.name, item]))
  const after = new Map(final.results.map((item) => [item.name, item]))
  const failures: string[] = []
  expected.forEach((item) => {
    requireValue(["red-green", "preserve-source-green"].includes(item.mode), `ACCEPTANCE_MODE_INVALID: ${item.name}`)
    const prior = before.get(item.name)
    const current = after.get(item.name)
    if (!prior) failures.push(`BASELINE_MISSING: ${item.name}`)
    if (!current) failures.push(`FINAL_MISSING: ${item.name}`)
    if (prior && prior.status !== (item.mode === "red-green" ? "fail" : "pass")) failures.push(`BASELINE_${prior.status.toUpperCase()}: ${item.name}`)
    if (current && current.status !== "pass") failures.push(`FINAL_${current.status.toUpperCase()}: ${item.name}`)
  })
  baseline.results.filter((item) => item.status === "pass").forEach((item) => {
    const current = after.get(item.name)
    if (!current || current.status !== "pass") failures.push(`REGRESSION_${current?.status.toUpperCase() ?? "MISSING"}: ${item.name}`)
  })
  return { status: failures.length ? "FAIL" : "PASS", failures: [...new Set(failures)].sort(), checked: expected.length, evidence: "host-observed-results" }
}
