import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { Cause, Deferred, Effect, Exit, Fiber } from "effect"
import { TestClock } from "effect/testing"
import { SessionSchema } from "@orchestra/core/session"
import { SessionInputTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { run, sourcePath, type Ctx, type Fixture } from "./fixture/lucy-engagement"
import { canonical, reader, refused, type Report } from "./fixture/lucy-engagement-artifacts"
import { completedPrior, decodedFix, fixedText, fixRequest, fixScript, type FixTurn } from "./fixture/lucy-fix-review"
import { saved, stateV4 } from "./fixture/lucy-fix-review-evidence"
import type { FixResult } from "./fixture/lucy-fix-review-schema"
import { nativeSearches, nativeSearchResult, variantScript } from "./fixture/lucy-variants"

const minute = (prior: Report, requestID: string, revision: string) => ({
  ...fixRequest(prior, requestID, revision), timeBoxMinutes: 1,
})

test("one fix deadline covers 50 seconds of capture and its acknowledged CODE continuation, then expires at 60 across reopening", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const prepared = yield* predecessor(root, "fix-deadline-prior")
    const input = minute(prepared.prior.report, "fix-original-deadline", prepared.revision)
    const acquiring = yield* Deferred.make<void>()
    const capture = yield* Deferred.make<void>()
    const entered = yield* Deferred.make<FixTurn>()
    const released = yield* Deferred.make<void>()
    const provider = fixScript({ onTurn: (turn) => turn.index === 1
      ? Deferred.succeed(entered, turn).pipe(Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(released, undefined)))
      : Effect.void })
    const original = yield* root.open((host) => Effect.gen(function* () {
      const pending = yield* host.invoke(input).pipe(Effect.forkChild)
      expect(yield* Effect.raceFirst(Deferred.await(acquiring).pipe(Effect.as(true)),
        Fiber.join(pending).pipe(Effect.as(false))), "the actual prior must lead to new capture before the invocation ends").toBe(true)
      yield* TestClock.adjust("50 seconds")
      yield* Deferred.succeed(capture, undefined)
      expect(yield* Effect.raceFirst(Deferred.await(entered).pipe(Effect.as(true)),
        Fiber.join(pending).pipe(Effect.as(false))), "a real fix verifier continuation must be reached").toBe(true)
      const turn = yield* Deferred.await(entered)
      yield* acknowledgedSearch(host, turn)
      expect((yield* host.execution.active).has(SessionSchema.ID.make(turn.sessionID))).toBe(true)
      yield* TestClock.adjust("9 seconds")
      expect(pending.pollUnsafe()).toBeUndefined()
      expect(yield* Deferred.isDone(released)).toBe(false)
      yield* TestClock.adjust("1 second")
      // The provider finalizer is synchronous; join then awaits real native and filesystem cleanup.
      expect(yield* Deferred.isDone(released)).toBe(true)
      const output = yield* Fiber.join(pending)
      const report = stopped(output, "expired")
      const held = yield* stoppedState(host, report, prepared.revision, prepared.prior.report.reportID, turn)
      expect(provider.turns.map((value) => value.index)).toEqual([0, 1])
      return { text: output.text, report, metadata: canonical(held.row.metadata), calls: root.requests.length }
    }), {
      onGit: (args) => args.includes("rev-parse") && args.includes("--end-of-options") && args.includes(`${prepared.revision}^{commit}`)
        ? Deferred.succeed(acquiring, undefined).pipe(Effect.andThen(Deferred.await(capture))) : undefined,
      stream: provider.stream,
    })
    yield* TestClock.adjust("120 seconds")
    yield* stoppedReplay(root, input, original, prepared.prior)
    expect(provider.turns.map((turn) => turn.index)).toEqual([0, 1])
  })).pipe(Effect.provide(TestClock.layer())))
}, 150_000)

