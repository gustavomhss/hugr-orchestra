import { createHash } from "node:crypto"
import { afterEach, describe, expect } from "bun:test"
import { Database } from "@opencode-ai/core/database/database"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { filesystem } from "@opencode-ai/core/effect/app-node-platform"
import { Config } from "../../src/config/config"
import { Session } from "../../src/session/session"
import { EventV2 } from "@opencode-ai/core/event"
import { EventTable } from "@opencode-ai/core/event/sql"
import { ProjectTable } from "@opencode-ai/core/project/sql"
import { ProjectSchema } from "@opencode-ai/core/project/schema"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SessionTable } from "@opencode-ai/core/session/sql"
import { MaestroEvent } from "@opencode-ai/schema/maestro-event"
import { Cause, Effect, Exit, FileSystem, Schema } from "effect"
import { eq } from "drizzle-orm"
import { rm } from "node:fs/promises"
import path from "node:path"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Git } from "@/git"
import { SessionID } from "@/session/schema"
import {
  findReview,
  readReview,
  readValidation,
  recordReview,
  recordValidation,
  REVIEW_ARTIFACT_MAX_BYTES,
  reviewPolicyHash,
} from "../../src/maestro/validation-record"
import { nativeProfiles, roster } from "../../src/maestro/roster"
import { disposeAllInstances, provideInstance, TestInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([filesystem, Config.node, Session.node, Database.node, EventV2Bridge.node, Git.node]),
  ),
)

const base = {
  sessionID: "ses_validation",
  planRevisionID: "evt_plan_validation",
  contextRecordID: "evt_context_validation",
  contextHash: "c".repeat(64),
  workCardID: "card_validation",
  workCard: "# Card\nImplement exact behavior.\n",
  routedMemberID: "charlie",
  validatorID: "maestro",
  validatorVersion: "validation-v1",
  checks: [{ id: "typecheck", status: "PASS" as const, detail: "clean" }],
}

const prepare = Effect.fn("MaestroValidationTest.prepare")(function* (sessionID = base.sessionID) {
  const test = yield* TestInstance
  const { db } = yield* Database.Service
  const project = yield* db
    .select()
    .from(ProjectTable)
    .where(eq(ProjectTable.worktree, AbsolutePath.make(test.directory)))
    .get()
    .pipe(Effect.orDie)
  if (!project) throw new Error("missing test project")
  yield* db
    .insert(SessionTable)
    .values({
      id: SessionID.make(sessionID),
      project_id: project.id,
      slug: sessionID,
      directory: test.directory,
      title: "validation",
      version: "test",
      time_created: 1,
      time_updated: 1,
    })
    .onConflictDoNothing()
    .run()
    .pipe(Effect.orDie)
  return { ...base, sessionID, projectID: project.id }
})

