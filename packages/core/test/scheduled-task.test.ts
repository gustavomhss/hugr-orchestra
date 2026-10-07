import { describe, expect } from "bun:test"
import path from "path"
import { Effect, Layer, Schedule } from "effect"
import { TestClock } from "effect/testing"
import { AgentV2 } from "@opencode-ai/core/agent"
import { Database } from "@opencode-ai/core/database/database"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { EventV2 } from "@opencode-ai/core/event"
import { ProjectV2 } from "@opencode-ai/core/project"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { ScheduledTask } from "@opencode-ai/core/scheduled-task"
import { ScheduledTaskModel } from "@opencode-ai/core/scheduled-task/model"
import { ScheduledTaskRunTable } from "@opencode-ai/core/scheduled-task/sql"
import { SessionV2 } from "@opencode-ai/core/session"
import { SessionExecution } from "@opencode-ai/core/session/execution"
import { SessionMessage } from "@opencode-ai/core/session/message"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { SessionInputTable } from "@opencode-ai/core/session/sql"
import { SessionStore } from "@opencode-ai/core/session/store"
import { testEffect } from "./lib/effect"
import { tmpdir } from "./fixture/tmpdir"

const wakes: SessionV2.ID[] = []
const execution = Layer.succeed(
  SessionExecution.Service,
  SessionExecution.Service.of({
    active: Effect.succeed(new Set()),
    resume: () => Effect.void,
    interrupt: () => Effect.void,
    wake: (sessionID) =>
      Effect.sync(() => {
        wakes.push(sessionID)
      }),
  }),
)
const projects = Layer.succeed(
  ProjectV2.Service,
  ProjectV2.Service.of({
    resolve: (directory) => Effect.succeed({ id: ProjectV2.ID.global, directory }),
    directories: () => Effect.succeed([]),
    commit: () => Effect.void,
  }),
)
const build = (daemon: boolean, database?: Layer.Layer<Database.Service>) =>
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      EventV2.node,
      SessionProjector.node,
      SessionStore.node,
      SessionV2.node,
      ScheduledTask.node,
      ...(daemon ? [ScheduledTask.daemonNode] : []),
    ]),
    [
      ...(database ? ([[Database.node, database]] as const) : []),
      [ProjectV2.node, projects],
      [SessionExecution.node, execution],
    ],
  )
const it = testEffect(build(false))

const HOUR = 3_600_000
const DAY = 24 * HOUR
const MINUTE = 60_000
const directory = AbsolutePath.make("/project")
const slot = Date.parse("2031-01-15T09:30:00-05:00")
const hourly = {
  name: "Hourly check",
  prompt: "Check the build.",
  cadence: "hourly" as const,
  next: slot,
  timezone: "America/New_York",
}

const inputs = Database.Service.use(({ db }) => db.select().from(SessionInputTable).all().pipe(Effect.orDie))
const runRows = Database.Service.use(({ db }) => db.select().from(ScheduledTaskRunTable).all().pipe(Effect.orDie))
const first = (tasks: ScheduledTask.Interface) => tasks.list(directory).pipe(Effect.map((list) => list[0]))
const slotIDs = (id: string, at: number) => {
  const ids = ScheduledTaskModel.slotIDs(id, at)
  return { session: SessionV2.ID.make(ids.session), message: SessionMessage.ID.make(ids.message) }
}
// What a process that stopped mid-dispatch leaves behind: its claim and, if it got that far, the admitted prompt.
const stopped = (input: { task: ScheduledTask.Info; slot: number; claimed: number; admitted: boolean }) =>
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const sessions = yield* SessionV2.Service
    const ids = slotIDs(input.task.id, input.slot)
    if (input.admitted) {
      yield* sessions.create({ id: ids.session, agent: AgentV2.defaultID, location: { directory } })
      yield* sessions.prompt({ id: ids.message, sessionID: ids.session, prompt: { text: input.task.prompt } })
    }
    yield* db
      .insert(ScheduledTaskRunTable)
      .values({
        id: `stopped-${input.task.id}`,
        task_id: input.task.id,
        slot: input.slot,
        state: "running",
        session_id: ids.session,
        message_id: ids.message,
        prompt: input.task.prompt,
        owner: "stopped-process",
        time_claimed: input.claimed,
      })
      .run()
      .pipe(Effect.orDie)
    return ids
  })

