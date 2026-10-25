import { describe, expect, test } from "bun:test"
import { ScheduledTaskCapabilityModel } from "@orchestra/core/scheduled-task/capability-model"

const plan = ScheduledTaskCapabilityModel.plan

const MINUTE = 60_000
const DAY = 86_400_000
const at = (value: string) => Date.parse(value)
const timing = (
  cadence: ScheduledTaskCapabilityModel.Timing["cadence"],
  input: Partial<ScheduledTaskCapabilityModel.Timing> = {},
): ScheduledTaskCapabilityModel.Timing => ({
  cadence,
  timezone: "America/New_York",
  next: 0,
  enabled: true,
  catchUp: "latest",
  ...input,
})
const next = ScheduledTaskCapabilityModel.nextAfter
const daily = (time: string, timezone = "America/New_York") => timing({ kind: "daily", time }, { timezone })
const cron = (expression: string, timezone = "America/New_York") => timing({ kind: "cron", expression }, { timezone })

describe("ScheduledTaskCapabilityModel.parseCron", () => {
  test("accepts five fields with lists, ranges and steps", () => {
    const parsed = ScheduledTaskCapabilityModel.parseCron("*/15 9-17/4 1,15 * 5-7")
    expect(parsed?.minutes).toEqual(new Set([0, 15, 30, 45]))
    expect(parsed?.hours).toEqual(new Set([9, 13, 17]))
    expect(parsed?.days).toEqual(new Set([1, 15]))
    expect(parsed?.months.size).toBe(12)
    expect([...(parsed?.weekdays ?? [])].sort()).toEqual([0, 5, 6])
    expect([parsed?.dayRestricted, parsed?.weekdayRestricted]).toEqual([true, true])
    const starred = ScheduledTaskCapabilityModel.parseCron("  0 0 */2 * 7 ")
    expect([starred?.weekdays, starred?.dayRestricted]).toEqual([new Set([0]), false])
    expect(ScheduledTaskCapabilityModel.parseCron("*/59 */23 * * \t0-7/7")?.minutes.size).toBe(2)
    expect(ScheduledTaskCapabilityModel.parseCron("0 0 30 2 1")?.dayRestricted).toBe(true)
  })

  // Empty, wrong arity, out of range, reversed range, zero step, `a/n`, empty item, macro, names, and
  // day-of-month rules no selected month can hold.
  test.each(
    "|* * * *|* * * * * *|60 * * * *|* 24 * * *|* * 0 * *|* * 32 * *|* * * 13 *|* * * * 8|-1 * * * *|5-1 * * * *|*/0 * * * *|1/5 * * * *|1,,2 * * * *|@daily|0 0 * JAN *|0 0 * * MON|0 0 30 2 *|0 0 31 4,6,9,11 *|*/99999999 * * * *|0-59/60 * * * *|0 0 * * 0-7/8|0\u00a00 * * *|0 0 * * *\u00a0|0 0 * *\n*".split(
      "|",
    ),
  )("rejects %p", (expression) => {
    expect(ScheduledTaskCapabilityModel.parseCron(expression)).toBeUndefined()
  })
})

describe("ScheduledTaskCapabilityModel.nextAfter", () => {
  test("once fires only in the future and interval stays anchored at next", () => {
    const once = timing({ kind: "once", at: 1_000 })
    expect(next(once, 999)).toBe(1_000)
    expect(next(once, 1_000)).toBeUndefined()
    const interval = timing({ kind: "interval", minutes: 5 }, { next: 1_000 })
    expect(next(interval, 999)).toBe(1_000)
    expect(next(interval, 1_000)).toBe(1_000 + 5 * MINUTE)
    expect(next(interval, 1_000 + 7 * MINUTE)).toBe(1_000 + 10 * MINUTE)
  })

  test("Vixie OR when both day fields are restricted, AND when one starts with *", () => {
    expect(next(cron("0 12 13 * 5", "UTC"), at("2031-01-06T00:00:00Z"))).toBe(at("2031-01-10T12:00:00Z"))
    expect(next(cron("0 12 13 * 5", "UTC"), at("2031-01-10T12:00:00Z"))).toBe(at("2031-01-13T12:00:00Z"))
    expect(next(cron("0 12 */2 * 5", "UTC"), at("2031-01-06T00:00:00Z"))).toBe(at("2031-01-17T12:00:00Z"))
  })

  test("a DST gap runs at the first valid local instant, that day only", () => {
    const gap = next(daily("02:30"), at("2031-03-08T02:30:00-05:00"))
    expect(gap).toBe(at("2031-03-09T03:00:00-04:00"))
    expect(next(daily("02:30"), gap ?? 0)).toBe(at("2031-03-10T02:30:00-04:00"))
    expect(next(daily("02:30", "Europe/Berlin"), at("2031-03-29T02:30:00+01:00"))).toBe(at("2031-03-30T03:00:00+02:00"))
    expect(next(cron("30 2 * * *"), at("2031-03-08T02:30:00-05:00"))).toBe(at("2031-03-09T03:00:00-04:00"))
    // Every wall time in the gap and 03:00 itself collapse into one run.
    const quarter = cron("*/15 * * * *", "Europe/Berlin")
    expect(next(quarter, at("2031-03-30T01:45:00+01:00"))).toBe(at("2031-03-30T03:00:00+02:00"))
    expect(next(quarter, at("2031-03-30T03:00:00+02:00"))).toBe(at("2031-03-30T03:15:00+02:00"))
  })

  test("a repeated hour runs once, at the earlier instant", () => {
    const fold = next(daily("01:30"), at("2031-11-01T01:30:00-04:00"))
    expect(fold).toBe(at("2031-11-02T01:30:00-04:00"))
    expect(next(daily("01:30"), fold ?? 0)).toBe(at("2031-11-03T01:30:00-05:00"))
    expect(next(daily("02:30", "Europe/Berlin"), at("2031-10-26T02:30:00+02:00"))).toBe(at("2031-10-27T02:30:00+01:00"))
    const half = cron("*/30 * * * *")
    expect(next(half, at("2031-11-02T01:30:00-04:00"))).toBe(at("2031-11-02T02:00:00-05:00"))
    expect(next(half, at("2031-11-02T01:10:00-05:00"))).toBe(at("2031-11-02T02:00:00-05:00"))
    expect(next(cron("30 2 * * *", "Europe/Berlin"), at("2031-10-26T02:45:00+01:00"))).toBe(
      at("2031-10-27T02:30:00+01:00"),
    )
  })

  test("weekly keeps its local time across DST", () => {
    const weekly = timing({ kind: "weekly", day: 6, time: "09:30" })
    expect(next(weekly, at("2031-03-08T09:30:00-05:00"))).toBe(at("2031-03-15T09:30:00-04:00"))
    expect(next(weekly, at("2031-03-08T09:29:00-05:00"))).toBe(at("2031-03-08T09:30:00-05:00"))
  })

  test("an invalid zone or impossible rule yields undefined without throwing", () => {
    expect(next(daily("09:30", "Mars/Olympus"), 0)).toBeUndefined()
    expect(next(cron("0 0 30 2 *"), 0)).toBeUndefined()
    expect(next(cron("0 0 * * *"), Number.NaN)).toBeUndefined()
    expect(next(timing({ kind: "interval", minutes: 5 }, { next: 8e15 - 1 }), 8e15 - 1)).toBeUndefined()
  })

  test("rare rules are found across their full cycle", () => {
    expect(next(cron("0 0 */31 1 0", "UTC"), at("2026-01-01T00:00:00Z"))).toBe(at("2034-01-01T00:00:00Z"))
    expect(next(cron("0 0 29 2 *", "UTC"), at("2097-01-01T00:00:00Z"))).toBe(at("2104-02-29T00:00:00Z"))
  })
})

