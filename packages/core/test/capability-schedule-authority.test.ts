import { describe, expect } from "bun:test"
import { Capability } from "@orchestra/schema/capability"
import { CapabilityScheduleOperator } from "@orchestra/core/capability/schedule/management"
import { ScheduledTask } from "@orchestra/core/scheduled-task"
import { SessionV2 } from "@orchestra/core/session"
import { SessionInput } from "@orchestra/core/session/input"
import { ScheduledTaskRunTable } from "@orchestra/core/scheduled-task/sql"
import { SessionMessage } from "@orchestra/core/session/message"
import { Cause, Deferred, Effect, Exit, Fiber, Queue } from "effect"
import { ScheduleAuthorityFixture } from "./fixture/capability-schedule-authority"
import { it } from "./lib/effect"

// Only CONTROL and H8 names are original-bug baseline candidates. FUTURE cases exercise the frozen
// cause/guard safety requirements; their failure before implementation is not original H8 RED proof.
// Once the internal options/helper scaffold exists, add its direct new-write/adopt/exact-retry guard tests
// and the private RunError->Cause association unit assertions. No missing future import is used as RED.
type Fixture = Effect.Success<ReturnType<typeof ScheduleAuthorityFixture.make>>

function boundary<A, E>(f: Fixture, fiber: Fiber.Fiber<Exit.Exit<A, E>>) {
  return Deferred.await(f.entered).pipe(
    Effect.raceFirst(Fiber.join(fiber).pipe(Effect.flatMap((exit) => Effect.die(new Error(
      `Fixture did not reach its armed boundary: ${Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "operation already completed"}`,
    ))))),
    Effect.timeout("10 seconds"),
  )
}

function twoReasons(exit: Exit.Exit<unknown, unknown>, first: unknown, second: unknown) {
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isSuccess(exit)) throw new Error("Expected two preserved failure reasons")
  expect(exit.cause.reasons).toHaveLength(2)
  const identities = exit.cause.reasons.map((reason) => reason._tag === "Die" ? reason.defect : reason._tag === "Fail" ? reason.error : reason)
  expect(identities.some((identity) => identity === first)).toBe(true)
  expect(identities.some((identity) => identity === second)).toBe(true)
  expect(ScheduleAuthorityFixture.denial(exit)).toBeUndefined()
  return exit.cause
}

const operations = ["pause", "resume", "remove", "run"] as const