describe("ScheduledTask scheduler", () => {
  it.effect("admits a due slot once through the Session path and moves to the next slot", () =>
    Effect.gen(function* () {
      wakes.length = 0
      yield* TestClock.setTime(slot - 10 * MINUTE)
      const tasks = yield* ScheduledTask.Service
      const sessions = yield* SessionV2.Service
      const created = yield* tasks.create(directory, hourly)
      expect(created).toMatchObject({ minute: 570, next: slot, enabled: true, runs: 0 })
      expect(created).not.toHaveProperty("agent")
      yield* tasks.tick
      expect(yield* inputs).toHaveLength(0)

      yield* TestClock.setTime(slot + MINUTE)
      yield* tasks.tick
      yield* tasks.tick
      const ids = slotIDs(created.id, slot)
      expect((yield* inputs).map((row) => [row.id, row.session_id])).toEqual([[ids.message, ids.session]])
      expect(wakes).toEqual([ids.session])
      // Every scheduled run is a Maestro Session; a task names no agent of its own.
      expect(yield* sessions.get(ids.session)).toMatchObject({ agent: "maestro", location: { directory } })
      expect(yield* first(tasks)).toMatchObject({
        runs: 1,
        next: slot + HOUR,
        last: { outcome: "started", slot, sessionID: ids.session },
      })
    }),
  )

  it.effect("concurrent passes claim a slot once", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(slot - MINUTE)
      const tasks = yield* ScheduledTask.Service
      const created = yield* tasks.create(directory, hourly)
      yield* TestClock.setTime(slot + MINUTE)
      yield* Effect.all([tasks.tick, tasks.tick, tasks.tick, tasks.tick], { concurrency: "unbounded" })
      expect((yield* inputs).map((row) => row.id)).toEqual([slotIDs(created.id, slot).message])
      expect((yield* runRows).map((row) => [row.slot, row.state])).toEqual([[slot, "started"]])
      expect(yield* first(tasks)).toMatchObject({ runs: 1, next: slot + HOUR })
    }),
  )

  it.effect("an overtaken slot is missed and only the latest due slot runs", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(slot - MINUTE)
      const tasks = yield* ScheduledTask.Service
      const created = yield* tasks.create(directory, hourly)
      yield* TestClock.setTime(slot + 3 * HOUR + 5 * MINUTE)
      yield* tasks.tick
      expect((yield* inputs).map((row) => row.id)).toEqual([slotIDs(created.id, slot + 3 * HOUR).message])
      expect(yield* first(tasks)).toMatchObject({ runs: 1, next: slot + 4 * HOUR, missed: slot + 2 * HOUR })
    }),
  )

  it.effect("a one-off more than a day late is marked missed and paused, never run", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(slot - MINUTE)
      const tasks = yield* ScheduledTask.Service
      yield* tasks.create(directory, { ...hourly, cadence: "once" })
      yield* TestClock.setTime(slot + DAY + MINUTE)
      yield* tasks.tick
      yield* tasks.tick
      expect(yield* inputs).toHaveLength(0)
      const task = yield* first(tasks)
      expect(task).toMatchObject({ enabled: false, missed: slot, runs: 0, next: slot })
      expect(task?.last).toBeUndefined()
    }),
  )

  it.effect("a failed run is recorded with its reason and its slot is not retried", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(slot - MINUTE)
      const tasks = yield* ScheduledTask.Service
      const sessions = yield* SessionV2.Service
      const created = yield* tasks.create(directory, hourly)
      // The slot's message ID already holds another prompt, so admission conflicts.
      const ids = slotIDs(created.id, slot)
      yield* sessions.create({ id: ids.session, location: { directory } })
      yield* sessions.prompt({ id: ids.message, sessionID: ids.session, prompt: { text: "Something else." } })
      yield* TestClock.setTime(slot + MINUTE)
      yield* tasks.tick
      yield* tasks.tick
      expect(yield* first(tasks)).toMatchObject({
        runs: 0,
        next: slot + HOUR,
        last: { outcome: "failed", slot, error: expect.stringContaining("conflicts") },
      })
      expect((yield* runRows).map((row) => row.state)).toEqual(["failed"])
      expect(yield* inputs).toHaveLength(1)
    }),
  )
})

