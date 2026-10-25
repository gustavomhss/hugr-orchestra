import { beforeEach, describe, expect } from "bun:test"
import { eq, sql } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { TestClock } from "effect/testing"
import type { Capability } from "@orchestra/schema/capability"
import { WorkspaceID } from "@orchestra/schema/workspace-id"
import { AgentV2 } from "@orchestra/core/agent"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { EventV2 } from "@orchestra/core/event"
import { ProjectV2 } from "@orchestra/core/project"
import { AbsolutePath } from "@orchestra/core/schema"
import { ScheduledTask } from "@orchestra/core/scheduled-task"
import { ScheduledTaskModel } from "@orchestra/core/scheduled-task/model"
import { ScheduledTaskRunTable, ScheduledTaskTable } from "@orchestra/core/scheduled-task/sql"
import { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionInputTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { testEffect } from "./lib/effect"

const wakes: SessionV2.ID[] = []
// Deterministic interleavings: `beforeResolve` runs once while the dispatcher creates a run's Session (after the
// claim, before the recheck and admission); `onWake` runs once right after a prompt was admitted; `failWake` makes
// the wake after admission fail.
const hook: { beforeResolve?: Effect.Effect<void>; onWake?: Effect.Effect<void>; failWake?: boolean } = {}
beforeEach(() => {
  wakes.length = 0
  hook.beforeResolve = undefined
  hook.onWake = undefined
  hook.failWake = false
})
const once = (key: "beforeResolve" | "onWake") =>
  Effect.suspend(() => {
    const effect = hook[key] ?? Effect.void
    hook[key] = undefined
    return effect
  })
const execution = Layer.succeed(
  SessionExecution.Service,
  SessionExecution.Service.of({
    active: Effect.succeed(new Set()),
    resume: () => Effect.void,
    interrupt: () => Effect.void,
    wake: (sessionID) =>
      once("onWake").pipe(
        Effect.andThen(
          Effect.suspend(() => {
            wakes.push(sessionID)
            return hook.failWake ? Effect.die(new Error("wake failed")) : Effect.void
          }),
        ),
      ),
    exclusive: (_, effect) => Effect.asSome(effect),
    withRunner: () => Effect.die("No Session runner in this test"),
  }),
)
const projects = Layer.succeed(
  ProjectV2.Service,
  ProjectV2.Service.of({
    resolve: (directory) => once("beforeResolve").pipe(Effect.as({ id: ProjectV2.ID.global, directory })),
    directories: () => Effect.succeed([]),
    list: () => Effect.succeed([]),
    commit: () => Effect.void,
  }),
)
const it = testEffect(
  AppNodeBuilder.build(
    LayerNode.group([
      Database.node,
      EventV2.node,
      SessionProjector.node,
      SessionStore.node,
      SessionV2.node,
      ScheduledTask.node,
    ]),
    [
      [ProjectV2.node, projects],
      [SessionExecution.node, execution],
    ],
  ),
)

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const start = Date.parse("2031-01-15T09:30:00-05:00")
const directory = AbsolutePath.make("/project")
const location = { directory, workspaceID: WorkspaceID.make("wrk_owner") }
const reviewer = AgentV2.ID.make("reviewer")
const hourly = {
  name: "Hourly check",
  prompt: "Check the build.",
  cadence: { kind: "interval" as const, minutes: 60 },
  timezone: "America/New_York",
}

const inputs = Database.Service.use(({ db }) => db.select().from(SessionInputTable).all().pipe(Effect.orDie))
const runRows = Database.Service.use(({ db }) => db.select().from(ScheduledTaskRunTable).all().pipe(Effect.orDie))
const slotIDs = (id: string, revision: number, at: number) => {
  const ids = ScheduledTaskModel.slotIDs(`${id}:${revision}`, at)
  return { session: SessionV2.ID.make(ids.session), message: SessionMessage.ID.make(ids.message) }
}
// The invoking Session of schedule_manage; `agentID` is what the schedule records, `agent` what the Session persists.
const ownerSession = (agent = reviewer, agentID = agent) =>
  Effect.gen(function* () {
    const sessions = yield* SessionV2.Service
    const session = yield* sessions.create({ agent, location })
    return { projectID: session.projectID, location, sessionID: session.id, agentID } satisfies Capability.Owner
  })

describe("ScheduledTask capability dispatch", () => {
  it.effect("concurrent ticks admit a due slot once in a fresh Session with the owner's agent and placement", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start)
      const tasks = yield* ScheduledTask.Service
      const sessions = yield* SessionV2.Service
      const owner = yield* ownerSession()
      const created = yield* tasks.capability.create(owner, hourly)
      expect(created).toMatchObject({ revision: 0, enabled: true, runs: 0, skipped: 0, catchUp: "latest" })
      const slot = created.next!
      expect(slot).toBeGreaterThan(start)

      yield* TestClock.setTime(slot + MINUTE)
      yield* Effect.all([tasks.tick, tasks.tick, tasks.tick, tasks.tick], { concurrency: "unbounded" })
      const ids = slotIDs(created.id, 0, slot)
      expect((yield* inputs).map((row) => [row.id, row.session_id])).toEqual([[ids.message, ids.session]])
      expect(wakes).toEqual([ids.session])
      expect((yield* runRows).map((row) => [row.slot, row.revision, row.state])).toEqual([[slot, 0, "started"]])
      const run = yield* sessions.get(ids.session)
      expect(run.id).not.toBe(owner.sessionID)
      expect(run).toMatchObject({ agent: "reviewer", location })
      const after = yield* tasks.capability.get(owner, created.id)
      expect(after).toMatchObject({ runs: 1, skipped: 0, last: { outcome: "started", slot, sessionID: ids.session } })
      expect(after.next!).toBeGreaterThan(slot + MINUTE)
    }),
  )

  it.effect("catch-up latest runs only the latest overdue slot; skip runs none; both count what they pass", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start)
      const tasks = yield* ScheduledTask.Service
      const owner = yield* ownerSession()
      const created = yield* tasks.capability.create(owner, hourly)
      const never = yield* tasks.capability.create(owner, { ...hourly, catchUp: "skip" })
      const slot = created.next!
      yield* TestClock.setTime(slot + 3 * HOUR + 5 * MINUTE)
      yield* tasks.tick
      yield* tasks.tick
      expect((yield* inputs).map((row) => row.id)).toEqual([slotIDs(created.id, 0, slot + 3 * HOUR).message])
      expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({
        runs: 1,
        skipped: 3,
        next: slot + 4 * HOUR,
      })
      // catchUp skip never runs a late slot and counts every one it passed.
      expect(yield* tasks.capability.get(owner, never.id)).toMatchObject({ runs: 0, skipped: 4, next: slot + 4 * HOUR })
    }),
  )

  it.effect("repeat counts admitted slots and disables the schedule when exhausted", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start)
      const tasks = yield* ScheduledTask.Service
      const owner = yield* ownerSession()
      const created = yield* tasks.capability.create(owner, { ...hourly, repeat: 2 })
      const slot = created.next!
      yield* TestClock.setTime(slot + MINUTE)
      yield* tasks.tick
      yield* TestClock.setTime(slot + HOUR + MINUTE)
      yield* tasks.tick
      yield* TestClock.setTime(slot + 2 * HOUR + MINUTE)
      yield* tasks.tick
      expect(yield* inputs).toHaveLength(2)
      const exhausted = yield* tasks.capability.get(owner, created.id)
      expect(exhausted).toMatchObject({ runs: 2, enabled: false, disabledReason: "exhausted" })
      expect(exhausted.next).toBeUndefined()
      expect(yield* tasks.capability.resume(owner, created.id).pipe(Effect.flip)).toBeInstanceOf(
        ScheduledTask.InvalidError,
      )
    }),
  )

  it.effect("lowering repeat to the runs already admitted exhausts the schedule at once", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start)
      const tasks = yield* ScheduledTask.Service
      const owner = yield* ownerSession()
      const created = yield* tasks.capability.create(owner, hourly)
      yield* TestClock.setTime(created.next! + MINUTE)
      yield* tasks.tick
      const lowered = yield* tasks.capability.update(owner, created.id, { repeat: 1 })
      expect(lowered).toMatchObject({ runs: 1, repeat: 1, enabled: false, disabledReason: "exhausted" })
      yield* TestClock.setTime(created.next! + 3 * HOUR)
      yield* tasks.tick
      expect(yield* inputs).toHaveLength(1)
    }),
  )

  const missing: ReadonlyArray<[string, (owner: Capability.Owner) => Capability.Owner, AgentV2.ID]> = [
    ["the owner Session persists another agent", (owner) => owner, AgentV2.ID.make("builder")],
    [
      "the owner Session no longer exists",
      (owner) => ({ ...owner, sessionID: SessionV2.ID.make("ses_gone") }),
      reviewer,
    ],
    [
      "the owner Session lives in another placement",
      (owner) => ({
        ...owner,
        location: { directory: AbsolutePath.make("/elsewhere"), workspaceID: WorkspaceID.make("wrk_other") },
      }),
      reviewer,
    ],
  ]
  for (const [name, change, persisted] of missing)
    it.effect(`owner-missing when ${name}: disabled, claim revoked, nothing admitted`, () =>
      Effect.gen(function* () {
        yield* TestClock.setTime(start)
        const tasks = yield* ScheduledTask.Service
        const owner = change(yield* ownerSession(persisted, reviewer))
        const created = yield* tasks.capability.create(owner, hourly)
        yield* TestClock.setTime(created.next! + MINUTE)
        yield* tasks.tick
        yield* tasks.tick
        expect(yield* inputs).toHaveLength(0)
        expect((yield* runRows).map((row) => row.state)).toEqual(["revoked"])
        expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({
          enabled: false,
          disabledReason: "owner-missing",
          runs: 0,
        })
      }),
    )
})

