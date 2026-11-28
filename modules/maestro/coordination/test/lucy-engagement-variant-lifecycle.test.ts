import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Cause, Deferred, Effect, Exit, Fiber, Option, Schema } from "effect"
import { TestClock } from "effect/testing"
import { SessionSchema } from "@orchestra/core/session"
import { SessionScope } from "@orchestra/core/session/scope"
import { SessionInputTable, SessionTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ReviewEngagementStoreV2 } from "../src/v2/tools/review-engagement-store"
import { ReviewEngagementPolicyV2 } from "../src/v2/workflow/review-engagement-policy"
import { run, sourcePath, sourceText, type Ctx, type Fixture } from "./fixture/lucy-engagement"
import { canonical, decoded, reader, receipt, refused, request, type Report } from "./fixture/lucy-engagement-artifacts"
import { StateV3 } from "./fixture/lucy-variant-schema"
import { fullSearch, nativeSearches, nativeSearchResult, variantScript, type VariantTurn } from "./fixture/lucy-variants"

const minute = (id: string) => ({ ...request(id), timeBoxMinutes: 1 })
const strict = { onExcessProperty: "error" } as const

test("the original 50+9+1 second budget interrupts a real variant after its acknowledged search and replays only expiry", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const acquiring = yield* Deferred.make<void>()
    const capture = yield* Deferred.make<void>()
    const entered = yield* Deferred.make<VariantTurn>()
    const released = yield* Deferred.make<void>()
    const input = minute("variant-original-deadline")
    const provider = variantScript({ onTurn: (turn) => turn.kind === "variant-proposal" && turn.index === 1
      ? Deferred.succeed(entered, turn).pipe(Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(released, undefined)))
      : Effect.void })
    const original = yield* root.open((host) => Effect.gen(function* () {
      const pending = yield* host.invoke(input).pipe(Effect.forkChild)
      expect(yield* Effect.raceFirst(Deferred.await(acquiring).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)))).toBe(true)
      yield* TestClock.adjust("50 seconds")
      yield* Deferred.succeed(capture, undefined)
      const reached = yield* Effect.raceFirst(Deferred.await(entered).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)))
      expect(provider.turns.some((turn) => turn.kind === "verify"), "the actual initial independent verifier must run").toBe(true)
      expect(reached, "the new stage must be reached before the original invocation completes").toBe(true)
      const turn = yield* Deferred.await(entered)
      yield* completeSearch(host, turn.sessionID, [1])
      const active = yield* host.execution.active
      expect(active.has(SessionSchema.ID.make(turn.sessionID))).toBe(true)
      yield* TestClock.adjust("9 seconds")
      expect(pending.pollUnsafe()).toBeUndefined()
      expect(yield* Deferred.isDone(released)).toBe(false)
      yield* TestClock.adjust("1 second")
      // The synchronous provider finalizer proves expiry at t=60; join still awaits real native cleanup.
      expect(yield* Deferred.isDone(released)).toBe(true)
      const output = yield* Fiber.join(pending)
      const report = stopped(output, "expired")
      expect(report.source?.commit).toBe(root.head)
      expect((yield* host.execution.active).size).toBe(0)
      const held = yield* saved(host, report.sessionID)
      expect(held.value.variants.reservations).toHaveLength(1)
      expect(held.value.variants.reservations[0]?.status).toBe("reserved")
      expect(held.value.evidence?.receiptID).toBeUndefined()
      expect(held.value.evidence?.bytes).toBeUndefined()
      return { text: output.text, report, metadata: canonical(held.row.metadata), calls: root.requests.length }
    }), {
      onGit: (args) => args.includes("rev-parse") && args.includes("--end-of-options") && args.includes("HEAD^{commit}")
        ? Deferred.succeed(acquiring, undefined).pipe(Effect.andThen(Deferred.await(capture))) : undefined,
      stream: provider.stream,
    })
    yield* TestClock.adjust("120 seconds")
    yield* stoppedReplay(root, input, original)
    expect(provider.proposals).toHaveLength(1)
    expect(provider.verifiers).toEqual([])
  })).pipe(Effect.provide(TestClock.layer())))
}, 150_000)

