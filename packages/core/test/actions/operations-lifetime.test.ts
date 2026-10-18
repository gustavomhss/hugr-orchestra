import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { eq } from "drizzle-orm"
import { Cause, Deferred, Effect, Exit, Fiber, Option, Scheduler, Scope } from "effect"
import { TestClock } from "effect/testing"
import { ActionsError } from "../../src/actions/error"
import { ActionsOperationTable } from "../../src/actions/operations/sql"
import { it } from "../lib/effect"
import { fault, fixture, intent, open } from "./operations-fixture"

const provider = Effect.gen(function* () {
  const started = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const closed = yield* Deferred.make<void>()
  const calls: { readonly intent: Actions.OperationIntent; readonly payload: unknown }[] = []
  const perform = (intent: Actions.OperationIntent, payload: typeof import("effect").Schema.Json.Type) => Effect.scoped(Effect.gen(function* () {
    yield* Effect.acquireRelease(Effect.sync(() => calls.push({ intent, payload })), () => Deferred.succeed(closed, undefined))
    yield* Deferred.succeed(started, undefined)
    yield* Deferred.await(release)
    return { runID: "native-ack", attempt: 4 }
  }))
  return { started, release, closed, calls, perform }
})

it.live("two concurrent executes have one durable CAS owner; duplicates never join and completed retries never send", () => Effect.gen(function* () {
  const f = yield* fixture
  const first = yield* open(f.database, f.directory)
  const second = yield* open(f.database, f.directory)
  const command = intent(first.binding)
  const lease = yield* first.operations.prepare(first.binding, command)
  const remote = yield* provider
  const submission = { id: lease.id, input: { secret: "original-input-secret", source: "source-edit-body" } }
  const locked = yield* Deferred.make<void>()
  const unlock = yield* Deferred.make<void>()
  const blocker = yield* f.database.db.transaction(() => Effect.gen(function* () {
    yield* Deferred.succeed(locked, undefined)
    yield* Deferred.await(unlock)
  }), { behavior: "immediate" }).pipe(Effect.forkScoped)
  yield* Deferred.await(locked)
  const fibers = yield* Effect.all([
    first.operations.execute(first.binding, submission, remote.perform).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, 32), Effect.forkScoped),
    second.operations.execute(second.binding, submission, remote.perform).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, 32), Effect.forkScoped),
  ], { concurrency: "unbounded" })
  // Queue both reads behind the actual SQLite connection before allowing either
  // claim. This reaches the CAS-loser path, not only the earlier state check.
  yield* Effect.forEach([0, 1, 2], () => Effect.yieldNow)
  yield* Deferred.succeed(unlock, undefined)
  yield* Fiber.join(blocker)
  yield* Deferred.await(remote.started)
  const observed = yield* Effect.race(Fiber.join(fibers[0]), Fiber.join(fibers[1])).pipe(Effect.timeoutOption("2 seconds"))
  expect(remote.calls).toHaveLength(1)
  expect(Option.isSome(observed)).toBe(true)
  if (Option.isNone(observed)) return yield* Effect.die("Duplicate joined provider owner instead of returning a receipt")
  expect(observed.value.state).toBe("sending")
  const duplicate = yield* second.operations.execute(second.binding, { id: lease.id, input: { secret: "changed-input" } }, remote.perform).pipe(Effect.timeout("2 seconds"))
  expect(duplicate.state).toBe("sending")
  expect(remote.calls).toHaveLength(1)
  expect(remote.calls[0]).toEqual({ intent: command, payload: submission.input })
  const rebuilt = yield* open(f.database, f.directory)
  expect((yield* rebuilt.operations.get(rebuilt.binding, lease.id)).state).toBe("sending")
  yield* Deferred.succeed(remote.release, undefined)
  const results = yield* Effect.forEach(fibers, Fiber.join)
  expect(results.map((r) => r.state).sort()).toEqual(["accepted", "sending"])
  const completed = yield* rebuilt.operations.execute(rebuilt.binding, { id: lease.id, input: { secret: "late-input" } }, remote.perform)
  expect(completed.state).toBe("accepted")
  expect(completed.result).toEqual({ runID: "native-ack", attempt: 4 })
  expect(remote.calls).toHaveLength(1)
  const persisted = yield* f.database.db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, lease.id)).get()
  expect(persisted).toMatchObject({ state: "accepted", result: { runID: "native-ack", attempt: 4 } })
  expect(JSON.stringify(persisted)).not.toContain("original-input-secret")
  expect(JSON.stringify(persisted)).not.toContain("source-edit-body")
  expect(JSON.stringify(persisted)).not.toContain("provider-echo-secret")
}))