describe("ScheduledTask capability revisions", () => {
  it.effect("an edit revokes a stopped claim of the old revision that never admitted", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start)
      const tasks = yield* ScheduledTask.Service
      const { db } = yield* Database.Service
      const owner = yield* ownerSession()
      const created = yield* tasks.capability.create(owner, hourly)
      const slot = created.next!
      const stale = slotIDs(created.id, 0, slot)
      yield* db
        .insert(ScheduledTaskRunTable)
        .values({
          id: "stopped-claim",
          task_id: created.id,
          slot,
          revision: 0,
          state: "running",
          session_id: stale.session,
          message_id: stale.message,
          prompt: created.prompt,
          owner: "stopped-process",
          time_claimed: slot,
        })
        .run()
        .pipe(Effect.orDie)
      yield* TestClock.setTime(slot + MINUTE)
      const edited = yield* tasks.capability.update(owner, created.id, { prompt: "Check the deploy." })
      expect(edited).toMatchObject({ revision: 1, prompt: "Check the deploy." })
      expect((yield* runRows).map((row) => [row.id, row.state])).toEqual([["stopped-claim", "revoked"]])

      yield* TestClock.setTime(edited.next! + ScheduledTask.LEASE)
      yield* tasks.tick
      const admitted = yield* inputs
      expect(admitted.map((row) => row.id)).not.toContain(stale.message)
      expect(admitted.map((row) => row.session_id)).toEqual([slotIDs(created.id, 1, edited.next!).session])
      expect((yield* runRows).find((row) => row.id === "stopped-claim")?.state).toBe("revoked")
    }),
  )

  it.effect("an edit before the recheck voids the claim and admits nothing", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start)
      const tasks = yield* ScheduledTask.Service
      const owner = yield* ownerSession()
      const created = yield* tasks.capability.create(owner, hourly)
      const slot = created.next!
      yield* TestClock.setTime(slot + MINUTE)
      const edits: ScheduledTask.Schedule[] = []
      hook.beforeResolve = tasks.capability
        .update(owner, created.id, { cadence: { kind: "interval", minutes: 120 } })
        .pipe(
          Effect.map((schedule) => edits.push(schedule)),
          Effect.asVoid,
          Effect.orDie,
        )
      yield* tasks.tick
      expect(edits).toHaveLength(1)
      expect(yield* inputs).toHaveLength(0)
      expect((yield* runRows).map((row) => [row.slot, row.revision, row.state])).toEqual([[slot, 0, "revoked"]])
      expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({
        revision: 1,
        runs: 0,
        next: edits[0]!.next,
        cadence: { minutes: 120 },
      })
    }),
  )

  it.effect("an edit after admission keeps the old revision's started receipt and its new next", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start)
      const tasks = yield* ScheduledTask.Service
      const owner = yield* ownerSession()
      const created = yield* tasks.capability.create(owner, hourly)
      const slot = created.next!
      yield* TestClock.setTime(slot + MINUTE)
      const edits: ScheduledTask.Schedule[] = []
      hook.onWake = tasks.capability.update(owner, created.id, { cadence: { kind: "interval", minutes: 120 } }).pipe(
        Effect.map((schedule) => edits.push(schedule)),
        Effect.asVoid,
        Effect.orDie,
      )
      yield* tasks.tick
      const ids = slotIDs(created.id, 0, slot)
      expect((yield* inputs).map((row) => row.id)).toEqual([ids.message])
      expect((yield* runRows).map((row) => [row.revision, row.state, row.session_id])).toEqual([
        [0, "started", ids.session],
      ])
      expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({
        revision: 1,
        runs: 1,
        next: edits[0]!.next,
        last: { outcome: "started", sessionID: ids.session },
      })
    }),
  )

  it.effect("a claim revoked while its prompt was admitted settles as started without counting", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start)
      const tasks = yield* ScheduledTask.Service
      const { db } = yield* Database.Service
      const owner = yield* ownerSession()
      const created = yield* tasks.capability.create(owner, hourly)
      const slot = created.next!
      yield* TestClock.setTime(slot + MINUTE)
      // What an edit racing admission leaves behind: the claim revoked after the recheck.
      hook.onWake = db
        .update(ScheduledTaskRunTable)
        .set({ state: "revoked", owner: null })
        .where(eq(ScheduledTaskRunTable.task_id, created.id))
        .run()
        .pipe(Effect.asVoid, Effect.orDie)
      yield* tasks.tick
      const ids = slotIDs(created.id, 0, slot)
      expect((yield* inputs).map((row) => row.id)).toEqual([ids.message])
      expect((yield* runRows).map((row) => [row.state, row.session_id])).toEqual([["started", ids.session]])
      expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({ runs: 0, next: slot })
    }),
  )
})