test("owner interruption in a real independent variant verifier preserves its Cause, drains ownership and never publishes a receipt", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const extra = 'export const variantValue = "VARIANT-CANCELLED"'
    yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), sourceText + extra + "\n"))
    yield* root.git("add", "--", sourcePath)
    yield* root.git("commit", "-q", "-m", "captured-variant-cancellation")
    const revision = yield* root.git("rev-parse", "HEAD")
    const input = { ...minute("variant-cancel-owner"), revision }
    const entered = yield* Deferred.make<VariantTurn>()
    const released = yield* Deferred.make<void>()
    const provider = variantScript({
      generations: [{ search: fullSearch("sharedValue|variantValue"), candidates: [{
        path: sourcePath, line: 2, endLine: 2, severity: "P1", trigger: "The second declaration has the same captured invariant.", quote: extra,
      }] }],
      onTurn: (turn) => turn.kind === "variant-verify" && turn.index === 0
        ? Deferred.succeed(entered, turn).pipe(Effect.andThen(Effect.never), Effect.ensuring(Deferred.succeed(released, undefined)))
        : Effect.void,
    })
    const original = yield* root.open((host) => Effect.gen(function* () {
      const pending = yield* host.invoke(input).pipe(Effect.forkChild)
      const reached = yield* Effect.raceFirst(Deferred.await(entered).pipe(Effect.as(true)), Fiber.join(pending).pipe(Effect.as(false)))
      expect(provider.turns.some((turn) => turn.kind === "verify")).toBe(true)
      expect(reached, "the baseline must fail an assertion instead of waiting for an absent verifier stage").toBe(true)
      const turn = yield* Deferred.await(entered)
      expect(provider.proposals).toHaveLength(1)
      const proposal = provider.proposals[0]
      if (!proposal) return yield* Effect.die("actual variant proposal missing")
      expect(turn.sessionID).not.toBe(proposal.sessionID)
      expect(provider.turns.filter((entry) => entry.kind === "verify").every((entry) => entry.sessionID !== turn.sessionID)).toBe(true)
      yield* completeSearch(host, proposal.sessionID, [1, 2])
      yield* Fiber.interrupt(pending)
      expect(yield* Deferred.isDone(released)).toBe(true)
      expect((yield* host.execution.active).size).toBe(0)
      const exit = pending.pollUnsafe()
      expect(exit !== undefined && Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause)).toBe(true)
      const output = yield* host.invoke(input)
      const report = stopped(output, "cancelled")
      expect(report.source?.commit).toBe(revision)
      const held = yield* saved(host, report.sessionID)
      expect(held.value.variants.reservations).toHaveLength(1)
      expect(held.value.variants.reservations[0]?.status).toBe("reserved")
      expect(held.value.evidence?.receiptID).toBeUndefined()
      return { text: output.text, report, metadata: canonical(held.row.metadata), calls: root.requests.length }
    }), { stream: provider.stream })
    yield* TestClock.adjust("120 seconds")
    yield* stoppedReplay(root, input, original)
    expect(provider.proposals).toHaveLength(1)
    expect(provider.verifiers).toHaveLength(1)
  })).pipe(Effect.provide(TestClock.layer())))
}, 150_000)

test("cancelling an exact waiter during variants leaves the owner and its original deadline intact", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const entered = yield* Deferred.make<VariantTurn>()
    const release = yield* Deferred.make<void>()
    const released = yield* Deferred.make<void>()
    const input = minute("variant-cancel-follower")
    const provider = variantScript({ onTurn: (turn) => turn.kind === "variant-proposal" && turn.index === 1
      ? Deferred.succeed(entered, turn).pipe(Effect.andThen(Deferred.await(release)), Effect.ensuring(Deferred.succeed(released, undefined)))
      : Effect.void })
    yield* root.open((host) => Effect.gen(function* () {
      const owner = yield* host.invoke(input).pipe(Effect.forkChild)
      yield* Effect.gen(function* () {
        expect(yield* Effect.raceFirst(Deferred.await(entered).pipe(Effect.as(true)), Fiber.join(owner).pipe(Effect.as(false)))).toBe(true)
        const turn = yield* Deferred.await(entered)
        yield* completeSearch(host, turn.sessionID, [1])
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
        yield* TestClock.adjust("29 seconds")
        expect(owner.pollUnsafe()).toBeUndefined()
        yield* Deferred.succeed(release, undefined)
        const output = yield* Fiber.join(owner)
        const report = decoded(output)
        expect(report.status).toBe("completed")
        expect(report.budget.deadlineAt - report.budget.startedAt).toBe(60_000)
        expect(yield* Deferred.isDone(released)).toBe(true)
        expect((yield* host.execution.active).size).toBe(0)
        const evidence = yield* receipt(host, report)
        expect(evidence.value.schema).toBe("review-engagement-evidence-v2")
        if (evidence.value.schema !== "review-engagement-evidence-v2") return yield* Effect.die("variant receipt missing")
        expect(evidence.value.variants.stop).toBe("no-new-matches")
        expect(evidence.value.variants.generations).toHaveLength(1)
        expect(provider.proposals).toHaveLength(1)
        const count = root.requests.length
        expect((yield* host.invoke(input)).text).toBe(output.text)
        expect(root.requests.length).toBe(count)
      }).pipe(Effect.ensuring(Deferred.succeed(release, undefined)))
    }), { stream: provider.stream })
  })).pipe(Effect.provide(TestClock.layer())))
}, 150_000)