describe("ScheduledTask restart recovery", () => {
  it.effect("a stopped process's claim is left alone until its lease ends, then finished without a second prompt", () =>
    Effect.gen(function* () {
      wakes.length = 0
      yield* TestClock.setTime(slot - MINUTE)
      const tasks = yield* ScheduledTask.Service
      const created = yield* tasks.create(directory, hourly)
      yield* TestClock.setTime(slot + MINUTE)
      const ids = yield* stopped({ task: created, slot, claimed: slot + MINUTE, admitted: true })
      wakes.length = 0
      yield* tasks.tick
      expect(yield* first(tasks)).toMatchObject({ runs: 0, next: slot })

      yield* TestClock.setTime(slot + MINUTE + ScheduledTask.LEASE + 1)
      yield* tasks.tick
      expect((yield* inputs).map((row) => row.id)).toEqual([ids.message])
      // The exact retry reconciles the admitted prompt and wakes its Session.
      expect(wakes).toEqual([ids.session])
      expect(yield* first(tasks)).toMatchObject({
        runs: 1,
        next: slot + HOUR,
        last: { outcome: "started", sessionID: ids.session },
      })
      expect((yield* runRows).map((row) => [row.slot, row.state, row.owner])).toEqual([[slot, "started", null]])
    }),
  )

  it.effect("a stopped claim that never admitted its prompt is void, and the slot is served once", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(slot - MINUTE)
      const tasks = yield* ScheduledTask.Service
      const created = yield* tasks.create(directory, hourly)
      const ids = yield* stopped({ task: created, slot, claimed: slot - MINUTE, admitted: false })
      yield* TestClock.setTime(slot + ScheduledTask.LEASE)
      yield* tasks.tick
      expect((yield* inputs).map((row) => row.id)).toEqual([ids.message])
      expect((yield* runRows).map((row) => [row.slot, row.state])).toEqual([[slot, "started"]])
      expect(yield* first(tasks)).toMatchObject({ runs: 1, next: slot + HOUR })
    }),
  )

  it.live("a restarted server finishes the stopped run and serves due slots at boot", () =>
    Effect.gen(function* () {
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => tmpdir()),
        (dir) => Effect.promise(() => dir[Symbol.asyncDispose]()),
      )
      const database = () => Database.layerFromPath(path.join(tmp.path, "schedule.sqlite"))
      const now = Date.now()
      const recent = now - 5 * MINUTE
      // First process: a claimed and admitted slot it never settled, and a task due while it was down.
      const ids = yield* Effect.gen(function* () {
        const tasks = yield* ScheduledTask.Service
        const claimed = yield* tasks.create(directory, { ...hourly, next: recent })
        yield* tasks.create(directory, { ...hourly, name: "Due at boot", next: now - MINUTE })
        return yield* stopped({
          task: claimed,
          slot: recent,
          claimed: now - ScheduledTask.LEASE - 1_000,
          admitted: true,
        })
      }).pipe(Effect.provide(build(false, database())), Effect.scoped)

      // Second process: the scheduler's boot pass, with no client involved.
      const served = yield* Effect.gen(function* () {
        const tasks = yield* ScheduledTask.Service
        const list = yield* tasks.list(directory).pipe(
          Effect.repeat({
            until: (items) => items.every((item) => item.runs === 1),
            schedule: Schedule.spaced("25 millis"),
            times: 200,
          }),
        )
        return { list, inputs: yield* inputs }
      }).pipe(Effect.provide(build(true, database())), Effect.scoped)

      expect(served.list.map((item) => [item.name, item.runs])).toEqual([
        ["Hourly check", 1],
        ["Due at boot", 1],
      ])
      expect(served.list[0]?.last).toMatchObject({ outcome: "started", sessionID: ids.session })
      expect(served.list[0]?.next).toBe(recent + HOUR)
      expect(served.inputs).toHaveLength(2)
    }),
  )
})

describe("ScheduledTask Run now", () => {
  it.effect("serves the due slot with its IDs, otherwise starts an extra run", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(slot - HOUR)
      const tasks = yield* ScheduledTask.Service
      const once = yield* tasks.create(directory, { ...hourly, name: "Release notes", cadence: "once" })
      const extra = yield* tasks.run(directory, once.id)
      expect(extra.sessionID).not.toBe(slotIDs(once.id, slot).session)
      // A one-off pauses after it runs and keeps its time.
      expect((yield* tasks.list(directory))[0]).toMatchObject({
        enabled: false,
        next: slot,
        runs: 1,
        last: { outcome: "started", sessionID: extra.sessionID },
      })

      const recurring = yield* tasks.create(directory, hourly)
      yield* TestClock.setTime(slot + MINUTE)
      expect((yield* tasks.run(directory, recurring.id)).sessionID).toBe(slotIDs(recurring.id, slot).session)
      const again = yield* tasks.run(directory, recurring.id)
      expect(again.sessionID).not.toBe(slotIDs(recurring.id, slot).session)
      expect((yield* tasks.list(directory))[1]).toMatchObject({ runs: 2, next: slot + HOUR })
      yield* tasks.tick
      expect(yield* inputs).toHaveLength(3)
    }),
  )

  it.effect("a failed Run now returns its reason and records nothing", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(slot - MINUTE)
      const tasks = yield* ScheduledTask.Service
      const sessions = yield* SessionV2.Service
      const created = yield* tasks.create(directory, hourly)
      const ids = slotIDs(created.id, slot)
      yield* sessions.create({ id: ids.session, location: { directory } })
      yield* sessions.prompt({ id: ids.message, sessionID: ids.session, prompt: { text: "Something else." } })
      yield* TestClock.setTime(slot + MINUTE)
      const error = yield* tasks.run(directory, created.id).pipe(Effect.flip)
      expect(error).toBeInstanceOf(ScheduledTask.RunError)
      expect(error._tag === "ScheduledTask.RunError" && error.reason).toContain("conflicts")
      const task = yield* first(tasks)
      expect(task).toMatchObject({ runs: 0, next: slot })
      expect(task?.last).toBeUndefined()
      expect(yield* runRows).toEqual([])
    }),
  )
})

