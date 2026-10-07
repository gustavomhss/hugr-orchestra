import { expect, test, type TestOptions } from "bun:test"
import { ConfigV1 } from "@opencode-ai/core/v1/config/config"
import { Cause, Clock, Deferred, Duration, Effect, Exit, Fiber, Layer, Queue } from "effect"
import * as Scope from "effect/Scope"
import * as TestClock from "effect/testing/TestClock"
import * as TestConsole from "effect/testing/TestConsole"
import { memoMap } from "@opencode-ai/core/effect/memo-map"
import type { Config } from "@/config/config"
import { TestInstance, withTmpdirInstance } from "../fixture/fixture"
import { InstanceStore } from "@/project/instance-store"

type Body<A, E, R> = Effect.Effect<A, E, R> | (() => Effect.Effect<A, E, R>)
type InstanceOptions<E, R> = {
  git?: boolean
  config?: Partial<ConfigV1.Info> | (() => Partial<ConfigV1.Info>)
  init?: (directory: string) => Effect.Effect<void, E, R>
}

function isInstanceOptions<E, R>(
  options: InstanceOptions<E, R> | number | TestOptions | undefined,
): options is InstanceOptions<E, R> {
  return !!options && typeof options === "object" && ("git" in options || "config" in options || "init" in options)
}

function instanceArgs<E, R>(
  options?: InstanceOptions<E, R> | number | TestOptions,
  testOptions?: number | TestOptions,
): { instanceOptions: InstanceOptions<E, R> | undefined; testOptions: number | TestOptions | undefined } {
  if (typeof options === "number") return { instanceOptions: undefined, testOptions: options }
  if (isInstanceOptions(options)) return { instanceOptions: options, testOptions }
  return { instanceOptions: undefined, testOptions: options }
}

const body = <A, E, R>(value: Body<A, E, R>) => Effect.suspend(() => (typeof value === "function" ? value() : value))

type Runner = <A, E, R, E2>(value: Body<A, E, R | Scope.Scope>, layer: Layer.Layer<R, E2>) => Promise<A>

const isolatedRun: Runner = (value, layer) =>
  Effect.gen(function* () {
    const exit = yield* body(value).pipe(Effect.scoped, Effect.provide(layer), Effect.exit)
    if (Exit.isFailure(exit)) {
      for (const err of Cause.prettyErrors(exit.cause)) {
        yield* Effect.logError(err)
      }
    }
    return yield* exit
  }).pipe(Effect.runPromise)

// Builds the test layer through the shared process-wide memoMap so cached
// services (Bus, Session, …) match Server.Default's instances. Use for tests
// that publish to an in-process HTTP server and need pub/sub identity with
// the server's handlers.
const sharedRun: Runner = (value, layer) =>
  Effect.gen(function* () {
    const scope = yield* Scope.make()
    const ctx = yield* Layer.buildWithMemoMap(layer, memoMap, scope)
    const exit = yield* body(value).pipe(Effect.scoped, Effect.provide(ctx), Effect.exit)
    yield* Scope.close(scope, Exit.void)
    if (Exit.isFailure(exit)) {
      for (const err of Cause.prettyErrors(exit.cause)) {
        yield* Effect.logError(err)
      }
    }
    return yield* exit
  }).pipe(Effect.runPromise)

const make = <R, E>(testLayer: Layer.Layer<R, E>, liveLayer: Layer.Layer<R, E>, run: Runner = isolatedRun) => {
  const effect = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test(name, () => run(value, testLayer), opts)

  effect.only = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test.only(name, () => run(value, testLayer), opts)

  effect.skip = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test.skip(name, () => run(value, testLayer), opts)

  const live = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test(name, () => run(value, liveLayer), opts)

  live.only = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test.only(name, () => run(value, liveLayer), opts)

  live.skip = <A, E2>(name: string, value: Body<A, E2, R | Scope.Scope>, opts?: number | TestOptions) =>
    test.skip(name, () => run(value, liveLayer), opts)

  const instance = <A, E2, E3 = never>(
    name: string,
    value: Body<A, E2, R | InstanceStore.Service | TestInstance | Scope.Scope>,
    options?: InstanceOptions<E3, R | Scope.Scope> | number | TestOptions,
    opts?: number | TestOptions,
  ) => {
    const args = instanceArgs(options, opts)
    return test(
      name,
      () => run(body(value).pipe(withTmpdirInstance(args.instanceOptions)), liveLayer),
      args.testOptions,
    )
  }

  instance.only = <A, E2, E3 = never>(
    name: string,
    value: Body<A, E2, R | InstanceStore.Service | TestInstance | Scope.Scope>,
    options?: InstanceOptions<E3, R | Scope.Scope> | number | TestOptions,
    opts?: number | TestOptions,
  ) => {
    const args = instanceArgs(options, opts)
    return test.only(
      name,
      () => run(body(value).pipe(withTmpdirInstance(args.instanceOptions)), liveLayer),
      args.testOptions,
    )
  }

  instance.skip = <A, E2, E3 = never>(
    name: string,
    value: Body<A, E2, R | InstanceStore.Service | TestInstance | Scope.Scope>,
    options?: InstanceOptions<E3, R | Scope.Scope> | number | TestOptions,
    opts?: number | TestOptions,
  ) => {
    const args = instanceArgs(options, opts)
    return test.skip(
      name,
      () => run(body(value).pipe(withTmpdirInstance(args.instanceOptions)), liveLayer),
      args.testOptions,
    )
  }

  return { effect, live, instance }
}

