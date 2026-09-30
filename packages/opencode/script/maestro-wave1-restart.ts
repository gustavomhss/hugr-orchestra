import { mkdtemp, realpath, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const [mode, database, receipt, artifactPath] = Bun.argv.slice(2)
const sessionID = "ses_wave1_restart"
const projectID = "prj_wave1_restart"

if (mode === "run") await run()
if (mode === "write") await write()
if (mode === "read") await read()
if (!["run", "write", "read"].includes(mode ?? "")) throw new Error("usage: maestro-wave1-restart.ts run")

async function run() {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "opencode-maestro-wave1-")))
  const db = path.join(directory, "receipts.db")
  const artifact = path.join(directory, "artifact.diff")
  const receiptFile = path.join(directory, "receipts.json")
  try {
    await git(directory, ["init"])
    await git(directory, ["config", "user.email", "maestro@opencode.test"])
    await git(directory, ["config", "user.name", "Maestro"])
    await Bun.write(path.join(directory, "proof.txt"), "proof\n")
    await git(directory, ["add", "proof.txt"])
    await git(directory, ["commit", "-m", "proof"])
    const base = (await git(directory, ["rev-parse", "HEAD"])).trim()
    await Bun.write(path.join(directory, "proof.txt"), "proof changed\n")
    await git(directory, ["add", "proof.txt"])
    await git(directory, ["commit", "-m", "change"])
    const head = (await git(directory, ["rev-parse", "HEAD"])).trim()
    const names = await git(directory, ["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", base, head, "--", "."])
    const bytes = await git(directory, ["diff", "--binary", "--full-index", "--no-ext-diff", "--no-renames", "--src-prefix=a/", "--dst-prefix=b/", base, head, "--", "."])
    await Bun.write(artifact, JSON.stringify({ baseSHA: base, headSHA: head, worktree: directory, changedPaths: names.split("\0").filter(Boolean), encoding: "base64", bytes: Buffer.from(bytes).toString("base64") }))
    await child("write", db, receiptFile, artifact)
    await child("read", db, receiptFile, artifact)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function child(childMode: "write" | "read", db: string, receiptFile: string, artifact: string) {
  const process = Bun.spawn(["bun", import.meta.path, childMode, db, receiptFile, artifact], { env: { ...Bun.env, OPENCODE_DB: db }, stdout: "inherit", stderr: "inherit" })
  if ((await process.exited) !== 0) throw new Error(`restart ${childMode} failed`)
}

async function write() {
  const { Effect } = await import("effect")
  const { LayerNode } = await import("@opencode-ai/core/effect/layer-node")
  const { Database } = await import("@opencode-ai/core/database/database")
  const { ProjectTable } = await import("@opencode-ai/core/project/sql")
  const { ProjectSchema } = await import("@opencode-ai/core/project/schema")
  const { SessionTable } = await import("@opencode-ai/core/session/sql")
  const { EventV2 } = await import("@opencode-ai/core/event")
  const { MaestroEvent } = await import("@opencode-ai/schema/maestro-event")
  const { SessionID } = await import("../src/session/schema")
  const { EventV2Bridge } = await import("../src/event-v2-bridge")
  const { Git } = await import("../src/git")
  const { recordReview, recordValidation } = await import("../src/maestro/validation-record")
  const artifact = JSON.parse(await Bun.file(artifactPath!).text())
  const layer = LayerNode.compile(LayerNode.group([Database.node, EventV2Bridge.node, Git.node]))
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const { db } = yield* Database.Service
      const events = yield* EventV2Bridge.Service
      yield* db.insert(ProjectTable).values({ id: ProjectSchema.ID.make(projectID), worktree: artifact.worktree, sandboxes: [], time_created: 1 }).run().pipe(Effect.orDie)
      yield* db.insert(SessionTable).values({ id: SessionID.make(sessionID), project_id: ProjectSchema.ID.make(projectID), slug: sessionID, directory: artifact.worktree, title: "restart", version: "test", time_created: 1 }).run().pipe(Effect.orDie)
      yield* events.publish(
        MaestroEvent.Context.Recorded,
        {
          id: "evt_context_wave1_restart",
          sessionID,
          planRevisionID: "evt_plan_wave1_restart",
          projectID,
          directory: artifact.worktree,
          mode: "UNGROUNDED",
          branch: "test",
          headSHA: artifact.headSHA,
          changedPaths: artifact.changedPaths,
          currentEvidenceIdentityHash: "b".repeat(64),
          contextHash: "c".repeat(64),
          status: "CURRENT",
          createdAt: 1,
        },
        { id: EventV2.ID.make("evt_context_wave1_restart") },
      )
      const validation = yield* recordValidation({
        sessionID,
        planRevisionID: "evt_plan_wave1_restart",
        contextRecordID: "evt_context_wave1_restart",
        contextHash: "c".repeat(64),
        projectID,
        workCardID: "card_wave1_restart",
        workCard: "# restart card\n",
        routedMemberID: "charlie",
        validatorID: "maestro",
        validatorVersion: "validate-v1",
        checks: [{ id: "route", status: "PASS", detail: "routed" }],
      })
      const review = yield* recordReview({
        sessionID,
        validationRecordID: validation.id,
        workCard: "# restart card\n",
        reviewerID: "lucy",
        reviewMethodVersion: "review-v1",
        verdict: "APPROVE",
        findings: [],
        artifact,
        checks: [{ id: "route", status: "PASS", detail: "routed" }],
      })
      return { validation, review }
    }).pipe(Effect.provide(layer)),
  )
  await Bun.write(receipt!, JSON.stringify(result))
  console.log("MAESTRO_WAVE1_RESTART_WRITE_OK")
}

async function read() {
  const { Effect } = await import("effect")
  const { LayerNode } = await import("@opencode-ai/core/effect/layer-node")
  const { Database } = await import("@opencode-ai/core/database/database")
  const { EventV2Bridge } = await import("../src/event-v2-bridge")
  const { readReview, readValidation } = await import("../src/maestro/validation-record")
  const expected = await Bun.file(receipt!).json()
  const layer = LayerNode.compile(LayerNode.group([Database.node, EventV2Bridge.node]))
  const actual = await Effect.runPromise(Effect.gen(function* () {
    return { validation: yield* readValidation(expected.validation.id), review: yield* readReview(expected.review.id) }
  }).pipe(Effect.provide(layer)))
  if (
    actual.validation?.id !== expected.validation.id ||
    actual.validation?.workCardHash !== expected.validation.workCardHash ||
    actual.validation?.outcome !== "VALID" ||
    actual.review?.id !== expected.review.id ||
    actual.review?.validationRecordID !== expected.review.validationRecordID ||
    actual.review?.workCardHash !== expected.review.workCardHash ||
    actual.review?.verdict !== "APPROVE"
  ) throw new Error("restart receipts mismatch")
  console.log("MAESTRO_WAVE1_RESTART_READ_OK")
}

async function git(cwd: string, args: string[]) {
  const process = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([process.exited, Bun.readableStreamToText(process.stdout), Bun.readableStreamToText(process.stderr)])
  if (code !== 0) throw new Error(stderr || stdout)
  return stdout
}