describe("Capability schedule authority", () => {
  it.live("CONTROL H8 real mutations, manual admission, provider entry and exact started retry", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const task = yield* f.createTask()
    yield* f.call("pause", task.id)
    expect((yield* f.tasks.capability.get(f.owner, task.id)).enabled).toBe(false)
    yield* f.call("resume", task.id)
    expect((yield* f.tasks.capability.get(f.owner, task.id)).enabled).toBe(true)
    const first = yield* f.request(f.api.run(f.placement, task.id))
    expect(yield* Queue.take(f.providerEntries)).toBe(first.sessionID)
    yield* f.execution.resume(first.sessionID)
    const retry = yield* f.request(f.api.run(f.placement, task.id))
    expect(retry).toEqual({ ...first, reused: true })
    const rows = yield* f.rows
    expect(rows.runs).toHaveLength(1)
    expect(rows.runs[0]).toMatchObject({ state: "started", session_id: first.sessionID })
    expect(rows.inputs.filter((row) => row.session_id === first.sessionID)).toHaveLength(1)
    expect(f.state.provider).toEqual([first.sessionID])
    yield* f.call("remove", task.id)
    expect((yield* f.rows).tasks).toEqual([])
  }), 30_000)

  it.live("CONTROL H8 installed prompt hook actually returns before provider execution", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    yield* f.installHook
    const task = yield* f.createTask()
    const first = yield* f.request(f.api.run(f.placement, task.id))
    expect(yield* Queue.take(f.providerEntries)).toBe(first.sessionID)
    yield* f.execution.resume(first.sessionID)
    expect(f.state.hookReturns).toBe(1)
    const row = (yield* f.rows).inputs.find((row) => row.session_id === first.sessionID)
    expect(row).toBeDefined()
    expect(JSON.stringify(row)).toContain("H8 actual prompt hook ran")
  }), 30_000)

  it.live("CONTROL H8 storage refusal remains storage failure and rolls back the real mutation", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const task = yield* f.createTask()
    const before = yield* f.rows
    const storage = new Error("H8 actual transaction callback refusal")
    f.state.transactionFailure = Cause.die(storage)
    const exit = yield* f.call("pause", task.id).pipe(Effect.exit)
    expect(ScheduleAuthorityFixture.denial(exit)).toBeUndefined()
    expect(Exit.isFailure(exit) && exit.cause.reasons.some((reason) => reason._tag === "Die" && reason.defect === storage)).toBe(true)
    expect(yield* f.rows).toEqual(before)
  }), 30_000)

  it.live("CONTROL H8 a failure after actual durable publication reconciles the already-started input", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const task = yield* f.createTask()
    f.state.afterPublishFailure = new Error("H8 response failed after durable publication")
    const started = yield* f.request(f.api.run(f.placement, task.id))
    expect(yield* Queue.take(f.providerEntries)).toBe(started.sessionID)
    yield* f.execution.resume(started.sessionID)
    const rows = yield* f.rows
    expect(rows.runs[0]?.state).toBe("started")
    expect(rows.inputs.filter((row) => row.session_id === started.sessionID)).toHaveLength(1)
  }), 30_000)

  it.live("CONTROL H8 a replayed revoked receipt has no fabricated own-denial provenance", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const task = yield* f.createTask()
    // A valid unadmitted historical receipt: no Session/input or live object provenance is invented.
    yield* f.database.db.insert(ScheduledTaskRunTable).values({ id: "h8-historical-revoked", task_id: task.id,
      revision: 0, manual_key: "operator:schedule-authority-acceptance:manual-once", state: "revoked",
      session_id: SessionV2.ID.create(), message_id: SessionMessage.ID.create(), prompt: "Historical unadmitted prompt",
      error: "authentication_required", time_claimed: 1, time_settled: 2 }).run()
    const exit = yield* f.request(f.api.run(f.placement, task.id)).pipe(Effect.exit)
    expect(ScheduleAuthorityFixture.denial(exit)).toBeUndefined()
    expect(Exit.isFailure(exit) && exit.cause.reasons[0]?._tag === "Fail"
      && exit.cause.reasons[0].error instanceof ScheduledTask.RunError).toBe(true)
    expect(f.state.provider).toEqual([])
  }), 30_000)

  for (const operation of operations) {
    for (const invalidation of ["revoke", "expire"] as const) {
      it.live(`H8: ${operation} refuses ${invalidation} after real placed lookup`, () => Effect.gen(function* () {
        const f = yield* ScheduleAuthorityFixture.make()
        const task = yield* f.createTask()
        if (operation === "resume") yield* f.tasks.capability.pause(f.owner, task.id)
        const before = yield* f.rows
        yield* f.arm("placed")
        const pending = yield* f.fork(f.call(operation, task.id))
        yield* boundary(f, pending)
        yield* f[invalidation]
        yield* Deferred.succeed(f.release, undefined)
        const exit = yield* Fiber.join(pending)
        expect(ScheduleAuthorityFixture.denial(exit)).toMatchObject({ code: "target_denied", message: "Schedule is unavailable" })
        expect(yield* f.rows).toEqual(before)
        expect(f.state.provider).toEqual([])
      }), 30_000)
    }
  }

  for (const phase of ["writer-enter", "writer-after-sql"] as const) {
    it.live(`H8: pause rolls back when revoked at ${phase} inside real IMMEDIATE`, () => Effect.gen(function* () {
      const f = yield* ScheduleAuthorityFixture.make()
      const task = yield* f.createTask()
      const before = yield* f.rows
      yield* f.arm(phase)
      const pending = yield* f.fork(f.call("pause", task.id))
      expect(yield* boundary(f, pending)).toBe(phase)
      expect(f.state.insideTransaction).toBe(true)
      yield* f.revoke
      yield* Deferred.succeed(f.release, undefined)
      const exit = yield* Fiber.join(pending)
      expect(ScheduleAuthorityFixture.denial(exit)?.code).toBe("target_denied")
      expect(yield* f.rows).toEqual(before)
      expect(f.state.provider).toEqual([])
    }), 30_000)
  }

  for (const phase of ["created-commit", "prompt-hook", "prompt-commit"] as const) {
    it.live(`H8: run refuses revocation at real ${phase} without denied admission/provider entry`, () => Effect.gen(function* () {
      const f = yield* ScheduleAuthorityFixture.make()
      if (phase === "prompt-hook") yield* f.installHook
      const task = yield* f.createTask()
      const before = yield* f.rows
      yield* f.arm(phase)
      const pending = yield* f.fork(f.call("run", task.id))
      expect(yield* boundary(f, pending)).toBe(phase)
      if (phase === "created-commit") expect(f.state.projected.sessions).toBe(before.sessions.length + 1)
      if (phase === "prompt-commit") expect(f.state.projected.inputs).toBe(before.inputs.length + 1)
      if (phase === "prompt-hook") expect(f.state.hookReturns).toBe(1)
      yield* f.revoke
      yield* Deferred.succeed(f.release, undefined)
      const exit = yield* Fiber.join(pending)
      expect(ScheduleAuthorityFixture.denial(exit)?.code).toBe("target_denied")
      const after = yield* f.rows
      expect(after.inputs).toEqual(before.inputs)
      expect(after.sessions).toHaveLength(before.sessions.length + (phase === "created-commit" ? 0 : 1))
      expect(after.runs.some((row) => row.state === "started")).toBe(false)
      expect(f.state.provider).toEqual([])
    }), 30_000)
  }

  // FUTURE safety suite: existing Event.publish commit decoration is the causal port, with no future imports.
  for (const publication of ["created-commit", "prompt-commit"] as const) {
    it.live(`FUTURE H8 ${publication} preserves both annotated defects through the public Session facade`, () => Effect.gen(function* () {
      const f = yield* ScheduleAuthorityFixture.make()
      const one = new Error("H8 first identity")
      const two = new Error("H8 second identity")
      const first = Cause.makeDieReason(one).annotate(new Map([["h8", "first"]]))
      const second = Cause.makeDieReason(two).annotate(new Map([["h8", "second"]]))
      f.state.afterCommitFailure = Cause.fromReasons([first, second])
      const exit = publication === "created-commit"
        ? yield* f.sessions.create({ location: f.owner.location }).pipe(Effect.exit)
        : yield* f.sessions.prompt({ sessionID: f.owner.sessionID, prompt: { text: "mixed publication" }, resume: false }).pipe(Effect.exit)
      const cause = twoReasons(exit, one, two)
      expect(cause.reasons.find((reason) => reason._tag === "Die" && reason.defect === one)?.annotations).toEqual(first.annotations)
      expect(cause.reasons.find((reason) => reason._tag === "Die" && reason.defect === two)?.annotations).toEqual(second.annotations)
      expect((yield* f.rows).inputs).toEqual([])
      expect(f.state.provider).toEqual([])
    }), 30_000)
  }

  for (const interference of ["defect", "sql", "interrupt"] as const) {
    it.live(`FUTURE H8 own denial plus ${interference} cannot become hidden-target denial`, () => Effect.gen(function* () {
      const f = yield* ScheduleAuthorityFixture.make()
      const task = yield* f.createTask()
      const storage = new Error("H8 concurrent finalizer identity")
      yield* f.arm("prompt-commit")
      const pending = yield* f.fork(f.call("run", task.id))
      yield* boundary(f, pending)
      expect(f.state.commitPresent).toBe(true) // Future authority seam required, not original-bug baseline evidence.
      if (interference === "defect") f.state.afterCommitFailure = Cause.die(storage)
      if (interference === "sql") f.state.sqlFinalizer = true
      if (interference === "interrupt") f.state.afterCommitFailure = Cause.interrupt(178)
      yield* f.revoke
      yield* Deferred.succeed(f.release, undefined)
      const exit = yield* Fiber.join(pending)
      const own = f.state.commitCauses[0]?.reasons[0]
      expect(own?._tag).toBe("Die")
      if (own?._tag !== "Die") return yield* Effect.die("Future check did not preserve the exact own denial")
      expect(own.defect).toBeInstanceOf(Capability.Failure)
      if (interference !== "interrupt") {
        const observed = f.state.publicationCauses[0]
        expect(observed).toBeDefined()
        if (!observed) return yield* Effect.die("Expected actual publication Cause observation")
        const cause = twoReasons(Exit.failCause(observed), own.defect, interference === "sql" ? f.state.sqlFailure : storage)
        expect(cause.reasons.every((reason) => reason._tag === "Die")).toBe(true)
        if (interference === "sql") {
          expect(f.state.sqlFailure).toBeDefined()
          expect(cause.reasons.find((reason) => reason._tag === "Die" && reason.defect === f.state.sqlFailure)?.annotations.get("h8-storage"))
            .toBe("actual-sql-finalizer")
        }
      }
      if (interference === "interrupt") {
        expect(f.state.publicationCauses[0]?.reasons.some(Cause.isInterruptReason)).toBe(true)
      }
      expect(ScheduleAuthorityFixture.denial(exit)).toBeUndefined()
      expect(Exit.isFailure(exit) && exit.cause.reasons[0]?._tag === "Fail"
        && exit.cause.reasons[0].error instanceof ScheduledTask.RunError).toBe(true)
      expect((yield* f.rows).inputs).toEqual([])
      expect(f.state.provider).toEqual([])
    }), 30_000)
  }

  it.live("FUTURE H8 exact own denial with successful settlement maps to the existing hidden target failure", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const task = yield* f.createTask()
    yield* f.arm("prompt-commit")
    const pending = yield* f.fork(f.call("run", task.id))
    yield* boundary(f, pending)
    expect(f.state.commitPresent).toBe(true)
    yield* f.revoke
    yield* Deferred.succeed(f.release, undefined)
    const exit = yield* Fiber.join(pending)
    const own = f.state.commitCauses[0]?.reasons[0]
    expect(own?._tag === "Die" && ScheduleAuthorityFixture.denial(exit)).toMatchObject({ code: "target_denied" })
    if (own?._tag === "Die") expect(ScheduleAuthorityFixture.denial(exit)).toBe(own.defect)
    const rows = yield* f.rows
    expect(rows.inputs).toEqual([])
    expect(rows.runs.some((row) => row.state === "started")).toBe(false)
  }), 30_000)

  it.live("FUTURE H8 settlement failure wins over an earlier own denial without mapping the denial cell", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const task = yield* f.createTask()
    const storage = new Error("H8 settle failed after the authority refusal")
    f.state.onPromptCommit = f.revoke.pipe(Effect.orDie)
    f.state.settleFailure = Cause.die(storage)
    const exit = yield* f.call("run", task.id).pipe(Effect.exit)
    const own = f.state.commitCauses[0]?.reasons[0]
    expect(own?._tag === "Die" && own.defect instanceof Capability.Failure).toBe(true)
    expect(ScheduleAuthorityFixture.denial(exit)).toBeUndefined()
    expect(Exit.isFailure(exit) && exit.cause.reasons.length === 1
      && exit.cause.reasons[0]?._tag === "Die" && exit.cause.reasons[0].defect === storage).toBe(true)
    const rows = yield* f.rows
    expect(rows.inputs).toEqual([])
    expect(rows.runs[0]?.state).toBe("running") // Failed settlement did not fabricate a completed receipt.
    expect(f.state.provider).toEqual([])
  }), 30_000)

  it.live("FUTURE H8 settled started truth and nested provider admission do not inherit the operation guard", () => Effect.gen(function* () {
    const f = yield* ScheduleAuthorityFixture.make()
    const task = yield* f.createTask()
    const nestedMessage = SessionMessage.ID.create()
    f.state.onProvider = Effect.gen(function* () {
      yield* f.revoke
      const nested = yield* f.sessions.create({ location: f.owner.location })
      yield* f.sessions.prompt({ id: nestedMessage, sessionID: nested.id, prompt: { text: "future independent admission" }, resume: false })
    }).pipe(Effect.orDie)
    const first = yield* f.request(f.api.run(f.placement, task.id))
    expect(yield* Queue.take(f.providerEntries)).toBe(first.sessionID)
    yield* f.execution.resume(first.sessionID)
    expect((yield* SessionInput.find(f.database.db, nestedMessage))?.id).toBe(nestedMessage)
    expect((yield* f.rows).runs[0]?.state).toBe("started")
    const newAuthority = yield* f.operators.issue({ origin: "sdk" })
    const replay = yield* f.operators.withRequest(newAuthority.authority, { requestID: "new-frame", idempotencyKey: "manual-once" },
      f.api.run(f.placement, task.id))
    expect(replay).toEqual({ ...first, reused: true })
    expect(f.state.provider).toEqual([first.sessionID])
  }), 30_000)

  for (const operation of operations) {
    it.live(`FUTURE H8 ${operation} keeps mixed NotFound/storage causes instead of manufacturing a denial`, () => Effect.gen(function* () {
      const f = yield* ScheduleAuthorityFixture.make()
      const task = yield* f.createTask()
      if (operation === "resume") yield* f.tasks.capability.pause(f.owner, task.id)
      const absent = new ScheduledTask.NotFoundError({ id: task.id })
      const storage = new Error("H8 alien storage identity")
      const mixed = Cause.combine(Cause.fail(absent), Cause.die(storage))
      const schedules = { ...f.tasks.capability,
        pause: (...args: Parameters<typeof f.tasks.capability.pause>) => f.tasks.capability.pause(...args).pipe(Effect.andThen(Effect.failCause(mixed))),
        resume: (...args: Parameters<typeof f.tasks.capability.resume>) => f.tasks.capability.resume(...args).pipe(Effect.andThen(Effect.failCause(mixed))),
        remove: (...args: Parameters<typeof f.tasks.capability.remove>) => f.tasks.capability.remove(...args).pipe(Effect.andThen(Effect.failCause(mixed))),
        run: (...args: Parameters<typeof f.tasks.capability.run>) => f.tasks.capability.run(...args).pipe(Effect.andThen(Effect.failCause(mixed))),
      }
      const api = CapabilityScheduleOperator.make({ operators: f.operators, schedules })
      const result: Effect.Effect<unknown, CapabilityScheduleOperator.Error> = api[operation](f.placement, task.id)
      const exit = yield* f.request(result).pipe(Effect.exit)
      twoReasons(exit, absent, storage)
    }), 30_000)
  }
})
