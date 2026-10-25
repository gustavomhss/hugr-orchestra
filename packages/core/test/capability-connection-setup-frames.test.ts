import { expect } from "bun:test"
import { randomUUID } from "node:crypto"
import { Deferred, Effect, Fiber } from "effect"
import { CapabilityConnectionSetup } from "../src/capability/connection/setup"
import { CapabilityConnectionSetupFixture } from "./fixture/capability-connection-setup"
import { CapabilityConnectionSetupSqlFixture } from "./fixture/capability-connection-setup-sql"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionSetupSqlFixture.layer)
const input = CapabilityConnectionSetupFixture.input
const placement = CapabilityConnectionSetupFixture.placement

it.live("commit writer waiter authorizes while live, then revocation prevents every credential INSERT attempt", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionSetupFixture.fixture()
  const control = CapabilityConnectionSetupSqlFixture.trace()
  yield* f.run(f.setup.connect(placement, input), "insert-control").pipe(Effect.withTracer(control.tracer))
  expect(control.credentialAttempts).toHaveLength(1)
  expect(control.reservations).toHaveLength(2)
  expect(control.reservations.every((reservation) => reservation.completed)).toBe(true)
  const issued = yield* f.operators.issue({ origin: "sdk" })
  const before = yield* f.rows
  const hold = yield* CapabilityConnectionSetupFixture.checkpoint(f.database, "commit", () => Effect.void)
  const acquiring = yield* Deferred.make<void>()
  const trace = CapabilityConnectionSetupSqlFixture.trace(hold.tracer, () => {
    if (hold.state.writer) Deferred.doneUnsafe(acquiring, Effect.void)
  })
  return yield* hold.protect(Effect.gen(function* () {
    const pending = yield* hold.start(f.run(f.setup.connect(placement, input), "writer-wait", issued.authority).pipe(
      Effect.withTracer(trace.tracer), Effect.exit))
    yield* Effect.raceFirst(Deferred.await(acquiring), Fiber.join(pending).pipe(Effect.andThen(Effect.die("ACTUAL_SQL_RESERVE_CHECKPOINT_NOT_REACHED"))))
    // Real ledger's initial require precedes reserve. Yield lets the original semaphore acquisition suspend.
    yield* Effect.yieldNow
    expect(pending.pollUnsafe()).toBeUndefined()
    // Holder runs in its own tracer context; hold.entered proves its real immediate writer is held.
    expect(yield* Deferred.isDone(hold.entered)).toBe(true)
    expect(trace.reservations).toHaveLength(2) // pending request's reconciliation and commit reserve
    expect(trace.reservations.map((reservation) => reservation.completed)).toEqual([true, false])
    expect(trace.credentialAttempts).toEqual([])
    expect(f.seen).toHaveLength(2)
    yield* f.operators.revoke(issued.authority)
    yield* Deferred.succeed(hold.release, undefined)
    if (!hold.state.writer) return yield* Effect.die("Missing real held writer")
    yield* Fiber.join(hold.state.writer)
    CapabilityConnectionSetupFixture.expectCode(yield* Fiber.join(pending), "authentication_required", [input.key])
    expect(trace.credentialAttempts).toEqual([])
    expect(yield* f.rows).toEqual(before)
  })).pipe(Effect.timeout("3 seconds"))
}))

it.live("a second live same-factory private frame at real ledger commit cannot replace captured setup binding", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionSetupFixture.fixture()
  const first = yield* f.operators.issue({ origin: "sdk" })
  const second = yield* f.operators.issue({ origin: "sdk" })
  const control = CapabilityConnectionSetupSqlFixture.trace()
  const unchanged = yield* CapabilityConnectionSetup.make({ operators: f.operators, verifier: f.verifier,
    ledger: { ...f.ledger, commit: (target, payload, write, verify) => f.ledger.commit(target, payload, write, verify) } })
  const receipt = yield* f.run(unchanged.connect(placement, input), "same-frame", first.authority).pipe(Effect.withTracer(control.tracer))
  expect(receipt.reused).toBe(false)
  expect(control.credentialAttempts).toHaveLength(1)
  const before = yield* f.rows
  CapabilityConnectionSetupFixture.publicReceipts([receipt], before)
  const setup = yield* CapabilityConnectionSetup.make({ operators: f.operators, verifier: f.verifier,
    ledger: { ...f.ledger, commit: (target, payload, write, verify) => f.operators.withRequest(second.authority,
      { requestID: randomUUID(), idempotencyKey: "replacement-frame" }, f.ledger.commit(target, payload, write, verify)) } })
  const trace = CapabilityConnectionSetupSqlFixture.trace()
  const exit = yield* f.run(setup.connect(placement, input), "captured-frame", first.authority).pipe(Effect.withTracer(trace.tracer), Effect.exit)
  expect(trace.credentialAttempts).toEqual([])
  CapabilityConnectionSetupFixture.expectCode(exit, "invocation_binding_mismatch", [input.key])
  expect(f.seen).toHaveLength(2)
  expect(yield* f.rows).toEqual(before)
}))
