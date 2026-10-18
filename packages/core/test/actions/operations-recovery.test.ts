import { expect } from "bun:test"
import { Actions } from "@orchestra/schema/actions"
import { count, eq } from "drizzle-orm"
import { Clock, Deferred, Effect, Exit, Fiber, Scope } from "effect"
import { ActionsError } from "../../src/actions/error"
import { ActionsOperationTable } from "../../src/actions/operations/sql"
import { LEDGER_LIMIT, RECEIPT_EXPIRED, RETENTION, UNKNOWN_LIMIT } from "../../src/actions/operations/storage"
import { it } from "../lib/effect"
import { fault, fixture, intent, open, openDatabase } from "./operations-fixture"

it.live("Database lifetime recovery marks orphan sending unknown once; same lifetime rebuild preserves live owner", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const lease = yield* service.operations.prepare(service.binding, intent(service.binding))
  yield* f.database.db.update(ActionsOperationTable).set({ state: "sending" }).where(eq(ActionsOperationTable.id, lease.id)).run()
  yield* Scope.close(service.scope, Exit.void)
  yield* Scope.close(f.scope, Exit.void)
  const restarted = yield* openDatabase(f.filename)
  expect((yield* restarted.database.db.select().from(ActionsOperationTable).get())?.state).toBe("sending")
  const rebuilt = yield* open(restarted.database, f.directory)
  expect((yield* rebuilt.operations.get(rebuilt.binding, lease.id)).state).toBe("outcome_unknown")
  expect((yield* rebuilt.operations.execute(rebuilt.binding, { id: lease.id, input: {} }, () => Effect.die("orphan must not replay"))).state).toBe("outcome_unknown")

  const active = yield* rebuilt.operations.prepare(rebuilt.binding, intent(rebuilt.binding))
  const started = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const owner = yield* rebuilt.operations.execute(rebuilt.binding, { id: active.id, input: {} }, () => Effect.gen(function* () {
    yield* Deferred.succeed(started, undefined)
    yield* Deferred.await(release)
    return {}
  })).pipe(Effect.forkScoped)
  yield* Deferred.await(started)
  const other = yield* open(restarted.database, f.directory)
  expect((yield* other.operations.get(other.binding, active.id)).state).toBe("sending")
  yield* Deferred.succeed(release, undefined)
  expect((yield* Fiber.join(owner)).state).toBe("accepted")
}))

it.live("resolved receipts expire after 30 days; old unknown stays protected during admission sweep", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const accepted = yield* service.operations.prepare(service.binding, intent(service.binding))
  yield* service.operations.execute(service.binding, { id: accepted.id, input: {} }, () => Effect.succeed({}))
  const unknown = yield* service.operations.prepare(service.binding, intent(service.binding))
  yield* fault(service.operations.execute(service.binding, { id: unknown.id, input: {} }, () => Effect.fail(new ActionsError({ kind: "transport_failed", message: "offline" }))), "outcome_unknown")
  const old = (yield* Clock.currentTimeMillis) - RETENTION
  yield* f.database.db.update(ActionsOperationTable).set({ time_updated: old }).where(eq(ActionsOperationTable.id, accepted.id)).run()
  yield* f.database.db.update(ActionsOperationTable).set({ time_updated: old }).where(eq(ActionsOperationTable.id, unknown.id)).run()
  yield* fault(service.operations.execute(service.binding, { id: accepted.id, input: {} }, () => Effect.die("old receipt must not execute")), "operation_missing")
  const next = yield* service.operations.prepare(service.binding, intent(service.binding))
  expect(next.state).toBe("prepared")
  expect(yield* f.database.db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, accepted.id)).get()).toMatchObject({
    state: "expired", result: null, reason: RECEIPT_EXPIRED,
  })
  expect((yield* service.operations.execute(service.binding, { id: unknown.id, input: {} }, () => Effect.die("unknown must not execute"))).state).toBe("outcome_unknown")
  expect((yield* f.database.db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, unknown.id)).get())?.time_updated).toBe(old)
}))

it.live("unknown admission pressure rejects new intent with maintenance state without purging protection", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const command = intent(service.binding)
  const lease = yield* service.operations.prepare(service.binding, command)
  yield* fault(service.operations.execute(service.binding, { id: lease.id, input: {} }, () => Effect.fail(new ActionsError({ kind: "outcome_unknown", message: "unknown" }))), "outcome_unknown")
  const template = yield* f.database.db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, lease.id)).get()
  if (!template) return yield* Effect.die("Expected durable unknown positive control")
  yield* Effect.forEach(Array.from({ length: Math.ceil((UNKNOWN_LIMIT - 1) / 200) }, (_, index) => index), (batch) =>
    f.database.db.insert(ActionsOperationTable).values(Array.from({ length: Math.min(200, UNKNOWN_LIMIT - 1 - batch * 200) }, (_, offset) => ({
      ...template, id: Actions.OperationID.make(`aop_pressure_${batch * 200 + offset}`), client_id: `pressure-${batch * 200 + offset}`,
    }))).run(),
  )
  expect((yield* f.database.db.select({ total: count() }).from(ActionsOperationTable).where(eq(ActionsOperationTable.state, "outcome_unknown")).get())?.total).toBe(UNKNOWN_LIMIT)
  yield* fault(service.operations.prepare(service.binding, intent(service.binding)), "maintenance_required")
  expect((yield* service.operations.prepare(service.binding, command)).id).toBe(lease.id)
  expect((yield* f.database.db.select({ total: count() }).from(ActionsOperationTable).get())?.total).toBe(UNKNOWN_LIMIT)
}))

