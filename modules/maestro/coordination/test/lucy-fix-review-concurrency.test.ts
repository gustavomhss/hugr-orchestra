import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Deferred, Effect, Fiber, Option, Schema } from "effect"
import { SessionSchema } from "@orchestra/core/session"
import { SessionScope } from "@orchestra/core/session/scope"
import { SessionTable } from "@orchestra/core/session/sql"
import { expectSpawn } from "@orchestra/core/test/fixture/omni-expect"
import { ReviewEngagementStoreV2 } from "../src/v2/tools/review-engagement-store"
import { ReviewEngagementPolicyV2 } from "../src/v2/workflow/review-engagement-policy"
import { run, sourcePath } from "./fixture/lucy-engagement"
import { canonical, decoded, receipt, request } from "./fixture/lucy-engagement-artifacts"
import { completedPrior, decodedFix, fixedText, fixRequest, fixScript, type FixTurn } from "./fixture/lucy-fix-review"
import { fixReceipt, saved, stateV4 } from "./fixture/lucy-fix-review-evidence"
import { initialCandidate, nativeSearches, nativeSearchResult, variantScript, type VariantTurn } from "./fixture/lucy-variants"

test("a fix verifier and another audit's eligible lenses share the same two native execution permits", () => {
  expectSpawn(import.meta.path)
  return Effect.runPromise(run((root) => Effect.gen(function* () {
    const prior = yield* root.open((host) => Effect.gen(function* () {
      const result = yield* completedPrior(host, "fix-concurrency-prior")
      return { ...result, metadata: canonical((yield* saved(host, result.report.sessionID)).row.metadata) }
    }), { stream: variantScript().stream })
    yield* Effect.promise(() => fs.writeFile(path.join(root.directory, sourcePath), fixedText))
    yield* root.git("add", "--", sourcePath)
    yield* root.git("commit", "-q", "-m", "captured-fix-concurrency")
    const revision = yield* root.git("rev-parse", "HEAD")
    const entered = yield* Deferred.make<FixTurn>()
    const releaseFix = yield* Deferred.make<void>()
    const releaseLenses = yield* Deferred.make<void>()
    const firstLens = yield* Deferred.make<VariantTurn>()
    const secondLens = yield* Deferred.make<VariantTurn>()
    const lensIDs: string[] = []
    const snapshots: SessionSchema.ID[][] = []
    let observeFix: ((turn: FixTurn) => Effect.Effect<void>) | undefined
    let observeAudit: ((turn: VariantTurn) => Effect.Effect<void>) | undefined
    const audit = variantScript({ initial: [{ ...initialCandidate, quote: fixedText.trimEnd() }],
      onTurn: (turn) => observeAudit?.(turn) ?? Effect.void })
    const provider = fixScript({ prior: audit.stream, onTurn: (turn) => observeFix?.(turn) ?? Effect.void })
    yield* root.open((host) => Effect.gen(function* () {
      const fix = fixRequest(prior.report, "fix-shared-permit", revision)
      const ordinary = { ...request("audit-shared-fix-permit"), revision }
      const identity = ReviewEngagementStoreV2.identity(host.parent, Schema.decodeUnknownSync(ReviewEngagementPolicyV2.Input)(ordinary))
      observeFix = (turn) => Effect.gen(function* () {
        snapshots.push([...(yield* host.execution.active)])
        if (turn.index !== 1) return
        yield* Deferred.succeed(entered, turn)
        yield* Deferred.await(releaseFix)
      })
      observeAudit = (turn) => Effect.gen(function* () {
        snapshots.push([...(yield* host.execution.active)])
        if (turn.kind !== "lens" || turn.index !== 0) return
        const native = yield* host.sessions.get(SessionSchema.ID.make(turn.sessionID))
        if (native.parentID !== identity.leadID) return
        lensIDs.push(turn.sessionID)
        if (lensIDs.length === 1) yield* Deferred.succeed(firstLens, turn)
        if (lensIDs.length === 2) yield* Deferred.succeed(secondLens, turn)
        yield* Deferred.await(releaseLenses)
      }).pipe(Effect.orDie)
      const ownerFix = yield* host.invoke(fix).pipe(Effect.forkChild)
      yield* Effect.gen(function* () {
        expect(yield* Effect.raceFirst(Deferred.await(entered).pipe(Effect.as(true)),
          Fiber.join(ownerFix).pipe(Effect.as(false))), "the unavailable predecessor must fail before waiting for a nonexistent verifier").toBe(true)
        const verifier = yield* Deferred.await(entered)
        const searches = yield* nativeSearches(host, verifier.sessionID)
        expect(searches).toHaveLength(1)
        const search = searches[0]
        if (!search) return yield* Effect.die("fix verifier did not complete its actual CODE control")
        const actual = nativeSearchResult(search)
        expect(actual.result.matches.map((match) => [match.path, match.line])).toEqual([[sourcePath, 1]])
        expect(actual.result.basis.coverage).toMatchObject({ complete: true, skipped: [], binariesSkipped: 0 })
        expect(actual.result.basis.bounds).toMatchObject({ truncated: false, limit: 200 })
        const ownerAudit = yield* host.invoke(ordinary).pipe(Effect.forkChild)
        expect(yield* Effect.raceFirst(Deferred.await(firstLens).pipe(Effect.as(true)),
          Fiber.join(ownerAudit).pipe(Effect.as(false)))).toBe(true)
        const lens = yield* Deferred.await(firstLens)
        const ready = yield* Effect.raceFirst(Effect.gen(function* () {
          while (true) {
            const children = yield* host.db.select().from(SessionTable).where(eq(SessionTable.parent_id, identity.leadID)).all().pipe(Effect.orDie)
            const eligible = children.filter((row) => {
              const scope = Schema.decodeUnknownOption(SessionScope.State)(row.metadata?.scope)
              return Option.isSome(scope) && scope.value.scope.skills.entry.startsWith("lucy-lens-")
            })
            if (eligible.length >= 2) return true
            yield* Effect.sleep("10 millis")
          }
        }), Fiber.join(ownerAudit).pipe(Effect.as(false)))
        expect(ready, "two real scoped audit lenses must be eligible before measuring the occupied slots").toBe(true)
        // Both occupied Sessions stay suspended while actual brief IO for the other eligible lens gets a turn.
        expect(yield* Effect.raceFirst(Effect.sleep("200 millis").pipe(Effect.as(true)),
          Effect.raceFirst(Fiber.join(ownerFix), Fiber.join(ownerAudit)).pipe(Effect.as(false)))).toBe(true)
        expect(yield* Deferred.isDone(secondLens)).toBe(false)
        expect(lensIDs).toHaveLength(1)
        expect([...(yield* host.execution.active)].sort()).toEqual([
          SessionSchema.ID.make(verifier.sessionID), SessionSchema.ID.make(lens.sessionID),
        ].sort())
        expect(Math.max(...snapshots.map((active) => active.length))).toBeLessThanOrEqual(2)
        yield* Deferred.succeed(releaseFix, undefined)
        expect(yield* Effect.raceFirst(Deferred.await(secondLens).pipe(Effect.as(true)),
          Fiber.join(ownerAudit).pipe(Effect.as(false)))).toBe(true)
        expect(yield* Deferred.isDone(releaseLenses)).toBe(false)
        expect((yield* host.execution.active).has(SessionSchema.ID.make(lens.sessionID))).toBe(true)
        expect(lensIDs).toHaveLength(2)
        yield* Deferred.succeed(releaseLenses, undefined)
        const fixed = decodedFix(yield* Fiber.join(ownerFix))
        const audited = decoded(yield* Fiber.join(ownerAudit))
        expect(fixed.status).toBe("completed")
        expect(fixed.dispositions.map((item) => item.disposition)).toEqual(["resolved"])
        expect(audited.status).toBe("completed")
        expect(fixed.sessionID).not.toBe(audited.sessionID)
        expect(fixed.budget.deadlineAt - fixed.budget.startedAt).toBe(300_000)
        expect(audited.budget.deadlineAt - audited.budget.startedAt).toBe(300_000)
        const evidence = yield* fixReceipt(host, fixed)
        expect(evidence.value.examinations.map((item) => item.verifierSessionID)).toEqual([SessionSchema.ID.make(verifier.sessionID)])
        const calls = evidence.value.operations.filter((operation) => operation.kind === "code")
        expect(calls).toHaveLength(1)
        const call = calls[0]
        if (!call) return yield* Effect.die("completed fix omitted its actual CODE observation")
        expect(call.sessionID).toBe(verifier.sessionID)
        expect(call.nativeSettlement).toEqual({ status: "completed", messageID: call.assistantMessageID })
        const held = yield* stateV4(host, fixed.sessionID)
        expect(held.value.children.filter((child) => child.role === "verifier")).toEqual([{
          id: SessionSchema.ID.make(verifier.sessionID), key: `fix:verify:${verifier.findingID}`, role: "verifier",
        }])
        expect(held.value).not.toHaveProperty("variants")
        const auditEvidence = yield* receipt(host, audited)
        expect(auditEvidence.value.schema).toBe("review-engagement-evidence-v2")
        if (auditEvidence.value.schema !== "review-engagement-evidence-v2") return yield* Effect.die("ordinary audit receipt changed")
        expect(auditEvidence.value.variants.stop).toBe("no-new-matches")
        expect(auditEvidence.value.variants.generations).toHaveLength(1)
        expect(provider.turns.map((turn) => turn.index)).toEqual([0, 1])
        expect(audit.proposals).toHaveLength(1)
        const before = root.requests.length
        expect((yield* host.invoke(prior.input)).text).toBe(prior.output.text)
        expect(canonical((yield* saved(host, prior.report.sessionID)).row.metadata)).toBe(prior.metadata)
        expect(root.requests.length).toBe(before)
        expect(Math.max(...snapshots.map((active) => active.length))).toBe(2)
        expect((yield* host.execution.active).size).toBe(0)
      }).pipe(Effect.ensuring(Effect.all([Deferred.succeed(releaseFix, undefined), Deferred.succeed(releaseLenses, undefined)])))
    }), { stream: provider.stream })
  })))
}, 150_000)