test("a variant and another audit's real lenses share the same two native execution permits", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const entered = yield* Deferred.make<VariantTurn>()
    const releaseVariant = yield* Deferred.make<void>()
    const releaseLenses = yield* Deferred.make<void>()
    const firstLens = yield* Deferred.make<VariantTurn>()
    const secondLens = yield* Deferred.make<VariantTurn>()
    const lensIDs: string[] = []
    let observe: ((turn: VariantTurn) => Effect.Effect<void>) | undefined
    let heldVariant: string | undefined
    const provider = variantScript({ onTurn: (turn) => observe?.(turn) ?? Effect.void })
    yield* root.open((host) => Effect.gen(function* () {
      const a = minute("variant-concurrent-a")
      const b = minute("variant-concurrent-b")
      const bIdentity = ReviewEngagementStoreV2.identity(host.parent, Schema.decodeUnknownSync(ReviewEngagementPolicyV2.Input)(b))
      const snapshots: string[][] = []
      observe = (turn) => Effect.gen(function* () {
        snapshots.push([...(yield* host.execution.active)])
        if (turn.kind === "variant-proposal" && turn.index === 1 && heldVariant === undefined) {
          heldVariant = turn.sessionID
          yield* Deferred.succeed(entered, turn)
          return yield* Deferred.await(releaseVariant)
        }
        if (turn.kind !== "lens" || turn.index !== 0) return
        const native = yield* host.sessions.get(SessionSchema.ID.make(turn.sessionID))
        if (native.parentID !== bIdentity.leadID) return
        lensIDs.push(turn.sessionID)
        if (lensIDs.length === 1) yield* Deferred.succeed(firstLens, turn)
        if (lensIDs.length === 2) yield* Deferred.succeed(secondLens, turn)
        yield* Deferred.await(releaseLenses)
      }).pipe(Effect.orDie)
      const ownerA = yield* host.invoke(a).pipe(Effect.forkChild)
      yield* Effect.gen(function* () {
        expect(yield* Effect.raceFirst(Deferred.await(entered).pipe(Effect.as(true)), Fiber.join(ownerA).pipe(Effect.as(false)))).toBe(true)
        const variant = yield* Deferred.await(entered)
        yield* completeSearch(host, variant.sessionID, [1])
        const ownerB = yield* host.invoke(b).pipe(Effect.forkChild)
        expect(yield* Effect.raceFirst(Deferred.await(firstLens).pipe(Effect.as(true)), Fiber.join(ownerB).pipe(Effect.as(false)))).toBe(true)
        const lens = yield* Deferred.await(firstLens)
        const ready = yield* Effect.raceFirst(Effect.gen(function* () {
          while (true) {
            const children = yield* host.db.select().from(SessionTable).where(eq(SessionTable.parent_id, bIdentity.leadID)).all().pipe(Effect.orDie)
            const scoped = children.filter((row) => {
              const value = Schema.decodeUnknownOption(SessionScope.State)(row.metadata?.scope)
              return Option.isSome(value) && value.value.scope.skills.entry.startsWith("lucy-lens-")
            })
            if (scoped.length >= 2) return true
            yield* Effect.sleep("10 millis")
          }
        }), Fiber.join(ownerB).pipe(Effect.as(false)))
        expect(ready, "at least two real B lens Sessions must be narrowed before the negative window").toBe(true)
        // A short bounded real window lets eligible native brief IO finish while both occupied slots stay held.
        expect(yield* Effect.raceFirst(Effect.sleep("200 millis").pipe(Effect.as(true)),
          Effect.raceFirst(Fiber.join(ownerA), Fiber.join(ownerB)).pipe(Effect.as(false)))).toBe(true)
        expect(yield* Deferred.isDone(secondLens)).toBe(false)
        expect(lensIDs).toHaveLength(1)
        expect([...(yield* host.execution.active)].sort()).toEqual([variant.sessionID, lens.sessionID].sort())
        expect(Math.max(...snapshots.map((active) => active.length))).toBeLessThanOrEqual(2)
        yield* Deferred.succeed(releaseVariant, undefined)
        expect(yield* Effect.raceFirst(Deferred.await(secondLens).pipe(Effect.as(true)), Fiber.join(ownerB).pipe(Effect.as(false)))).toBe(true)
        expect(yield* Deferred.isDone(releaseLenses)).toBe(false)
        expect((yield* host.execution.active).has(SessionSchema.ID.make(lens.sessionID))).toBe(true)
        yield* Deferred.succeed(releaseLenses, undefined)
        const outputs = yield* Effect.all([Fiber.join(ownerA), Fiber.join(ownerB)])
        for (const output of outputs) {
          const report = decoded(output)
          expect(report.status).toBe("completed")
          expect(report.budget.deadlineAt - report.budget.startedAt).toBe(60_000)
          const evidence = yield* receipt(host, report)
          expect(evidence.value.schema).toBe("review-engagement-evidence-v2")
        }
        expect(new Set(outputs.map((output) => decoded(output).sessionID)).size).toBe(2)
        expect(Math.max(...snapshots.map((active) => active.length))).toBe(2)
        expect((yield* host.execution.active).size).toBe(0)
      }).pipe(Effect.ensuring(Effect.all([Deferred.succeed(releaseVariant, undefined), Deferred.succeed(releaseLenses, undefined)])))
    }), { stream: provider.stream })
  })))
}, 150_000)

