import { describe, expect, test } from "bun:test"
import { parseJanitorReport, usefulJanitorReport } from "./janitor-report"

const payload = {
  createdAt: "2026-09-08T00:00:00.000Z",
  findings: [{ kind: "disk", severity: "attention", summary: "disk", evidence: "e", suggestion: "s" }],
}
const invalidPayload = {
  ...payload,
  findings: [...payload.findings, { kind: "junk", severity: "nope", summary: "x", evidence: "e", suggestion: "s" }],
}

describe("janitor report", () => {
  test("rejects report with invalid findings", () => {
    const report = parseJanitorReport(JSON.stringify(invalidPayload))
    expect(report).toBeNull()
  })

  test("accepts decoded objects and rejects junk", () => {
    expect(parseJanitorReport(payload)?.createdAt).toBe(payload.createdAt)
    expect(parseJanitorReport("junk{")).toBeNull()
    expect(parseJanitorReport(null)).toBeNull()
    expect(parseJanitorReport({ findings: [] })?.findings).toEqual([])
    expect(parseJanitorReport({ findings: "junk" })).toBeNull()
  })

  test("drops scanner-only noise from user-facing report", () => {
    const report = parseJanitorReport({
      createdAt: "now",
      findings: [{ kind: "scanner", severity: "attention", summary: "unavailable", evidence: "e", suggestion: "s" }],
    })!
    expect(usefulJanitorReport(report)).toBeNull()
  })
})
