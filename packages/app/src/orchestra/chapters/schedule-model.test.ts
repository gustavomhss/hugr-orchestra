import { describe, expect, test } from "bun:test"
import {
  canResume,
  following,
  localInput,
  localMinute,
  plan,
  readTasks,
  recordRun,
  resume,
  skipRun,
  slotIDs,
  type ScheduleTask,
} from "./schedule-model"

// Pin a zone with DST so gap and overlap cases are real on every machine.
process.env.TZ = "America/New_York"

const HOUR = 3_600_000
const DAY = 24 * HOUR
const at = (iso: string) => new Date(iso).getTime()
const base = at("2031-01-15T09:30:00-05:00")
const task = (input: Partial<ScheduleTask> = {}): ScheduleTask => ({
  id: "daily",
  name: "Daily review",
  prompt: "Review the changes",
  agent: "build",
  cadence: "daily",
  next: base,
  minute: 9 * 60 + 30,
  enabled: true,
  runs: 0,
  ...input,
})

describe("schedule model", () => {
  test("the pinned zone is in effect", () => {
    expect(new Date(base).getHours()).toBe(9)
    expect(localMinute(at("2031-07-01T14:05:00Z"))).toBe(10 * 60 + 5)
  })

  test("only enabled tasks whose slot has come are planned", () => {
    expect(plan(task(), base - 1)).toEqual({ type: "wait" })
    expect(plan(task({ enabled: false }), base + DAY)).toEqual({ type: "wait" })
    expect(plan(task(), base)).toEqual({ type: "run", slot: base })
    expect(plan(task({ cadence: "once" }), base + DAY)).toEqual({ type: "run", slot: base })
  })

  test("only the latest slot runs; overtaken slots are reported missed", () => {
    expect(plan(task(), base + 3 * DAY + HOUR)).toEqual({ type: "run", slot: base + 3 * DAY, missed: base + 2 * DAY })
    expect(plan(task({ cadence: "hourly" }), base + 5 * HOUR + 1)).toEqual({
      type: "run",
      slot: base + 5 * HOUR,
      missed: base + 4 * HOUR,
    })
    expect(plan(task({ cadence: "weekly" }), base + 20 * HOUR)).toEqual({ type: "run", slot: base })
  })

  test("one-off and weekly slots more than a day late are skipped, never caught up", () => {
    expect(plan(task({ cadence: "once" }), base + DAY + 1)).toEqual({ type: "skip", slot: base })
    expect(plan(task({ cadence: "once" }), base + 120 * DAY)).toEqual({ type: "skip", slot: base })
    expect(plan(task({ cadence: "weekly" }), base + 3 * DAY)).toEqual({ type: "skip", slot: base })
    expect(plan(task({ cadence: "weekly" }), base + 9 * DAY)).toEqual({ type: "skip", slot: base + 7 * DAY })
    expect(skipRun(task({ cadence: "once" }), base, base + 2 * DAY)).toMatchObject({
      enabled: false,
      missed: base,
      next: base,
    })
    expect(skipRun(task({ cadence: "weekly" }), base, base + 3 * DAY)).toMatchObject({
      enabled: true,
      missed: base,
      next: base + 7 * DAY,
    })
  })

  test("a run that served a slot moves past it and pauses one-off work", () => {
    expect(recordRun(task({ cadence: "once" }), { time: base + 5_000, sessionID: "ses_1", slot: base })).toMatchObject({
      enabled: false,
      next: base,
      runs: 1,
      last: { time: base + 5_000, sessionID: "ses_1" },
    })
    expect(recordRun(task(), { time: base + 40_000, sessionID: "ses_1", slot: base }).next).toBe(base + DAY)
    expect(recordRun(task({ cadence: "hourly" }), { time: base, sessionID: "ses_1", slot: base }).next).toBe(
      base + HOUR,
    )
    expect(
      recordRun(task({ missed: base - DAY }), {
        time: base + 3 * DAY,
        sessionID: "s",
        slot: base + 3 * DAY,
        missed: base + 2 * DAY,
      }),
    ).toMatchObject({ next: base + 4 * DAY, missed: base + 2 * DAY, runs: 1 })
    expect(recordRun(task({ missed: base - DAY }), { time: base, sessionID: "s", slot: base }).missed).toBeUndefined()
  })

  test("an extra run before a slot is due keeps the upcoming slot", () => {
    expect(recordRun(task({ missed: 1 }), { time: base - HOUR, sessionID: "ses_1" })).toMatchObject({
      next: base,
      missed: 1,
      runs: 1,
    })
    expect(recordRun(task({ enabled: false }), { time: base + 2 * DAY + HOUR, sessionID: "ses_1" })).toMatchObject({
      next: base + 3 * DAY,
      enabled: false,
    })
  })

  test("a daily 02:30 slot moved by the spring-forward gap returns to 02:30 the next day", () => {
    const minute = 2 * 60 + 30
    const before = at("2031-03-08T02:30:00-05:00")
    const gap = following("daily", minute, before, before + 1)
    expect(gap).toBe(at("2031-03-09T03:30:00-04:00"))
    const after = following("daily", minute, gap, gap + 1)
    expect(after).toBe(at("2031-03-10T02:30:00-04:00"))
    expect(following("daily", minute, after, after + 1)).toBe(at("2031-03-11T02:30:00-04:00"))
    const weekly = following("weekly", minute, at("2031-03-02T02:30:00-05:00"), at("2031-03-02T02:31:00-05:00"))
    expect(weekly).toBe(at("2031-03-09T03:30:00-04:00"))
    expect(following("weekly", minute, weekly, weekly + 1)).toBe(at("2031-03-16T02:30:00-04:00"))
  })

  test("a daily 01:30 slot runs once on the fall-back day, at its first occurrence", () => {
    const minute = 90
    const before = at("2031-11-01T01:30:00-04:00")
    const ambiguous = following("daily", minute, before, before + 1)
    expect(ambiguous).toBe(at("2031-11-02T01:30:00-04:00"))
    expect(following("daily", minute, ambiguous, ambiguous + 1)).toBe(at("2031-11-03T01:30:00-05:00"))
    const late = plan(task({ next: ambiguous, minute }), at("2031-11-02T01:45:00-05:00"))
    expect(late).toEqual({ type: "run", slot: ambiguous })
  })

  test("hourly slots stay absolute hours across DST", () => {
    const first = at("2031-11-02T01:30:00-04:00")
    expect(following("hourly", 90, first, first + 1)).toBe(at("2031-11-02T01:30:00-05:00"))
    expect(following("hourly", 90, first, first + 3 * HOUR)).toBe(first + 4 * HOUR)
  })

  test("long gaps roll forward to the first future slot", () => {
    expect(following("daily", 570, base, base + 400 * DAY + 1)).toBe(at("2032-02-20T09:30:00-05:00"))
    expect(following("weekly", 570, base, base + 400 * DAY)).toBe(base + 406 * DAY)
    expect(following("daily", 570, base + DAY, base)).toBe(base + DAY)
  })

  test("resume rolls a recurring slot into the future but a past one-off cannot resume", () => {
    const now = base + 2 * DAY + HOUR
    expect(resume(task({ enabled: false }), now)).toMatchObject({ enabled: true, next: base + 3 * DAY })
    expect(canResume(task({ cadence: "once", enabled: false }), now)).toBe(false)
    expect(canResume(task({ cadence: "once", enabled: false, next: now + 1 }), now)).toBe(true)
    expect(canResume(task({ enabled: false }), now)).toBe(true)
  })

  test("slot IDs are deterministic per task and slot and match the server's ID layout", () => {
    const ids = slotIDs("daily", base)
    expect(slotIDs("daily", base)).toEqual(ids)
    expect(ids.session).toMatch(/^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    expect(ids.message).toMatch(/^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/)
    expect(slotIDs("daily", base + DAY).session).not.toBe(ids.session)
    expect(slotIDs("weekly", base).message).not.toBe(ids.message)
    // Sessions sort newest first and messages oldest first, as server-made IDs do.
    expect(slotIDs("daily", base + DAY).session < ids.session).toBe(true)
    expect(slotIDs("daily", base + DAY).message > ids.message).toBe(true)
  })

  test("local input renders the browser-local minute", () => {
    expect(localInput(new Date(2031, 0, 5, 7, 4, 59).getTime())).toBe("2031-01-05T07:04")
    expect(new Date(localInput(base)).getTime()).toBe(base)
  })

  test("saved data keeps valid tasks, fills the time of day and drops malformed rows", () => {
    const valid = task({ last: { time: base, sessionID: "ses_1" }, missed: base - DAY })
    const legacy = { ...task({ id: "legacy" }), minute: undefined }
    expect(
      readTasks({
        tasks: [
          valid,
          legacy,
          { ...valid, id: 1 },
          { ...valid, cadence: "monthly" },
          { ...valid, next: "tomorrow" },
          { ...valid, runs: 1.5 },
          { ...valid, minute: 1440 },
          { ...valid, missed: "yesterday" },
          { ...valid, last: { time: base } },
          null,
        ],
      }),
    ).toEqual({ tasks: [valid, task({ id: "legacy" })] })
    expect(readTasks({ tasks: "nope" })).toEqual({ tasks: [] })
    expect(readTasks(undefined)).toEqual({ tasks: [] })
  })
})
