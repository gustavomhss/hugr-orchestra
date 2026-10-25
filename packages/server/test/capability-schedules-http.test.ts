import { expect } from "bun:test"
import { ScheduledTaskTable } from "@orchestra/core/scheduled-task/sql"
import { it } from "@orchestra/core/test/lib/effect"
import { CapabilityScheduleManagement } from "@orchestra/schema/capability-schedule-management"
import { ScheduledTask } from "@orchestra/schema/scheduled-task"
import { eq } from "drizzle-orm"
import { Effect, Schema } from "effect"
import { CapabilitySchedulesHttpFixture } from "./capability-schedules-http-fixture"

const hourly = CapabilitySchedulesHttpFixture.hourly
const decodePage = Schema.decodeUnknownSync(CapabilityScheduleManagement.Page)

it.live("HTTP list returns this placement's agent schedules with their owning Session and agent only", () =>
  Effect.gen(function* () {
    const f = yield* CapabilitySchedulesHttpFixture.make()
    const auth = yield* f.issue()
    const owner = yield* f.owner()
    const created = yield* f.tasks.capability.create(owner, hourly)
    yield* f.tasks.capability.create(yield* f.owner(f.foreign), { ...hourly, name: "Foreign" })
    expect((yield* f.request(f.url(""))).status).toBe(401)
    const page = yield* f.request(f.url(""), { auth })
    expect(page.status).toBe(200)
    const decoded = decodePage(page.json)
    expect(decoded.coverage).toBe("live")
    expect(decoded.items.map((item) => [item.schedule.id, item.sessionID, item.agentID]))
      .toEqual([[created.id, owner.sessionID, owner.agentID]])
    expect(Object.keys(page.json.items[0]).sort()).toEqual(["agentID", "schedule", "sessionID"])
    expect(decoded.items[0]!.schedule).toMatchObject({ name: "Hourly check", enabled: true, runs: 0, skipped: 0 })
  }), 30_000)

it.live("HTTP pause and resume flip the schedule, and resuming an exhausted repeat is a 409", () =>
  Effect.gen(function* () {
    const f = yield* CapabilitySchedulesHttpFixture.make()
    const auth = yield* f.issue()
    const created = yield* f.tasks.capability.create(yield* f.owner(), hourly)
    const paused = yield* f.request(f.url(`/${created.id}/pause`), { method: "POST", auth, key: "pause-1" })
    expect(paused.status).toBe(200)
    expect(paused.json).toMatchObject({ id: created.id, enabled: false })
    expect(paused.json.next).toBeUndefined()
    const resumed = yield* f.request(f.url(`/${created.id}/resume`), { method: "POST", auth, key: "resume-1" })
    expect(resumed.status).toBe(200)
    expect(resumed.json).toMatchObject({ id: created.id, enabled: true })
    expect(resumed.json.next).toBeGreaterThan(Date.now())
    // The repeat limit is used up: Core disables the schedule and refuses to resume it.
    yield* f.database.db.update(ScheduledTaskTable).set({ enabled: false, disabled_reason: "exhausted", runs: 2,
      repeat_limit: 2 }).where(eq(ScheduledTaskTable.id, created.id)).run()
    const exhausted = yield* f.request(f.url(`/${created.id}/resume`), { method: "POST", auth, key: "resume-2" })
    expect(exhausted.status).toBe(409)
    expect(exhausted.json).toMatchObject({ message: "Schedule cannot resume" })
    const listed = decodePage((yield* f.request(f.url(""), { auth })).json)
    expect(listed.items[0]!.schedule).toMatchObject({ enabled: false, disabledReason: "exhausted", repeat: 2, runs: 2 })
  }), 30_000)

