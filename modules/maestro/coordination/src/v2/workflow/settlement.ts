export * as WorkflowSettlementV2 from "./settlement"

import { randomUUID } from "node:crypto"
import path from "node:path"
import { isDeepStrictEqual } from "node:util"
import { ToolFailure } from "@orchestra/llm"
import { desc, eq } from "drizzle-orm"
import { Cause, Effect, Exit, Option, Schema } from "effect"
import { ChildProcess } from "effect/unstable/process"
import type { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { FSUtil } from "@orchestra/core/fs-util"
import type { GitCli } from "@orchestra/core/git-cli"
import { AppProcess } from "@orchestra/core/process"
import { Relay } from "@orchestra/core/relay"
import { RelayWorkflowBinding } from "@orchestra/core/relay-workflow-binding"
import { ToolSafetySandbox } from "@orchestra/core/tool-safety-sandbox"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import type { RelayArm } from "@orchestra/schema/relay-arm"
import { GovernanceRecordsV2 } from "../governance/records"
import { MaestroReviewRecords } from "../tools/review-records"
import { WorkflowReviewV2 } from "./review"

// Workflow completion: how one workflow settlement is graded, how the authorized resume grades a step held for a
// code review, the two global acceptance checks every workflow plan ends on, and the owner-approved release of a parked
// arm. The host (`host.ts`) binds them to one Task's placement.

type Db = Database.Interface["db"]

/** What a host check found, before the arm records it under the check's own name and provenance. */
export type Outcome = {
  readonly status: "pass" | "fail" | "skip" | "missing" | "acquisition-error"
  readonly exitCode?: number
}

/** The placement one workflow Task's host checks read: the authority Session that approved its plan. */
export type Binding = {
  readonly sessionID: string
  readonly projectID: string
  readonly planID: string
  readonly taskID: string
  readonly directory: string
  /** The placement's Git worktree root, already resolved through symlinks. */
  readonly worktree: string
}

/**
 * One workflow settlement. A gate that grades the final cold review asks for the code review first: while the
 * workers' result has no code receipt at all, only Maestro can request one, so the hold returns the Task to Maestro
 * before the arm grades, without touching the arm or spending the gate's retry budget. Every other outcome is graded as
 * usual, with one exception: a receipt the authorized resume already graded for this step (`graded`) is never graded
 * again by a settlement; it holds as unaddressed, and only Maestro's next resume grades it again (gradeReviewedHold).
 * `held` durably records either hold before it returns, which is what lets that resume continue this step.
 */
export const settle = <A, E, R, E2, R2, E3, R3>(input: {
  readonly checklist: ReadonlyArray<{ readonly host_check?: string }> | null | undefined
  readonly coldReview: Effect.Effect<unknown, unknown> | undefined
  readonly held: Effect.Effect<void, E2, R2>
  readonly graded: Effect.Effect<string | undefined, E3, R3> | undefined
  readonly transition: Effect.Effect<A, E, R>
}) =>
  Effect.gen(function* () {
    if (!input.coldReview || !input.checklist?.some((control) => control.host_check === "cold-review"))
      return yield* input.transition
    const exit = yield* Effect.exit(input.coldReview)
    const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    if (!(error instanceof RelayWorkflowBinding.Held)) return yield* input.transition
    if (error.reason === WorkflowReviewV2.REQUIRED) {
      yield* input.held
      return yield* Effect.fail(error)
    }
    if (error.reason !== WorkflowReviewV2.NOT_APPROVED || !error.receiptID || !input.graded) return yield* input.transition
    if (error.receiptID !== (yield* input.graded)) return yield* input.transition
    yield* input.held
    return yield* new RelayWorkflowBinding.Held({
      reason: WorkflowReviewV2.UNADDRESSED,
      receiptID: error.receiptID,
      detail: `The workers' result is still the tree the code review ${error.receiptID} graded, so its findings are unaddressed; no retry was spent. Resume this workflow Task with exactly the approved dispatch input to grade it again (one retry) and run another attempt with the findings, or report to the owner.`,
    })
  })

/**
 * The authorized resume of a step held for a code review, before its child runs again. A FIX_FIRST of the workers'
 * result grades the held reply now, so the gate fails and spends one retry of its budget, once per resume; the grade is
 * recorded, and from then on every attempt of the step carries that review's findings. A REJECT holds without grading:
 * a rejected result needs a new plan round. Any other cold-review outcome grades nothing here; the child's next
 * settlement does. A spent budget holds with the same reason the child's own settlement would.
 */
export const gradeReviewedHold = <E1, R1, E2, R2, E3, R3, E4, R4>(input: {
  readonly coldReview: Effect.Effect<unknown, unknown> | undefined
  readonly verdict: (receiptID: string) => Effect.Effect<string | undefined, E1, R1>
  readonly settle: Effect.Effect<RelayArm.Evaluation, E2, R2>
  readonly next: Effect.Effect<RelayArm.WorkflowPosition, E3, R3>
  readonly record: (receiptID: string, expected: RelayArm.WorkflowPosition) => Effect.Effect<void, E4, R4>
}) =>
  Effect.gen(function* () {
    if (!input.coldReview) return
    const exit = yield* Effect.exit(input.coldReview)
    const error = Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined
    if (!(error instanceof RelayWorkflowBinding.Held) || error.reason !== WorkflowReviewV2.NOT_APPROVED || !error.receiptID)
      return
    const receiptID = error.receiptID
    const verdict = yield* input.verdict(receiptID)
    if (verdict === "REJECT")
      return yield* new RelayWorkflowBinding.Held({
        reason: "WORKFLOW_CODE_REVIEW_REJECTED",
        detail: `The code review ${receiptID} rejected the workers' result. Nothing ran and no retry was spent; report its findings to the owner, because fixing them needs a new plan round.`,
      })
    if (verdict !== "FIX_FIRST") return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_COLD_REVIEW_MISSING" })
    const evaluation = yield* input.settle
    // The tree changed to an approved result between the two reads: the step moved on and nothing carries findings.
    if (evaluation.outcome === "advance" || evaluation.outcome === "complete") return
    if (evaluation.outcome !== "gate-fail")
      return yield* new RelayWorkflowBinding.Held({
        reason: `WORKFLOW_TRANSITION_${evaluation.outcome.toUpperCase().replaceAll("-", "_")}`,
      })
    yield* input.record(receiptID, yield* input.next)
  })

/** A host check as the arm calls it. A failed check is an acquisition error with the same provenance, never a pass. */
export const adapt =
  (check: Effect.Effect<Outcome, unknown>, binding: Pick<Binding, "projectID" | "sessionID">): RelayArm.HostCheck =>
  (input) => {
    const provenance = {
      source: "host-check" as const,
      projectID: binding.projectID,
      sessionID: binding.sessionID,
      eventID: randomUUID(),
      revision: input.revision ?? "",
      revisionKind: "git" as const,
    }
    return check.pipe(
      Effect.map((outcome) => ({
        name: input.check.id,
        status: outcome.status,
        provenance,
        ...(outcome.exitCode === undefined ? {} : { exitCode: outcome.exitCode }),
      })),
      Effect.catchCause(() => Effect.succeed({ name: input.check.id, status: "acquisition-error" as const, provenance })),
    )
  }

/**
 * The global cold-review check: the plan-stage review Lucy approved for this plan's validation still binds the head the
 * workers started from, and the workers' uncommitted result, inside the approved writePaths, has its own approved
 * code-stage review for exactly that tree. A run that changed nothing completes on the plan review alone.
 */
export const coldReview = Effect.fn("WorkflowSettlementV2.coldReview")(function* (
  services: { readonly db: Db; readonly git: GitCli.Interface; readonly fs: FSUtil.Interface },
  binding: Binding,
) {
  const rows = yield* services.db
    .select({ id: EventV2.EventTable.id, type: EventV2.EventTable.type, data: EventV2.EventTable.data })
    .from(EventV2.EventTable)
    .where(eq(EventV2.EventTable.aggregate_id, binding.sessionID))
    .orderBy(desc(EventV2.EventTable.seq))
    .all()
    .pipe(Effect.orDie)
  const selected = rows.find(
    (row) =>
      [1, 2, 3].some((version) => row.type === EventV2.versionedType(MaestroEvent.Validation.Recorded.type, version)) &&
      Option.getOrUndefined(Schema.decodeUnknownOption(PlanReference)(row.data))?.planRevisionID === binding.planID,
  )
  const validation = selected ? yield* GovernanceRecordsV2.readValidation(services.db, selected.id) : undefined
  const review = validation ? yield* MaestroReviewRecords.findReview(services, binding.sessionID, validation.id) : undefined
  const session = { id: binding.sessionID, projectID: binding.projectID }
  if (
    !validation ||
    !review ||
    validation.outcome !== "VALID" ||
    validation.projectID !== binding.projectID ||
    validation.sessionID !== binding.sessionID ||
    validation.planRevisionID !== binding.planID ||
    review.sessionID !== binding.sessionID ||
    review.validationRecordID !== validation.id ||
    review.verdict !== "APPROVE" ||
    review.reviewerID !== "lucy" ||
    review.routedMemberID === "lucy" ||
    review.workCardHash !== validation.workCardHash ||
    review.reviewPolicyHash !== validation.reviewPolicyHash ||
    review.projectID !== binding.projectID ||
    review.routedMemberID !== validation.routedMemberID ||
    review.artifact.workCardHash !== validation.workCardHash ||
    review.rosterHash !== validation.rosterHash ||
    review.grantHash !== validation.grantHash ||
    !isDeepStrictEqual(validation.actor, MaestroReviewRecords.actor(session, "maestro")) ||
    !isDeepStrictEqual(review.actor, MaestroReviewRecords.actor(session, "lucy")) ||
    ![review.artifact.baseSHA, review.artifact.headSHA].every((sha) => SHA.test(sha))
  )
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_COLD_REVIEW_MISSING" })
  const head = yield* services.git.run(["rev-parse", "HEAD"], { cwd: binding.directory })
  const diff = yield* services.git.run(
    [
      "diff",
      "--binary",
      "--full-index",
      "--no-ext-diff",
      "--no-renames",
      "--src-prefix=a/",
      "--dst-prefix=b/",
      review.artifact.baseSHA,
      review.artifact.headSHA,
      "--",
      ".",
    ],
    { cwd: review.artifact.worktree, maxOutputBytes: MAX_DIFF },
  )
  const real = (value: string) => services.fs.realPath(value).pipe(Effect.orElseSucceed(() => undefined))
  // Workers never commit: HEAD stays the plan-reviewed head and their result lives in the working tree.
  if (
    head.exitCode ||
    head.truncated ||
    head.text().trim() !== review.artifact.headSHA ||
    diff.exitCode ||
    diff.truncated ||
    !diff.stdout.length ||
    RelayWorkflowBinding.digest(diff.stdout) !== review.artifact.sha256 ||
    (yield* real(review.artifact.worktree)) !== binding.worktree
  )
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_COLD_REVIEW_STALE" })
  const writePaths = yield* WorkflowReviewV2.writePaths(services.db, binding.planID)
  if (!writePaths) return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_COLD_REVIEW_MISSING" })
  const result = yield* WorkflowReviewV2.result(services.git, {
    worktree: review.artifact.worktree,
    base: review.artifact.headSHA,
    writePaths,
    maxOutputBytes: MAX_DIFF,
  })
  if (result.status === "unchanged") return
  if (result.status !== "ready")
    return yield* new RelayWorkflowBinding.Held({
      reason: "WORKFLOW_COLD_REVIEW_STALE",
      detail:
        result.status === "outside"
          ? `The working tree changes paths outside the approved writePaths ${JSON.stringify(writePaths)}: ${JSON.stringify(result.outside.slice(0, 10))}.`
          : `The workers' result is ${result.status}.`,
    })
  // The workers' result needs its own code review, bound to this exact tree. Only a result nobody reviewed yet holds
  // before grading; a FIX_FIRST or REJECT is a graded failure that spends the gate's retry budget.
  const code = yield* WorkflowReviewV2.receipt(services.db, binding.sessionID, validation.id, result.tree)
  if (!code)
    return yield* new RelayWorkflowBinding.Held({
      reason: WorkflowReviewV2.REQUIRED,
      detail: `The workers' result (tree ${result.tree}) has no code review. Maestro calls maestro_request_review with stage "code", the approved validationRecordID and its work card, then on APPROVE or FIX_FIRST resumes this workflow Task with its task_id ${binding.taskID} and exactly the approved dispatch input. A REJECT needs a new plan round.`,
    })
  if (
    code.data.sessionID !== binding.sessionID ||
    code.data.validationRecordID !== validation.id ||
    code.data.projectID !== binding.projectID ||
    code.data.reviewerID !== "lucy" ||
    code.data.workCardHash !== validation.workCardHash ||
    code.data.artifact.workCardHash !== validation.workCardHash ||
    code.data.routedMemberID !== validation.routedMemberID ||
    code.data.rosterHash !== validation.rosterHash ||
    code.data.grantHash !== validation.grantHash ||
    code.data.reviewPolicyHash !== validation.reviewPolicyHash ||
    !isDeepStrictEqual(code.data.actor, MaestroReviewRecords.actor(session, "lucy"))
  )
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_COLD_REVIEW_MISSING" })
  // Checked after the receipt's bindings, so findings that reach the workers come only from a receipt bound to this
  // validation, card and reviewer. `receiptID` names it for the host that grades a resumed held step.
  if (code.data.verdict !== "APPROVE")
    return yield* new RelayWorkflowBinding.Held({
      reason: WorkflowReviewV2.NOT_APPROVED,
      receiptID: code.id,
      detail: `The code review of the workers' result (tree ${result.tree}) is ${code.data.verdict}: ${code.id}. On FIX_FIRST, Maestro resumes this workflow Task with its task_id ${binding.taskID} and exactly the approved dispatch input: the host grades the held step, which spends one retry, and the next attempt carries the recorded findings. A REJECT needs a new plan round.`,
    })
  if (
    code.data.artifact.baseSHA !== review.artifact.headSHA ||
    code.data.artifact.sha256 !== result.sha256 ||
    (yield* real(code.data.artifact.worktree)) !== binding.worktree
  )
    return yield* new RelayWorkflowBinding.Held({ reason: "WORKFLOW_COLD_REVIEW_STALE" })
})

/**
 * The global package-verification check: the fixed native Bun test runner in the placement, sandboxed, with a JUnit
 * report whose counts must agree with its cases; a zero exit alone is not execution evidence. `authorize` asks for the
 * exact command line before anything runs.
 */
export const verification = Effect.fn("WorkflowSettlementV2.verification")(
  function* (directory: string, authorize: (command: string) => Effect.Effect<void, unknown>) {
    const fs = yield* FSUtil.Service
    const processes = yield* AppProcess.Service
    const temporary = yield* fs.makeTempDirectoryScoped({ directory, prefix: ".arsenal-verification-" })
    const file = path.join(temporary, "junit.xml")
    const args = ["test", "--timeout", "30000", "--reporter=junit", `--reporter-outfile=${file}`]
    yield* authorize([process.execPath, ...args].map((item) => JSON.stringify(item)).join(" "))
    const command = yield* ToolSafetySandbox.wrap(ChildProcess.make(process.execPath, args, { cwd: directory, extendEnv: false }))
    const result = yield* processes.run(command, { timeout: "55 seconds", maxOutputBytes: 1024, maxErrorBytes: 1024 })
    const refused = (status: "missing" | "acquisition-error", reason: string) => ({ outcome: { status }, reason })
    if (result.stdoutTruncated || result.stderrTruncated) return refused("acquisition-error", "RUNNER_OUTPUT_OVERFLOW")
    const info = yield* fs.stat(file).pipe(Effect.orElseSucceed(() => undefined))
    if (!info) return refused("missing", "RUNNER_REPORT_MISSING")
    if (info.type !== "File" || info.size > 512 * 1024) return refused("acquisition-error", "RUNNER_REPORT_OVERFLOW_OR_TYPE")
    if ((yield* fs.realPath(file)) !== file) return refused("acquisition-error", "RUNNER_REPORT_SYMLINK")
    const bytes = yield* fs.readFileString(file)
    if (Buffer.byteLength(bytes, "utf8") !== Number(info.size)) return refused("acquisition-error", "RUNNER_REPORT_CHANGED")
    const document = yield* Effect.gen(function* () {
      const { XMLParser, XMLValidator } = yield* Effect.tryPromise(() => import("fast-xml-parser"))
      if (XMLValidator.validate(bytes, { allowBooleanAttributes: false }) !== true) return undefined
      const parsed = yield* Effect.try({
        try: () =>
          new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@",
            parseTagValue: false,
            parseAttributeValue: false,
            trimValues: false,
            processEntities: false,
            isArray: (name: string) => name === "testsuite" || name === "testcase",
          }).parse(bytes),
        catch: (error) => error,
      })
      return Option.getOrUndefined(Schema.decodeUnknownOption(Document)(parsed))?.testsuites
    }).pipe(Effect.orElseSucceed(() => undefined))
    if (!document) return refused("acquisition-error", "RUNNER_REPORT_INVALID_OR_PARSER_UNAVAILABLE")
    const suites = document.testsuite
    const cases = suites.flatMap((suite) =>
      (suite.testcase ?? []).map((item) => ({
        assertions: item["@assertions"],
        status: "skipped" in item ? "skip" : "failure" in item || "error" in item ? "fail" : "pass",
      })),
    )
    const skipped = cases.filter((item) => item.status === "skip").length
    const failed = cases.filter((item) => item.status === "fail").length
    if (
      !suites.length ||
      !cases.length ||
      cases.length > 4096 ||
      document["@tests"] !== cases.length ||
      document["@skipped"] !== skipped ||
      document["@failures"] !== failed ||
      document["@assertions"] !== cases.reduce((total, item) => total + item.assertions, 0) ||
      suites.some(
        (suite) =>
          suite["@tests"] !== (suite.testcase ?? []).length ||
          suite["@assertions"] !== (suite.testcase ?? []).reduce((total, item) => total + item["@assertions"], 0) ||
          suite["@skipped"] !== (suite.testcase ?? []).filter((item) => "skipped" in item).length ||
          suite["@failures"] !== (suite.testcase ?? []).filter((item) => "failure" in item || "error" in item).length,
      )
    )
      return refused("acquisition-error", "RUNNER_COUNTS_EMPTY_OR_CONTRADICTORY")
    const outcome: Outcome =
      failed || result.exitCode !== 0
        ? { status: "fail", exitCode: result.exitCode === 0 ? 1 : Math.min(255, Math.max(1, result.exitCode)) }
        : skipped
          ? { status: "skip" }
          : { status: "pass", exitCode: 0 }
    return { outcome, reason: skipped ? "RUNNER_SKIPPED_CASES" : undefined }
  },
  Effect.scoped,
)

