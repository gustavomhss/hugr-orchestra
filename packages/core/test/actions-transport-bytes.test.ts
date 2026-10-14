import { expect } from "bun:test"
import { createHash } from "node:crypto"
import { Deferred, Effect, Exit, Fiber, Stream } from "effect"
import { TestClock } from "effect/testing"
import { ActionsError } from "../src/actions/error"
import { ActionsTransportFixture } from "./fixture/actions-transport"

const it = ActionsTransportFixture.it
const block = Buffer.from(Array.from({ length: 16 * 1024 }, (_, index) => index % 256))

it.live("raw bytes preserve large binary, blank lines and non-UTF8 without collection helpers", Effect.gen(function* () {
  const prefix = Buffer.from([10, 10, 0, 255, 254, 195, 40, 10, 10])
  const fixture = yield* ActionsTransportFixture.fixture({ binary: prefix.toString("base64"), blocks: 512, stderr: "diagnostic".repeat(4096) })
  const hash = createHash("sha256")
  const seen = { size: 0, chunks: 0 }
  yield* fixture.service.bytes(fixture.binding(), { method: "GET", path: "repos/acme/widget/actions/jobs/52/logs" })
    .pipe(Stream.runForEach((bytes) => Effect.sync(() => { hash.update(bytes); seen.size += bytes.length; seen.chunks++ })))
  const expected = createHash("sha256").update(prefix)
  Array.from({ length: 512 }).forEach(() => expected.update(block))
  expect(hash.digest("hex")).toBe(expected.digest("hex"))
  expect(seen.size).toBe(prefix.length + block.length * 512)
  expect(seen.chunks).toBeGreaterThan(1)
  const call = (yield* fixture.calls())[0]
  expect(call.argv).toEqual(["api", "--hostname", "github.com", "--method", "GET", "--header", "X-GitHub-Api-Version: 2026-03-10", "--", "repos/acme/widget/actions/jobs/52/logs"])
}))

it.live("nonzero exit fails after any emitted partial bytes and keeps diagnostic secrets private", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ binary: Buffer.from([0, 255, 10, 10]).toString("base64"), code: 7, stderr: "synthetic-secret".repeat(4096) })
  const received: Buffer[] = []
  const error = yield* fixture.service.bytes(fixture.binding(), { method: "GET", path: "repos/acme/widget/actions/jobs/8/logs" })
    .pipe(Stream.runForEach((bytes) => Effect.sync(() => { received.push(Buffer.from(bytes)) })), Effect.flip)
  expect(Buffer.concat(received)).toEqual(Buffer.from([0, 255, 10, 10]))
  expect(error).toMatchObject({ kind: "transfer_failed", bindingID: fixture.binding().id })
  expect(JSON.stringify(error)).not.toContain("synthetic-secret")
}))

it.live("downstream early close and cancellation kill actual held subprocess", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ stdout: "first\n\n", hold: true })
  yield* fixture.service.bytes(fixture.binding(), { method: "GET", path: "repos/acme/widget/actions/jobs/8/logs" }).pipe(Stream.take(1), Stream.runDrain)
  expect(yield* fixture.handles[0].isRunning).toBe(false)
  const ready = yield* Deferred.make<void>()
  const fiber = yield* fixture.service.bytes(fixture.binding(), { method: "GET", path: "repos/acme/widget/actions/jobs/8/logs" })
    .pipe(Stream.tap(() => Deferred.succeed(ready, undefined)), Stream.runDrain, Effect.forkChild)
  yield* Deferred.await(ready)
  yield* Fiber.interrupt(fiber)
  expect(yield* fixture.handles[1].isRunning).toBe(false)
}), 20_000)

it.effect("absolute raw stream deadline closes held subprocess", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ hold: true })
  const fiber = yield* fixture.service.bytes(fixture.binding(), { method: "GET", path: "repos/acme/widget/actions/jobs/8/logs" })
    .pipe(Stream.runDrain, Effect.flip, Effect.forkChild)
  yield* fixture.ready()
  yield* TestClock.adjust("6 minutes")
  expect((yield* Fiber.join(fiber)).message).toContain("deadline exceeded")
  expect(yield* fixture.handles[0].isRunning).toBe(false)
}), 20_000)

