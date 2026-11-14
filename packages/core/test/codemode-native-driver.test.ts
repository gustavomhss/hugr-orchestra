import { expect } from "bun:test"
import { Deferred, Effect, Fiber } from "effect"
import { NativeRegex } from "@orchestra/codemode"
import { makeDriver } from "@orchestra/codemode/native-regex-driver"
import { CodeModeNativeRegex } from "../src/codemode-native-regex"
import { LayerNode } from "../src/effect/layer-node"
import { AppProcess } from "../src/process"
import { Omni } from "../src/omni"
import { expectSpawn } from "./fixture/omni-expect"
import { testEffect } from "./lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))
const node = { type: "CallExpression" }

function index(reply: NativeRegex.Reply) {
  if (!reply.ok || reply.operation !== "exec" || reply.result.value === null)
    throw new Error("Expected actual successful native exec match")
  return reply.result.value.index
}

it.live("native driver constructs concurrent alias requests lazily and commits state before releasing ownership", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const driver = makeDriver(performance.now() + 5000, Effect.void)
  const state = { source: "a", flags: "g", lastIndex: 0 }
  const requested: number[] = []
  const committed: number[] = []
  const before = Omni.snapshot().spawns
  const operation = () => driver.run(() => {
    requested.push(state.lastIndex)
    return { version: 1, operation: "exec", regex: { ...state }, subject: "aa" }
  }, node, (reply) => {
    if (!reply.ok) throw new Error("Expected successful exec before commit")
    state.lastIndex = reply.regex.lastIndex
    committed.push(state.lastIndex)
  })
  const replies = yield* Effect.all([operation(), operation()], { concurrency: "unbounded" })
  expect(requested).toEqual([0, 1])
  expect(committed).toEqual([1, 2])
  expect(replies.map(index)).toEqual([0, 1])
  expect(state.lastIndex).toBe(2)
  expect(Omni.snapshot().spawns - before).toBe(2)
  yield* driver.idle
}).pipe(Effect.provide(CodeModeNativeRegex.layer), Effect.timeout(8000)))

it.live("native driver releases ownership before awaiting its first post-reply guard", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const guards = { count: 0 }
  const guard = Effect.suspend(() => guards.count++ === 0
    ? Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release)))
    : Effect.void)
  const driver = makeDriver(performance.now() + 5000, guard)
  const state = { source: "a", flags: "g", lastIndex: 0 }
  const run = () => driver.run(() => ({ version: 1, operation: "exec", regex: { ...state }, subject: "aa" }), node,
    (reply) => { if (reply.ok) state.lastIndex = reply.regex.lastIndex })
  const firstState = { settled: false }
  const before = Omni.snapshot().spawns
  const first = yield* Effect.forkScoped(run().pipe(Effect.tap(() => Effect.sync(() => { firstState.settled = true }))))
  yield* Deferred.await(entered)
  expect(firstState.settled).toBe(false)
  expect(state.lastIndex).toBe(1)
  // This actual second child must finish while the first operation remains parked in its guard.
  const second = yield* run()
  expect(index(second)).toBe(1)
  expect(state.lastIndex).toBe(2)
  expect(firstState.settled).toBe(false)
  expect(Omni.snapshot().spawns - before).toBe(2)
  yield* driver.idle
  yield* Deferred.succeed(release, undefined)
  expect(index(yield* Fiber.join(first))).toBe(0)
  expect(firstState.settled).toBe(true)
}).pipe(Effect.provide(CodeModeNativeRegex.layer), Effect.timeout(8000)))

it.live("independent native drivers progress while another execution awaits its own post-reply guard", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const entered = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const firstDriver = makeDriver(performance.now() + 5000,
    Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(release))))
  const secondDriver = makeDriver(performance.now() + 5000, Effect.void)
  const request = (): NativeRegex.Request => ({
    version: 1, operation: "exec", regex: { source: "a", flags: "g", lastIndex: 0 }, subject: "a",
  })
  const state = { firstSettled: false }
  const before = Omni.snapshot().spawns
  const first = yield* Effect.forkScoped(firstDriver.run(request, node).pipe(
    Effect.tap(() => Effect.sync(() => { state.firstSettled = true })),
  ))
  yield* Deferred.await(entered)
  expect(state.firstSettled).toBe(false)
  const second = yield* secondDriver.run(request, node)
  expect(index(second)).toBe(0)
  yield* secondDriver.idle
  expect(state.firstSettled).toBe(false)
  expect(Omni.snapshot().spawns - before).toBe(2)
  yield* Deferred.succeed(release, undefined)
  expect(index(yield* Fiber.join(first))).toBe(0)
  expect(state.firstSettled).toBe(true)
  // Semaphore allocation itself is a source-review obligation; guard independence is observed here.
}).pipe(Effect.provide(CodeModeNativeRegex.layer), Effect.timeout(8000)))