test("interrupting the fix owner preserves its Cause, drains the real verifier and reopens only the cancelled terminal", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const prepared = yield* predecessor(root, "fix-cancel-prior")
    const input = minute(prepared.prior.report, "fix-cancel-owner", prepared.revision)
    const entered = yield* Deferred.make<FixTurn>()
    const released = yield* Deferred.make<void>()
    const provider = fixScript({ onTurn: (turn) => turn.index === 1
      ? Deferred.succeed(entered, turn).pipe(Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(released, undefined)))
      : Effect.void })
    const original = yield* root.open((host) => Effect.gen(function* () {
      const pending = yield* host.invoke(input).pipe(Effect.forkChild)
      expect(yield* Effect.raceFirst(Deferred.await(entered).pipe(Effect.as(true)),
        Fiber.join(pending).pipe(Effect.as(false))), "an unavailable fix route must fail here instead of waiting forever").toBe(true)
      const turn = yield* Deferred.await(entered)
      yield* acknowledgedSearch(host, turn)
      yield* TestClock.adjust("20 seconds")
      yield* Fiber.interrupt(pending)
      expect(yield* Deferred.isDone(released)).toBe(true)
      const exit = pending.pollUnsafe()
      expect(exit !== undefined && Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
      expect((yield* host.execution.active).size).toBe(0)
      const calls = root.requests.length
      const output = yield* host.invoke(input)
      expect(root.requests.length).toBe(calls)
      const report = stopped(output, "cancelled")
      const held = yield* stoppedState(host, report, prepared.revision, prepared.prior.report.reportID, turn)
      expect(provider.turns.map((value) => value.index)).toEqual([0, 1])
      return { text: output.text, report, metadata: canonical(held.row.metadata), calls }
    }), { stream: provider.stream })
    yield* TestClock.adjust("120 seconds")
    yield* stoppedReplay(root, input, original, prepared.prior)
    expect(provider.turns.map((turn) => turn.index)).toEqual([0, 1])
  })).pipe(Effect.provide(TestClock.layer())))
}, 150_000)

test("cancelling an exact fix waiter leaves the owner, native work and original deadline intact", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const prepared = yield* predecessor(root, "fix-waiter-prior")
    const input = minute(prepared.prior.report, "fix-cancel-waiter", prepared.revision)
    const entered = yield* Deferred.make<FixTurn>()
    const released = yield* Deferred.make<void>()
    const provider = fixScript({ onTurn: (turn) => turn.index === 1
      ? Deferred.succeed(entered, turn).pipe(Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(released, undefined)))
      : Effect.void })
    const original = yield* root.open((host) => Effect.gen(function* () {
      const owner = yield* host.invoke(input).pipe(Effect.forkChild)
      expect(yield* Effect.raceFirst(Deferred.await(entered).pipe(Effect.as(true)),
        Fiber.join(owner).pipe(Effect.as(false)))).toBe(true)
      const turn = yield* Deferred.await(entered)
      yield* acknowledgedSearch(host, turn)
      yield* TestClock.adjust("30 seconds")
      const calls = root.requests.length
      const admitted = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
      const waiter = yield* host.invoke(input).pipe(Effect.forkChild)
      yield* Effect.yieldNow
      expect(waiter.pollUnsafe()).toBeUndefined()
      expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(admitted)
      yield* Fiber.interrupt(waiter)
      const exit = waiter.pollUnsafe()
      expect(exit !== undefined && Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
      expect(owner.pollUnsafe()).toBeUndefined()
      expect(yield* Deferred.isDone(released)).toBe(false)
      expect(root.requests.length).toBe(calls)
      expect((yield* host.execution.active).has(SessionSchema.ID.make(turn.sessionID))).toBe(true)
      yield* TestClock.adjust("29 seconds")
      expect(owner.pollUnsafe()).toBeUndefined()
      expect(yield* Deferred.isDone(released)).toBe(false)
      yield* TestClock.adjust("1 second")
      expect(yield* Deferred.isDone(released)).toBe(true)
      const output = yield* Fiber.join(owner)
      const report = stopped(output, "expired")
      const held = yield* stoppedState(host, report, prepared.revision, prepared.prior.report.reportID, turn)
      expect(root.requests.length).toBe(calls)
      return { text: output.text, report, metadata: canonical(held.row.metadata), calls }
    }), { stream: provider.stream })
    yield* TestClock.adjust("120 seconds")
    yield* stoppedReplay(root, input, original, prepared.prior)
    expect(provider.turns.map((turn) => turn.index)).toEqual([0, 1])
  })).pipe(Effect.provide(TestClock.layer())))
}, 150_000)

function predecessor(root: Fixture, requestID: string) {
  return Effect.gen(function* () {
    const prior = yield* root.open((host) => Effect.gen(function* () {
      const result = yield* completedPrior(host, requestID)
      const held = yield* saved(host, result.report.sessionID)
      return { ...result, metadata: canonical(held.row.metadata) }
    }), { stream: variantScript().stream })
    yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), fixedText))
    yield* root.git("add", "--", sourcePath)
    yield* root.git("commit", "-q", "-m", "captured-fix-lifecycle")
    return { prior, revision: yield* root.git("rev-parse", "HEAD") }
  })
}