/**
 * Maestro may request the release of a parked arm, but only the owner's answer to the approval releases it. Approving
 * resets the parked gate's retry budget only; rejecting leaves the arm parked, which is the owner cancelling it.
 */
export const release = Effect.fn("WorkflowSettlementV2.release")(function* (input: {
  readonly relay: Relay.Interface
  readonly token: RelayArm.Token
  readonly reason: string
  readonly approve: (message: string) => Effect.Effect<void, unknown>
}) {
  const unavailable = () => new ToolFailure({ message: "COMPLETION_RELEASE_UNAVAILABLE" })
  const parked = yield* input.relay.parked(input.token).pipe(Effect.mapError(unavailable))
  if (Option.isNone(parked)) return yield* new ToolFailure({ message: "COMPLETION_RELEASE_NOT_PARKED" })
  yield* input
    .approve(`${Relay.parkedHold(parked.value.wp, parked.value.failing)} Release requested: ${input.reason}`)
    .pipe(Effect.mapError(() => new ToolFailure({ message: "COMPLETION_RELEASE_REJECTED" })))
  yield* input.relay.release(input.token, `owner: ${input.reason}`).pipe(Effect.mapError(unavailable))
})

const MAX_DIFF = 2 * 1024 * 1024
const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/
const PlanReference = Schema.Struct({ planRevisionID: Schema.optional(Schema.String) })

// Bun's JUnit reporter as the earlier runtime reads it: every count is a bounded integer string, and absent counts never decode.
const Count = Schema.NumberFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0), Schema.isLessThanOrEqualTo(4096))
const Case = Schema.Struct({
  "@name": Schema.NonEmptyString,
  "@file": Schema.NonEmptyString,
  "@assertions": Count,
  skipped: Schema.optional(Schema.Unknown),
  failure: Schema.optional(Schema.Unknown),
  error: Schema.optional(Schema.Unknown),
})
const Suite = Schema.Struct({
  "@tests": Count,
  "@failures": Count,
  "@skipped": Count,
  "@assertions": Count,
  testcase: Schema.optional(Schema.Array(Case)),
})
const Document = Schema.Struct({
  testsuites: Schema.Struct({
    "@tests": Count,
    "@failures": Count,
    "@skipped": Count,
    "@assertions": Count,
    testsuite: Schema.Array(Suite),
  }),
})