describe("ScheduledTask capability manual runs", () => {
  it.effect("a manual run dedupes on its key and never moves next or counts", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start)
      const tasks = yield* ScheduledTask.Service
      const sessions = yield* SessionV2.Service
      const owner = yield* ownerSession()
      const created = yield* tasks.capability.create(owner, hourly)
      yield* TestClock.setTime(start + 10 * MINUTE)
      const key = "invocation:msg_assistant:call_1"
      // The wake fails after admission: the prompt did start, so the run reports it and a retry reuses it.
      hook.failWake = true
      const first = yield* tasks.capability.run(owner, created.id, key)
      hook.failWake = false
      const retry = yield* tasks.capability.run(owner, created.id, key)
      expect(first).toEqual({
        sessionID: SessionV2.ID.make(ScheduledTaskModel.slotIDs(`${created.id}:manual:${key}`, start).session),
        reused: false,
      })
      expect(retry).toEqual({ sessionID: first.sessionID, reused: true })
      expect(yield* sessions.get(first.sessionID)).toMatchObject({ agent: "reviewer", location })
      const other = yield* tasks.capability.run(owner, created.id, "invocation:msg_assistant:call_2")
      expect(other.sessionID).not.toBe(first.sessionID)
      expect(yield* inputs).toHaveLength(2)
      expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({ runs: 0, next: created.next })

      yield* TestClock.setTime(created.next! + MINUTE)
      yield* tasks.tick
      expect(yield* tasks.capability.get(owner, created.id)).toMatchObject({ runs: 1 })
      expect(yield* inputs).toHaveLength(3)
    }),
  )
})