it.effect("watchdog stops child while downstream holds a chunk before consumer cancellation", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ stdout: "first chunk\n\n", hold: true })
  const received = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const fiber = yield* fixture.service.bytes(fixture.binding(), { method: "GET", path: "repos/acme/widget/actions/jobs/8/logs" })
    .pipe(Stream.runForEach(() => Deferred.succeed(received, undefined).pipe(Effect.andThen(Deferred.await(release)))), Effect.flip, Effect.forkChild)
  yield* Deferred.await(received)
  expect(yield* fixture.handles[0].isRunning).toBe(true)
  yield* TestClock.adjust("6 minutes")
  yield* fixture.stopped()
  // Capture before releasing the consumer, then settle it before assertions so
  // a killed mutant cannot hide the failure behind Windows directory cleanup.
  const running = yield* fixture.handles[0].isRunning
  yield* Deferred.succeed(release, undefined)
  const exit = yield* Fiber.await(fiber)
  expect(running).toBe(false)
  expect(Exit.isSuccess(exit)).toBe(true)
  if (Exit.isSuccess(exit)) expect(exit.value.message).toContain("deadline exceeded")
}), 20_000)

it.effect("watchdog handles stdout EOF while exit remains pending", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ stdoutEOF: true, hold: true })
  const fiber = yield* fixture.service.bytes(fixture.binding(), { method: "GET", path: "repos/acme/widget/actions/jobs/8/logs" })
    .pipe(Stream.runDrain, Effect.flip, Effect.forkChild)
  yield* fixture.ready("stdout-eof")
  expect(yield* fixture.handles[0].isRunning).toBe(true)
  yield* TestClock.adjust("6 minutes")
  expect((yield* Fiber.join(fiber)).message).toContain("deadline exceeded")
  expect(yield* fixture.handles[0].isRunning).toBe(false)
}), 20_000)

it.live("GitLab multipart ingress streams bytes intact; name matches prepared filename", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ stdout: ActionsTransportFixture.response(201, '{"id":829,"name":"bundle.bin"}') })
  const bytes = Stream.fromIterable(Array.from({ length: 512 }, () => block))
  expect(yield* fixture.service.upload(fixture.binding(ActionsTransportFixture.gitlab),
    { method: "POST", path: "projects/9347/secure_files", query: { name: "bundle.bin" } },
    { filename: "bundle.bin", bytes })).toMatchObject({ status: 201, data: { id: 829, name: "bundle.bin" } })
  const call = fixture.network.requests.at(-1)
  expect(call?.path).toBe("/api/v4/projects/9347/secure_files?name=bundle.bin")
  expect(call?.size).toBeGreaterThan(block.length * 512)
  expect(call?.chunks).toBeGreaterThan(1)
  expect(call?.prefix.toString("utf8")).toContain('filename="bundle.bin"')
  expect(fixture.handles).toHaveLength(0)
}))

it.live("multipart capability, unsafe filename, name mismatch and GitHub unsupported errors fail closed", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ settings: { token: "" } })
  const request = { method: "POST", path: "projects/9347/secure_files", query: { name: "bundle.bin" } } as const
  const file = { filename: "bundle.bin", bytes: Stream.empty }
  expect((yield* fixture.service.upload(fixture.binding(ActionsTransportFixture.gitlab), request, file).pipe(Effect.flip)).kind).toBe("not_authenticated")
  expect((yield* fixture.service.upload(fixture.binding(), request, file).pipe(Effect.flip)).kind).toBe("capability_unavailable")
  for (const filename of ["../bundle.bin", "bad\r\n.bin", "bad\\file", " bundle.bin ", "different.bin"]) {
    expect((yield* fixture.service.upload(fixture.binding(ActionsTransportFixture.gitlab), request, { ...file, filename }).pipe(Effect.flip)).kind).toBe("invalid_input")
  }
  expect(fixture.handles).toHaveLength(0)
}))

it.live("upload source failure propagates and closes subprocess rather than claiming acceptance", Effect.gen(function* () {
  const fixture = yield* ActionsTransportFixture.fixture({ hold: true })
  const failure = new ActionsError({ kind: "transfer_failed", message: "Ingress interrupted" })
  const error = yield* fixture.service.upload(fixture.binding(ActionsTransportFixture.gitlab),
    { method: "POST", path: "projects/9347/secure_files", query: { name: "bundle.bin" } },
    { filename: "bundle.bin", bytes: Stream.concat(Stream.make(block), Stream.fail(failure)) }).pipe(Effect.flip)
  expect(error).toMatchObject({ kind: "transfer_failed", message: "Ingress interrupted" })
  expect(fixture.handles).toHaveLength(0)
}))
