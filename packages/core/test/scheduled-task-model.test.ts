import { describe, expect, test } from "bun:test"
import { ScheduledTaskModel } from "@orchestra/core/scheduled-task/model"

const HOUR = 3_600_000
const DAY = 24 * HOUR
const at = (value: string) => Date.parse(value)
const ny = { timezone: "America/New_York" }
const task = (input: Partial<ScheduledTaskModel.Timing> & Pick<ScheduledTaskModel.Timing, "cadence" | "next">) => ({
  minute: 570,
  timezone: "America/New_York",
  enabled: true,
  ...input,
})
const slot = at("2031-01-15T09:30:00-05:00")

describe("ScheduledTaskModel.plan", () => {
  test("waits for a future slot and for a paused task", () => {
    expect(ScheduledTaskModel.plan(task({ cadence: "hourly", next: slot }), slot - 1)).toEqual({ type: "wait" })
    expect(ScheduledTaskModel.plan(task({ cadence: "hourly", next: slot, enabled: false }), slot + DAY)).toEqual({
      type: "wait",
    })
  })

  test("runs a due slot on time without a missed slot", () => {
    expect(ScheduledTaskModel.plan(task({ cadence: "daily", next: slot }), slot + 1_000)).toEqual({ type: "run", slot })
    expect(ScheduledTaskModel.plan(task({ cadence: "once", next: slot }), slot + DAY)).toEqual({ type: "run", slot })
  })

  test("runs only the latest overtaken slot and records the one before it as missed", () => {
    expect(ScheduledTaskModel.plan(task({ cadence: "hourly", next: slot }), slot + 3 * HOUR + 5 * 60_000)).toEqual({
      type: "run",
      slot: slot + 3 * HOUR,
      missed: slot + 2 * HOUR,
    })
    expect(ScheduledTaskModel.plan(task({ cadence: "daily", next: slot }), slot + 2 * DAY + HOUR)).toEqual({
      type: "run",
      slot: slot + 2 * DAY,
      missed: slot + DAY,
    })
  })

  test("skips a one-off or weekly slot more than a day late instead of catching up", () => {
    expect(ScheduledTaskModel.plan(task({ cadence: "once", next: slot }), slot + DAY + 1)).toEqual({
      type: "skip",
      slot,
    })
    expect(ScheduledTaskModel.plan(task({ cadence: "weekly", next: slot }), slot + 2 * DAY)).toEqual({
      type: "skip",
      slot,
    })
    expect(ScheduledTaskModel.plan(task({ cadence: "weekly", next: slot }), slot + DAY - 1)).toEqual({
      type: "run",
      slot,
    })
  })
})

