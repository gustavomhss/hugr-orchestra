import { expect, test } from "bun:test"
import { Cause, Context, Deferred, Effect, Exit, Fiber } from "effect"

const Annotation = Context.Service<{ phase: string }>("test/native-interruption/annotation")
const annotation = { phase: "masked body" }
const domain = { _tag: "NativeMaskFailure" }
const defect = new Error("NATIVE_MASK_DEFECT")
const fail = Cause.makeFailReason(domain).annotate(Context.make(Annotation, annotation))
const die = Cause.makeDieReason(defect).annotate(Context.make(Annotation, annotation))
const bodyInterrupt = Cause.makeInterruptReason(123).annotate(Context.make(Annotation, annotation))

function failure<A, E>(exit: Exit.Exit<A, E>) {
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isSuccess(exit)) throw new Error("Expected native interruption failure")
  return exit.cause
}

function expectBody(actual: Cause.Cause<unknown>, original: Cause.Cause<unknown>) {
  expect(actual.reasons.slice(0, original.reasons.length).map((reason) => reason._tag)).toEqual(
    original.reasons.map((reason) => reason._tag),
  )
  original.reasons.forEach((reason, index) => {
    const found = actual.reasons[index]
    if (Cause.isFailReason(reason) && Cause.isFailReason(found)) expect(found.error).toBe(reason.error)
    if (Cause.isDieReason(reason) && Cause.isDieReason(found)) expect(found.defect).toBe(reason.defect)
    if (Cause.isInterruptReason(reason) && Cause.isInterruptReason(found)) expect(found.fiberId).toBe(reason.fiberId)
    expect(Context.getOrUndefined(Cause.reasonAnnotations(found), Annotation)).toBe(annotation)
  })
}

const run = <A, E>(body: Effect.Effect<A, E, never>) => body.pipe(
  Effect.timeout("5 seconds"), Effect.scoped, Effect.runPromise,
)

test.each([
  ["Fail", Cause.fromReasons([fail])],
  ["Die", Cause.fromReasons([die])],
  ["mixed duplicate reasons", Cause.fromReasons([fail, die, die, fail, bodyInterrupt, bodyInterrupt])],
] as const)("native interrupt survives failing mask unwind: %s", async (_, original) => {
  await run(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const continued: string[] = []
    const pending = yield* Effect.uninterruptibleMask(() => Effect.gen(function* () {
      yield* Deferred.succeed(entered, undefined)
      // Bound masked waits even if the test's controller fails.
      yield* Deferred.await(release).pipe(Effect.timeout("2 seconds"))
      return yield* Effect.failCause(original)
    })).pipe(
      Effect.catchCause(() => Effect.sync(() => continued.push("recovered"))),
      Effect.andThen(Effect.sync(() => continued.push("continued"))),
      Effect.withSpan("native failing mask"),
      Effect.forkChild,
    )
    yield* Deferred.await(entered)
    // Immediate start executes public Fiber.interrupt before returning, then waits for pending.
    const interruptor = yield* Fiber.interrupt(pending).pipe(Effect.forkChild({ startImmediately: true }))
    expect(pending.pollUnsafe()).toBeUndefined()
    yield* Deferred.succeed(release, undefined)
    const cause = failure(yield* Fiber.await(pending))
    yield* Fiber.join(interruptor)
    expectBody(cause, original)
    expect(cause.reasons).toHaveLength(original.reasons.length + 1)
    expect(cause.reasons.filter(Cause.isInterruptReason).map((reason) => reason.fiberId)).toEqual([
      ...original.reasons.flatMap((reason) => Cause.isInterruptReason(reason) ? [reason.fiberId] : []), interruptor.id,
    ])
    expect(continued).toEqual([])
  }))
})

test("native interrupts from distinct fibers survive nested failing masks once each", async () => {
  await run(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const original = Cause.fromReasons([fail, die, die])
    const pending = yield* Effect.uninterruptibleMask(() => Effect.uninterruptibleMask(() => Effect.gen(function* () {
      yield* Deferred.succeed(entered, undefined)
      yield* Deferred.await(release).pipe(Effect.timeout("2 seconds"))
      return yield* Effect.failCause(original)
    }))).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    const first = yield* Fiber.interrupt(pending).pipe(Effect.forkChild({ startImmediately: true }))
    const second = yield* Fiber.interrupt(pending).pipe(Effect.forkChild({ startImmediately: true }))
    yield* Deferred.succeed(release, undefined)
    const cause = failure(yield* Fiber.await(pending))
    yield* Fiber.join(first)
    yield* Fiber.join(second)
    expectBody(cause, original)
    expect(cause.reasons).toHaveLength(original.reasons.length + 2)
    expect(cause.reasons.filter(Cause.isInterruptReason).map((reason) => reason.fiberId)).toEqual([first.id, second.id])
  }))
})