describe("ScheduledTask capability voided and revoked claims", () => {
  it.effect("a claim voided before its Session leaves no Session and no prompt", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start)
      const tasks = yield* ScheduledTask.Service
      const sessions = yield* SessionV2.Service
      const { db } = yield* Database.Service
      const owner = yield* ownerSession()
      const created = yield* tasks.capability.create(owner, hourly)
      const slot = created.next!
      // The schedule is paused the moment its slot is claimed, before dispatch reaches the Session.
      yield* db
        .run(
          sql.raw(
            "CREATE TEMP TRIGGER pause_on_claim AFTER INSERT ON scheduled_task_run BEGIN UPDATE scheduled_task SET enabled = 0 WHERE id = NEW.task_id; END",
          ),
        )
        .pipe(Effect.orDie)
      yield* TestClock.setTime(slot + MINUTE)
      yield* tasks.tick
      yield* db.run(sql.raw("DROP TRIGGER pause_on_claim")).pipe(Effect.orDie)
      expect(yield* inputs).toHaveLength(0)
      expect(yield* runRows).toEqual([])
      expect(yield* sessions.get(slotIDs(created.id, 0, slot).session).pipe(Effect.flip)).toBeInstanceOf(
        SessionV2.NotFoundError,
      )
    }),
  )

  it.effect("a revoked manual claim fails honestly and the same call never runs", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start)
      const tasks = yield* ScheduledTask.Service
      const { db } = yield* Database.Service
      const owner = yield* ownerSession()
      const created = yield* tasks.capability.create(owner, hourly)
      // A manual claim that a stopped process never admitted, revoked by an edit.
      const key = "invocation:msg_assistant:call_edit"
      const ids = ScheduledTaskModel.slotIDs(`${created.id}:manual:${key}`, start)
      yield* db
        .insert(ScheduledTaskRunTable)
        .values({
          id: "stopped-manual",
          task_id: created.id,
          revision: 0,
          manual_key: key,
          state: "running",
          session_id: SessionV2.ID.make(ids.session),
          message_id: SessionMessage.ID.make(ids.message),
          prompt: created.prompt,
          owner: "stopped-process",
          time_claimed: start,
        })
        .run()
        .pipe(Effect.orDie)
      yield* tasks.capability.update(owner, created.id, { name: "Renamed" })
      const edited = yield* tasks.capability.run(owner, created.id, key).pipe(Effect.flip)
      expect(edited).toBeInstanceOf(ScheduledTask.RunError)
      expect(edited._tag === "ScheduledTask.RunError" && edited.reason).toBe(
        "revoked by an edit; retrying the same call will not run",
      )

      const gone = { ...owner, sessionID: SessionV2.ID.make("ses_gone") }
      const orphan = yield* tasks.capability.create(gone, hourly)
      const missing = yield* tasks.capability
        .run(gone, orphan.id, "invocation:msg_assistant:call_gone")
        .pipe(Effect.flip)
      expect(missing._tag === "ScheduledTask.RunError" && missing.reason).toBe("owner-missing")
      const retried = yield* tasks.capability
        .run(gone, orphan.id, "invocation:msg_assistant:call_gone")
        .pipe(Effect.flip)
      expect(retried._tag === "ScheduledTask.RunError" && retried.reason).toBe(
        "owner-missing; retrying the same call will not run",
      )
      expect(yield* tasks.capability.get(gone, orphan.id)).toMatchObject({
        enabled: false,
        disabledReason: "owner-missing",
      })
      expect(yield* inputs).toHaveLength(0)
    }),
  )
})

