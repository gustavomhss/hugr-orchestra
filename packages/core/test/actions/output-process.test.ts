import { expect } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Stream } from "effect"
import { TestClock } from "effect/testing"
import { ChildProcess } from "effect/unstable/process"
import { ExitCode, type ChildProcessHandle } from "effect/unstable/process/ChildProcessSpawner"
import { ActionsOutput } from "../../src/actions/output"
import { ActionsProcess } from "../../src/actions/transport/process"
import { AppProcess } from "../../src/process"
import { OmniAdoption } from "../../src/omni-adoption"
import { LayerNode } from "../../src/effect/layer-node"
import { OutputFixture } from "./output-fixture"
import { expectSpawn } from "../fixture/omni-expect"
import { testEffect } from "../lib/effect"

const it = testEffect(LayerNode.compile(AppProcess.node))
const f = OutputFixture

it.live("GH W1 byte-spawner seam preserves stdout prefix then fails on child exit, without metadata/file fallback", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const proc = yield* AppProcess.Service
  const fixture = f.make(f.github, { "repositories/9347/actions/artifacts/11": f.response(f.artifact) })
  const observed: string[] = []
  const service = ActionsOutput.make({ reader: fixture.reader, transport: { ...fixture.transport,
    bytes: (_binding, request) => {
      observed.push(request.path)
      return ActionsProcess.bytes(proc, f.github.provider, ChildProcess.make("node", ["--eval",
        `process.stdout.write(Buffer.from(${JSON.stringify(Array.from(f.bytes))})); process.exitCode = 23;`],
        { stdin: "ignore", stdout: "pipe", stderr: "pipe" }))
    } } })
  const chunks: Uint8Array[] = []
  const error = yield* service.read(f.github, { kind: "artifact", id: "11" }).pipe(Stream.runForEach((chunk) => Effect.sync(() => chunks.push(chunk))), Effect.flip)
  expect(error).toMatchObject({ kind: "transfer_failed", bindingID: f.github.id })
  expect(Buffer.concat(chunks)).toEqual(Buffer.from(f.bytes))
  expect(observed).toEqual(["repositories/9347/actions/artifacts/11/zip"])
  expect(fixture.requests.every((request) => request.method === "GET" && request.path !== observed[0])).toBe(true)
}))

it.live("GH cancellation and scope watchdog kill real child while consumer holds emitted bytes", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const proc = yield* AppProcess.Service
  yield* Effect.forEach(["cancel", "deadline"], (mode) => Effect.scoped(Effect.gen(function* () {
    const entered = yield* Deferred.make<void>()
    const held = yield* Deferred.make<void>()
    const spawned = yield* Deferred.make<ChildProcessHandle>()
    const fixture = f.make(f.github, { "repositories/9347/actions/artifacts/11": f.response(f.artifact) })
    const service = ActionsOutput.make({ reader: fixture.reader, transport: { ...fixture.transport,
      bytes: () => ActionsProcess.bytes({ ...proc, spawn: (command) => proc.spawn(command).pipe(Effect.tap((handle) => Deferred.succeed(spawned, handle))) },
        f.github.provider, ChildProcess.make("node", ["--eval", "process.stdout.write(Buffer.from([0,10,255])); setInterval(() => {}, 1000);"],
          { stdin: "ignore", stdout: "pipe", stderr: "pipe" })) } })
    const fiber = yield* service.read(f.github, { kind: "artifact", id: "11" }).pipe(Stream.runForEach(() =>
      Deferred.succeed(entered, undefined).pipe(Effect.andThen(Deferred.await(held)))), Effect.forkChild)
    yield* Deferred.await(entered)
    const handle = yield* Deferred.await(spawned)
    expect(yield* handle.isRunning).toBe(true)
    if (mode === "cancel") yield* Fiber.interrupt(fiber)
    if (mode === "deadline") yield* TestClock.adjust("5 minutes")
    // Omni reports signal termination as PlatformError on Unix, not an exit code.
    const termination = yield* handle.exitCode.pipe(Effect.exit)
    if (Exit.isSuccess(termination)) expect(termination.value).not.toBe(0)
    if (Exit.isFailure(termination)) expect(Cause.findErrorOption(termination.cause)).toMatchObject({ _tag: "Some", value: {
      _tag: "PlatformError", reason: { _tag: "Unknown", module: "ChildProcess", method: "exitCode",
        cause: { message: expect.stringMatching(/^Process interrupted due to receipt of signal: '(SIGTERM|SIGKILL)'$/) } },
    } })
    expect(yield* handle.isRunning).toBe(false)
    expect(yield* Deferred.isDone(held)).toBe(false)
    yield* Deferred.succeed(held, undefined)
    const exit = yield* Fiber.await(fiber)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit) && mode === "cancel") expect(Cause.hasInterrupts(exit.cause)).toBe(true)
    if (Exit.isFailure(exit) && mode === "deadline") expect(Cause.findErrorOption(exit.cause)).toMatchObject({ _tag: "Some", value: {
      _tag: "ActionsError", kind: "transfer_failed", bindingID: f.github.id, provider: "github", disposition: "unknown",
    } })
  })))
}).pipe(Effect.provide(TestClock.layer())))