function completeSearch(host: Ctx, sessionID: string, lines: readonly number[]) {
  return Effect.gen(function* () {
    const calls = yield* nativeSearches(host, sessionID)
    expect(calls).toHaveLength(1)
    const call = calls[0]
    if (!call) return yield* Effect.die("completed native search missing")
    const actual = nativeSearchResult(call)
    expect(actual.result.matches.map((match) => [match.path, match.line])).toEqual(lines.map((line) => [sourcePath, line]))
    expect(actual.result.basis.coverage).toMatchObject({ complete: true, skipped: [], binariesSkipped: 0 })
    expect(actual.result.basis.bounds).toMatchObject({ truncated: false, limit: 200 })
    expect(actual.result.next).toBeUndefined()
  })
}

function stopped(output: { readonly type: string; readonly text: string }, status: "expired" | "cancelled") {
  const report = decoded(output)
  expect(report.status).toBe(status)
  expect(report.budget.deadlineAt - report.budget.startedAt).toBe(60_000)
  expect(report.report).toBeUndefined()
  expect(report.citations).toEqual([])
  expect(report.notExamined).toContainEqual({ item: "engagement:evidence-publication", reason: status === "expired" ? "time-box" : "cancelled" })
  return report
}

function saved(host: Ctx, sessionID: SessionSchema.ID) {
  return Effect.gen(function* () {
    const row = yield* host.db.select().from(SessionTable).where(eq(SessionTable.id, sessionID)).get().pipe(Effect.orDie)
    if (!row) return yield* Effect.die("native engagement lead missing")
    return { row, value: Schema.decodeUnknownSync(StateV3)(row.metadata?.lucyEngagementV1, strict) }
  })
}

function stoppedReplay(root: Fixture, input: ReturnType<typeof minute>, original: {
  readonly text: string; readonly report: Report; readonly metadata: string; readonly calls: number
}) {
  let gitCalls = 0
  return root.open((host) => Effect.gen(function* () {
    const before = gitCalls
    const admitted = yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)
    expect((yield* host.invoke(input)).text).toBe(original.text)
    const unavailable = yield* host.call(reader, { op: "manifest", reportID: original.report.reportID })
    refused(unavailable, "engagement-evidence-unavailable")
    expect(unavailable.text).toContain("terminal-status")
    expect(root.requests.length).toBe(original.calls)
    expect(gitCalls).toBe(before)
    expect((yield* host.execution.active).size).toBe(0)
    expect(yield* host.db.select().from(SessionInputTable).all().pipe(Effect.orDie)).toEqual(admitted)
    const current = yield* saved(host, original.report.sessionID)
    expect(canonical(current.row.metadata)).toBe(original.metadata)
    expect(current.value.evidence?.receiptID).toBeUndefined()
    expect(current.value.evidence?.bytes).toBeUndefined()
  }), { onGit: () => { gitCalls++ } })
}
