import { expect } from "bun:test"
import { Cause, Deferred, Effect, Exit, Fiber, Stream } from "effect"
import { TestClock } from "effect/testing"
import { ActionsOutput } from "../../src/actions/output"
import { OutputHeaders } from "../../src/actions/output/headers"
import { OutputSigned } from "../../src/actions/output/signed"
import { ActionsError } from "../../src/actions/error"
import { OutputFixture } from "./output-fixture"
import { it } from "../lib/effect"

const f = OutputFixture
const attempts = { "repositories/9347/actions/runs/30433642/attempts/2": f.response({ id: 30433642, run_attempt: 2, repository: { id: 9347 } }) }

it.effect("GH attempt ZIP, job raw log and artifact ZIP use validated ID routes; bytes preserve blank/non-UTF8 content", Effect.gen(function* () {
  const fixture = f.make(f.github, { ...attempts,
    "repositories/9347/actions/jobs/7": f.response({ id: 7, run_id: 30433642, run_attempt: 2, name: "build" }),
    "repositories/9347/actions/artifacts/11": f.response(f.artifact),
  })
  const selections = [{ kind: "runLog", id: "30433642", attempt: 2 },
    { kind: "jobLog", id: "7", runID: "30433642", attempt: 2 },
    { kind: "artifact", id: "11", runID: "30433642" }] as const
  yield* Effect.forEach(selections, (input) => fixture.service.read(f.github, input).pipe(Stream.runCollect,
    Effect.tap((chunks) => Effect.sync(() => expect(Buffer.concat(chunks)).toEqual(Buffer.from(f.bytes))))))
  expect(fixture.transfers.map((request) => request.path)).toEqual([
    "repositories/9347/actions/runs/30433642/attempts/2/logs", "repositories/9347/actions/jobs/7/logs", "repositories/9347/actions/artifacts/11/zip",
  ])
  const before = fixture.transfers.length
  expect(yield* fixture.service.info(f.github, selections[2])).toEqual({ filename: "result.zip", contentType: "application/zip", size: 17, digest: f.artifact.digest })
  expect(fixture.transfers.length).toBe(before)
  expect(yield* fixture.service.info(f.github, selections[0])).toEqual({ filename: "run-30433642-attempt-2-logs.zip", contentType: "application/zip" })
}))

it.effect("wrong run/job/artifact/attempt identities fail before opening bytes; erased/expired outputs and unsupported native kinds fail typed", Effect.gen(function* () {
  const wrong = f.make(f.github, { ...attempts,
    "repositories/9347/actions/jobs/7": f.response({ id: 7, run_id: 30433643, run_attempt: 2, name: "build" }),
    "repositories/9347/actions/artifacts/11": f.response({ ...f.artifact, workflow_run: { id: 30433642, repository_id: 9348 } }),
  })
  expect(yield* wrong.service.read(f.github, { kind: "jobLog", id: "7", runID: "30433642" }).pipe(Stream.runDrain, Effect.flip)).toMatchObject({ kind: "binding_stale" })
  expect(yield* wrong.service.read(f.github, { kind: "artifact", id: "11" }).pipe(Stream.runDrain, Effect.flip)).toMatchObject({ kind: "binding_stale" })
  expect(yield* wrong.service.read(f.github, { kind: "runLog", id: "30433642", attempt: 4 }).pipe(Stream.runDrain, Effect.flip)).toMatchObject({ kind: "binding_stale" })
  expect(yield* wrong.service.read(f.github, { kind: "runLog", id: "30433642", attempt: Number.MAX_SAFE_INTEGER + 1 }).pipe(Stream.runDrain, Effect.flip))
    .toMatchObject({ kind: "invalid_input" })
  expect(wrong.transfers).toEqual([])
  const gl = f.make(f.gitlab, { "projects/21/jobs/8": f.response({ ...f.job, erased_at: "2026-01-01T00:00:00Z" }) })
  expect(yield* gl.service.info(f.gitlab, { kind: "artifact", id: "8" }).pipe(Effect.flip)).toMatchObject({ kind: "not_found" })
  expect(yield* gl.service.info(f.gitlab, { kind: "runLog", id: "287" }).pipe(Effect.flip)).toMatchObject({ kind: "capability_unavailable" })
  expect(yield* gl.service.info(f.gitlab, { kind: "secureFile", id: "8" }).pipe(Effect.flip)).toMatchObject({ kind: "capability_unavailable" })
  expect(yield* gl.service.info(f.gitlab, { kind: "jobLog", id: "8", attempt: 1 }).pipe(Effect.flip)).toMatchObject({ kind: "capability_unavailable" })
  expect(yield* wrong.service.info(f.github, { kind: "artifact", id: "11", attempt: 2 }).pipe(Effect.flip)).toMatchObject({ kind: "capability_unavailable" })
}))