const artifact = Effect.fn("MaestroValidationTest.artifact")(function* (inputDirectory?: string, proof2 = "proof 2\n") {
  const test = yield* TestInstance
  const directory = inputDirectory ?? test.directory
  const { db } = yield* Database.Service
  const events = yield* EventV2Bridge.Service
  const git = yield* Git.Service
  // Bun.write can resolve on Windows before its file handle closes. Git for Windows' FSCache then reads the stale
  // zero-byte directory entry and stages an empty blob, leaving a dirty tree. FileSystem writes close before completing.
  const fs = yield* FileSystem.FileSystem
  const baseCommit = yield* git.run(["rev-parse", "HEAD"], { cwd: directory })
  const root = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: directory })
  yield* fs.writeFileString(path.join(directory, "proof.txt"), "proof\n")
  yield* git.run(["add", "proof.txt"], { cwd: directory })
  yield* git.run(["commit", "-m", "proof"], { cwd: directory })
  yield* fs.writeFileString(path.join(directory, "proof-2.txt"), proof2)
  yield* git.run(["add", "proof-2.txt"], { cwd: directory })
  yield* git.run(["commit", "-m", "proof 2"], { cwd: directory })
  const head = yield* git.run(["rev-parse", "HEAD"], { cwd: directory })
  const names = yield* git.run(
    [
      "diff",
      "--no-ext-diff",
      "--no-renames",
      "--name-only",
      "-z",
      baseCommit.text().trim(),
      head.text().trim(),
      "--",
      ".",
    ],
    {
      cwd: directory,
    },
  )
  const diff = yield* git.run(
    [
      "diff",
      "--binary",
      "--full-index",
      "--no-ext-diff",
      "--no-renames",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      baseCommit.text().trim(),
      head.text().trim(),
      "--",
      ".",
    ],
    { cwd: directory },
  )
  const session = yield* db
    .select()
    .from(SessionTable)
    .where(eq(SessionTable.id, SessionID.make(base.sessionID)))
    .get()
    .pipe(Effect.orDie)
  if (!session) throw new Error("missing artifact Session")
  expect(session.directory).toBe(path.normalize(directory))
  const status = yield* git.run(["status", "--porcelain=v1", "--untracked-files=all"], { cwd: session.directory })
  expect({
    exitCode: status.exitCode,
    truncated: status.truncated,
    stdout: status.text(),
    stderr: status.stderr.toString(),
  }).toMatchObject({ exitCode: 0, truncated: false, stdout: "" })
  yield* events.publish(
    MaestroEvent.Context.Recorded,
    {
      id: base.contextRecordID,
      sessionID: base.sessionID,
      planRevisionID: base.planRevisionID,
      projectID: session.project_id,
      directory: session.directory,
      mode: "UNGROUNDED",
      branch: "test",
      headSHA: head.text().trim(),
      changedPaths: [],
      currentEvidenceIdentityHash: "b".repeat(64),
      contextHash: base.contextHash,
      status: "CURRENT",
      createdAt: 1,
    },
    { id: EventV2.ID.make(base.contextRecordID) },
  )
  return {
    baseSHA: baseCommit.text().trim(),
    headSHA: head.text().trim(),
    worktree: root.text().trim(),
    changedPaths: names.text().split("\0").filter(Boolean),
    sha256: createHash("sha256").update(diff.stdout).digest("hex"),
  }
})

function expectReviewRejection(error: { _tag: string }, reason: string) {
  expect(error._tag).toBe("MaestroReviewRejected")
  if (!("reason" in error) || typeof error.reason !== "string") throw new Error("expected review rejection")
  expect(error.reason).toBe(reason)
  expect("message" in error && error.message).toBe(`MaestroReviewRejected: ${reason}`)
}