it.live("HTTP run starts a Session without moving next, and a retry with the same key reuses it", () =>
  Effect.gen(function* () {
    const f = yield* CapabilitySchedulesHttpFixture.make()
    const auth = yield* f.issue()
    const owner = yield* f.owner()
    const created = yield* f.tasks.capability.create(owner, hourly)
    const path = f.url(`/${created.id}/run`)
    const first = yield* f.request(path, { method: "POST", auth, key: "run-1" })
    expect(first.status).toBe(200)
    expect(first.json).toMatchObject({ id: created.id, reused: false })
    expect(first.json.sessionID).not.toBe(owner.sessionID)
    const retry = yield* f.request(path, { method: "POST", auth, key: "run-1" })
    expect(retry.json).toEqual({ ...first.json, reused: true })
    const other = yield* f.request(path, { method: "POST", auth, key: "run-2" })
    expect(other.json).toMatchObject({ reused: false })
    expect(other.json.sessionID).not.toBe(first.json.sessionID)
    const after = yield* f.tasks.capability.get(owner, created.id)
    expect(after.next).toBe(created.next)
    expect(after.runs).toBe(0)
    expect((yield* f.request(path, { method: "POST", auth })).status).toBe(400)
  }), 30_000)

it.live("HTTP delete removes the schedule and a repeat delete is denied", () =>
  Effect.gen(function* () {
    const f = yield* CapabilitySchedulesHttpFixture.make()
    const auth = yield* f.issue()
    const created = yield* f.tasks.capability.create(yield* f.owner(), hourly)
    const removed = yield* f.request(f.url(`/${created.id}`), { method: "DELETE", auth, key: "delete-1" })
    expect(removed.status).toBe(200)
    expect(removed.json).toEqual({ id: created.id, removed: true })
    expect(decodePage((yield* f.request(f.url(""), { auth })).json).items).toEqual([])
    const again = yield* f.request(f.url(`/${created.id}`), { method: "DELETE", auth, key: "delete-2" })
    expect([again.status, again.json]).toEqual([403, CapabilitySchedulesHttpFixture.denied])
  }), 30_000)

it.live("HTTP unknown, foreign and denied schedules share one constant 403 and change nothing", () =>
  Effect.gen(function* () {
    const f = yield* CapabilitySchedulesHttpFixture.make()
    const auth = yield* f.issue()
    const owned = yield* f.tasks.capability.create(yield* f.owner(), hourly)
    const foreignOwned = yield* f.tasks.capability.create(yield* f.owner(f.foreign), hourly)
    const listOnly = yield* f.issue({ placements: "instance", actions: ["schedule.list"] })
    const otherPlacement = yield* f.issue({ placements: [f.foreign], actions: ["*"] })
    const otherResource = yield* f.issue({ placements: "instance", actions: ["*"],
      resources: [{ kind: "schedule", id: ScheduledTask.ID.create() }] })
    const targets = [
      { id: foreignOwned.id, auth },
      { id: ScheduledTask.ID.create(), auth },
      { id: owned.id, auth: listOnly },
      { id: owned.id, auth: otherPlacement },
      { id: owned.id, auth: otherResource },
    ]
    const cases = targets.flatMap((target) => [
      { ...target, path: `/${target.id}/pause`, method: "POST" },
      { ...target, path: `/${target.id}/resume`, method: "POST" },
      { ...target, path: `/${target.id}/run`, method: "POST" },
      { ...target, path: `/${target.id}`, method: "DELETE" },
    ])
    yield* Effect.forEach(cases, (entry) => Effect.gen(function* () {
      const response = yield* f.request(f.url(entry.path), { method: entry.method, auth: entry.auth, key: "denied-1" })
      expect([entry.method, entry.path, response.status, response.json])
        .toEqual([entry.method, entry.path, 403, CapabilitySchedulesHttpFixture.denied])
    }))
    expect((yield* f.request(f.url(""), { auth: otherPlacement })).status).toBe(403)
    expect(decodePage((yield* f.request(f.url(""), { auth: listOnly })).json).items.map((item) => item.schedule))
      .toEqual([owned])
    expect(decodePage((yield* f.request(f.url("", f.foreign), { auth })).json).items.map((item) => item.schedule.id))
      .toEqual([foreignOwned.id])
  }), 30_000)
