import { expect } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Effect, Layer, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { FSUtil } from "@orchestra/core/fs-util"
import { AppProcess } from "@orchestra/core/process"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { AtlasKnowledge } from "@/maestro/atlas-knowledge"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { recordReview, recordValidation } from "@/maestro/validation-record"
import { InstanceStore } from "@/project/instance-store"
import { Session } from "@/session/session"
import { tmpdir } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.empty)

const cases = [
  "distinct-actors", "review-member", "validator-member", "review-parent", "validator-parent",
  "review-project", "validator-project", "self-review", "actor-digest",
] as const

// Commits one file as a fixture author and returns the new HEAD.
const commit = Effect.fn("WorkflowColdReviewTest.commit")(function* (directory: string, file: string, text: string) {
  const git = yield* Git.Service
  const fs = yield* FSUtil.Service
  yield* fs.writeFileString(path.join(directory, file), text)
  const added = yield* git.run(["add", file], { cwd: directory })
  const committed = yield* git.run(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false", "commit", "-m", file], { cwd: directory })
  const head = yield* git.run(["rev-parse", "HEAD"], { cwd: directory })
  if (added.exitCode || committed.exitCode || head.exitCode) throw new Error("fixture commit failed")
  return head.text().trim()
})

// The artifact evidence Lucy echoes back for base..head, computed the way the review tool does.
const evidence = Effect.fn("WorkflowColdReviewTest.evidence")(function* (directory: string, base: string, head: string) {
  const git = yield* Git.Service
  const diff = yield* git.run(["diff", "--binary", "--full-index", "--no-ext-diff", "--no-renames",
    "--src-prefix=a/", "--dst-prefix=b/", base, head, "--", "."], { cwd: directory })
  const names = yield* git.run(["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", base, head, "--", "."],
    { cwd: directory })
  if (diff.exitCode || names.exitCode || diff.truncated || names.truncated)
    throw new Error("fixture artifact acquisition failed")
  return {
    baseSHA: base, headSHA: head, worktree: directory,
    changedPaths: names.text().split("\0").filter(Boolean),
    sha256: createHash("sha256").update(diff.stdout).digest("hex"),
  }
})

// A VALID validation, its committed spec, a context at that head and Lucy's APPROVE plan review, plus the actual
// native cold-review host check bound to them.
const approvedPlan = Effect.fn("WorkflowColdReviewTest.approvedPlan")(function* (directory: string) {
  const sessions = yield* Session.Service
  const session = yield* sessions.create({ agent: "maestro" })
  const events = yield* EventV2Bridge.Service
  const planRevisionID = EventV2.ID.create()
  const contextRecordID = EventV2.ID.create()
  const recorded = yield* recordValidation({
    sessionID: session.id, projectID: session.projectID, planRevisionID, contextRecordID,
    contextHash: "c".repeat(64), workCardID: "cold-review-card", workCard: "Bounded implementation receipt",
    routedMemberID: "backend", validatorID: "maestro", validatorVersion: "cold-review-fixture-v1",
    checks: [{ id: "source", status: "PASS", detail: "bounded source evidence" }],
  })
  const validation = { id: recorded.id, ...Schema.decodeUnknownSync(MaestroEvent.Validation.RecordedV3.data)(recorded) }
  if (!("reviewBaseSHA" in validation)) throw new Error("fixture validation lacks review baseline")
  const head = yield* commit(directory, "cold-review.txt", "reviewed implementation\n")
  yield* events.publish(MaestroEvent.Context.Recorded, {
    id: contextRecordID, sessionID: session.id, projectID: session.projectID, planRevisionID,
    directory: session.directory, mode: "UNGROUNDED", branch: "fixture", headSHA: head,
    changedPaths: [], currentEvidenceIdentityHash: "b".repeat(64), contextHash: "c".repeat(64),
    status: "CURRENT", createdAt: 1,
  }, { id: contextRecordID })
  const review = yield* recordReview({
    sessionID: session.id, validationRecordID: validation.id, workCard: validation.workCard,
    reviewerID: "lucy", reviewMethodVersion: "cold-review-fixture-v1", verdict: "APPROVE",
    findings: [], checks: validation.checks, artifact: yield* evidence(directory, validation.reviewBaseSHA, head),
  })
  const runtime = yield* ArsenalBindings.make
  const check = runtime.withSession(session.id, Effect.gen(function* () {
    const host = yield* ArsenalCompletion.NativeHost
    const coldReview = host?.checks.get("cold-review")
    if (!coldReview) throw new Error("actual native cold-review check missing")
    return yield* coldReview({ sessionID: session.id, projectID: session.projectID,
      directory: session.directory, taskID: "fixture-worker", callID: "fixture-task",
      planID: planRevisionID, token: "fixture-cold-review", stateDirectory: "", ownedPaths: ["cold-review.txt"] })
  }))
  return { session, validation, review, check }
})

const layer = LayerNode.compile(LayerNode.group([filesystem, AppProcess.node, CrossSpawnSpawner.node, AtlasKnowledge.node]))

cases.forEach((variant) => {
  it.live(`native cold review binds independent actor contracts: ${variant}`, () => Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true })
    await AppRuntime.runPromise(Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory: tmp.path })
      yield* Effect.gen(function* () {
        const database = yield* Database.Service
        const { validation, review, check } = yield* approvedPlan(tmp.path)
        expect(review.actor).not.toEqual(validation.actor)
        expect(review.stage).toBe("plan")
        // Positive control traverses real producers, native host, artifact digest and current-tree checks.
        expect(yield* check).toMatchObject({ status: "pass" })
        if (variant === "distinct-actors") return
        if (variant === "self-review") {
          const validationData = Schema.decodeUnknownSync(MaestroEvent.Validation.RecordedV3.data)(validation)
          const reviewData = Schema.decodeUnknownSync(MaestroEvent.Review.ReceivedV2.data)(review)
          yield* database.db.update(EventTable).set({ data: { ...validationData, routedMemberID: "lucy" } })
            .where(eq(EventTable.id, EventV2.ID.make(validation.id))).run().pipe(Effect.orDie)
          yield* database.db.update(EventTable).set({ data: { ...reviewData, routedMemberID: "lucy" } })
            .where(eq(EventTable.id, EventV2.ID.make(review.id))).run().pipe(Effect.orDie)
        }
        if (variant !== "self-review") {
          const target = variant.startsWith("validator-") ? validation : review
          const identity = Schema.decodeUnknownSync(Schema.Struct({
            memberId: Schema.String, projectId: Schema.String, sessionId: Schema.String,
          }))(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(target.actor.bytes))
          const bytes = JSON.stringify({
            ...identity,
            ...(variant.endsWith("member") ? { memberId: variant === "review-member" ? "maestro" : "lucy" } : {}),
            ...(variant.endsWith("parent") ? { sessionId: "ses_other_parent" } : {}),
            ...(variant.endsWith("project") ? { projectId: "other-project" } : {}),
          })
          const row = yield* database.db.select().from(EventTable)
            .where(eq(EventTable.id, EventV2.ID.make(target.id))).get().pipe(Effect.orDie)
          if (!row) throw new Error("fixture actor receipt missing")
          yield* database.db.update(EventTable).set({ data: { ...row.data, actor: {
            version: "rfc8785-v1", bytes,
            sha256: variant === "actor-digest" ? "0".repeat(64) : createHash("sha256").update(bytes).digest("hex"),
          } } }).where(eq(EventTable.id, row.id)).run().pipe(Effect.orDie)
        }
        expect(yield* check.pipe(Effect.flip)).toMatchObject({ reason: "WORKFLOW_COLD_REVIEW_MISSING" })
      }).pipe(Effect.provideService(InstanceRef, instance))
    }).pipe(Effect.scoped, Effect.provide(layer)))
  }), 90000)
})

