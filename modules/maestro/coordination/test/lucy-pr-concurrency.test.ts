import { expect, test } from "bun:test"
import { Deferred, Effect, Fiber, Scheduler } from "effect"
import { ReviewPRConcurrencyV2 } from "../src/v2/tools/review-pr-concurrency"

test("same candidate waits for its predecessor and a later call enters after release", () => {
  const admissions: { candidate: string; waiting: boolean }[] = []
  return Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const order: string[] = []
    const first = yield* ReviewPRConcurrencyV2.withCandidate("same", () => Effect.gen(function* () {
      order.push("first")
      yield* Deferred.succeed(started, undefined)
      yield* Deferred.await(release)
    })).pipe(Effect.forkChild)
    yield* Deferred.await(started)
    const second = yield* ReviewPRConcurrencyV2.withCandidate("same", (waited) => Effect.sync(() => {
        expect(waited).toBe(true)
        order.push("second")
      })).pipe(Effect.forkScoped({ startImmediately: true }), Effect.provideService(Scheduler.PreventSchedulerYield, true))
    const other = yield* ReviewPRConcurrencyV2.withCandidate("other", () => Effect.sync(() => order.push("other")))
      .pipe(Effect.forkScoped({ startImmediately: true }), Effect.provideService(Scheduler.PreventSchedulerYield, true))
    yield* Fiber.join(other)
    expect(order).toEqual(["first", "other"])
    expect(admissions).toEqual([{ candidate: "same", waiting: false }, { candidate: "same", waiting: true }, { candidate: "other", waiting: false }])
    yield* Deferred.succeed(release, undefined)
    yield* Fiber.join(first)
    yield* Fiber.join(second)
    expect(order).toEqual(["first", "other", "second"])
    yield* ReviewPRConcurrencyV2.withCandidate("same", () => Effect.sync(() => order.push("third")))
    expect(order).toEqual(["first", "other", "second", "third"])
  })).pipe(Effect.provideService(ReviewPRConcurrencyV2.AdmissionObserver, (event) => admissions.push(event))))
})

test("an observer failure still releases the registered candidate", () =>
  Effect.runPromise(Effect.gen(function* () {
    const result = yield* ReviewPRConcurrencyV2.withCandidate("observer-failure", () => Effect.void).pipe(
      Effect.provideService(ReviewPRConcurrencyV2.AdmissionObserver, () => { throw new Error("observer failure") }),
      Effect.exit,
    )
    expect(result._tag).toBe("Failure")
    expect(yield* ReviewPRConcurrencyV2.withCandidate("observer-failure", (waited) => Effect.succeed(waited))).toBe(false)
  })),
)

test("cancelling owner and queued waiter releases slots; 64 active keys enforce the limit", () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function* () {
    const release = yield* Deferred.make<void>()
    const acquired: string[] = []
    const owner = yield* ReviewPRConcurrencyV2.withCandidate("cancel", () => Deferred.await(release))
      .pipe(Effect.forkScoped({ startImmediately: true }), Effect.provideService(Scheduler.PreventSchedulerYield, true))
    const queued = yield* ReviewPRConcurrencyV2.withCandidate("cancel", () => Effect.sync(() => acquired.push("queued")))
      .pipe(Effect.forkScoped({ startImmediately: true }), Effect.provideService(Scheduler.PreventSchedulerYield, true))
    yield* Fiber.interrupt(queued)
    yield* Fiber.interrupt(owner)
    expect(acquired).toEqual([])
    const workers = yield* Effect.forEach(Array.from({ length: 64 }, (_, index) => index), (index) =>
      ReviewPRConcurrencyV2.withCandidate(`slot-${index}`, () => Deferred.await(release))
        .pipe(Effect.forkScoped({ startImmediately: true }), Effect.provideService(Scheduler.PreventSchedulerYield, true)))
    const busy = yield* Effect.flip(ReviewPRConcurrencyV2.withCandidate("slot-overflow", () => Effect.void))
    expect(busy.message).toContain("pr-busy")
    yield* Deferred.succeed(release, undefined)
    yield* Effect.forEach(workers, Fiber.join)
    yield* ReviewPRConcurrencyV2.withCandidate("slot-overflow", () => Effect.sync(() => acquired.push("after")))
    expect(acquired).toEqual(["after"])
  }))),
)