it.live("canceling duplicate request leaves owner transport alive; owner disconnect closes transport and persists unknown", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const lease = yield* service.operations.prepare(service.binding, intent(service.binding))
  const remote = yield* provider
  const owner = yield* service.operations.execute(service.binding, { id: lease.id, input: {} }, remote.perform).pipe(Effect.forkScoped)
  yield* Deferred.await(remote.started)
  const observed = yield* Deferred.make<void>()
  const nonowner = yield* service.operations.execute(service.binding, { id: lease.id, input: {} }, remote.perform).pipe(
    Effect.tap((receipt) => { expect(receipt.state).toBe("sending"); return Deferred.succeed(observed, undefined) }),
    Effect.andThen(Effect.never), Effect.forkScoped,
  )
  yield* Deferred.await(observed)
  yield* Fiber.interrupt(nonowner)
  expect(yield* Deferred.isDone(remote.closed)).toBe(false)
  expect((yield* service.operations.get(service.binding, lease.id)).state).toBe("sending")
  yield* Fiber.interrupt(owner)
  expect(yield* Deferred.isDone(remote.closed)).toBe(true)
  expect((yield* service.operations.get(service.binding, lease.id)).state).toBe("outcome_unknown")
  const later = yield* service.operations.execute(service.binding, { id: lease.id, input: { edited: true } }, remote.perform)
  expect(later.state).toBe("outcome_unknown")
  expect(remote.calls).toHaveLength(1)
}))

it.live("Location eviction interrupts owning request; Database lifetime preserves unknown receipt across rebuild", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const lease = yield* service.operations.prepare(service.binding, intent(service.binding))
  const remote = yield* provider
  const owner = yield* service.operations.execute(service.binding, { id: lease.id, input: {} }, remote.perform).pipe(Effect.forkScoped)
  yield* Deferred.await(remote.started)
  yield* Scope.close(service.scope, Exit.void)
  const exit = yield* Fiber.await(owner)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.hasInterrupts(exit.cause)).toBe(true)
  expect(yield* Deferred.isDone(remote.closed)).toBe(true)
  const rebuilt = yield* open(f.database, f.directory)
  expect((yield* rebuilt.operations.get(rebuilt.binding, lease.id)).state).toBe("outcome_unknown")
  expect((yield* rebuilt.operations.execute(rebuilt.binding, { id: lease.id, input: {} }, remote.perform)).state).toBe("outcome_unknown")
  expect(remote.calls).toHaveLength(1)
}))

it.live("Location closing while execute waits for SQLite rejects before provider entry and preserves prepared receipt", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const lease = yield* service.operations.prepare(service.binding, intent(service.binding))
  const locked = yield* Deferred.make<void>()
  const unlock = yield* Deferred.make<void>()
  const blocker = yield* f.database.db.transaction(() => Effect.gen(function* () {
    yield* Deferred.succeed(locked, undefined)
    yield* Deferred.await(unlock)
  }), { behavior: "immediate" }).pipe(Effect.forkScoped)
  yield* Deferred.await(locked)
  const calls: number[] = []
  const owner = yield* fault(service.operations.execute(service.binding, { id: lease.id, input: {} }, () => Effect.sync(() => {
    calls.push(1)
    return {}
  })), "binding_missing").pipe(Effect.forkScoped)
  yield* Effect.forEach([0, 1, 2], () => Effect.yieldNow)
  const closing = yield* Scope.close(service.scope, Exit.void).pipe(Effect.forkScoped)
  yield* Effect.forEach([0, 1, 2], () => Effect.yieldNow)
  yield* Deferred.succeed(unlock, undefined)
  yield* Fiber.join(blocker)
  yield* Fiber.join(owner)
  yield* Fiber.join(closing)
  expect(calls).toEqual([])
  const rebuilt = yield* open(f.database, f.directory)
  expect((yield* rebuilt.operations.get(rebuilt.binding, lease.id)).state).toBe("prepared")
}))

it.effect("bounded owner timeout closes provider before durable unknown finalization", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const lease = yield* service.operations.prepare(service.binding, intent(service.binding))
  const remote = yield* provider
  const owner = yield* fault(service.operations.execute(service.binding, { id: lease.id, input: {} }, remote.perform), "outcome_unknown").pipe(Effect.forkScoped)
  yield* Deferred.await(remote.started)
  yield* TestClock.adjust("30 seconds")
  yield* Fiber.join(owner)
  expect(yield* Deferred.isDone(remote.closed)).toBe(true)
  expect((yield* service.operations.get(service.binding, lease.id)).state).toBe("outcome_unknown")
  expect(remote.calls).toHaveLength(1)
}))

it.live("provider typed failure, defect and throwing callback all finalize unknown without persisting source/error echoes", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const error = new ActionsError({ kind: "transport_failed", message: "sensitive-source-in-error" })
  yield* Effect.forEach([
    () => Effect.fail(error),
    () => Effect.die(new Error("sensitive-source-in-defect")),
    () => { throw new Error("sensitive-source-in-throw") },
  ], (perform) => Effect.gen(function* () {
    const lease = yield* service.operations.prepare(service.binding, intent(service.binding))
    yield* fault(service.operations.execute(service.binding, { id: lease.id, input: { source: "sensitive-source-body" } }, perform), "outcome_unknown")
    expect((yield* service.operations.execute(service.binding, { id: lease.id, input: {} }, () => Effect.die("must not retry"))).state).toBe("outcome_unknown")
  }))
  const rows = yield* f.database.db.select().from(ActionsOperationTable).all()
  expect(rows).toHaveLength(3)
  expect(JSON.stringify(rows)).not.toContain("sensitive-source")
}))