it.live("the workers' result completes only with a code-stage APPROVE bound to that exact result", () => Effect.promise(async () => {
  await using tmp = await tmpdir({ git: true })
  const directory = tmp.path
  await AppRuntime.runPromise(Effect.gen(function* () {
    const instances = yield* InstanceStore.Service
    const instance = yield* instances.load({ directory })
    yield* Effect.gen(function* () {
      const database = yield* Database.Service
      const { session, validation, review, check } = yield* approvedPlan(directory)
      if (!("reviewBaseSHA" in validation)) throw new Error("fixture validation lacks review baseline")
      const approvedHead = review.artifact.headSHA
      const code = (artifact: unknown, verdict = "APPROVE") => recordReview({
        sessionID: session.id, validationRecordID: validation.id, workCard: validation.workCard,
        reviewerID: "lucy", reviewMethodVersion: "cold-review-fixture-v1", verdict, stage: "code",
        findings: verdict === "APPROVE" ? [] : [{ path: "worker.txt", line: 1, message: "the worker's change is wrong" }],
        checks: validation.checks, artifact,
      })
      // The workers commit their implementation after approval; the plan review cannot cover it.
      const result = yield* commit(directory, "worker.txt", "worker implementation\n")
      expect(yield* check.pipe(Effect.flip)).toMatchObject({ reason: "WORKFLOW_CODE_REVIEW_REQUIRED" })

      // A code review must start at the plan-reviewed head, so it covers exactly what the workers added.
      expect(yield* code(yield* evidence(directory, validation.reviewBaseSHA, result)).pipe(Effect.flip))
        .toMatchObject({ reason: "code-review-base-mismatch" })
      // A code review of a head that is not the current result is refused.
      expect(yield* code({ ...(yield* evidence(directory, approvedHead, result)), headSHA: approvedHead })
        .pipe(Effect.flip)).toMatchObject({ reason: "artifact-context-mismatch" })
      // A code review whose digest does not match the workers' diff is refused.
      expect(yield* code({ ...(yield* evidence(directory, approvedHead, result)), sha256: "0".repeat(64) })
        .pipe(Effect.flip)).toMatchObject({ reason: "artifact-bytes-mismatch" })

      // FIX_FIRST on the result keeps the workflow held.
      const fix = yield* code(yield* evidence(directory, approvedHead, result), "FIX_FIRST")
      expect(fix.stage).toBe("code")
      expect(yield* check.pipe(Effect.flip)).toMatchObject({ reason: "WORKFLOW_CODE_REVIEW_REQUIRED" })

      // The workers fix it; APPROVE bound to the exact new result completes the workflow.
      const fixed = yield* commit(directory, "worker.txt", "fixed worker implementation\n")
      const approved = yield* code(yield* evidence(directory, approvedHead, fixed))
      expect(approved).toMatchObject({ stage: "code", verdict: "APPROVE" })
      expect(approved.id).not.toBe(review.id)
      expect(approved.id).not.toBe(fix.id)
      expect(yield* check).toMatchObject({ status: "pass" })

      // The host recomputes the workers' diff: a receipt whose digest no longer matches it is stale.
      const row = yield* database.db.select().from(EventTable)
        .where(eq(EventTable.id, EventV2.ID.make(approved.id))).get().pipe(Effect.orDie)
      if (!row) throw new Error("fixture code receipt missing")
      yield* database.db.update(EventTable)
        .set({ data: { ...row.data, artifact: { ...approved.artifact, sha256: "0".repeat(64) } } })
        .where(eq(EventTable.id, row.id)).run().pipe(Effect.orDie)
      expect(yield* check.pipe(Effect.flip)).toMatchObject({ reason: "WORKFLOW_COLD_REVIEW_STALE" })
      yield* database.db.update(EventTable).set({ data: row.data }).where(eq(EventTable.id, row.id)).run()
        .pipe(Effect.orDie)
      expect(yield* check).toMatchObject({ status: "pass" })

      // Any later commit is a new result that the approved code review does not cover.
      yield* commit(directory, "worker.txt", "unreviewed change\n")
      expect(yield* check.pipe(Effect.flip)).toMatchObject({ reason: "WORKFLOW_CODE_REVIEW_REQUIRED" })
    }).pipe(Effect.provideService(InstanceRef, instance))
  }).pipe(Effect.scoped, Effect.provide(layer)))
}), 90000)