describe("ScheduledTaskModel slots", () => {
  test("daily and weekly slots keep their local time across a DST change in the task's zone", () => {
    const winter = at("2031-03-08T09:30:00-05:00")
    expect(ScheduledTaskModel.following({ ...ny, minute: 570 }, "daily", winter, winter)).toBe(
      at("2031-03-09T09:30:00-04:00"),
    )
    expect(ScheduledTaskModel.following({ ...ny, minute: 570 }, "weekly", winter, winter + 3 * DAY)).toBe(
      at("2031-03-15T09:30:00-04:00"),
    )
  })

  test("a time inside the spring-forward gap runs after the gap that day only", () => {
    const from = at("2031-03-08T02:30:00-05:00")
    const gap = ScheduledTaskModel.following({ ...ny, minute: 150 }, "daily", from, from)
    expect(gap).toBe(at("2031-03-09T03:30:00-04:00"))
    expect(ScheduledTaskModel.following({ ...ny, minute: 150 }, "daily", gap, gap)).toBe(
      at("2031-03-10T02:30:00-04:00"),
    )
  })

  test("an ambiguous fall-back time runs once, at its first occurrence", () => {
    const from = at("2031-11-01T01:30:00-04:00")
    const fold = ScheduledTaskModel.following({ ...ny, minute: 90 }, "daily", from, from)
    expect(fold).toBe(at("2031-11-02T01:30:00-04:00"))
    expect(ScheduledTaskModel.following({ ...ny, minute: 90 }, "daily", fold, fold)).toBe(
      at("2031-11-03T01:30:00-05:00"),
    )
  })

  test("slots follow the task's zone, not the host's", () => {
    const tokyo = at("2031-01-15T09:30:00+09:00")
    expect(ScheduledTaskModel.following({ timezone: "Asia/Tokyo", minute: 570 }, "daily", tokyo, tokyo)).toBe(
      at("2031-01-16T09:30:00+09:00"),
    )
    expect(ScheduledTaskModel.localMinute(slot, "America/New_York")).toBe(570)
    expect(ScheduledTaskModel.localMinute(slot, "Asia/Tokyo")).toBe(23 * 60 + 30)
    expect(ScheduledTaskModel.validZone("America/New_York")).toBe(true)
    expect(ScheduledTaskModel.validZone("Mars/Olympus")).toBe(false)
  })

  test("hourly slots step whole hours from the slot", () => {
    expect(ScheduledTaskModel.following({ ...ny, minute: 0 }, "hourly", slot, slot + 90 * 60_000)).toBe(slot + 2 * HOUR)
    expect(ScheduledTaskModel.previous({ ...ny, minute: 0 }, "hourly", slot)).toBe(slot - HOUR)
  })
})

describe("ScheduledTaskModel transitions", () => {
  test("a run of a slot moves the task past it; a one-off pauses and keeps its time", () => {
    const now = slot + 5 * 60_000
    expect(ScheduledTaskModel.recordRun(task({ cadence: "hourly", next: slot }), { time: now, slot })).toMatchObject({
      next: slot + HOUR,
      enabled: true,
    })
    expect(ScheduledTaskModel.recordRun(task({ cadence: "once", next: slot }), { time: now, slot })).toMatchObject({
      next: slot,
      enabled: false,
    })
  })

  test("an on-time run clears the missed slot; an extra run keeps it and a future slot", () => {
    const missed = slot - HOUR
    const recurring = task({ cadence: "hourly", next: slot, missed })
    expect(ScheduledTaskModel.recordRun(recurring, { time: slot + 1, slot }).missed).toBeUndefined()
    expect(ScheduledTaskModel.recordRun(recurring, { time: slot - HOUR })).toMatchObject({ next: slot, missed })
  })

  test("skipping marks the slot missed; a one-off pauses", () => {
    expect(ScheduledTaskModel.skipRun(task({ cadence: "once", next: slot }), slot, slot + 2 * DAY)).toMatchObject({
      missed: slot,
      enabled: false,
    })
    expect(ScheduledTaskModel.skipRun(task({ cadence: "weekly", next: slot }), slot, slot + 2 * DAY)).toMatchObject({
      missed: slot,
      next: slot + 7 * DAY,
    })
  })

  test("resuming rolls a recurring task forward; a past one-off cannot resume", () => {
    const paused = task({ cadence: "hourly", next: slot, enabled: false })
    expect(ScheduledTaskModel.resume(paused, slot + 150 * 60_000)).toMatchObject({
      enabled: true,
      next: slot + 3 * HOUR,
    })
    expect(ScheduledTaskModel.canResume(task({ cadence: "once", next: slot, enabled: false }), slot + 1)).toBe(false)
    expect(ScheduledTaskModel.canResume(task({ cadence: "once", next: slot, enabled: false }), slot - 1)).toBe(true)
  })

  test("slot IDs are deterministic Session and message IDs per task and slot", () => {
    const ids = ScheduledTaskModel.slotIDs("task", slot)
    expect(ids).toEqual(ScheduledTaskModel.slotIDs("task", slot))
    expect(ids.session).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    expect(ids.message).toMatch(/^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    expect(ScheduledTaskModel.slotIDs("task", slot + HOUR)).not.toEqual(ids)
    expect(ScheduledTaskModel.slotIDs("other", slot)).not.toEqual(ids)
  })
})
