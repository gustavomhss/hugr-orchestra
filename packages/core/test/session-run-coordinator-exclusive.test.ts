import { describe, expect } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Option } from "effect"
import { SessionRunCoordinator } from "@orchestra/core/session/run-coordinator"
import { testEffect } from "./lib/effect"

const it = testEffect(Layer.empty)

describe("SessionRunCoordinator", () => {
  it.effect("coalesces wakes held by a successful exclusive operation into one non-forced drain", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const holdStarted = yield* Deferred.make<void>()
        const holdGate = yield* Deferred.make<void>()
        const drainStarted = yield* Deferred.make<void>()
        const drainGate = yield* Deferred.make<void>()
        const forces: boolean[] = []
        const overlaps: boolean[] = []
        let holding = false
        const coordinator = yield* SessionRunCoordinator.make<string, never>({
          drain: (_key, force) =>
            Effect.sync(() => {
              forces.push(force)
              overlaps.push(holding)
            }).pipe(
              Effect.andThen(Deferred.succeed(drainStarted, undefined)),
              Effect.andThen(Deferred.await(drainGate)),
            ),
        })
        // Register after the coordinator so LIFO teardown releases gates before awaiting its fibers.
        yield* Effect.addFinalizer(() =>
          Deferred.succeed(holdGate, undefined).pipe(
            Effect.andThen(Deferred.succeed(drainGate, undefined)),
            Effect.asVoid,
          ),
        )
        const holdEffect = Effect.sync(() => (holding = true)).pipe(
          Effect.andThen(Deferred.succeed(holdStarted, undefined)),
          Effect.andThen(Deferred.await(holdGate)),
          Effect.as("held"),
          Effect.ensuring(Effect.sync(() => (holding = false))),
        )

        const owner = yield* coordinator.exclusive("session", holdEffect).pipe(Effect.forkChild)
        yield* Deferred.await(holdStarted)
        yield* coordinator.wake("session")
        yield* coordinator.wake("session")
        yield* coordinator.wake("session")
        expect(forces).toEqual([])
        expect((yield* coordinator.active).has("session")).toBeTrue()
        const joiner = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Effect.yieldNow
        yield* Deferred.succeed(holdGate, undefined)
        expect(Option.getOrThrow(yield* Fiber.join(owner))).toBe("held")
        yield* Deferred.await(drainStarted)
        expect((yield* coordinator.active).has("session")).toBe(true)
        expect(yield* Deferred.isDone(drainGate)).toBe(false)
        expect(forces).toEqual([false])
        expect(overlaps).toEqual([false])
        yield* Deferred.succeed(drainGate, undefined)
        yield* Fiber.join(joiner)
        expect(Array.from(yield* coordinator.active)).toEqual([])
        expect(forces).toEqual([false])
      }),
    ),
  )

  it.effect("retains and coalesces wakes through exclusive interruption cleanup", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const holdStarted = yield* Deferred.make<void>()
        const cleanupStarted = yield* Deferred.make<void>()
        const cleanupGate = yield* Deferred.make<void>()
        const drainStarted = yield* Deferred.make<void>()
        const drainGate = yield* Deferred.make<void>()
        const forces: boolean[] = []
        const overlaps: boolean[] = []
        let holding = false
        const coordinator = yield* SessionRunCoordinator.make<string, never>({
          drain: (_key, force) =>
            Effect.sync(() => {
              forces.push(force)
              overlaps.push(holding)
            }).pipe(
              Effect.andThen(Deferred.succeed(drainStarted, undefined)),
              Effect.andThen(Deferred.await(drainGate)),
            ),
        })
        // Register after the coordinator so LIFO teardown releases gates before awaiting its fibers.
        yield* Effect.addFinalizer(() =>
          Deferred.succeed(cleanupGate, undefined).pipe(
            Effect.andThen(Deferred.succeed(drainGate, undefined)),
            Effect.asVoid,
          ),
        )
        const holdEffect = Effect.sync(() => (holding = true)).pipe(
          Effect.andThen(Deferred.succeed(holdStarted, undefined)),
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() =>
            Deferred.succeed(cleanupStarted, undefined).pipe(Effect.andThen(Deferred.await(cleanupGate))),
          ),
          Effect.ensuring(Effect.sync(() => (holding = false))),
        )

        const owner = yield* coordinator.exclusive("session", holdEffect).pipe(Effect.forkChild)
        yield* Deferred.await(holdStarted)
        yield* coordinator.wake("session")
        const interrupt = yield* coordinator.interrupt("session").pipe(Effect.forkChild)
        yield* Deferred.await(cleanupStarted)
        yield* coordinator.wake("session")
        yield* coordinator.wake("session")
        expect(forces).toEqual([])
        expect((yield* coordinator.active).has("session")).toBeTrue()
        yield* Deferred.succeed(cleanupGate, undefined)
        yield* Fiber.join(interrupt)
        const exit = yield* Fiber.await(owner)
        expect(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBeTrue()
        yield* Deferred.await(drainStarted)
        expect(forces).toEqual([false])
        expect(overlaps).toEqual([false])
        const joiner = yield* coordinator.run("session").pipe(Effect.forkChild)
        yield* Effect.yieldNow
        yield* Deferred.succeed(drainGate, undefined)
        yield* Fiber.join(joiner)
        expect(forces).toEqual([false])
        expect(Array.from(yield* coordinator.active)).toEqual([])
      }),
    ),
  )

})
