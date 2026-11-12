import { describe, expect } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import type { CapabilityOperatorContract } from "@orchestra/core/capability/operator/contract"
import { CapabilityScheduleOperator } from "@orchestra/core/capability/schedule/management"
import { Database } from "@orchestra/core/database/database"
import { AppNodeBuilder } from "@orchestra/core/effect/app-node-builder"
import { EventV2 } from "@orchestra/core/event"
import { Global } from "@orchestra/core/global"
import { Location } from "@orchestra/core/location"
import { LocationServiceMap } from "@orchestra/core/location-service-map"
import type { LocationServices } from "@orchestra/core/location-services"
import { ScheduledTask } from "@orchestra/core/scheduled-task"
import { ScheduledTaskRunTable, ScheduledTaskTable } from "@orchestra/core/scheduled-task/sql"
import { SessionV2 } from "@orchestra/core/session"
import { SessionEvent } from "@orchestra/core/session/event"
import { SessionExecution } from "@orchestra/core/session/execution"
import { SessionInput } from "@orchestra/core/session/input"
import { SessionMessage } from "@orchestra/core/session/message"
import { SessionProjector } from "@orchestra/core/session/projector"
import { SessionTable } from "@orchestra/core/session/sql"
import { SessionStore } from "@orchestra/core/session/store"
import { SessionSubagentModels } from "@orchestra/core/session/subagent-models"
import { and, eq } from "drizzle-orm"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Layer, LayerMap, Queue } from "effect"
import { SessionArchive } from "../src/session/archive"
import { failureCause } from "../src/scheduled-task/failure-cause"
import { ScheduleAuthorityFixture } from "./fixture/capability-schedule-authority"
import { it } from "./lib/effect"

type Fixture = Effect.Success<ReturnType<typeof ScheduleAuthorityFixture.make>>

const raw = (f: Fixture, sql: string) => f.database.db.$client.unsafe(sql).withoutTransform.pipe(Effect.asVoid)

function reasons(exit: Exit.Exit<unknown, unknown>) {
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isSuccess(exit)) throw new Error("Expected a failed safety operation")
  return exit.cause.reasons
}

function boundary<A, E>(f: Fixture, fiber: Fiber.Fiber<Exit.Exit<A, E>>) {
  return Deferred.await(f.entered).pipe(Effect.raceFirst(Fiber.join(fiber).pipe(Effect.flatMap((exit) =>
    Effect.die(new Error(Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "Operation completed before its actual boundary"))))),
  Effect.timeout("10 seconds"))
}

function management(f: Fixture, operators: CapabilityOperatorContract.Interface = f.operators,
  schedules = f.tasks.capability) {
  return CapabilityScheduleOperator.make({ operators, schedules: { ...schedules,
    placed: (at) => schedules.placed(at).pipe(Effect.tap(() => f.checkpoint("placed"))),
  } })
}

// This map exposes the SAME real Location graph, never another runner or registration of projectors.
const routing = (f: Fixture) => Layer.effect(LocationServiceMap.Service, LayerMap.make((_: Location.Ref) =>
  Layer.succeedContext(f.context as Context.Context<LocationServices>)))

function scheduler(f: Fixture, sessions: SessionV2.Interface) {
  return Effect.gen(function* () {
    const context = yield* Layer.build(Layer.fresh(AppNodeBuilder.build(ScheduledTask.node, [
      [Database.node, Layer.succeed(Database.Service, f.database)],
      [SessionV2.node, Layer.succeed(SessionV2.Service, sessions)],
      [LocationServiceMap.node, routing(f)],
    ])))
    return Context.get(context, ScheduledTask.Service)
  })
}

function sessionsWithWakeFailure(f: Fixture, wake: SessionExecution.Interface["wake"]) {
  return Effect.gen(function* () {
    const context = yield* Layer.build(Layer.fresh(AppNodeBuilder.build(SessionV2.node, [
      [Database.node, Layer.succeed(Database.Service, f.database)],
      [EventV2.node, Layer.succeed(EventV2.Service, f.events)],
      [SessionStore.node, Layer.succeed(SessionStore.Service, Context.get(f.context, SessionStore.Service))],
      [SessionSubagentModels.node, Layer.succeed(SessionSubagentModels.Service, Context.get(f.context, SessionSubagentModels.Service))],
      [SessionExecution.node, Layer.succeed(SessionExecution.Service, { ...f.execution, wake })],
      [Global.node, Layer.succeed(Global.Service, Context.get(f.context, Global.Service))],
      [LocationServiceMap.node, routing(f)],
      // The original application already registered these on the very same Event service and database.
      [SessionProjector.node, Layer.empty], [SessionArchive.node, Layer.empty],
    ])))
    return Context.get(context, SessionV2.Service)
  })
}

