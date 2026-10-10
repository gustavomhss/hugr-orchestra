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
    expect(Context.getOrUndefined(Cause.reasonAnnotations(interrupts[0]), Annotation)).toBe(firstAnnotation)
    expect(Context.getOrUndefined(Cause.reasonAnnotations(interrupts[1]), Annotation)).toBe(secondAnnotation)
  }))
})

test.each([["original maps", false], ["copied maps", true]] as const)("annotated restored interrupt and unannotated cleanup interrupt both survive: %s", async (_, copy) => {
  await run(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const cleanupEntered = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const controllerID = yield* Effect.fiberId
    const requested = { phase: "first annotated request" }
    const captured: Cause.Cause<never>[] = []
    const continued: boolean[] = []
    const pending = yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
      const original = failure(yield* restore(Deferred.succeed(entered, undefined).pipe(
        Effect.andThen(Effect.never),
      )).pipe(Effect.exit))
      captured.push(original)
      yield* Deferred.succeed(cleanupEntered, undefined)
      yield* Deferred.await(release).pipe(Effect.timeout("2 seconds"))
      const reasons = copy ? original.reasons.map((reason) => reason.annotate(
        Context.makeUnsafe(new Map(reason.annotations)),
      )) : original.reasons
      if (copy) expect(reasons[0].annotations).not.toBe(original.reasons[0].annotations)
      return yield* Effect.failCause(Cause.fromReasons([...reasons, die]))
    })).pipe(
      Effect.catchCause(() => Effect.sync(() => continued.push(true))),
      Effect.withSpan("two native requests through masked cleanup"), Effect.forkChild,
    )
    yield* Deferred.await(entered)
    const first = yield* Fiber.interruptAs(pending, controllerID, Context.make(Annotation, requested))
      .pipe(Effect.forkChild({ startImmediately: true }))
    yield* Deferred.await(cleanupEntered)
    const second = yield* Fiber.interruptAs(pending, controllerID)
      .pipe(Effect.forkChild({ startImmediately: true }))
    yield* Deferred.succeed(release, undefined)
    const cause = failure(yield* Fiber.await(pending))
    yield* Fiber.join(first)
    yield* Fiber.join(second)
    expect(captured).toHaveLength(1)
    expect(cause.reasons.map((reason) => reason._tag)).toEqual(["Interrupt", "Die", "Interrupt"])
    const interrupts = cause.reasons.filter(Cause.isInterruptReason)
    expect(interrupts.map((reason) => reason.fiberId)).toEqual([controllerID, controllerID])
    expect(Context.getOrUndefined(Cause.reasonAnnotations(interrupts[0]), Annotation)).toBe(requested)
    expect(interrupts[1].annotations.has(Annotation.key)).toBe(false)
    captured[0].reasons[0].annotations.forEach((value, key) => expect(interrupts[0].annotations.get(key)).toBe(value))
    expect(cause.reasons.filter(Cause.isDieReason)[0].defect).toBe(defect)
    expect(continued).toEqual([])
  }))
})