it.live("GH ending byte demand disposes real child without inherited tool adoption", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const proc = yield* AppProcess.Service
  const spawned = yield* Deferred.make<ChildProcessHandle>()
  const adopted: number[] = []
  const chunks = yield* ActionsProcess.bytes({ ...proc, spawn: (command) => proc.spawn(command).pipe(Effect.tap((handle) => Deferred.succeed(spawned, handle))) },
    f.github.provider, ChildProcess.make("node", ["--eval", "process.stdout.write(Buffer.from([0,10,255])); setInterval(() => {}, 1000);"],
      { stdin: "ignore", stdout: "pipe", stderr: "pipe" })).pipe(Stream.take(1), Stream.runCollect,
        Effect.provideService(OmniAdoption.Service, { sessionID: "actions-output-dispose", policy: "tool" }),
        Effect.provideService(OmniAdoption.Registry, { register: (child, input) =>
          Effect.sync(() => adopted.push(child.pid)).pipe(Effect.andThen(OmniAdoption.stub.register(child, input))) }))
  expect(Buffer.concat(chunks)).toEqual(Buffer.from([0, 10, 255]))
  const handle = yield* Deferred.await(spawned)
  const termination = yield* handle.exitCode.pipe(Effect.exit)
  if (Exit.isSuccess(termination)) expect(termination.value).not.toBe(0)
  if (Exit.isFailure(termination)) expect(Cause.findErrorOption(termination.cause)).toMatchObject({ _tag: "Some", value: {
    _tag: "PlatformError", reason: { _tag: "Unknown", module: "ChildProcess", method: "exitCode",
      cause: { message: expect.stringMatching(/^Process interrupted due to receipt of signal: '(SIGTERM|SIGKILL)'$/) } },
  } })
  expect(yield* handle.isRunning).toBe(false)
  expect(adopted).toEqual([])
}))

it.live("GH byte transport watchdog kills real upstream independently and delivers typed failure after held bytes", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const proc = yield* AppProcess.Service
  const entered = yield* Deferred.make<void>()
  const held = yield* Deferred.make<void>()
  const spawned = yield* Deferred.make<ChildProcessHandle>()
  const seen: Uint8Array[] = []
  const fiber = yield* ActionsProcess.bytes({ ...proc, spawn: (command) => proc.spawn(command).pipe(Effect.tap((handle) => Deferred.succeed(spawned, handle))) },
    f.github.provider, ChildProcess.make("node", ["--eval", "process.stdout.write(Buffer.from([0,10,255])); setInterval(() => {}, 1000);"],
      { stdin: "ignore", stdout: "pipe", stderr: "pipe" })).pipe(Stream.runForEach((chunk) =>
        Effect.sync(() => seen.push(chunk)).pipe(Effect.andThen(Deferred.succeed(entered, undefined)), Effect.andThen(Deferred.await(held)))), Effect.forkChild)
  yield* Deferred.await(entered)
  const handle = yield* Deferred.await(spawned)
  expect(yield* handle.isRunning).toBe(true)
  yield* TestClock.adjust("5 minutes")
  const termination = yield* handle.exitCode.pipe(Effect.exit)
  if (Exit.isSuccess(termination)) expect(termination.value).not.toBe(0)
  if (Exit.isFailure(termination)) expect(Cause.findErrorOption(termination.cause)).toMatchObject({ _tag: "Some", value: {
    _tag: "PlatformError", reason: { _tag: "Unknown", module: "ChildProcess", method: "exitCode",
      cause: { message: expect.stringMatching(/^Process interrupted due to receipt of signal: '(SIGTERM|SIGKILL)'$/) } },
  } })
  expect(yield* handle.isRunning).toBe(false)
  expect(yield* Deferred.isDone(held)).toBe(false)
  yield* Deferred.succeed(held, undefined)
  const exit = yield* Fiber.await(fiber)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.findErrorOption(exit.cause)).toMatchObject({ _tag: "Some", value: {
    _tag: "ActionsError", kind: "transfer_failed", provider: "github", disposition: "unknown",
    message: "Provider CLI byte transfer deadline exceeded",
  } })
  expect(Buffer.concat(seen)).toEqual(Buffer.from([0, 10, 255]))
}).pipe(Effect.provide(TestClock.layer())))

it.live("GH successful child exit cannot cache EOF past the byte deadline while consumer holds its last chunk", Effect.gen(function* () {
  expectSpawn(import.meta.path)
  const proc = yield* AppProcess.Service
  const entered = yield* Deferred.make<void>()
  const held = yield* Deferred.make<void>()
  const spawned = yield* Deferred.make<ChildProcessHandle>()
  const seen: Uint8Array[] = []
  const fiber = yield* ActionsProcess.bytes({ ...proc, spawn: (command) => proc.spawn(command).pipe(Effect.tap((handle) => Deferred.succeed(spawned, handle))) },
    f.github.provider, ChildProcess.make("node", ["--eval", "process.stdout.write(Buffer.from([0,10,255]));"],
      { stdin: "ignore", stdout: "pipe", stderr: "pipe" })).pipe(Stream.runForEach((chunk) =>
        Effect.sync(() => seen.push(chunk)).pipe(Effect.andThen(Deferred.succeed(entered, undefined)), Effect.andThen(Deferred.await(held)))), Effect.forkChild)
  yield* Deferred.await(entered)
  const handle = yield* Deferred.await(spawned)
  expect(yield* handle.exitCode).toBe(ExitCode(0))
  expect(yield* handle.isRunning).toBe(false)
  yield* TestClock.adjust("5 minutes")
  expect(yield* Deferred.isDone(held)).toBe(false)
  yield* Deferred.succeed(held, undefined)
  const exit = yield* Fiber.await(fiber)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.findErrorOption(exit.cause)).toMatchObject({ _tag: "Some", value: {
    _tag: "ActionsError", kind: "transfer_failed", provider: "github", disposition: "unknown",
    message: "Provider CLI byte transfer deadline exceeded",
  } })
  expect(Buffer.concat(seen)).toEqual(Buffer.from([0, 10, 255]))
}).pipe(Effect.provide(TestClock.layer())))