describe("H8 direct safety", () => {
  it.live("new Session commit sees real projection and a failed guard rolls it back", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const id = SessionV2.ID.create()
    const denied = new Error("new Session checkpoint refusal")
    const seen = { calls: 0 }
    const exit = yield* f.sessions.create({ id, location: f.owner.location }, { beforeCommit: Effect.gen(function* () {
      seen.calls++
      const row = yield* f.database.db.select().from(SessionTable).where(eq(SessionTable.id, id)).get()
      expect(row?.id).toBe(id)
      return yield* Effect.die(denied)
    }).pipe(Effect.orDie) }).pipe(Effect.exit)
    expect(seen.calls).toBe(1)
    expect(reasons(exit).some((reason) => reason._tag === "Die" && reason.defect === denied)).toBe(true)
    expect((yield* f.rows).sessions.map((row) => row.id)).toEqual([f.owner.sessionID])
    expect(yield* f.database.db.select().from(EventV2.EventTable).where(eq(EventV2.EventTable.aggregate_id, id)).all()).toEqual([])
    expect(f.state.provider).toEqual([])
  }), 30_000)

  it.live("adopting a durable Session skips the optional guard", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const before = yield* f.rows
    const calls = { n: 0 }
    const adopted = yield* f.sessions.create({ id: f.owner.sessionID, location: f.owner.location }, {
      beforeCommit: Effect.sync(() => { calls.n++ }).pipe(Effect.andThen(Effect.die("Adoption must not execute its guard"))),
    })
    expect(adopted.id).toBe(f.owner.sessionID)
    expect(calls.n).toBe(0)
    expect(yield* f.rows).toEqual(before)
  }), 30_000)

  it.live("new prompt guard runs after the actual hook and projection, with atomic input refusal", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    yield* f.installHook
    const id = SessionMessage.ID.create()
    const denied = new Error("new prompt checkpoint refusal")
    const exit = yield* f.sessions.prompt({ id, sessionID: f.owner.sessionID, prompt: { text: "guarded prompt" }, resume: false }, {
      beforeCommit: Effect.gen(function* () {
        expect(f.state.hookReturns).toBe(1)
        expect((yield* SessionInput.find(f.database.db, id))?.id).toBe(id)
        return yield* Effect.die(denied)
      }),
    }).pipe(Effect.exit)
    expect(reasons(exit).some((reason) => reason._tag === "Die" && reason.defect === denied)).toBe(true)
    expect(yield* SessionInput.find(f.database.db, id)).toBeUndefined()
    expect((yield* f.rows).sessions).toHaveLength(1)
    expect(yield* f.database.db.select().from(EventV2.EventTable).where(and(
      eq(EventV2.EventTable.aggregate_id, f.owner.sessionID),
      eq(EventV2.EventTable.type, EventV2.versionedType(SessionEvent.PromptAdmitted.type, 1)),
    )).all()).toEqual([])
    expect(f.state.provider).toEqual([])
  }), 30_000)

  it.live("exact prompt retry skips hook and guard while a conflicting retry retains its typed conflict", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    yield* f.installHook
    const id = SessionMessage.ID.create()
    const calls = { n: 0 }
    const input = { id, sessionID: f.owner.sessionID, prompt: { text: "exact prompt" }, resume: false }
    const first = yield* f.sessions.prompt(input, { beforeCommit: Effect.sync(() => { calls.n++ }) })
    const skip = { beforeCommit: Effect.sync(() => { calls.n++ }).pipe(Effect.andThen(Effect.die("Durable retry must skip guard"))) }
    const retried = yield* f.sessions.prompt(input, skip)
    const conflict = yield* f.sessions.prompt({ ...input, prompt: { text: "conflicting prompt" } }, skip).pipe(Effect.exit)
    expect(retried).toEqual(first)
    expect(calls.n).toBe(1)
    expect(f.state.hookReturns).toBe(1)
    expect(reasons(conflict).some((reason) => reason._tag === "Fail" && reason.error instanceof SessionV2.PromptConflictError)).toBe(true)
    expect((yield* f.rows).inputs).toHaveLength(1)
    expect(f.state.provider).toEqual([])
  }), 30_000)

  it.live("enabled resume performs no SQL update but still checks valid and revoked authority", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const task = yield* f.createTask()
    yield* raw(f, "CREATE TRIGGER h8_no_resume_update BEFORE UPDATE ON scheduled_task BEGIN SELECT RAISE(ABORT, 'enabled resume wrote'); END")
    const checks = { n: 0 }
    const resumed = yield* f.tasks.capability.resume(f.owner, task.id, { beforeCommit: Effect.sync(() => { checks.n++ }) })
    expect(resumed.enabled).toBe(true)
    expect(checks.n).toBe(1)
    const before = yield* f.rows
    yield* f.arm("placed")
    const pending = yield* f.fork(f.call("resume", task.id))
    yield* boundary(f, pending)
    yield* f.revoke
    yield* Deferred.succeed(f.release, undefined)
    expect(ScheduleAuthorityFixture.denial(yield* Fiber.join(pending))?.code).toBe("target_denied")
    expect(yield* f.rows).toEqual(before)
  }), 30_000)

  it.live("missing operations and invalid resume preserve existing errors without executing a guard", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const calls = { n: 0 }
    const options = { beforeCommit: Effect.sync(() => { calls.n++ }).pipe(Effect.andThen(Effect.die("No successful write"))) }
    const missing = ScheduledTask.ID.make("h8-missing")
    const failures = yield* Effect.all([
      f.tasks.capability.pause(f.owner, missing, options).pipe(Effect.exit),
      f.tasks.capability.resume(f.owner, missing, options).pipe(Effect.exit),
      f.tasks.capability.remove(f.owner, missing, options).pipe(Effect.exit),
      f.tasks.capability.run(f.owner, missing, "missing-run", options).pipe(Effect.exit),
    ], { concurrency: 1 })
    failures.forEach((exit) => expect(reasons(exit).some((reason) => reason._tag === "Fail" && reason.error instanceof ScheduledTask.NotFoundError)).toBe(true))
    const task = yield* f.createTask()
    yield* f.database.db.update(ScheduledTaskTable).set({ enabled: false, repeat_limit: 1, runs: 1 }).where(eq(ScheduledTaskTable.id, task.id)).run()
    const before = yield* f.rows
    const invalid = yield* f.tasks.capability.resume(f.owner, task.id, options).pipe(Effect.exit)
    expect(reasons(invalid).some((reason) => reason._tag === "Fail" && reason.error instanceof ScheduledTask.InvalidError)).toBe(true)
    expect(calls.n).toBe(0)
    expect(yield* f.rows).toEqual(before)
  }), 30_000)

  it.live("a new manual claim checks all three write boundaries and a started receipt skips them on exact retry", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const task = yield* f.createTask()
    const checks = { n: 0 }
    const first = yield* f.tasks.capability.run(f.owner, task.id, "direct-manual", { beforeCommit: Effect.sync(() => { checks.n++ }) })
    expect(yield* Queue.take(f.providerEntries)).toBe(first.sessionID)
    yield* f.execution.resume(first.sessionID)
    const retry = yield* f.tasks.capability.run(f.owner, task.id, "direct-manual", { beforeCommit: Effect.die("Started replay must skip guard") })
    expect(checks.n).toBe(3)
    expect(retry).toEqual({ ...first, reused: true })
    expect((yield* f.rows).runs).toHaveLength(1)
    expect(f.state.provider).toEqual([first.sessionID])
  }), 30_000)

  it.live("two actual authority failures remain two identities instead of one hidden-target denial", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const task = yield* f.createTask()
    const observed: Cause.Reason<Capability.Failure>[] = []
    const api = management(f, { ...f.operators, validate: (binding, target) => Effect.gen(function* () {
      const first = yield* f.operators.validate(binding, target).pipe(Effect.exit)
      const second = yield* f.operators.validate(binding, target).pipe(Effect.exit)
      if (Exit.isSuccess(first) || Exit.isSuccess(second)) return yield* Effect.die("Expected real revoked validation failures")
      observed.push(...first.cause.reasons, ...second.cause.reasons)
      return yield* Effect.failCause(Cause.fromReasons(observed))
    }) })
    yield* f.arm("placed")
    const pending = yield* f.fork(f.request(api.pause(f.placement, task.id)))
    yield* boundary(f, pending)
    yield* f.revoke
    yield* Deferred.succeed(f.release, undefined)
    const exit = yield* Fiber.join(pending)
    expect(observed).toHaveLength(2)
    expect(ScheduleAuthorityFixture.denial(exit)).toBeUndefined()
    const failed = reasons(exit)
    expect(failed).toHaveLength(2)
    observed.forEach((reason, index) => {
      const converted = failed[index]
      expect(reason._tag === "Fail" && converted?._tag === "Die" && converted.defect === reason.error).toBe(true)
    })
    expect((yield* f.rows).tasks[0]?.enabled).toBe(true)
  }), 30_000)

  it.live("actual validate failure plus an alien finalizer defect survives the new authority check", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const task = yield* f.createTask()
    const alien = new Error("validator finalizer storage identity")
    const original: Capability.Failure[] = []
    const api = management(f, { ...f.operators, validate: (binding, target) => f.operators.validate(binding, target).pipe(
      Effect.tapError((error) => Effect.sync(() => { original.push(error) })),
      Effect.catchCause((cause) => Effect.failCause(Cause.fromReasons(cause.reasons.map((reason) =>
        reason.annotate(Context.makeUnsafe(new Map([["h8-validation", "real-policy"]]))))))),
      Effect.onExit(() => Effect.failCause(Cause.fromReasons([
        Cause.makeDieReason(alien).annotate(Context.makeUnsafe(new Map([["h8-validation", "alien-finalizer"]]))),
      ]))),
    ) })
    yield* f.arm("placed")
    const pending = yield* f.fork(f.request(api.pause(f.placement, task.id)))
    yield* boundary(f, pending)
    yield* f.revoke
    yield* Deferred.succeed(f.release, undefined)
    const exit = yield* Fiber.join(pending)
    const failed = reasons(exit)
    expect(failed).toHaveLength(2)
    expect(failed.some((reason) => reason._tag === "Die" && reason.defect === original[0])).toBe(true)
    expect(failed.some((reason) => reason._tag === "Die" && reason.defect === alien)).toBe(true)
    expect(failed.find((reason) => reason._tag === "Die" && reason.defect === original[0])?.annotations.get("h8-validation")).toBe("real-policy")
    expect(failed.find((reason) => reason._tag === "Die" && reason.defect === alien)?.annotations.get("h8-validation")).toBe("alien-finalizer")
    expect(ScheduleAuthorityFixture.denial(exit)).toBeUndefined()
    expect((yield* f.rows).tasks[0]?.enabled).toBe(true)
  }), 30_000)

  it.live("a real failed dispatch transfers its original cause to the exact RunError after successful settlement", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const task = yield* f.createTask()
    const refused = new Error("prompt checkpoint refused")
    const exit = yield* f.tasks.capability.run(f.owner, task.id, "provenance", {
      beforeCommit: Effect.suspend(() => f.state.promptAttempted ? Effect.die(refused) : Effect.void),
    }).pipe(Effect.exit)
    const failed = reasons(exit)[0]
    expect(failed?._tag === "Fail" && failed.error instanceof ScheduledTask.RunError).toBe(true)
    if (failed?._tag !== "Fail" || !(failed.error instanceof ScheduledTask.RunError)) return yield* Effect.die("Expected the exact real RunError")
    const original = failureCause(failed.error)
    expect(original?.reasons).toHaveLength(1)
    expect(original?.reasons[0]?._tag === "Die" && original.reasons[0].defect === refused).toBe(true)
    expect(failureCause(new ScheduledTask.RunError({ reason: failed.error.reason }))).toBeUndefined()
    expect((yield* f.rows).inputs).toEqual([])
    expect((yield* f.rows).runs).toEqual([]) // Actual successful void settlement removed the unadmitted claim.
    expect(f.state.provider).toEqual([])
  }), 30_000)

  it.live("a real durable-input lookup failure after denial propagates as storage and never as captured 403", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const task = yield* f.createTask()
    f.state.onPromptCommit = f.revoke.pipe(Effect.orDie)
    const sessions: SessionV2.Interface = { ...f.sessions, prompt: (...args) => f.sessions.prompt(...args).pipe(
      Effect.catchCause((cause) => raw(f, "DROP TABLE session_input").pipe(Effect.orDie, Effect.andThen(Effect.failCause(cause)))),
    ) }
    const tasks = yield* scheduler(f, sessions)
    const observed: Cause.Cause<unknown>[] = []
    const api = management(f, f.operators, { ...tasks.capability, run: (...args) => tasks.capability.run(...args).pipe(
      Effect.tapCause((cause) => Effect.sync(() => { observed.push(cause) })),
    ) })
    const exit = yield* f.request(api.run(f.placement, task.id)).pipe(Effect.exit)
    expect(ScheduleAuthorityFixture.denial(exit)).toBeUndefined()
    expect(observed).toHaveLength(1)
    const failed = reasons(exit)
    expect(failed).toHaveLength(1)
    const own = f.state.commitCauses[0]?.reasons[0]
    expect(own?._tag === "Die" && own.defect instanceof Capability.Failure).toBe(true)
    expect(failed[0]?._tag === "Die" && observed[0]?.reasons[0]?._tag === "Die"
      && failed[0].defect === observed[0].reasons[0].defect).toBe(true)
    expect(failed[0]?._tag === "Die" && own?._tag === "Die" && failed[0].defect !== own.defect).toBe(true)
    expect(yield* f.database.db.$client.unsafe("SELECT name FROM sqlite_master WHERE type='table' AND name='session_input'").withoutTransform).toEqual([])
    expect((yield* f.database.db.select().from(ScheduledTaskRunTable).all())[0]?.state).toBe("running")
    expect(f.state.provider).toEqual([])
  }), 30_000)

  it.live("actual Local wake failure after durable admission retains truthful started receipt", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const task = yield* f.createTask()
    const wakeError = new Error("actual wake decorator failure after Local wake")
    const calls = { n: 0 }
    const sessions = yield* sessionsWithWakeFailure(f, (id) => f.execution.wake(id).pipe(
      Effect.andThen(Effect.sync(() => { calls.n++ })), Effect.andThen(Effect.die(wakeError)),
    ))
    const tasks = yield* scheduler(f, sessions)
    const started = yield* tasks.capability.run(f.owner, task.id, "wake-failed")
    expect(calls.n).toBe(1)
    expect(yield* Queue.take(f.providerEntries)).toBe(started.sessionID)
    yield* f.execution.resume(started.sessionID)
    const rows = yield* f.rows
    expect(rows.inputs.filter((row) => row.session_id === started.sessionID)).toHaveLength(1)
    expect(rows.runs[0]).toMatchObject({ state: "started", session_id: started.sessionID, error: null })
    expect(failureCause(started)).toBeUndefined()
  }), 30_000)

  it.live("real settlement SQLite refusal wins over earlier own authority denial", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const task = yield* f.createTask()
    yield* raw(f, "CREATE TRIGGER h8_fail_settle BEFORE DELETE ON scheduled_task_run BEGIN SELECT RAISE(ABORT, 'settlement storage refused'); END")
    f.state.onPromptCommit = f.revoke.pipe(Effect.orDie)
    const exit = yield* f.call("run", task.id).pipe(Effect.exit)
    const own = f.state.commitCauses[0]?.reasons[0]
    expect(own?._tag === "Die" && own.defect instanceof Capability.Failure).toBe(true)
    const failed = reasons(exit)
    expect(failed).toHaveLength(1)
    expect(failed[0]?._tag === "Die" && own?._tag === "Die" && failed[0].defect !== own.defect).toBe(true)
    expect(ScheduleAuthorityFixture.denial(exit)).toBeUndefined()
    expect((yield* f.rows).runs[0]?.state).toBe("running")
    expect((yield* f.rows).inputs).toEqual([])
    expect(f.state.provider).toEqual([])
  }), 30_000)

  for (const mixed of [false, true]) {
    it.live(`${mixed ? "mixed" : "pure"} actual NotFound keeps its whole cause or existing hidden-target semantics`, () => Effect.gen(function* () {
      const f = yield* ScheduleAuthorityFixture.make()
      const task = yield* f.createTask()
      const alien = new Error("adjacent NotFound cleanup defect")
      const original: ScheduledTask.NotFoundError[] = []
      const api = management(f, f.operators, { ...f.tasks.capability, pause: (...args) => f.tasks.capability.pause(...args).pipe(
        Effect.tapError((error) => Effect.sync(() => { original.push(error) })),
        Effect.onExit(() => mixed ? Effect.die(alien) : Effect.void),
      ) })
      yield* f.arm("placed")
      const pending = yield* f.fork(f.request(api.pause(f.placement, task.id)))
      yield* boundary(f, pending)
      yield* f.database.db.delete(ScheduledTaskTable).where(eq(ScheduledTaskTable.id, task.id)).run()
      yield* Deferred.succeed(f.release, undefined)
      const exit = yield* Fiber.join(pending)
      expect(original).toHaveLength(1)
      if (!mixed) expect(ScheduleAuthorityFixture.denial(exit)?.code).toBe("target_denied")
      if (mixed) {
        expect(ScheduleAuthorityFixture.denial(exit)).toBeUndefined()
        const failed = reasons(exit)
        expect(failed).toHaveLength(2)
        expect(failed.some((reason) => reason._tag === "Fail" && reason.error === original[0])).toBe(true)
        expect(failed.some((reason) => reason._tag === "Die" && reason.defect === alien)).toBe(true)
      }
    }), 30_000)
  }

  it.live("an adjacent LifecycleConflict and alien defect never collapse into typed PromptConflict", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const id = SessionMessage.ID.create()
    const conflict = new SessionInput.LifecycleConflict({ id })
    const alien = new Error("adjacent prompt rollback identity")
    const exit = yield* f.sessions.prompt({ id, sessionID: f.owner.sessionID, prompt: { text: "mixed conflict" }, resume: false }, {
      beforeCommit: Effect.failCause(Cause.fromReasons([Cause.makeDieReason(conflict), Cause.makeDieReason(alien)])),
    }).pipe(Effect.exit)
    const failed = reasons(exit)
    expect(failed).toHaveLength(2)
    expect(failed.some((reason) => reason._tag === "Die" && reason.defect === conflict)).toBe(true)
    expect(failed.some((reason) => reason._tag === "Die" && reason.defect === alien)).toBe(true)
    expect(yield* SessionInput.find(f.database.db, id)).toBeUndefined()
  }), 30_000)

  for (const mixed of [false, true]) {
    it.live(`${mixed ? "mixed" : "single"} projection-race defect retains identities when no durable Session can be adopted`, () => Effect.gen(function* () {
      const f = yield* ScheduleAuthorityFixture.make()
      const id = SessionV2.ID.create()
      const race = new SessionProjector.SessionAlreadyProjected()
      const alien = new Error("adjacent create rollback identity")
      const original = Cause.makeDieReason(race).annotate(Context.makeUnsafe(new Map([["h8-race", "original"]])))
      const exit = yield* f.sessions.create({ id, location: f.owner.location }, {
        beforeCommit: Effect.failCause(Cause.fromReasons(mixed ? [original, Cause.makeDieReason(alien)] : [original])),
      }).pipe(Effect.exit)
      const failed = reasons(exit)
      expect(failed).toHaveLength(mixed ? 2 : 1)
      const retained = failed.find((reason) => reason._tag === "Die" && reason.defect === race)
      expect(retained).toBeDefined()
      expect(retained?.annotations.get("h8-race")).toBe("original")
      if (mixed) expect(failed.some((reason) => reason._tag === "Die" && reason.defect === alien)).toBe(true)
      expect((yield* f.database.db.select().from(SessionTable).where(eq(SessionTable.id, id)).all())).toEqual([])
    }), 30_000)
  }
})