test("native requests with identical metadata and distinct maps retain both origins", async () => {
  await run(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const cleanup = yield* Deferred.make<void>()
    const release = yield* Deferred.make<void>()
    const controllerID = yield* Effect.fiberId
    const value = { phase: "identical native requests" }
    const request = Context.make(Annotation, value)
    const observed: Cause.Cause<never>[] = []
    const pending = yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
      const first = failure(yield* restore(Deferred.succeed(entered, undefined).pipe(
        Effect.andThen(Effect.never),
      )).pipe(Effect.exit))
      yield* Deferred.succeed(cleanup, undefined)
      yield* Deferred.await(release).pipe(Effect.timeout("2 seconds"))
      // Public restored boundary exposes both real pending requests without private fiber access.
      const all = failure(yield* restore(Effect.void).pipe(Effect.exit))
      observed.push(all)
      const requests = all.reasons.filter(Cause.isInterruptReason)
      expect(requests).toHaveLength(2)
      expect(requests.map((reason) => reason.fiberId)).toEqual([controllerID, controllerID])
      expect(requests[0].annotations).not.toBe(requests[1].annotations)
      requests.forEach((reason) => expect(Context.getOrUndefined(Cause.reasonAnnotations(reason), Annotation)).toBe(value))
      const copied = first.reasons.map((reason) => reason.annotate(Context.makeUnsafe(new Map(reason.annotations))))
      expect(copied[0].annotations).not.toBe(first.reasons[0].annotations)
      // A second annotation clone still represents the first native origin, not a third request.
      const cloned = copied.map((reason) => reason.annotate(Context.make(Annotation, value)))
      return yield* Effect.failCause(Cause.fromReasons([...cloned, die]))
    })).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    const first = yield* Fiber.interruptAs(pending, controllerID, request).pipe(Effect.forkChild({ startImmediately: true }))
    yield* Deferred.await(cleanup)
    const second = yield* Fiber.interruptAs(pending, controllerID, request).pipe(Effect.forkChild({ startImmediately: true }))
    yield* Deferred.succeed(release, undefined)
    const cause = failure(yield* Fiber.await(pending))
    yield* Fiber.join(first)
    yield* Fiber.join(second)
    expect(observed).toHaveLength(1)
    expect(cause.reasons.map((reason) => reason._tag)).toEqual(["Interrupt", "Die", "Interrupt"])
    expect(cause.reasons.filter(Cause.isDieReason)[0].defect).toBe(defect)
    const requests = cause.reasons.filter(Cause.isInterruptReason)
    expect(requests.map((reason) => reason.fiberId)).toEqual([controllerID, controllerID])
    requests.forEach((reason) => expect(Context.getOrUndefined(Cause.reasonAnnotations(reason), Annotation)).toBe(value))
    expect(requests[1]).toBe(observed[0].reasons.filter(Cause.isInterruptReason)[1])
  }))
})

test("manual same-ID interrupt with copied metadata is a new origin; duplicate body reasons stay intact", async () => {
  await run(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const controllerID = yield* Effect.fiberId
    const value = { phase: "manual metadata copy" }
    const native: Cause.Cause<never>[] = []
    const manufactured: Cause.Interrupt[] = []
    const pending = yield* Effect.uninterruptibleMask((restore) => Effect.gen(function* () {
      const original = failure(yield* restore(Deferred.succeed(entered, undefined).pipe(
        Effect.andThen(Effect.never),
      )).pipe(Effect.exit))
      native.push(original)
      const copied = Cause.makeInterruptReason(controllerID).annotate(Context.makeUnsafe(new Map(original.reasons[0].annotations)))
      manufactured.push(copied)
      expect(copied.annotations).not.toBe(original.reasons[0].annotations)
      original.reasons[0].annotations.forEach((entry, key) => expect(copied.annotations.get(key)).toBe(entry))
      return yield* Effect.failCause(Cause.fromReasons([copied, copied, die]))
    })).pipe(Effect.forkChild)
    yield* Deferred.await(entered)
    const interruptor = yield* Fiber.interruptAs(pending, controllerID, Context.make(Annotation, value))
      .pipe(Effect.forkChild({ startImmediately: true }))
    const cause = failure(yield* Fiber.await(pending))
    yield* Fiber.join(interruptor)
    expect(native).toHaveLength(1)
    expect(manufactured).toHaveLength(1)
    expect(cause.reasons.map((reason) => reason._tag)).toEqual(["Interrupt", "Interrupt", "Die", "Interrupt"])
    expect(cause.reasons[0]).toBe(manufactured[0])
    expect(cause.reasons[1]).toBe(manufactured[0])
    expect(cause.reasons[3]).toBe(native[0].reasons[0])
    cause.reasons.filter(Cause.isInterruptReason).forEach((reason) => {
      expect(reason.fiberId).toBe(controllerID)
      expect(Context.getOrUndefined(Cause.reasonAnnotations(reason), Annotation)).toBe(value)
    })
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