it.live("acknowledged send whose receipt write fails returns safe storage error and remains non-executable", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const lease = yield* service.operations.prepare(service.binding, intent(service.binding))
  const calls: number[] = []
  yield* fault(service.operations.execute(service.binding, { id: lease.id, input: { source: "source-payload" } }, () => Effect.gen(function* () {
    calls.push(1)
    yield* f.database.db.run("PRAGMA query_only = ON").pipe(Effect.orDie)
    return { runID: "native-ack" }
  })), "maintenance_required")
  yield* f.database.db.run("PRAGMA query_only = OFF")
  expect((yield* service.operations.execute(service.binding, { id: lease.id, input: {} }, () => Effect.sync(() => { calls.push(1); return {} }))).state).toBe("sending")
  expect(calls).toHaveLength(1)
  expect(JSON.stringify(yield* f.database.db.select().from(ActionsOperationTable).get())).not.toContain("source-payload")
}))

it.live("aged resolved receipt becomes non-executable tombstone; delayed logical prepare cannot issue fresh ID or second provider write", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const command = intent(service.binding)
  const lease = yield* service.operations.prepare(service.binding, command)
  const writes: number[] = []
  const perform = () => Effect.sync(() => { writes.push(1); return { runID: "native-run" } })
  yield* service.operations.execute(service.binding, { id: lease.id, input: {} }, perform)
  yield* f.database.db.update(ActionsOperationTable).set({ time_updated: (yield* Clock.currentTimeMillis) - RETENTION })
    .where(eq(ActionsOperationTable.id, lease.id)).run()
  const retried = yield* service.operations.prepare(service.binding, command).pipe(Effect.exit)
  // A broken sweep admits a fresh operation. Follow that public path so the
  // mutation probe witnesses the actual second provider call, not only an ID.
  if (Exit.isSuccess(retried)) yield* service.operations.execute(service.binding, { id: retried.value.id, input: {} }, perform)
  expect(writes).toHaveLength(1)
  expect(Exit.isFailure(retried)).toBe(true)
  yield* fault(service.operations.prepare(service.binding, command), "operation_missing")
  yield* fault(service.operations.execute(service.binding, { id: lease.id, input: {} }, perform), "operation_missing")
  yield* fault(service.operations.get(service.binding, lease.id), "operation_missing")
  yield* fault(service.operations.prepare(service.binding, { ...command, target: { runID: "edited-run" } }), "intent_conflict")
  const tombstone = yield* f.database.db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, lease.id)).get()
  expect(tombstone).toMatchObject({ id: lease.id, client_id: command.clientID, state: "expired", result: null, reason: RECEIPT_EXPIRED })
  expect(tombstone?.target).toEqual(command.target)
  expect(tombstone?.expected).toEqual(command.expected)
  expect((yield* f.database.db.select({ total: count() }).from(ActionsOperationTable).get())?.total).toBe(1)
}))

it.live("expired lease tombstone refuses delayed prepare permanently with operation_expired", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const command = intent(service.binding)
  const lease = yield* service.operations.prepare(service.binding, command)
  yield* f.database.db.update(ActionsOperationTable).set({ time_expires: lease.createdAt, time_updated: lease.createdAt - RETENTION })
    .where(eq(ActionsOperationTable.id, lease.id)).run()
  yield* fault(service.operations.prepare(service.binding, command), "operation_expired")
  yield* f.database.db.update(ActionsOperationTable).set({ time_updated: (yield* Clock.currentTimeMillis) - RETENTION })
    .where(eq(ActionsOperationTable.id, lease.id)).run()
  yield* fault(service.operations.prepare(service.binding, command), "operation_expired")
  yield* fault(service.operations.execute(service.binding, { id: lease.id, input: {} }, () => Effect.die("expired tombstone must not execute")), "operation_expired")
  expect((yield* f.database.db.select().from(ActionsOperationTable).get())?.id).toBe(lease.id)
  expect((yield* f.database.db.select({ total: count() }).from(ActionsOperationTable).get())?.total).toBe(1)
}))

it.live("100000-record admission ledger rejects new intent instead of evicting tombstones and still reconciles exact retries", () => Effect.gen(function* () {
  const f = yield* fixture
  const service = yield* open(f.database, f.directory)
  const command = intent(service.binding)
  const lease = yield* service.operations.prepare(service.binding, command)
  yield* service.operations.execute(service.binding, { id: lease.id, input: {} }, () => Effect.succeed({ runID: "native-run" }))
  const template = yield* f.database.db.select().from(ActionsOperationTable).where(eq(ActionsOperationTable.id, lease.id)).get()
  if (!template) return yield* Effect.die("Expected admission positive control")
  yield* Effect.forEach(Array.from({ length: Math.ceil((LEDGER_LIMIT - 1) / 200) }, (_, index) => index), (batch) =>
    f.database.db.insert(ActionsOperationTable).values(Array.from({ length: Math.min(200, LEDGER_LIMIT - 1 - batch * 200) }, (_, offset) => ({
      ...template, id: Actions.OperationID.make(`aop_ledger_${batch * 200 + offset}`), client_id: `ledger-${batch * 200 + offset}`,
      state: "expired" as const, result: null, reason: RECEIPT_EXPIRED,
    }))).run(),
  )
  expect((yield* f.database.db.select({ total: count() }).from(ActionsOperationTable).get())?.total).toBe(LEDGER_LIMIT)
  yield* fault(service.operations.prepare(service.binding, intent(service.binding)), "maintenance_required")
  expect((yield* service.operations.prepare(service.binding, command)).id).toBe(lease.id)
  expect((yield* f.database.db.select({ total: count() }).from(ActionsOperationTable).get())?.total).toBe(LEDGER_LIMIT)
}))
