import { expect } from "bun:test"
import { eq } from "drizzle-orm"
import { Deferred, Effect, Fiber } from "effect"
import { ProjectTable } from "../src/project/sql"
import { CapabilityConnectionSetupFixture } from "./fixture/capability-connection-setup"
import { testEffect } from "./lib/effect"

const it = testEffect(CapabilityConnectionSetupFixture.layer)
const input = CapabilityConnectionSetupFixture.input
const placement = CapabilityConnectionSetupFixture.placement

it.live("authority revoked while reconcile waits on real writer rejects before any HTTP", () => Effect.gen(function* () {
  const f = yield* CapabilityConnectionSetupFixture.fixture()
  const issued = yield* f.operators.issue({ origin: "sdk" })
  const before = yield* f.rows
  const hold = yield* CapabilityConnectionSetupFixture.checkpoint(f.database, "reconcile", () => Effect.void)
  return yield* hold.protect(Effect.gen(function* () {
    const completed = yield* Deferred.make<void>()
    const pending = yield* hold.start(f.run(f.setup.connect(placement, input), "revoked", issued.authority).pipe(
      Effect.exit, Effect.tap(() => Deferred.succeed(completed, undefined))))
    yield* Effect.raceFirst(Deferred.await(hold.entered), Fiber.join(pending).pipe(Effect.andThen(Effect.die("SETUP_RECONCILE_WRITER_NOT_HELD"))))
    expect(hold.state.starts).toBe(1)
    expect(yield* Deferred.isDone(completed)).toBe(false)
    expect(f.seen).toEqual([])
    yield* f.operators.revoke(issued.authority)
    yield* Deferred.succeed(hold.release, undefined)
    if (!hold.state.writer) return yield* Effect.die("Missing setup writer")
    yield* Fiber.join(hold.state.writer)
    CapabilityConnectionSetupFixture.expectCode(yield* Fiber.join(pending), "authentication_required")
    expect(f.seen).toEqual([])
    expect(yield* f.rows).toEqual(before)
  })).pipe(Effect.timeout("3 seconds"))
}))

it.live("project deletion or authority revocation between HTTP and writer commit prevents orphan rows", () => Effect.forEach(
  ["project", "authority"] as const, (change) => Effect.gen(function* () {
    const f = yield* CapabilityConnectionSetupFixture.fixture()
    const issued = yield* f.operators.issue({ origin: "sdk" })
    const before = yield* f.rows
    const hold = yield* CapabilityConnectionSetupFixture.checkpoint(f.database, "commit", (tx) => change === "project"
      ? tx.delete(ProjectTable).where(eq(ProjectTable.id, placement.projectID)).run().pipe(Effect.asVoid)
      : f.operators.revoke(issued.authority))
    return yield* hold.protect(Effect.gen(function* () {
      const pending = yield* hold.start(f.run(f.setup.connect(placement, input), "writer-fence", issued.authority).pipe(Effect.exit))
      yield* Effect.raceFirst(Deferred.await(hold.entered), Fiber.join(pending).pipe(Effect.andThen(Effect.die("SETUP_COMMIT_WRITER_NOT_HELD"))))
      expect(f.seen).toHaveLength(1)
      expect(f.writerStates).toEqual([false])
      yield* Deferred.succeed(hold.release, undefined)
      if (!hold.state.writer) return yield* Effect.die("Missing setup writer")
      yield* Fiber.join(hold.state.writer)
      CapabilityConnectionSetupFixture.expectCode(yield* Fiber.join(pending), change === "project" ? "connection_unavailable" : "authentication_required")
      expect(yield* f.rows).toEqual(before)
      expect(f.seen).toHaveLength(1)
    })).pipe(Effect.timeout("3 seconds"))
  })))

it.live("revocation during actual identity response blocks persistence under same private binding", () => Effect.gen(function* () {
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const f = yield* CapabilityConnectionSetupFixture.fixture({ response: () => Effect.runPromise(
    Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)),
      Effect.as(Response.json({ ok: true, team_id: "T123", user_id: "U456" })))) })
  const issued = yield* f.operators.issue({ origin: "sdk" })
  const before = yield* f.rows
  const pending = yield* f.run(f.setup.connect(placement, input), "network-fence", issued.authority).pipe(Effect.exit, Effect.forkChild)
  yield* Effect.gen(function* () {
    yield* Effect.raceFirst(Deferred.await(entered), Fiber.join(pending).pipe(Effect.andThen(Effect.die("IDENTITY_HTTP_NOT_ENTERED"))))
    yield* f.operators.revoke(issued.authority)
    yield* Deferred.succeed(release, undefined)
    CapabilityConnectionSetupFixture.expectCode(yield* Fiber.join(pending), "authentication_required")
    expect(yield* f.rows).toEqual(before)
    expect(f.seen).toHaveLength(1)
  }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)), Effect.timeout("3 seconds"))
}))
