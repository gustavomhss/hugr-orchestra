import { describe, expect, test } from "bun:test"
import { SCHEDULE_COPY } from "@/i18n/orchestra-chapters/schedule"
import type { CapabilityScheduleManagement } from "@orchestra/schema/capability-schedule-management"
import { ScheduledTask } from "@orchestra/schema/scheduled-task"
import { SessionID } from "@orchestra/schema/session-id"
import { Agent } from "@orchestra/schema/agent"
import { cadenceLabel, createScheduleAgentsModel, row, type Api, type Label, type Schedule } from "./schedule-agents-model"

const id = ScheduledTask.ID.make("tsk_hourly")
const sessionID = SessionID.make("ses_owner")
const runID = SessionID.make("ses_run")
const schedule = (input: Partial<Schedule> = {}): Schedule => ({
  id, revision: 0, name: "Hourly check", prompt: "Check the build.", cadence: { kind: "interval", minutes: 60 },
  timezone: "UTC", catchUp: "latest", enabled: true, next: 1_000, runs: 0, skipped: 0, ...input,
})
const item = (input: Partial<Schedule> = {}): CapabilityScheduleManagement.Item =>
  ({ schedule: schedule(input), sessionID, agentID: Agent.ID.make("reviewer") })
// Renders a label with the shipped English copy, the way the view's language.t does.
const words = (label: Label) => Object.entries(label.params ?? {}).reduce(
  (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
  (SCHEDULE_COPY as Record<string, string>)[label.key] ?? `missing ${label.key}`)

function fakeApi(input: { items?: CapabilityScheduleManagement.Item[]; fail?: () => unknown } = {}) {
  const calls: { action: string; id?: string; key?: string }[] = []
  const items = input.items ?? [item()]
  const answer = <T>(action: string, value: T, scheduleID?: string, key?: string) => {
    calls.push({ action, id: scheduleID, key })
    const error = action === "list" ? undefined : input.fail?.()
    return error ? Promise.reject(error) : Promise.resolve(value)
  }
  const api: Api = {
    list: () => answer("list", { items, coverage: "live" as const }),
    pause: (scheduleID, key) => answer("pause", schedule({ enabled: false, next: undefined }), scheduleID, key),
    resume: (scheduleID, key) => answer("resume", schedule(), scheduleID, key),
    run: (scheduleID, key) => answer("run", { id: scheduleID, sessionID: runID, reused: false }, scheduleID, key),
    remove: (scheduleID, key) => answer("remove", { id: scheduleID, removed: true as const }, scheduleID, key),
  }
  return { api, calls }
}
const keys = () => {
  let next = 0
  return () => `key-${++next}`
}

describe("agent schedule rows", () => {
  test("cadence reads in words and cron keeps its raw expression next to the next run", () => {
    expect(words(cadenceLabel({ kind: "interval", minutes: 30 }))).toBe("Every 30 min")
    expect(words(cadenceLabel({ kind: "interval", minutes: 60 }))).toBe("Every hour")
    expect(words(cadenceLabel({ kind: "interval", minutes: 180 }))).toBe("Every 3 hours")
    expect(words(cadenceLabel({ kind: "interval", minutes: 2880 }))).toBe("Every 2 days")
    expect(words(cadenceLabel({ kind: "daily", time: "09:00" }))).toBe("Daily at 09:00")
    expect(words(cadenceLabel({ kind: "weekly", day: 1, time: "09:00" }))).toBe("Mondays at 09:00")
    expect(cadenceLabel({ kind: "once", at: 5_000 })).toEqual({ key: "orchestra.schedule.agents.cadence.once",
      params: { date: 5_000 } })
    expect(words(cadenceLabel({ kind: "once", at: 5_000 }))).toBe("Once at 5000")
    const cron = row(item({ cadence: { kind: "cron", expression: "0 9 * * 1-5" }, next: 9_000 }))
    expect([words(cron.cadence), cron.expression, cron.next]).toEqual(["Cron 0 9 * * 1-5", "0 9 * * 1-5", 9_000])
    expect(row(item()).expression).toBeUndefined()
  })

  test("each row names its owning Session and agent with counters and the last outcome", () => {
    const started = row(item({ runs: 3, skipped: 2, last: { outcome: "started", time: 7_000, sessionID: runID } }))
    expect(started.owner).toEqual({ sessionID: "ses_owner", agentID: "reviewer" })
    expect([words(started.runs), started.skipped && words(started.skipped)]).toEqual(["3 runs", "2 skipped"])
    expect(started.last).toEqual({ label: { key: "orchestra.schedule.agents.last.started", params: { date: 7_000 } },
      sessionID: runID })
    const failed = row(item({ runs: 1, last: { outcome: "failed", time: 8_000, error: "owner-missing" } }))
    expect([words(failed.runs), failed.skipped, failed.last?.error, failed.last?.sessionID])
      .toEqual(["1 run", undefined, "owner-missing", undefined])
    expect(words(failed.last!.label)).toBe("Last run failed 8000")
  })

  test("disabled schedules say why and only offer the actions Core accepts", () => {
    const view = (input: Partial<Schedule>) => {
      const value = row(item(input))
      return [words(value.status), value.actions]
    }
    expect(view({})).toEqual(["Scheduled", ["pause", "run", "remove"]])
    expect(view({ enabled: false })).toEqual(["Paused", ["resume", "run", "remove"]])
    expect(view({ enabled: false, disabledReason: "exhausted" })).toEqual(["Repeat limit reached", ["run", "remove"]])
    expect(view({ enabled: false, disabledReason: "owner-missing" })).toEqual(["Owner no longer exists", ["remove"]])
  })
})

describe("agent schedule model", () => {
  test("loads the live page into rows", async () => {
    const fake = fakeApi({ items: [item(), item({ id: ScheduledTask.ID.make("tsk_other"), enabled: false })] })
    const model = createScheduleAgentsModel(fake.api, keys())
    await model.load()
    expect(model.state.status).toBe("ready")
    expect(model.state.rows.map((value) => [value.id, words(value.status)]))
      .toEqual([["tsk_hourly", "Scheduled"], ["tsk_other", "Paused"]])
  })

  test("run now reports the started Session and reloads; pause and resume send fresh keys", async () => {
    const fake = fakeApi()
    const model = createScheduleAgentsModel(fake.api, keys())
    await model.load()
    await model.run(id)
    expect(model.state.started).toEqual({ id, sessionID: runID, reused: false })
    await model.pause(id)
    await model.resume(id)
    expect(model.state.started).toBeUndefined()
    expect(fake.calls).toEqual([{ action: "list" }, { action: "run", id, key: "key-1" }, { action: "list" },
      { action: "pause", id, key: "key-2" }, { action: "list" }, { action: "resume", id, key: "key-3" }, { action: "list" }])
  })

  test("delete waits for confirmation and cancel sends nothing", async () => {
    const fake = fakeApi()
    const model = createScheduleAgentsModel(fake.api, keys())
    await model.load()
    model.requestRemove(id)
    expect(model.state.confirm).toBe(id)
    model.cancelRemove()
    await model.confirmRemove()
    expect(fake.calls.map((call) => call.action)).toEqual(["list"])
    model.requestRemove(id)
    await model.confirmRemove()
    expect(model.state.confirm).toBeUndefined()
    expect(fake.calls.slice(1)).toEqual([{ action: "remove", id, key: "key-1" }, { action: "list" }])
  })

  test("a failed mutation keeps its intent and a retry reuses the same idempotency key", async () => {
    const failures: unknown[] = [{ status: 500 }, { status: 409 }]
    const fake = fakeApi({ fail: () => failures.shift() })
    const model = createScheduleAgentsModel(fake.api, keys())
    await model.load()
    model.requestRemove(id)
    await model.confirmRemove()
    expect([model.state.failure, model.state.pending, model.state.confirm]).toEqual(["request", { action: "remove", id }, id])
    await model.retry()
    expect(model.state.failure).toBe("conflict")
    await model.retry()
    expect([model.state.failure, model.state.pending, model.state.confirm, model.state.status])
      .toEqual([undefined, undefined, undefined, "ready"])
    expect(fake.calls.filter((call) => call.action === "remove").map((call) => call.key)).toEqual(["key-1", "key-1", "key-1"])
    await model.resume(id)
    expect(fake.calls.at(-2)).toEqual({ action: "resume", id, key: "key-2" })
  })

  test("denied requests classify as authorization and a malformed page is invalid", async () => {
    const denied = fakeApi({ fail: () => ({ _tag: "ForbiddenError" }) })
    const model = createScheduleAgentsModel(denied.api, keys())
    await model.pause(id)
    expect(model.state.failure).toBe("authorization")
    const broken = createScheduleAgentsModel({ ...denied.api,
      list: () => Promise.resolve({ items: [{ schedule: {} }], coverage: "live" } as never) }, keys())
    await broken.load()
    expect([broken.state.status, broken.state.failure]).toEqual(["error", "invalid"])
  })

  test("dispose drops rows and ignores later calls", async () => {
    const fake = fakeApi()
    const model = createScheduleAgentsModel(fake.api, keys())
    await model.load()
    model.dispose()
    await model.run(id)
    expect([model.state.rows, fake.calls.length]).toEqual([[], 1])
  })
})
