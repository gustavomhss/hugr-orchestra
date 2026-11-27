import { expect, test } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Stream } from "effect"
import { TestClock } from "effect/testing"
import { SessionInputTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { reply, run, sourcePath, stage, text } from "./fixture/lucy-engagement"

const request = (requestID: string) => ({
  kind: "engagement", requestID, profile: "audit",
  brief: "Inspect only the captured src declarations under the original host deadline.",
  timeBoxMinutes: 1, paths: ["src"],
})

type Terminal = {
  schema: string
  requestID: string
  reportID: string
  status: string
  source?: { commit: string; files: { path: string }[] }
  report?: { verdict?: string }
  budget: { startedAt: number; deadlineAt: number }
  citations: unknown[]
  notExamined: { item: string; reason: string }[]
}

function terminal(output: { type: string; text: string }, status: string) {
  expect(output.type, output.text).toBe("text")
  const value = JSON.parse(output.text) as Terminal
  expect(value.schema).toBe("review-engagement-result-v1")
  expect(value.status).toBe(status)
  expect(value.reportID).toMatch(/^[0-9a-f]{64}$/)
  expect(value.budget.deadlineAt - value.budget.startedAt).toBe(60_000)
  expect(value.report?.verdict).toBeUndefined()
  return value
}

test("the original host deadline covers pending source capture without inventing a source or report", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const released = yield* Deferred.make<void>()
    yield* root.open((host) => Effect.gen(function* () {
      const pending = yield* host.invoke(request("expire-before-capture")).pipe(Effect.forkChild)
      const reached = yield* Effect.raceFirst(
        Deferred.await(entered).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)),
      )
      expect(reached).toBe(true)
      yield* TestClock.adjust("59 seconds")
      expect(pending.pollUnsafe()).toBeUndefined()
      expect(yield* Deferred.isDone(released)).toBe(false)
      yield* TestClock.adjust("1 second")
      expect(yield* Deferred.isDone(released)).toBe(true)
      const output = yield* Fiber.join(pending)
      const value = terminal(output, "expired")
      expect(value.source).toBeUndefined()
      expect(value.report).toBeUndefined()
      expect(value.citations).toEqual([])
      expect(value.notExamined.some((item) => item.reason === "time-box")).toBe(true)
      expect(root.requests).toEqual([])
      expect((yield* host.invoke(request("expire-before-capture"))).text).toBe(output.text)
    }), {
      onGit: (args) => args.includes("rev-parse") && args.includes("--end-of-options") && args.includes("HEAD^{commit}")
        ? Deferred.succeed(entered, undefined).pipe(Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(released, undefined)))
        : undefined,
    })
  })).pipe(Effect.provide(TestClock.layer())))
}, 90_000)

test("one deadline covers 50 seconds of acquisition and the later real provider, then persists expiry across reopening", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const acquiring = yield* Deferred.make<void>()
    const allowCapture = yield* Deferred.make<void>()
    const entered = yield* Deferred.make<void>()
    const released = yield* Deferred.make<void>()
    const original = yield* root.open((host) => Effect.gen(function* () {
      const pending = yield* host.invoke(request("expire-after-capture")).pipe(Effect.forkChild)
      expect(yield* Effect.raceFirst(
        Deferred.await(acquiring).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)),
      )).toBe(true)
      yield* TestClock.adjust("50 seconds")
      yield* Deferred.succeed(allowCapture, undefined)
      expect(yield* Effect.raceFirst(
        Deferred.await(entered).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)),
      )).toBe(true)
      yield* TestClock.adjust("9 seconds")
      expect(pending.pollUnsafe()).toBeUndefined()
      expect(yield* Deferred.isDone(released)).toBe(false)
      yield* TestClock.adjust("1 second")
      // Provider cancellation is the deadline witness; joining then awaits native and scoped cleanup.
      expect(yield* Deferred.isDone(released)).toBe(true)
      const output = yield* Fiber.join(pending)
      const value = terminal(output, "expired")
      expect(value.source?.commit).toBe(root.head)
      expect(value.source?.files.map((file) => file.path)).toEqual([sourcePath])
      expect(value.notExamined.some((item) => item.reason === "time-box")).toBe(true)
      expect((yield* host.execution.active).size).toBe(0)
      return { output, value, requests: root.requests.length }
    }), {
      onGit: (args) => args.includes("rev-parse") && args.includes("--end-of-options") && args.includes("HEAD^{commit}")
        ? Deferred.succeed(acquiring, undefined).pipe(Effect.andThen(Deferred.await(allowCapture)))
        : undefined,
      stream: () => Stream.unwrap(Deferred.succeed(entered, undefined).pipe(
        Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(released, undefined)),
      )),
    })
    yield* TestClock.adjust("120 seconds")
    yield* root.open((host) => Effect.gen(function* () {
      const before = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      const replayed = yield* host.invoke(request("expire-after-capture"))
      expect(replayed.text).toBe(original.output.text)
      expect(terminal(replayed, "expired").budget).toEqual(original.value.budget)
      expect(root.requests.length).toBe(original.requests)
      expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(before)
    }))
  })).pipe(Effect.provide(TestClock.layer())))
}, 90_000)

