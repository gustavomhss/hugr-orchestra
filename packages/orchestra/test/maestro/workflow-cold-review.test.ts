import { expect } from "bun:test"
import { createHash } from "node:crypto"
import path from "node:path"
import { rm } from "node:fs/promises"
import { eq } from "drizzle-orm"
import { Effect, FileSystem, Layer, Schema } from "effect"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { EventTable } from "@orchestra/core/event/sql"
import { LayerNode } from "@orchestra/core/effect/layer-node"
import { filesystem } from "@orchestra/core/effect/app-node-platform"
import { FSUtil } from "@orchestra/core/fs-util"
import { ModelV2 } from "@orchestra/core/model"
import { AppProcess } from "@orchestra/core/process"
import { ProviderV2 } from "@orchestra/core/provider"
import { CrossSpawnSpawner } from "@orchestra/core/cross-spawn-spawner"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { RelayArm } from "@orchestra/schema/relay-arm"
import { Config } from "@/config/config"
import { AppRuntime } from "@/effect/app-runtime"
import { InstanceRef } from "@/effect/instance-ref"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { ArsenalBindings } from "@/maestro/arsenal-bindings"
import { AtlasKnowledge } from "@/maestro/atlas-knowledge"
import { ArsenalCompletion } from "@/maestro/arsenal-completion"
import { CodeReview } from "@/maestro/code-review"
import { workflowRevisionBody } from "@/maestro/plan-revision"
import { recordReview, recordValidation, REVIEW_ARTIFACT_MAX_BYTES } from "@/maestro/validation-record"
import { InstanceStore } from "@/project/instance-store"
import { MessageID, PartID } from "@/session/schema"
import { Session } from "@/session/session"
import { MaestroRequestReviewTool } from "@/tool/maestro-review"
import type { TaskPromptOps } from "@/tool/task"
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
  yield* write(directory, file, text)
  const added = yield* git.run(["add", file], { cwd: directory })
  const committed = yield* git.run(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid",
    "-c", "commit.gpgsign=false", "commit", "-m", file], { cwd: directory })
  const head = yield* git.run(["rev-parse", "HEAD"], { cwd: directory })
  if (added.exitCode || committed.exitCode || head.exitCode) throw new Error("fixture commit failed")
  return head.text().trim()
})

