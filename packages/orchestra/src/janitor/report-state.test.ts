import { describe, expect, test } from "bun:test"
import { clearLatestReport, getLatestReport, setLatestReport } from "./report-state"

describe("janitor report state", () => {
  test("clears cached report on lifecycle reset", () => {
    const report = { createdAt: "now", findings: [] }
    setLatestReport(report)
    expect(getLatestReport()).toBe(report)
    clearLatestReport()
    expect(getLatestReport()).toBeUndefined()
  })
})
