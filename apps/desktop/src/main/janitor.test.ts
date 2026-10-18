import { describe, expect, test } from "bun:test"
import { createState, dismiss, getReport, isDismissed, isSnoozed, setReport, snooze, validReport } from "./janitor"

describe("janitor store", () => {
  test("accepts bounded report json and rejects junk", () => {
    const state = createState()
    expect(setReport(state, `{"findings":[]}`)).toBe(true)
    expect(getReport(state)).toBe(`{"findings":[]}`)
    expect(setReport(state, 42)).toBe(false)
    expect(setReport(state, "")).toBe(false)
    expect(validReport("x".repeat(300 * 1024))).toBe(false)
    expect(validReport("é".repeat(128 * 1024 + 1))).toBe(false)
  })

  test("dismiss clears and snooze blocks until expiry", () => {
    const state = createState()
    setReport(state, `{"findings":[]}`)
    dismiss(state)
    expect(getReport(state)).toBeNull()
    snooze(state, 60, 10_000)
    expect(isSnoozed(state, 11_000)).toBe(true)
    expect(isSnoozed(state, 10_000 + 61 * 60_000)).toBe(false)
    snooze(state, Number.MAX_VALUE, 10_000)
    expect(state.snoozedUntil).toBe(10_000 + 7 * 24 * 60 * 60_000)
  })

  test("hides stored report during snooze", () => {
    const state = createState()
    setReport(state, `{"findings":[]}`)
    snooze(state, 60, 10_000)
    expect(getReport(state, 11_000)).toBeNull()
    expect(getReport(state, 10_000 + 61 * 60_000)).toBe(`{"findings":[]}`)
  })

  test("restores bounded persisted state", () => {
    const state = createState({ reportJson: `{"findings":[]}`, snoozedUntil: 20_000 })
    expect(getReport(state, 10_000)).toBeNull()
    expect(getReport(state, 21_000)).toBe(`{"findings":[]}`)
    expect(createState({ reportJson: "", snoozedUntil: -1 })).toMatchObject({ reportJson: null, snoozedUntil: 0 })
  })

  test("remembers dismissed report identity", () => {
    const state = createState()
    setReport(state, `{"findings":[]}`, "local", true)
    dismiss(state)
    expect(isDismissed(state, `{"findings":[]}`, "local")).toBe(true)
    expect(isDismissed(state, `{"findings":[]}`, "remote")).toBe(false)
  })
})