it.effect("GL direct single-file path validates native API path without archive extraction or ref fallback", Effect.gen(function* () {
  const fixture = f.make(f.gitlab, { "projects/21/jobs/8": f.response(f.job) })
  const input = { kind: "artifact", id: "8", runID: "287", path: "reports/result binary.txt" } as const
  yield* fixture.service.read(f.gitlab, input).pipe(Stream.runDrain)
  expect(fixture.transfers[0]).toEqual({ method: "GET", path: "projects/21/jobs/8/artifacts/reports/result%20binary.txt" })
  yield* Effect.forEach(["../secret", "reports//secret", "/absolute", "%2e%2e/secret", "reports\\secret", "reports/a\n"], (path) => fixture.service.read(f.gitlab, { ...input, path })
    .pipe(Stream.runDrain, Effect.flip, Effect.tap((error) => Effect.sync(() => expect(error.kind).toBe("invalid_input")))))
  expect(fixture.transfers).toHaveLength(1)
  yield* fixture.service.read(f.gitlab, { kind: "jobLog", id: "8", runID: "287" }).pipe(Stream.runDrain)
  expect(fixture.transfers[1]).toEqual({ method: "GET", path: "projects/21/jobs/8/trace" })
}))

it.effect("unsolicited native partial ranges cannot masquerade as complete raw downloads", Effect.gen(function* () {
  const fixture = f.make(f.gitlab, { "projects/21/jobs/8": f.response(f.job) })
  const service = ActionsOutput.make({ reader: fixture.reader, transport: { ...fixture.transport,
    open: () => Effect.succeed({ status: 206, headers: { "content-range": "bytes 0-16/100", "content-length": "17" },
      body: Stream.make(f.bytes), close: Effect.void }) } })
  expect(yield* service.read(f.gitlab, { kind: "artifact", id: "8" }).pipe(Stream.runDrain, Effect.flip))
    .toMatchObject({ kind: "transfer_failed", message: "CI output endpoint returned an unrequested partial transfer" })
}))

it.effect("safe output headers retain native length/digest/type/range and sanitize Content-Disposition basename", Effect.gen(function* () {
  const info = OutputHeaders.info(f.gitlab, { filename: "fallback.zip", contentType: "application/zip" }, {
    "content-disposition": "attachment; filename*=UTF-8''..%2F..%2FCON.txt",
    "content-type": "application/octet-stream", "content-length": "17", digest: "sha-256=synthetic-digest",
    "content-range": "bytes 0-16/17", "accept-ranges": "bytes",
  })
  expect(info).toEqual({ filename: "_CON.txt", contentType: "application/octet-stream", size: 17,
    digest: "sha-256=synthetic-digest", contentRange: "bytes 0-16/17", acceptRanges: "bytes" })
  expect(() => OutputHeaders.info(f.gitlab, info, { "content-length": "-1" })).toThrow()
  expect(() => OutputHeaders.info(f.gitlab, info, { "content-disposition": "a\r\nb" })).toThrow()
  expect(OutputSigned.destination(f.gitlab, "https://signed.example/a?signature=synthetic").protocol).toBe("https:")
  const unsafe = ["http://signed.example/a", "https://user:pass@signed.example/a", "https://signed.example/a#fragment", "https://signed.example/a%0d", "https://signed.example/\na"]
  unsafe.forEach((url) =>
    expect(() => OutputSigned.destination(f.gitlab, url)).toThrow())
}))

