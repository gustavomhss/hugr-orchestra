import { describe, expect, test } from "bun:test"
import {
  filterFresh,
  findingKey,
  isSnoozed,
  makeState,
  nextDelayMs,
  processReport,
  reportKey,
  snooze,
} from "./scheduler"
import type { Finding } from "./scan"

function finding(summary: string): Finding {
  return { kind: "disk", severity: "attention", summary, evidence: "e", suggestion: "s" }
}

describe("janitor scheduler", () => {
  test("dedupes repeat findings within 24h", () => {
    const state = makeState()
    const first = filterFresh([finding("a")], state, 1_000, 24 * 3_600_000)
    expect(first.fresh.length).toBe(1)
    const second = filterFresh([finding("a")], first.state, 2_000, 24 * 3_600_000)
    expect(second.fresh.length).toBe(0)
    const late = filterFresh([finding("a")], first.state, 25 * 3_600_000, 24 * 3_600_000)
    expect(late.fresh.length).toBe(1)
  })

  test("snooze blocks alerts until expiry", () => {
    const now = 10_000
    const state = snooze(makeState(), 60, now)
    expect(isSnoozed(state, now + 1_000)).toBe(true)
    expect(isSnoozed(state, now + 61 * 60_000)).toBe(false)
  })

  test("clamps interval and keys findings", () => {
    expect(nextDelayMs({ intervalMinutes: 0, dedupeHours: 24 })).toBe(60_000)
    expect(nextDelayMs({ intervalMinutes: 15, dedupeHours: 24 })).toBe(900_000)
    expect(nextDelayMs({ intervalMinutes: Number.MAX_VALUE, dedupeHours: 24 })).toBe(2_147_483_647)
    expect(findingKey("disk", "full")).toBe("disk\nfull")
  })

  test("bounds remembered findings and fingerprints current report", () => {
    const items = Array.from({ length: 1_100 }, (_, index) => finding(String(index)))
    const next = filterFresh(items, makeState(), 1_000, 24 * 3_600_000)
    expect(Object.keys(next.state.seen)).toHaveLength(1_024)
    expect(
      reportKey({
        createdAt: "now",
        findings: [finding("b"), finding("a")],
      }),
    ).toBe("disk\na\nattention\u0000disk\nb\nattention")
  })

  test("emits full report for changes and silent clear updates", () => {
    const report = { createdAt: "now", findings: [finding("a")] }
    const first = processReport(report, makeState(), 1_000, 24 * 3_600_000)
    expect(first.event?.report.findings).toEqual(report.findings)
    expect(first.event?.notify).toBe(true)

    const cleared = processReport({ createdAt: "later", findings: [] }, first.state, 2_000, 24 * 3_600_000)
    expect(cleared.event?.report.findings).toEqual([])
    expect(cleared.event?.notify).toBe(false)
  })

  test("re-notifies after dedupe expiry and on severity changes", () => {
    const now = 1_000
    const report = { createdAt: "now", findings: [finding("a")] }
    const first = processReport(report, makeState(), now, 100)
    const repeated = processReport(report, first.state, now + 101, 100)
    expect(repeated.event?.notify).toBe(true)
    const escalated = processReport(
      { createdAt: "later", findings: [{ ...finding("a"), severity: "urgent" }] },
      first.state,
      now + 2,
      100,
    )
    expect(escalated.event?.notify).toBe(true)
  })

  test("treats clock rollback as fresh instead of extending dedupe", () => {
    const state = filterFresh([finding("a")], makeState(), 10_000, 100).state
    expect(filterFresh([finding("a")], state, 1_000, 100).fresh).toHaveLength(1)
  })

  test("does not notify for scanner health noise", () => {
    const result = processReport(
      {
        createdAt: "now",
        findings: [
          { kind: "scanner", severity: "attention", summary: "scanner unavailable", evidence: "e", suggestion: "s" },
        ],
      },
      makeState(),
      1_000,
      100,
    )
    expect(result.event?.notify).toBe(false)
  })
})
