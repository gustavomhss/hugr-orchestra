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

cases.forEach((variant) => {
  it.live(`native cold review binds independent actor contracts: ${variant}`, () => Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true })
    await AppRuntime.runPromise(Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory: tmp.path })
      yield* Effect.gen(function* () {
        const sessions = yield* Session.Service
        const session = yield* sessions.create({ agent: "maestro" })
        const git = yield* Git.Service
        const fs = yield* FSUtil.Service
        const events = yield* EventV2Bridge.Service
        const database = yield* Database.Service
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
        yield* fs.writeFileString(path.join(tmp.path, "cold-review.txt"), "reviewed implementation\n")
        const added = yield* git.run(["add", "cold-review.txt"], { cwd: tmp.path })
        const committed = yield* git.run(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
          "-c", "commit.gpgsign=false", "commit", "-m", "reviewed implementation"], { cwd: tmp.path })
        if (added.exitCode || committed.exitCode) throw new Error("fixture artifact commit failed")
        const head = yield* git.run(["rev-parse", "HEAD"], { cwd: tmp.path })
        const diff = yield* git.run(["diff", "--binary", "--full-index", "--no-ext-diff", "--no-renames",
          "--src-prefix=a/", "--dst-prefix=b/", validation.reviewBaseSHA, head.text().trim(), "--", "."], { cwd: tmp.path })
        const names = yield* git.run(["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z",
          validation.reviewBaseSHA, head.text().trim(), "--", "."], { cwd: tmp.path })
        if (head.exitCode || diff.exitCode || names.exitCode || head.truncated || diff.truncated || names.truncated)
          throw new Error("fixture artifact acquisition failed")
        yield* events.publish(MaestroEvent.Context.Recorded, {
          id: contextRecordID, sessionID: session.id, projectID: session.projectID, planRevisionID,
          directory: session.directory, mode: "UNGROUNDED", branch: "fixture", headSHA: head.text().trim(),
          changedPaths: [], currentEvidenceIdentityHash: "b".repeat(64), contextHash: "c".repeat(64),
          status: "CURRENT", createdAt: 1,
        }, { id: contextRecordID })
        const review = yield* recordReview({
          sessionID: session.id, validationRecordID: validation.id, workCard: validation.workCard,
          reviewerID: "lucy", reviewMethodVersion: "cold-review-fixture-v1", verdict: "APPROVE",
          findings: [], checks: validation.checks, artifact: {
            baseSHA: validation.reviewBaseSHA, headSHA: head.text().trim(), worktree: tmp.path,
            changedPaths: names.text().split("\0").filter(Boolean),
            sha256: createHash("sha256").update(diff.stdout).digest("hex"),
          },
        })
        expect(review.actor).not.toEqual(validation.actor)
        const runtime = yield* ArsenalBindings.make
        const check = runtime.withSession(session.id, Effect.gen(function* () {
          const host = yield* ArsenalCompletion.NativeHost
          const coldReview = host?.checks.get("cold-review")
          if (!coldReview) throw new Error("actual native cold-review check missing")
          return yield* coldReview({ sessionID: session.id, projectID: session.projectID,
            directory: session.directory, taskID: "fixture-worker", callID: "fixture-task",
            planID: planRevisionID, token: "fixture-cold-review", stateDirectory: "", ownedPaths: ["cold-review.txt"] })
        }))
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
    }).pipe(Effect.scoped, Effect.provide(LayerNode.compile(LayerNode.group([
      filesystem, AppProcess.node, CrossSpawnSpawner.node,
    ])))))
  }), 90000)
})