it.effect("partial raw byte error propagates after emitted bytes, without replay", Effect.gen(function* () {
  const failure = new ActionsError({ kind: "transfer_failed", message: "synthetic partial transfer" })
  const fixture = f.make(f.github, { "repositories/9347/actions/artifacts/11": f.response(f.artifact) }, Stream.concat(Stream.make(f.bytes), Stream.fail(failure)))
  const seen: Uint8Array[] = []
  const error = yield* fixture.service.read(f.github, { kind: "artifact", id: "11" }).pipe(Stream.runForEach((chunk) => Effect.sync(() => seen.push(chunk))), Effect.flip)
  expect(error).toMatchObject({ kind: "transfer_failed", message: failure.message })
  expect(Buffer.concat(seen)).toEqual(Buffer.from(f.bytes))
  expect(fixture.transfers).toHaveLength(1)
}))

it.effect("output watchdog closes GH byte resource scope while downstream holds an emitted chunk", Effect.gen(function* () {
  const opened = yield* Deferred.make<void>()
  const closed = yield* Deferred.make<void>()
  const release = yield* Deferred.make<void>()
  const entered = yield* Deferred.make<void>()
  const seen: Uint8Array[] = []
  const fixture = f.make(f.github, { "repositories/9347/actions/artifacts/11": f.response(f.artifact) })
  const stream = Stream.unwrap(Effect.gen(function* () {
    yield* Effect.acquireRelease(Deferred.succeed(opened, undefined), () => Deferred.succeed(closed, undefined))
    return Stream.make(f.bytes)
  }))
  const service = ActionsOutput.make({ reader: fixture.reader, transport: { ...fixture.transport, bytes: () => stream } })
  const fiber = yield* service.read(f.github, { kind: "artifact", id: "11" }).pipe(Stream.runForEach((chunk) =>
    Effect.sync(() => seen.push(chunk)).pipe(Effect.andThen(Deferred.succeed(entered, undefined)), Effect.andThen(Deferred.await(release)))), Effect.forkChild)
  yield* Deferred.await(opened)
  yield* Deferred.await(entered)
  yield* TestClock.adjust("5 minutes")
  yield* Deferred.await(closed)
  expect(yield* Deferred.isDone(release)).toBe(false)
  yield* Deferred.succeed(release, undefined)
  const exit = yield* Fiber.await(fiber)
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) expect(Cause.findErrorOption(exit.cause)).toMatchObject({ _tag: "Some", value: {
    _tag: "ActionsError", kind: "transfer_failed", bindingID: f.github.id, provider: "github", disposition: "unknown",
    message: "CI output transfer deadline exceeded",
  } })
  expect(Buffer.concat(seen)).toEqual(Buffer.from(f.bytes))
}))

it.effect("output watchdog fails a pending raw pull and closes its upstream resource", Effect.gen(function* () {
  const opened = yield* Deferred.make<void>()
  const closed = yield* Deferred.make<void>()
  const fixture = f.make(f.github, { "repositories/9347/actions/artifacts/11": f.response(f.artifact) }, Stream.unwrap(Effect.gen(function* () {
    yield* Effect.acquireRelease(Deferred.succeed(opened, undefined), () => Deferred.succeed(closed, undefined))
    return Stream.never
  })))
  const fiber = yield* fixture.service.read(f.github, { kind: "artifact", id: "11" }).pipe(Stream.runDrain, Effect.flip, Effect.forkChild)
  yield* Deferred.await(opened)
  yield* TestClock.adjust("5 minutes")
  yield* Deferred.await(closed)
  expect(yield* Fiber.join(fiber)).toMatchObject({
    _tag: "ActionsError", kind: "transfer_failed", bindingID: f.github.id, provider: "github", disposition: "unknown",
    message: "CI output transfer deadline exceeded",
  })
  expect(fixture.transfers).toHaveLength(1)
}))