describe("ScheduledTask capability isolation", () => {
  it.effect("legacy routes never see capability rows and legacy rows keep their behavior", () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(start - 10 * MINUTE)
      const tasks = yield* ScheduledTask.Service
      const sessions = yield* SessionV2.Service
      const { db } = yield* Database.Service
      const owner = yield* ownerSession()
      const legacy = yield* tasks.create(directory, {
        name: "Legacy",
        prompt: "Legacy prompt.",
        cadence: "hourly",
        next: start,
        timezone: "America/New_York",
      })
      const schedule = yield* tasks.capability.create(owner, hourly)
      expect((yield* tasks.list(directory)).map((task) => task.id)).toEqual([legacy.id])
      expect(yield* tasks.update(directory, schedule.id, { name: "x" }).pipe(Effect.flip)).toBeInstanceOf(
        ScheduledTask.NotFoundError,
      )
      expect(yield* tasks.run(directory, schedule.id).pipe(Effect.flip)).toBeInstanceOf(ScheduledTask.NotFoundError)
      expect(yield* tasks.remove(directory, schedule.id).pipe(Effect.flip)).toBeInstanceOf(ScheduledTask.NotFoundError)
      expect((yield* tasks.capability.list(owner)).map((item) => item.id)).toEqual([schedule.id])
      // Unknown, legacy and foreign IDs fail identically.
      const stranger = { ...owner, sessionID: SessionV2.ID.make("ses_stranger") }
      expect(yield* tasks.capability.get(owner, legacy.id).pipe(Effect.flip)).toBeInstanceOf(
        ScheduledTask.NotFoundError,
      )
      expect(yield* tasks.capability.get(stranger, schedule.id).pipe(Effect.flip)).toBeInstanceOf(
        ScheduledTask.NotFoundError,
      )
      expect(yield* tasks.capability.list(stranger)).toEqual([])

      yield* TestClock.setTime(start + MINUTE)
      yield* tasks.tick
      const ids = ScheduledTaskModel.slotIDs(legacy.id, start)
      expect(yield* sessions.get(SessionV2.ID.make(ids.session))).toMatchObject({ agent: "maestro" })
      expect((yield* tasks.list(directory))[0]).toMatchObject({ runs: 1, next: start + HOUR })
      const row = yield* db
        .select()
        .from(ScheduledTaskTable)
        .where(eq(ScheduledTaskTable.id, legacy.id))
        .get()
        .pipe(Effect.orDie)
      expect(row).toMatchObject({ policy: "legacy-browser", revision: 0, owner: null, skipped: 0 })
    }),
  )

  it.effect("the migrated slot index is unique per task, revision and slot", () =>
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      const columns = yield* db
        .all<{ name: string }>(sql`PRAGMA index_info('scheduled_task_run_slot_idx')`)
        .pipe(Effect.orDie)
      expect(columns.map((column) => column.name)).toEqual(["task_id", "revision", "slot"])
      const indexes = yield* db
        .all<{ name: string; unique: number }>(sql`PRAGMA index_list(scheduled_task_run)`)
        .pipe(Effect.orDie)
      expect(
        indexes
          .filter(
            (index) => index.name.startsWith("scheduled_task_run_") && index.name !== "scheduled_task_run_state_idx",
          )
          .map((index) => [index.name, index.unique])
          .sort(),
      ).toEqual([
        ["scheduled_task_run_manual_idx", 1],
        ["scheduled_task_run_slot_idx", 1],
      ])
    }),
  )
})