test("restored native cancellation plus failing cleanup keeps one native reason through traced unwind", async () => {
  await run(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const captured: Cause.Cause<never>[] = []
    const pending = yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
      const exit = yield* restore(Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never))).pipe(Effect.exit)
      const original = failure(exit)
      captured.push(original)
      return yield* Effect.failCause(Cause.fromReasons([...original.reasons, die, die]))
    })).pipe(Effect.withSpan("native cleanup"), Effect.forkChild)
    yield* Deferred.await(entered)
    const interruptor = yield* Fiber.interrupt(pending).pipe(Effect.forkChild({ startImmediately: true }))
    const cause = failure(yield* Fiber.await(pending))
    yield* Fiber.join(interruptor)
    expect(captured).toHaveLength(1)
    expect(cause.reasons.map((reason) => reason._tag)).toEqual(["Interrupt", "Die", "Die"])
    expect(cause.reasons.filter(Cause.isInterruptReason).map((reason) => reason.fiberId)).toEqual([interruptor.id])
    expectBody(Cause.fromReasons(cause.reasons.slice(1)), Cause.fromReasons([die, die]))
    captured[0].reasons[0].annotations.forEach((value, key) => expect(cause.reasons[0].annotations.get(key)).toBe(value))
  }))
})

test("pending native interrupts sharing fiber ID retain distinct annotation identities", async () => {
  await run(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const controllerID = yield* Effect.fiberId
    const firstAnnotation = { phase: "first native interrupt" }
    const secondAnnotation = { phase: "second native interrupt" }
    const original = Cause.fromReasons([die, die])
    const pending = yield* Effect.uninterruptibleMask(() => Deferred.succeed(entered, undefined).pipe(
      Effect.andThen(Deferred.await(release).pipe(Effect.timeout("2 seconds"))),
      Effect.andThen(Effect.failCause(original)),
    )).pipe(Effect.withSpan("annotated native requests"), Effect.forkChild)
    yield* Deferred.await(entered)
    const first = yield* Fiber.interruptAs(pending, controllerID, Context.make(Annotation, firstAnnotation))
      .pipe(Effect.forkChild({ startImmediately: true }))
    const second = yield* Fiber.interruptAs(pending, controllerID, Context.make(Annotation, secondAnnotation))
      .pipe(Effect.forkChild({ startImmediately: true }))
    yield* Deferred.succeed(release, undefined)
    const cause = failure(yield* Fiber.await(pending))
    yield* Fiber.join(first)
    yield* Fiber.join(second)
    expectBody(cause, original)
    expect(cause.reasons).toHaveLength(4)
    const interrupts = cause.reasons.filter(Cause.isInterruptReason)
    expect(interrupts.map((reason) => reason.fiberId)).toEqual([controllerID, controllerID])
    expect(interrupts.map((reason) => Context.getOrUndefined(Cause.reasonAnnotations(reason), Annotation))).toEqual([
      firstAnnotation, secondAnnotation,
    ])
  }))
})

test("positive control: native interrupt during successful mask is delivered", async () => {
  await run(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const pending = yield* Effect.uninterruptibleMask(() => Deferred.succeed(entered, undefined).pipe(
      Effect.andThen(Deferred.await(release).pipe(Effect.timeout("2 seconds"))), Effect.as("success"),
    )).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    const interruptor = yield* Fiber.interrupt(pending).pipe(Effect.forkChild({ startImmediately: true }))
    expect(pending.pollUnsafe()).toBeUndefined()
    yield* Deferred.succeed(release, undefined)
    const cause = failure(yield* Fiber.await(pending))
    yield* Fiber.join(interruptor)
    expect(cause.reasons.map((reason) => reason._tag)).toEqual(["Interrupt"])
    expect(cause.reasons.filter(Cause.isInterruptReason).map((reason) => reason.fiberId)).toEqual([interruptor.id])
  }))
})

test("positive control: interruptible cancellation stays native and cannot recover", async () => {
  await run(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const recovered: boolean[] = []
    const pending = yield* Deferred.succeed(entered, undefined).pipe(
      Effect.andThen(Effect.never),
      Effect.catchCause(() => Effect.sync(() => recovered.push(true))),
      Effect.withSpan("native interruptible control"), Effect.forkChild,
    )
    yield* Deferred.await(entered)
    const interruptor = yield* Fiber.interrupt(pending).pipe(Effect.forkChild({ startImmediately: true }))
    const cause = failure(yield* Fiber.await(pending))
    yield* Fiber.join(interruptor)
    expect(cause.reasons.map((reason) => reason._tag)).toEqual(["Interrupt"])
    expect(cause.reasons.filter(Cause.isInterruptReason).map((reason) => reason.fiberId)).toEqual([interruptor.id])
    expect(recovered).toEqual([])
  }))
})

test("positive control: uninterrupted failing mask preserves original duplicate reasons", async () => {
  const original = Cause.fromReasons([fail, die, die, fail, bodyInterrupt, bodyInterrupt])
  const cause = failure(await Effect.runPromiseExit(Effect.uninterruptibleMask(() => Effect.failCause(original))))
  expectBody(cause, original)
  expect(cause.reasons).toHaveLength(original.reasons.length)
})
