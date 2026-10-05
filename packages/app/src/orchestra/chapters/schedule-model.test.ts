import { describe, expect, test } from "bun:test"
import { canResume, dueTasks, following, localInput, readTasks, recordRun, resume, type ScheduleTask } from "./schedule-model"

const HOUR = 3_600_000
const DAY = 24 * HOUR
const base = new Date(2031, 0, 15, 9, 30).getTime()
const task = (input: Partial<ScheduleTask> = {}): ScheduleTask => ({
  id: "daily",
  name: "Daily review",
  prompt: "Review the changes",
  agent: "build",
  cadence: "daily",
  next: base,
  enabled: true,
  runs: 0,
  ...input,
})

describe("schedule model", () => {
  test("only enabled tasks whose time has come are due", () => {
    const tasks = [
      task({ id: "due" }),
      task({ id: "paused", enabled: false }),
      task({ id: "later", next: base + 1 }),
      task({ id: "overdue", next: base - DAY }),
    ]
    expect(dueTasks(tasks, base).map((item) => item.id)).toEqual(["due", "overdue"])
  })

  test("a one-off run pauses the task and keeps its slot", () => {
    const run = recordRun(task({ cadence: "once" }), base + 5_000, "ses_1")
    expect(run).toMatchObject({ enabled: false, next: base, runs: 1, last: { time: base + 5_000, sessionID: "ses_1" } })
  })

  test("recurring runs roll forward from their own slot, past every missed occurrence", () => {
    expect(recordRun(task(), base + 40_000, "ses_1").next).toBe(new Date(2031, 0, 16, 9, 30).getTime())
    expect(recordRun(task({ cadence: "hourly" }), base + 3 * HOUR + 1, "ses_1").next).toBe(base + 4 * HOUR)
    expect(recordRun(task({ cadence: "hourly" }), base, "ses_1").next).toBe(base + HOUR)
    expect(recordRun(task({ cadence: "weekly" }), base + 9 * DAY, "ses_1").next).toBe(
      new Date(2031, 0, 29, 9, 30).getTime(),
    )
    expect(recordRun(task({ runs: 4 }), base, "ses_2")).toMatchObject({ runs: 5, enabled: true })
  })

  test("running a recurring task early keeps its upcoming slot", () => {
    expect(recordRun(task(), base - HOUR, "ses_1").next).toBe(base)
  })

  test("daily and weekly keep the local time of day across a DST change", () => {
    const from = new Date(2031, 2, 1, 9, 30).getTime()
    const daily = new Date(following("daily", from, from + 40 * DAY))
    const weekly = new Date(following("weekly", from, from + 40 * DAY))
    expect([daily.getHours(), daily.getMinutes()]).toEqual([9, 30])
    expect([weekly.getHours(), weekly.getMinutes(), weekly.getDay()]).toEqual([9, 30, new Date(from).getDay()])
    expect(following("daily", from + DAY, from)).toBe(from + DAY)
  })

  test("resume rolls a recurring slot into the future but a past one-off cannot resume", () => {
    const now = base + 2 * DAY + HOUR
    expect(resume(task({ enabled: false }), now)).toMatchObject({
      enabled: true,
      next: new Date(2031, 0, 18, 9, 30).getTime(),
    })
    expect(canResume(task({ cadence: "once", enabled: false }), now)).toBe(false)
    expect(canResume(task({ cadence: "once", enabled: false, next: now + 1 }), now)).toBe(true)
    expect(canResume(task({ enabled: false }), now)).toBe(true)
  })

  test("local input renders the browser-local minute", () => {
    expect(localInput(new Date(2031, 0, 5, 7, 4, 59).getTime())).toBe("2031-01-05T07:04")
    expect(new Date(localInput(base)).getTime()).toBe(base)
  })

  test("saved data keeps valid tasks and drops malformed ones", () => {
    const valid = task({ last: { time: base, sessionID: "ses_1" } })
    expect(
      readTasks({
        tasks: [
          valid,
          { ...valid, id: 1 },
          { ...valid, cadence: "monthly" },
          { ...valid, next: "tomorrow" },
          { ...valid, runs: 1.5 },
          { ...valid, last: { time: base } },
          null,
        ],
      }),
    ).toEqual({ tasks: [valid] })
    expect(readTasks({ tasks: "nope" })).toEqual({ tasks: [] })
    expect(readTasks(undefined)).toEqual({ tasks: [] })
  })
})