test("owner cancellation propagates interruption, drains child cleanup and survives real graph reopening", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const released = yield* Deferred.make<void>()
    const original = yield* root.open((host) => Effect.gen(function* () {
      const pending = yield* host.invoke(request("cancel-owner")).pipe(Effect.forkChild)
      expect(yield* Effect.raceFirst(
        Deferred.await(entered).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)),
      )).toBe(true)
      yield* TestClock.adjust("20 seconds")
      yield* Fiber.interrupt(pending)
      expect(yield* Deferred.isDone(released)).toBe(true)
      expect((yield* host.execution.active).size).toBe(0)
      const exit = pending.pollUnsafe()
      expect(exit !== undefined && Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
      const output = yield* host.invoke(request("cancel-owner"))
      const value = terminal(output, "cancelled")
      expect(value.source?.commit).toBe(root.head)
      expect(value.notExamined.length).toBeGreaterThan(0)
      return { output, value, requests: root.requests.length }
    }), {
      stream: () => Stream.unwrap(Deferred.succeed(entered, undefined).pipe(
        Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(released, undefined)),
      )),
    })
    yield* TestClock.adjust("120 seconds")
    yield* root.open((host) => Effect.gen(function* () {
      const before = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      const replayed = yield* host.invoke(request("cancel-owner"))
      expect(replayed.text).toBe(original.output.text)
      expect(terminal(replayed, "cancelled").budget).toEqual(original.value.budget)
      expect(root.requests.length).toBe(original.requests)
      expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(before)
    }))
  })).pipe(Effect.provide(TestClock.layer())))
}, 90_000)

test("cancelling an exact concurrent waiter cannot cancel the owner or renew its deadline", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const released = yield* Deferred.make<void>()
    yield* root.open((host) => Effect.gen(function* () {
      const owner = yield* host.invoke(request("cancel-waiter")).pipe(Effect.forkChild)
      expect(yield* Effect.raceFirst(
        Deferred.await(entered).pipe(Effect.as(true)), Fiber.join(owner).pipe(Effect.as(false)),
      )).toBe(true)
      const waiter = yield* host.invoke(request("cancel-waiter")).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      expect(waiter.pollUnsafe()).toBeUndefined()
      yield* Fiber.interrupt(waiter)
      expect(owner.pollUnsafe()).toBeUndefined()
      expect(yield* Deferred.isDone(released)).toBe(false)
      expect(root.requests).toHaveLength(1)
      yield* TestClock.adjust("59 seconds")
      expect(owner.pollUnsafe()).toBeUndefined()
      yield* TestClock.adjust("1 second")
      expect(yield* Deferred.isDone(released)).toBe(true)
      terminal(yield* Fiber.join(owner), "expired")
      expect(root.requests).toHaveLength(1)
    }), {
      stream: (log, modelRequest) => stage(log.text) !== "entry" ? text(reply(log, modelRequest))
        : Stream.unwrap(Deferred.succeed(entered, undefined).pipe(
          Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(released, undefined)),
        )),
    })
  })).pipe(Effect.provide(TestClock.layer())))
}, 90_000)