function acknowledgedSearch(host: Ctx, turn: FixTurn) {
  return Effect.gen(function* () {
    expect(turn.index).toBe(1)
    const calls = yield* nativeSearches(host, turn.sessionID)
    expect(calls).toHaveLength(1)
    const call = calls[0]
    if (!call) return yield* Effect.die("actual fix CODE call missing")
    expect(call.toolCallID).toBe("fix_search")
    const actual = nativeSearchResult(call)
    expect(actual.result.matches.map((match) => [match.path, match.line])).toEqual([[sourcePath, 1]])
    const match = actual.result.matches[0]
    if (!match) return yield* Effect.die("actual fix CODE source match missing")
    expect(match.text).toContain("FIXED-GUARD")
    expect(actual.result.basis.coverage).toMatchObject({ complete: true, skipped: [], binariesSkipped: 0 })
    expect(actual.result.basis.bounds).toMatchObject({ truncated: false, limit: 200 })
    expect(actual.result.next).toBeUndefined()
  })
}

function stopped(output: { readonly type: string; readonly text: string }, status: "cancelled" | "expired") {
  const report = decodedFix(output)
  expect(report.status).toBe(status)
  expect(report.budget.deadlineAt - report.budget.startedAt).toBe(60_000)
  expect(report.notExamined).toContainEqual({ item: "engagement:remaining", reason: status === "expired" ? "time-box" : "cancelled" })
  return report
}

function stoppedState(host: Ctx, report: FixResult, revision: string, priorReportID: string, turn: FixTurn) {
  return Effect.gen(function* () {
    if (!report.source || !report.prior) return yield* Effect.die("captured stopped fix omitted source/prior")
    expect(report.source.commit).toBe(revision)
    expect(report.source.files.map((file) => file.path)).toEqual([sourcePath])
    expect(report.prior.reportID).toBe(priorReportID)
    const held = yield* stateV4(host, report.sessionID)
    expect(held.value.state).toBe("terminal")
    if (held.value.output === undefined || held.value.fix.prior === undefined)
      return yield* Effect.die("terminal fix omitted its durable output/prior")
    expect(held.value.output).toBe(canonical(report))
    expect(held.value.fix.prior).toEqual(report.prior)
    expect(held.value.budget).toEqual(report.budget)
    expect(held.value).not.toHaveProperty("variants")
    expect(held.value.children.filter((child) => child.role === "verifier")).toEqual([{
      id: SessionSchema.ID.make(turn.sessionID), key: `fix:verify:${turn.findingID}`, role: "verifier",
    }])
    expect(held.value.evidence.receiptID).toBeUndefined()
    expect(held.value.evidence.bytes).toBeUndefined()
    expect((yield* host.execution.active).size).toBe(0)
    const owned = new Set(held.value.children.map((child) => child.id))
    const inputs = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
    expect(inputs.filter((entry) => owned.has(entry.session_id) && entry.promoted_seq === null)).toEqual([])
    return held
  })
}

function stoppedReplay(root: Fixture, input: ReturnType<typeof minute>, original: {
  readonly text: string; readonly report: FixResult; readonly metadata: string; readonly calls: number
}, prior: Effect.Success<ReturnType<typeof predecessor>>["prior"]) {
  let gitCalls = 0
  return root.open((host) => Effect.gen(function* () {
    const before = gitCalls
    const inputs = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
    const replay = yield* host.invoke(input)
    expect(replay.text).toBe(original.text)
    expect(decodedFix(replay).budget).toEqual(original.report.budget)
    const unavailable = yield* host.call(reader, { op: "manifest", reportID: original.report.reportID })
    refused(unavailable, "engagement-evidence-unavailable")
    expect(unavailable.text).toContain("terminal-status")
    expect((yield* host.invoke(prior.input)).text).toBe(prior.output.text)
    expect(canonical((yield* saved(host, prior.report.sessionID)).row.metadata)).toBe(prior.metadata)
    expect(root.requests.length).toBe(original.calls)
    expect(gitCalls).toBe(before)
    expect((yield* host.execution.active).size).toBe(0)
    expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(inputs)
    const held = yield* stateV4(host, original.report.sessionID)
    expect(canonical(held.row.metadata)).toBe(original.metadata)
    expect(held.value.evidence.receiptID).toBeUndefined()
    expect(held.value.evidence.bytes).toBeUndefined()
  }), { onGit: () => { gitCalls++ } })
}