// A worker edit: written to the working tree and never committed, as the worker sandbox requires.
const write = Effect.fn("WorkflowColdReviewTest.write")(function* (directory: string, file: string, text: string) {
  const fs = yield* FSUtil.Service
  yield* fs.writeWithDirs(path.join(directory, file), text)
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

// A V3 plan revision bound to a workflow whose approved writePaths are `src`, a VALID validation, its committed spec,
// a context at that head and Lucy's APPROVE plan review, plus the actual native cold-review host check bound to them.
const approvedPlan = Effect.fn("WorkflowColdReviewTest.approvedPlan")(function* (directory: string) {
  const sessions = yield* Session.Service
  const session = yield* sessions.create({ agent: "maestro" })
  const events = yield* EventV2Bridge.Service
  const field = { value: "Repair the price rounding.", source: "maestro" as const }
  const revision = Schema.decodeUnknownSync(MaestroEvent.PlanRevision.RecordedV3.data)(workflowRevisionBody({
    sessionID: session.id, admissionMessageID: "msg_admission", methodVersion: "draft-plan-v3", goal: field,
    acceptance: [field], scope: [field], constraints: [], reviewRequirement: field, contextRequirement: "PENDING",
    assumptions: [], risks: [], status: "PROPOSED", createdAt: 1,
  }, Schema.decodeUnknownSync(RelayArm.WorkflowDefinition)({
    publication: { projectID: session.projectID, documentID: "packet", activeVersionID: "version-1",
      immutableVersionBodyChecksum: "1".repeat(64), livePublicationChecksum: "2".repeat(64) },
    materialization: { schemaIdentifier: "RelaySprint.Sprint", digest: "3".repeat(64), byteLength: 128 },
    resolvedSkills: [], parameters: {}, writePaths: ["src"],
  })))
  yield* events.publish(MaestroEvent.PlanRevision.RecordedV3, revision, { id: EventV2.ID.make(revision.id) })
  const planRevisionID = revision.id
  const contextRecordID = EventV2.ID.create()
  const recorded = yield* recordValidation({
    sessionID: session.id, projectID: session.projectID, planRevisionID, contextRecordID,
    contextHash: "c".repeat(64), workCardID: "cold-review-card", workCard: "Bounded implementation receipt",
    routedMemberID: "backend", validatorID: "maestro", validatorVersion: "cold-review-fixture-v1",
    checks: [{ id: "source", status: "PASS", detail: "bounded source evidence" }],
  })
  const validation = { id: recorded.id, ...Schema.decodeUnknownSync(MaestroEvent.Validation.RecordedV3.data)(recorded) }
  if (!("reviewBaseSHA" in validation)) throw new Error("fixture validation lacks review baseline")
  // The repair plan's committed spec; the implementation it plans does not exist yet.
  const head = yield* commit(directory, "price.test.txt", "price rounds half up\n")
  yield* events.publish(MaestroEvent.Context.Recorded, {
    id: contextRecordID, sessionID: session.id, projectID: session.projectID, planRevisionID,
    directory: session.directory, mode: "UNGROUNDED", branch: "fixture", headSHA: head,
    changedPaths: [], currentEvidenceIdentityHash: "b".repeat(64), contextHash: "c".repeat(64),
    status: "CURRENT", createdAt: 1,
  }, { id: contextRecordID })
  const planEvidence = yield* evidence(directory, validation.reviewBaseSHA, head)
  const review = yield* recordReview({
    sessionID: session.id, validationRecordID: validation.id, workCard: validation.workCard,
    reviewerID: "lucy", reviewMethodVersion: "cold-review-fixture-v1", verdict: "APPROVE",
    findings: [], checks: validation.checks, artifact: planEvidence,
  })
  const runtime = yield* ArsenalBindings.make
  const check = runtime.withSession(session.id, Effect.gen(function* () {
    const host = yield* ArsenalCompletion.NativeHost
    const coldReview = host?.checks.get("cold-review")
    if (!coldReview) throw new Error("actual native cold-review check missing")
    return yield* coldReview({ sessionID: session.id, projectID: session.projectID,
      directory: session.directory, taskID: "fixture-worker", callID: "fixture-task",
      planID: planRevisionID, token: "fixture-cold-review", stateDirectory: "", ownedPaths: ["src/**"] })
  }))
  return { session, validation, review, planEvidence, check }
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

it.live("the workers' uncommitted result completes only with a code-stage APPROVE bound to that exact tree", () =>
  Effect.promise(async () => {
    await using tmp = await tmpdir({ git: true })
    const directory = tmp.path
    await AppRuntime.runPromise(Effect.gen(function* () {
      const instances = yield* InstanceStore.Service
      const instance = yield* instances.load({ directory })
      yield* Effect.gen(function* () {
        const database = yield* Database.Service
        const { session, validation, review, planEvidence, check } = yield* approvedPlan(directory)
        if (!("reviewBaseSHA" in validation)) throw new Error("fixture validation lacks review baseline")
        const approvedHead = review.artifact.headSHA
        const services = yield* Effect.context<Database.Service | Git.Service | EventV2Bridge.Service | Session.Service |
          Config.Service | FileSystem.FileSystem>()
        const record = (artifact: unknown, verdict = "APPROVE", stage = "code") => recordReview({
          sessionID: session.id, validationRecordID: validation.id, workCard: validation.workCard,
          reviewerID: "lucy", reviewMethodVersion: "cold-review-fixture-v1", verdict, stage,
          findings: verdict === "APPROVE" ? [] : [{ path: "src/price.ts", line: 1, message: "rounds half down" }],
          checks: validation.checks, artifact,
        })
        // The evidence for the current working tree, as the review tool hands it to Lucy.
        const current = CodeReview.result({ worktree: directory, base: approvedHead, writePaths: ["src"],
          maxOutputBytes: REVIEW_ARTIFACT_MAX_BYTES }).pipe(Effect.map((result) => {
          if (result.status !== "ready") throw new Error(`fixture result ${result.status}`)
          return { baseSHA: approvedHead, headSHA: result.tree, worktree: directory, changedPaths: result.changedPaths,
            sha256: result.sha256 }
        }))
        // Lucy as the real producer sees her: she records the exact artifact JSON the tool handed her.
        const lucy = (verdict: "APPROVE" | "FIX_FIRST"): TaskPromptOps => ({
          cancel: () => Effect.void,
          resolvePromptParts: (template) => Effect.succeed([{ type: "text", text: template }]),
          prompt: (input) => Effect.gen(function* () {
            const text = input.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("")
            expect(text).toContain("Stage: code.")
            yield* record(Schema.decodeUnknownSync(Schema.UnknownFromJsonString)(/^artifact JSON: (.+)$/m.exec(text)?.[1]),
              verdict).pipe(Effect.provide(services))
            const id = MessageID.ascending()
            return {
              info: {
                id, role: "assistant" as const, parentID: input.messageID ?? MessageID.ascending(), sessionID: input.sessionID,
                mode: "lucy", agent: "lucy", cost: 0, path: { cwd: directory, root: directory },
                tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
                modelID: ModelV2.ID.make("test-model"), providerID: ProviderV2.ID.make("test"),
                time: { created: Date.now() }, finish: "stop",
              },
              parts: [{ id: PartID.ascending(), messageID: id, sessionID: input.sessionID, type: "text" as const, text: "done" }],
            }
          }).pipe(Effect.orDie),
        })
        const tool = yield* MaestroRequestReviewTool
        const request = (verdict: "APPROVE" | "FIX_FIRST") => tool.init().pipe(Effect.flatMap((def) => def.execute(
          { validationRecordID: validation.id, workCard: validation.workCard, reviewMethodVersion: "cold-review-fixture-v1",
            stage: "code" },
          { sessionID: session.id, messageID: MessageID.ascending(), agent: "maestro", agentID: "maestro",
            abort: new AbortController().signal, extra: { promptOps: lucy(verdict) }, messages: [],
            metadata: () => Effect.void, ask: () => Effect.void },
        )))
        const held = (reason: string) => check.pipe(Effect.flip, Effect.map((error) => expect(error).toMatchObject({ reason })))

        // The workers edit inside the approved writePaths and leave the change uncommitted.
        yield* write(directory, "src/price.ts", "export const round = (value: number) => Math.round(value)\n")
        yield* held("WORKFLOW_CODE_REVIEW_REQUIRED")
        // The plan stage still requires the clean committed tree it reviews.
        expect(yield* record(planEvidence, "APPROVE", "plan").pipe(Effect.flip))
          .toMatchObject({ reason: "artifact-context-mismatch" })

        // A code receipt binds the plan-reviewed head, the result tree, its paths, its digest and the worktree.
        const evidenceNow = yield* current
        const refused = [
          [{ ...evidenceNow, baseSHA: validation.reviewBaseSHA }, "code-review-base-mismatch"],
          [{ ...evidenceNow, headSHA: approvedHead }, "artifact-context-mismatch"],
          [{ ...evidenceNow, changedPaths: [] }, "artifact-path-mismatch"],
          [{ ...evidenceNow, sha256: "0".repeat(64) }, "artifact-bytes-mismatch"],
          [{ ...evidenceNow, worktree: path.dirname(directory) }, "artifact-worktree-mismatch"],
        ] as const
        yield* Effect.forEach(refused, ([artifact, reason]) => record(artifact).pipe(Effect.flip,
          Effect.map((error) => expect(error).toMatchObject({ reason }))))

        // FIX_FIRST through the real tool keeps the workflow held.
        expect((yield* request("FIX_FIRST")).output).toStartWith("FIX_FIRST: evt_maestro_review_")
        yield* held("WORKFLOW_CODE_REVIEW_REQUIRED")
        // The resumed workers fix it: a new tree that the FIX_FIRST receipt does not cover.
        const fixed = "export const round = (value: number) => Math.floor(value + 0.5)\n"
        yield* write(directory, "src/price.ts", fixed)
        yield* held("WORKFLOW_CODE_REVIEW_REQUIRED")
        const approved = yield* request("APPROVE")
        expect(approved.output).toStartWith("APPROVE: evt_maestro_review_")
        expect(approved.metadata.reviewReceiptID).not.toBe(review.id)
        expect(yield* check).toMatchObject({ status: "pass" })

        // The host re-derives every binding of the code receipt.
        const row = yield* database.db.select().from(EventTable)
          .where(eq(EventTable.id, EventV2.ID.make(approved.metadata.reviewReceiptID))).get().pipe(Effect.orDie)
        if (!row) throw new Error("fixture code receipt missing")
        const data = Schema.decodeUnknownSync(MaestroEvent.Review.ReceivedV2.data)(row.data)
        expect(data).toMatchObject({ stage: "code", verdict: "APPROVE", artifact: { baseSHA: approvedHead } })
        const tampered = [
          [{ ...data, actor: validation.actor }, "WORKFLOW_COLD_REVIEW_MISSING"],
          [{ ...data, rosterHash: "0".repeat(64) }, "WORKFLOW_COLD_REVIEW_MISSING"],
          [{ ...data, grantHash: "0".repeat(64) }, "WORKFLOW_COLD_REVIEW_MISSING"],
          [{ ...data, artifact: { ...data.artifact, baseSHA: validation.reviewBaseSHA } }, "WORKFLOW_COLD_REVIEW_STALE"],
          [{ ...data, artifact: { ...data.artifact, worktree: path.dirname(directory) } }, "WORKFLOW_COLD_REVIEW_STALE"],
          [{ ...data, artifact: { ...data.artifact, sha256: "0".repeat(64) } }, "WORKFLOW_COLD_REVIEW_STALE"],
        ] as const
        yield* Effect.forEach(tampered, ([value, reason]) => Effect.gen(function* () {
          yield* database.db.update(EventTable).set({ data: value }).where(eq(EventTable.id, row.id)).run()
            .pipe(Effect.orDie)
          yield* held(reason)
          yield* database.db.update(EventTable).set({ data: row.data }).where(eq(EventTable.id, row.id)).run()
            .pipe(Effect.orDie)
        }))
        expect(yield* check).toMatchObject({ status: "pass" })

        // A changed edit after the review is a result the receipt does not cover; restoring it is covered again.
        yield* write(directory, "src/price.ts", "export const round = (value: number) => Math.ceil(value)\n")
        yield* held("WORKFLOW_CODE_REVIEW_REQUIRED")
        yield* write(directory, "src/price.ts", fixed)
        expect(yield* check).toMatchObject({ status: "pass" })
        // An edit outside the approved writePaths holds, whatever was reviewed.
        yield* write(directory, "notes.txt", "outside the approved scope\n")
        yield* held("WORKFLOW_COLD_REVIEW_STALE")
        yield* Effect.promise(() => rm(path.join(directory, "notes.txt")))
        expect(yield* check).toMatchObject({ status: "pass" })
        // HEAD must stay the plan-reviewed head.
        yield* commit(directory, "src/price.ts", fixed)
        yield* held("WORKFLOW_COLD_REVIEW_STALE")
      }).pipe(Effect.provideService(InstanceRef, instance))
    }).pipe(Effect.scoped, Effect.provide(layer)))
  }), 90000)