describe("ScheduledTask storage", () => {
  it.effect("tasks belong to their directory and reusing an ID adopts the task", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(slot - HOUR)
      const tasks = yield* ScheduledTask.Service
      const id = ScheduledTask.ID.make("3f1c2a4e-device-task")
      const imported = yield* tasks.create(directory, {
        ...hourly,
        id,
        minute: 575,
        enabled: false,
        history: {
          runs: 4,
          missed: slot - DAY,
          last: { time: slot - 2 * HOUR, sessionID: SessionV2.ID.make("ses_device_run") },
        },
      })
      expect(imported).toMatchObject({
        id,
        minute: 575,
        enabled: false,
        runs: 4,
        missed: slot - DAY,
        last: { outcome: "started", time: slot - 2 * HOUR, sessionID: "ses_device_run" },
      })
      expect(yield* tasks.create(directory, { ...hourly, id, name: "Imported twice" })).toEqual(imported)
      const conflict = yield* tasks.create(AbsolutePath.make("/other"), { ...hourly, id }).pipe(Effect.flip)
      expect(conflict).toBeInstanceOf(ScheduledTask.ConflictError)
      expect(yield* tasks.list(AbsolutePath.make("/other"))).toEqual([])
      const zone = yield* tasks.create(directory, { ...hourly, timezone: "Mars/Olympus" }).pipe(Effect.flip)
      expect(zone).toBeInstanceOf(ScheduledTask.InvalidError)

      yield* tasks.remove(directory, id)
      expect(yield* tasks.list(directory)).toEqual([])
      expect(yield* runRows).toEqual([])
      expect(yield* tasks.remove(directory, id).pipe(Effect.flip)).toBeInstanceOf(ScheduledTask.NotFoundError)
    }),
  )

  it.effect("editing re-anchors the time, pausing keeps it, and resuming rolls a recurring task forward", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(slot - MINUTE)
      const tasks = yield* ScheduledTask.Service
      const created = yield* tasks.create(directory, { ...hourly, cadence: "daily" })
      yield* TestClock.setTime(slot + MINUTE)
      yield* tasks.tick
      yield* TestClock.setTime(slot + 3 * DAY)
      yield* tasks.tick
      expect(yield* first(tasks)).toMatchObject({ missed: slot + 2 * DAY, next: slot + 4 * DAY, runs: 2 })

      expect(yield* tasks.update(directory, created.id, { name: "Renamed" })).toMatchObject({
        name: "Renamed",
        missed: slot + 2 * DAY,
      })
      const retimed = yield* tasks.update(directory, created.id, {
        next: Date.parse("2031-01-20T07:15:00-05:00"),
        timezone: "Asia/Tokyo",
      })
      expect(retimed.minute).toBe(21 * 60 + 15)
      expect(retimed.missed).toBeUndefined()

      expect(yield* tasks.update(directory, created.id, { enabled: false })).toMatchObject({ enabled: false })
      yield* TestClock.setTime(Date.parse("2031-01-22T00:00:00Z"))
      expect(yield* tasks.update(directory, created.id, { enabled: true })).toMatchObject({
        enabled: true,
        next: Date.parse("2031-01-22T21:15:00+09:00"),
      })

      const once = yield* tasks.create(directory, { ...hourly, cadence: "once", enabled: false })
      expect(yield* tasks.update(directory, once.id, { enabled: true }).pipe(Effect.flip)).toBeInstanceOf(
        ScheduledTask.InvalidError,
      )
      const later = Date.parse("2031-02-01T09:30:00-05:00")
      expect(yield* tasks.update(directory, once.id, { enabled: true, next: later })).toMatchObject({
        enabled: true,
        next: later,
      })
      expect(
        yield* tasks.update(directory, ScheduledTask.ID.make("missing"), { enabled: true }).pipe(Effect.flip),
      ).toBeInstanceOf(ScheduledTask.NotFoundError)
    }),
  )
})