// Test environment with TestClock and TestConsole
const testEnv = Layer.mergeAll(TestConsole.layer, TestClock.layer())

// Live environment - uses real clock, but keeps TestConsole for output capture
const liveEnv = TestConsole.layer

export const it = make<never, never>(testEnv, liveEnv)

export const testEffect = <R, E>(layer: Layer.Layer<R, E>) =>
  make<R, E>(Layer.provideMerge(layer, testEnv), Layer.provideMerge(layer, liveEnv))

// Variant of `testEffect` that builds the test layer through the shared
// process-wide memoMap so services like Bus/Session resolve to the same
// instances Server.Default uses. Use when a test needs pub/sub identity with
// an in-process HTTP server — most tests should stick with `testEffect`.
export const testEffectShared = <R, E>(layer: Layer.Layer<R, E>) =>
  make<R, E>(Layer.provideMerge(layer, testEnv), Layer.provideMerge(layer, liveEnv), sharedRun)

export const awaitWithTimeout = <A, E, R>(
  self: Effect.Effect<A, E, R>,
  message: string,
  duration: Duration.Input = "2 seconds",
) =>
  self.pipe(
    Effect.timeoutOrElse({
      duration,
      orElse: () => Effect.fail(new Error(message)),
    }),
  )

export const pollWithTimeout = <A, E, R>(
  self: Effect.Effect<A | undefined, E, R>,
  message: string,
  duration: Duration.Input = "5 seconds",
) =>
  Effect.gen(function* () {
    while (true) {
      const result = yield* self
      if (result !== undefined) return result
      yield* Effect.sleep("20 millis")
    }
  }).pipe(
    Effect.timeoutOrElse({
      duration,
      orElse: () => Effect.fail(new Error(message)),
    }),
  )

// A Clock whose sleeps never elapse on their own. Each sleep is published on
// `sleeps` with its requested length and resumes only when the test runs its
// `wake`, so a test can wait until a backoff has actually started, check its
// length, and then release or interrupt it without waiting in real time.
// Current time still reads the live clock.
export const heldClock = Effect.gen(function* () {
  const live = yield* Clock.clockWith(Effect.succeed)
  const sleeps = yield* Queue.unbounded<{ millis: number; wake: Effect.Effect<void> }>()
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => live.currentTimeMillisUnsafe(),
    currentTimeMillis: live.currentTimeMillis,
    currentTimeNanosUnsafe: () => live.currentTimeNanosUnsafe(),
    currentTimeNanos: live.currentTimeNanos,
    sleep: (duration) =>
      Effect.gen(function* () {
        const wake = yield* Deferred.make<void>()
        yield* Queue.offer(sleeps, {
          millis: Duration.toMillis(duration),
          wake: Deferred.succeed(wake, undefined).pipe(Effect.asVoid),
        })
        yield* Deferred.await(wake)
      }),
  }
  return { clock, sleeps }
})

// Runs `effect` on a fresh held clock, requires its first sleep to last at least `minMillis`, then
// releases it. Fails if the effect finishes without sleeping.
export const releaseFirstSleep =
  (minMillis: number) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const held = yield* heldClock
      const fiber = yield* effect.pipe(Effect.provideService(Clock.Clock, held.clock), Effect.forkChild)
      const sleep = yield* Queue.take(held.sleeps).pipe(
        Effect.raceFirst(Fiber.await(fiber).pipe(Effect.andThen(Effect.die("finished without sleeping")))),
      )
      expect(sleep.millis).toBeGreaterThanOrEqual(minMillis)
      yield* sleep.wake
      return yield* Fiber.join(fiber)
    })

// Runs `effect` until something on `held` requests a sleep of exactly `millis`, fires that sleep, and
// returns the effect's result, so a test can trigger one timer (say a kill escalation) without waiting.
export const fireSleep =
  (held: Effect.Success<typeof heldClock>, millis: number) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.gen(function* () {
      const fiber = yield* effect.pipe(Effect.forkChild)
      const sleep = yield* Effect.gen(function* () {
        while (true) {
          const next = yield* Queue.take(held.sleeps)
          if (next.millis === millis) return next
        }
      }).pipe(Effect.timeout(Duration.seconds(5)))
      yield* sleep.wake
      return yield* Fiber.join(fiber)
    })