describe("Maestro validation receipt", () => {
  it.instance(
    "exposes rejected check order through Error.message without persisting invalid validation",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const checks = [
          { id: "scope", status: "PASS" as const, detail: "observed scope" },
          { id: "grounding", status: "PASS" as const, detail: "observed context" },
        ]
        const rejected = yield* recordValidation({ ...input, checks }).pipe(Effect.exit)
        expect(Exit.isFailure(rejected)).toBe(true)
        if (!Exit.isFailure(rejected)) throw new Error("noncanonical checks were admitted")
        const error = Cause.squash(rejected.cause)
        expect(error instanceof Error && error.message).toBe("MaestroValidationRejected: checks-not-deterministic")
        const database = yield* Database.Service
        expect(yield* database.db.select().from(EventTable).all().pipe(Effect.orDie)).toHaveLength(0)
        const valid = yield* recordValidation({ ...input, checks: [...checks].reverse() })
        expect(valid.outcome).toBe("VALID")
        expect(yield* readValidation(valid.id)).toEqual(valid)
      }),
    { git: true },
  )

  it.instance(
    "derives project and canonical Maestro actor from durable Session",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const receipt = yield* recordValidation(input)
        const { db } = yield* Database.Service
        const row = yield* db.select().from(EventTable).where(eq(EventTable.id, receipt.id)).get().pipe(Effect.orDie)

        expect(receipt.projectID).toBe(input.projectID)
        expect(row?.type).toBe(EventV2.versionedType(MaestroEvent.Validation.RecordedV3.type, 3))
        expect(yield* readValidation(receipt.id)).toEqual(receipt)
        expect(yield* recordValidation(input)).toEqual(receipt)
        expect(
          yield* recordValidation({ ...input, workCard: `${input.workCard}changed\n` }).pipe(Effect.flip),
        ).toMatchObject({ _tag: "MaestroValidationConflict" })
        expect(receipt.actor).toEqual({
          version: "rfc8785-v1",
          bytes: `{"memberId":"maestro","projectId":"${input.projectID}","sessionId":"${input.sessionID}"}`,
          sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        })
      }),
    { git: true },
  )

  it.instance(
    "rejects caller project mutation before publish",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const rejected = yield* recordValidation({ ...input, projectID: "prj_other" }).pipe(Effect.flip)
        const { db } = yield* Database.Service

        expect(rejected).toMatchObject({ _tag: "MaestroValidationRejected", reason: "project-mismatch" })
        expect(yield* db.select().from(EventTable).all().pipe(Effect.orDie)).toHaveLength(0)
      }),
    { git: true },
  )

  it.instance(
    "reads validation V2 rows without V3 baseline field",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const current = yield* recordValidation(input)
        if (!("reviewBaseSHA" in current)) throw new Error("expected validation V3")
        const v2 = Schema.decodeUnknownSync(MaestroEvent.Validation.RecordedV2.data)(current)
        const id = EventV2.ID.make("evt_maestro_validation_legacy_v2")
        const events = yield* EventV2Bridge.Service
        yield* events.publish(MaestroEvent.Validation.RecordedV2, v2, { id })

        expect(yield* readValidation(id)).toEqual({ id, ...v2 })
      }),
    { git: true },
  )

  it.instance(
    "binds replay to Lucy native review profile and conflicts when profile changes",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const lucy = roster.find((member) => member.memberId === "lucy")
        if (!lucy?.nativeProfile) throw new Error("missing Lucy native review profile")
        const profile = nativeProfiles[lucy.nativeProfile]
        const changedHash = reviewPolicyHash(lucy, { ...profile, bash: "allow" })
        const receipt = yield* recordValidation(input)
        const { db } = yield* Database.Service
        const { id, ...recorded } = receipt

        expect(receipt.reviewPolicyHash).toBe(reviewPolicyHash(lucy, profile))
        expect(changedHash).not.toBe(receipt.reviewPolicyHash)
        yield* db
          .update(EventTable)
          .set({ data: { ...recorded, reviewPolicyHash: changedHash } })
          .where(eq(EventTable.id, id))
          .run()
          .pipe(Effect.orDie)

        const conflict = yield* recordValidation(input).pipe(Effect.flip)

        expect(conflict).toMatchObject({
          _tag: "MaestroValidationConflict",
          sessionID: input.sessionID,
          workCardID: input.workCardID,
        })
      }),
    { git: true },
  )

  it.instance(
    "holds historical V2 retry without rewriting its durable receipt",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const current = yield* recordValidation(input)
        const { db } = yield* Database.Service
        const v2 = Schema.decodeUnknownSync(MaestroEvent.Validation.RecordedV2.data)(current)
        yield* db
          .update(EventTable)
          .set({ type: EventV2.versionedType(MaestroEvent.Validation.RecordedV2.type, 2), data: v2 })
          .where(eq(EventTable.id, current.id))
          .run()
          .pipe(Effect.orDie)

        const before = yield* db.select().from(EventTable).where(eq(EventTable.id, current.id)).get().pipe(Effect.orDie)
        expect(yield* recordValidation(input).pipe(Effect.flip)).toMatchObject({
          _tag: "MaestroValidationConflict",
          sessionID: input.sessionID,
          workCardID: input.workCardID,
        })
        expect(
          yield* db.select().from(EventTable).where(eq(EventTable.id, current.id)).get().pipe(Effect.orDie),
        ).toEqual(before)
        expect(yield* readValidation(current.id)).toEqual({ id: current.id, ...v2 })
      }),
    { git: true },
  )

  it.instance(
    "binds Lucy receipt to real Git diff, root, paths, bytes, and actor",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const validation = yield* recordValidation(input)
        const evidence = yield* artifact()
        const receipt = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: evidence,
          checks: input.checks,
        })

        expect(receipt.artifact).toMatchObject({
          baseSHA: evidence.baseSHA,
          headSHA: evidence.headSHA,
          worktree: evidence.worktree,
          changedPaths: evidence.changedPaths,
          workCardHash: validation.workCardHash,
          sha256: evidence.sha256,
        })
        expect("reviewBaseSHA" in validation && validation.reviewBaseSHA).toBe(evidence.baseSHA)
        expect(receipt.artifact.changedPaths).toEqual(["proof-2.txt", "proof.txt"])
        expect("bytes" in receipt.artifact).toBe(false)
        expect(receipt.actor.bytes).toBe(
          `{"memberId":"lucy","projectId":"${input.projectID}","sessionId":"${input.sessionID}"}`,
        )
        expect(yield* readReview(receipt.id)).toEqual(receipt)
      }),
    { git: true },
  )

  it.instance(
    "rejects a review artifact larger than the inline review budget",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const validation = yield* recordValidation(input)
        const evidence = yield* artifact(undefined, "x".repeat(REVIEW_ARTIFACT_MAX_BYTES) + "\n")
        const rejected = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: evidence,
          checks: input.checks,
        }).pipe(Effect.flip)

        expectReviewRejection(rejected, "artifact-too-large")
      }),
    { git: true },
  )

  it.instance(
    "rejects review artifacts that carry bytes or a malformed digest",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const validation = yield* recordValidation(input)
        const evidence = yield* artifact()
        const review = (value: unknown) =>
          recordReview({
            sessionID: input.sessionID,
            validationRecordID: validation.id,
            workCard: input.workCard,
            reviewerID: "lucy",
            reviewMethodVersion: "review-v1",
            verdict: "APPROVE",
            findings: [],
            artifact: value,
            checks: input.checks,
          }).pipe(Effect.flip)

        expectReviewRejection(
          yield* review({ ...evidence, encoding: "base64", bytes: "cHJvb2Y=" }),
          "malformed-artifact-evidence",
        )
        expectReviewRejection(yield* review({ ...evidence, sha256: "A".repeat(64) }), "malformed-artifact-digest")
      }),
    { git: true },
  )

  it.instance(
    "reads version 1 review receipts without their stored diff bytes",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const validation = yield* recordValidation(input)
        const events = yield* EventV2Bridge.Service
        const legacy = yield* events.publish(MaestroEvent.Review.Received, {
          sessionID: input.sessionID,
          projectID: validation.projectID,
          validationRecordID: validation.id,
          workCardHash: validation.workCardHash,
          routedMemberID: validation.routedMemberID,
          rosterHash: validation.rosterHash,
          grantHash: validation.grantHash,
          reviewPolicyHash: validation.reviewPolicyHash,
          actor: validation.actor,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          artifact: {
            workCardHash: validation.workCardHash,
            sha256: "a".repeat(64),
            baseSHA: "a".repeat(40),
            headSHA: "b".repeat(40),
            worktree: "/tmp",
            changedPaths: ["proof.txt"],
            bytes: "ZGlmZg==",
          },
          verdict: "APPROVE",
          findings: [],
        })
        const read = yield* readReview(legacy.id)

        expect(read?.artifact).toEqual({
          workCardHash: validation.workCardHash,
          sha256: "a".repeat(64),
          baseSHA: "a".repeat(40),
          headSHA: "b".repeat(40),
          worktree: "/tmp",
          changedPaths: ["proof.txt"],
        })
        expect((yield* findReview(input.sessionID, validation.id))?.id).toBe(legacy.id)
      }),
    { git: true },
  )

  it.instance(
    "binds Lucy artifact to registered nested Git sandbox root",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const test = yield* TestInstance
        const { db } = yield* Database.Service
        const sandbox = path.join(test.directory, ".sandboxes", "card")
        const git = yield* Git.Service
        const fs = yield* FileSystem.FileSystem
        yield* fs.writeFileString(path.join(test.directory, ".git", "info", "exclude"), ".sandboxes/\n")
        expect((yield* git.run(["worktree", "add", "-b", "sandbox", sandbox], { cwd: test.directory })).exitCode).toBe(
          0,
        )
        yield* provideInstance(sandbox)(Effect.void)
        const project = yield* db
          .select()
          .from(ProjectTable)
          .where(eq(ProjectTable.id, input.projectID))
          .get()
          .pipe(Effect.orDie)
        expect(project?.sandboxes).toContain(AbsolutePath.make(sandbox))
        yield* db
          .update(SessionTable)
          .set({ directory: AbsolutePath.make(sandbox) })
          .where(eq(SessionTable.id, SessionID.make(input.sessionID)))
          .run()
          .pipe(Effect.orDie)
        const validation = yield* recordValidation(input)
        const evidence = yield* artifact(sandbox)
        const receipt = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: evidence,
          checks: input.checks,
        })

        expect(receipt.artifact.worktree).toBe(evidence.worktree)
      }),
    { git: true },
  )

  it.instance(
    "rejects review when bound context contains dirty paths",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const validation = yield* recordValidation(input)
        const evidence = yield* artifact()
        const { db } = yield* Database.Service
        const context = yield* db
          .select()
          .from(EventTable)
          .where(eq(EventTable.id, EventV2.ID.make(input.contextRecordID)))
          .get()
          .pipe(Effect.orDie)
        if (!context) throw new Error("missing context row")
        yield* db
          .update(EventTable)
          .set({ data: { ...context.data, changedPaths: ["dirty.ts"] } })
          .where(eq(EventTable.id, context.id))
          .run()
          .pipe(Effect.orDie)
        const rejected = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: evidence,
          checks: input.checks,
        }).pipe(Effect.flip)

        expectReviewRejection(rejected, "artifact-context-mismatch")
      }),
    { git: true },
  )

  it.instance(
    "fails forged changed paths and diff bytes closed",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const validation = yield* recordValidation(input)
        const evidence = yield* artifact()
        const paths = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: { ...evidence, changedPaths: ["forged.ts"] },
          checks: input.checks,
        }).pipe(Effect.flip)
        const bytes = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: { ...evidence, sha256: "f".repeat(64) },
          checks: input.checks,
        }).pipe(Effect.flip)
        const sha = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: { ...evidence, baseSHA: "a".repeat(40) },
          checks: input.checks,
        }).pipe(Effect.flip)
        const worktree = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: { ...evidence, worktree: path.dirname(evidence.worktree) },
          checks: input.checks,
        }).pipe(Effect.flip)

        expectReviewRejection(paths, "artifact-path-mismatch")
        expectReviewRejection(bytes, "artifact-bytes-mismatch")
        expectReviewRejection(sha, "artifact-sha-not-found")
        expectReviewRejection(worktree, "artifact-worktree-mismatch")
      }),
    { git: true },
  )

  it.instance(
    "rejects unrelated artifact head before review persistence",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const validation = yield* recordValidation(input)
        const evidence = yield* artifact()
        const test = yield* TestInstance
        const git = yield* Git.Service
        yield* git.run(["checkout", "--orphan", "unrelated-artifact"], { cwd: test.directory })
        yield* git.run(["rm", "-rf", "."], { cwd: test.directory })
        const fs = yield* FileSystem.FileSystem
        yield* fs.writeFileString(path.join(test.directory, "unrelated.txt"), "unrelated\n")
        yield* git.run(["add", "unrelated.txt"], { cwd: test.directory })
        yield* git.run(["commit", "-m", "unrelated"], { cwd: test.directory })
        const head = yield* git.run(["rev-parse", "HEAD"], { cwd: test.directory })
        const names = yield* git.run(
          [
            "diff",
            "--no-ext-diff",
            "--no-renames",
            "--name-only",
            "-z",
            evidence.baseSHA,
            head.text().trim(),
            "--",
            ".",
          ],
          { cwd: test.directory },
        )
        const diff = yield* git.run(
          [
            "diff",
            "--binary",
            "--full-index",
            "--no-ext-diff",
            "--no-renames",
            "--src-prefix=a/",
            "--dst-prefix=b/",
            evidence.baseSHA,
            head.text().trim(),
            "--",
            ".",
          ],
          { cwd: test.directory },
        )
        const rejected = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: {
            ...evidence,
            headSHA: head.text().trim(),
            changedPaths: names.text().split("\0").filter(Boolean),
            sha256: createHash("sha256").update(diff.stdout).digest("hex"),
          },
          checks: input.checks,
        }).pipe(Effect.flip)
        const { db } = yield* Database.Service

        expectReviewRejection(rejected, "artifact-parentage-mismatch")
        expect(yield* db.select().from(EventTable).all().pipe(Effect.orDie)).toHaveLength(2)
      }),
    { git: true },
  )

  it.instance(
    "rejects review before artifact processing when validation is not valid",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const validation = yield* recordValidation({
          ...input,
          checks: [{ id: "typecheck", status: "FAIL", detail: "failed" }],
        })
        const rejected = yield* recordReview({
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "APPROVE",
          findings: [],
          artifact: null,
          checks: input.checks,
        }).pipe(Effect.flip)
        const { db } = yield* Database.Service

        expect(rejected).toMatchObject({ _tag: "MaestroReviewRejected", reason: "validation-not-valid" })
        expect(yield* db.select().from(EventTable).all().pipe(Effect.orDie)).toHaveLength(1)
      }),
    { git: true },
  )

  it.instance(
    "rejects finding citations outside the canonical artifact diff",
    () =>
      Effect.gen(function* () {
        const input = yield* prepare()
        const validation = yield* recordValidation(input)
        const evidence = yield* artifact()
        const review = {
          sessionID: input.sessionID,
          validationRecordID: validation.id,
          workCard: input.workCard,
          reviewerID: "lucy",
          reviewMethodVersion: "review-v1",
          verdict: "FIX_FIRST",
          artifact: evidence,
          checks: input.checks,
        }
        expect(
          (yield* recordReview({
            ...review,
            findings: [{ path: "proof.txt", line: 1, message: "actual added line" }],
          })).findings,
        ).toEqual([{ path: "proof.txt", line: 1, message: "actual added line" }])
        const test = yield* TestInstance
        const git = yield* Git.Service
        const fs = yield* FileSystem.FileSystem
        yield* fs.writeFileString(path.join(test.directory, "untracked-control.txt"), "untracked\n")
        const dirty = yield* git.run(["status", "--porcelain=v1", "--untracked-files=all"], { cwd: test.directory })
        expect(dirty.exitCode).toBe(0)
        expect(dirty.text()).toContain("?? untracked-control.txt")
        const unclean = yield* recordReview({
          ...review,
          findings: [{ path: "proof.txt", line: 99, message: "invented citation" }],
        }).pipe(Effect.flip)
        expectReviewRejection(unclean, "artifact-context-mismatch")
        // The rejection names what was dirty so an intermittent CI failure is diagnosable from its log alone.
        expect("detail" in unclean && unclean.detail).toBe("git status exit 0: ?? untracked-control.txt")
        yield* Effect.promise(() => rm(path.join(test.directory, "untracked-control.txt")))
        const clean = yield* git.run(["status", "--porcelain=v1", "--untracked-files=all"], { cwd: test.directory })
        expect({ exitCode: clean.exitCode, truncated: clean.truncated, stdout: clean.text() }).toEqual({
          exitCode: 0,
          truncated: false,
          stdout: "",
        })
        const rejected = yield* recordReview({
          ...review,
          findings: [{ path: "proof.txt", line: 99, message: "invented citation" }],
        }).pipe(Effect.flip)

        expectReviewRejection(rejected, "finding-not-in-artifact")
      }),
    {
      git: true,
      init: (directory) =>
        Effect.gen(function* () {
          const { db } = yield* Database.Service
          // Seed an unrelated row first so an unscoped Project lookup cannot mask the finding gate.
          yield* db
            .insert(ProjectTable)
            .values({
              id: ProjectSchema.ID.make("prj_unrelated"),
              worktree: AbsolutePath.make(path.dirname(directory)),
              sandboxes: [],
              time_created: 1,
              time_updated: 1,
            })
            .run()
            .pipe(Effect.orDie)
        }),
    },
  )
})