describe("ScheduledTaskCapabilityModel.plan", () => {
  const t0 = at("2031-01-15T09:30:00-05:00")

  test("waits for a future or disabled slot; once runs within 24h and is skipped after", () => {
    const once = timing({ kind: "once", at: t0 }, { next: t0 })
    expect(plan(once, t0 - 1)).toEqual({ type: "wait" })
    expect(plan({ ...once, enabled: false }, t0 + 1)).toEqual({ type: "wait" })
    expect(plan(once, t0 + DAY)).toEqual({ type: "run", slot: t0, skipped: 0 })
    expect(plan(once, t0 + DAY + 1)).toEqual({ type: "skip", skipped: 1 })
  })

  test("latest runs the newest overdue slot; skip never runs a slot more than a tick late", () => {
    const interval = timing({ kind: "interval", minutes: 5 }, { next: t0 })
    expect(plan(interval, t0 + 22 * MINUTE)).toEqual({
      type: "run",
      slot: t0 + 20 * MINUTE,
      skipped: 4,
    })
    const skip = { ...interval, catchUp: "skip" as const }
    expect(plan(skip, t0 + 22 * MINUTE)).toEqual({ type: "skip", skipped: 5 })
    expect(plan(skip, t0 + 20 * MINUTE + 30_000)).toEqual({
      type: "run",
      slot: t0 + 20 * MINUTE,
      skipped: 4,
    })
    expect(plan(skip, t0 + MINUTE)).toEqual({ type: "run", slot: t0, skipped: 0 })
  })

  test("daily catch-up counts local days across DST", () => {
    const start = at("2031-03-07T09:30:00-05:00")
    const value = { ...daily("09:30"), next: start }
    expect(plan(value, at("2031-03-10T09:30:30-04:00"))).toEqual({
      type: "run",
      slot: at("2031-03-10T09:30:00-04:00"),
      skipped: 3,
    })
    expect(plan({ ...value, catchUp: "skip" }, at("2031-03-10T10:00:00-04:00"))).toEqual({
      type: "skip",
      skipped: 4,
    })
    expect(plan(value, start + 1)).toEqual({ type: "run", slot: start, skipped: 0 })
  })

  test("a cron due inside the second pass of a repeated hour picks the earlier-pass slot", () => {
    const value = { ...cron("45 1 * * *"), next: at("2031-11-01T01:45:00-04:00") }
    expect(plan(value, at("2031-11-02T01:10:00-05:00"))).toEqual({
      type: "run",
      slot: at("2031-11-02T01:45:00-04:00"),
      skipped: 1,
    })
  })

  test("an invalid zone runs only the owed slot", () => {
    const value = { ...daily("09:30", "Mars/Olympus"), next: t0 }
    expect(plan(value, t0 + 3 * DAY)).toEqual({ type: "run", slot: t0, skipped: 0 })
  })

  test("a year of downtime is planned without walking every slot", () => {
    const started = performance.now()
    expect(
      ScheduledTaskCapabilityModel.plan(timing({ kind: "interval", minutes: 5 }, { next: t0 }), t0 + 365 * DAY),
    ).toEqual({ type: "run", slot: t0 + 365 * DAY, skipped: 105_120 })
    const minutely = { ...cron("* * * * *", "UTC"), next: at("2031-01-01T00:00:00Z") }
    expect(plan(minutely, at("2032-01-01T00:00:30Z"))).toEqual({
      type: "run",
      slot: at("2032-01-01T00:00:00Z"),
      skipped: 525_600,
    })
    // Generous on purpose: walking slot by slot takes tens of seconds; this only catches that regression.
    expect(performance.now() - started).toBeLessThan(2000)
  })
})
