export * as MaestroReviewTools from "./review"

import { Context, Effect, Layer, Option, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Node } from "@orchestra/core/effect/app-node"
import type { GitCli } from "@orchestra/core/git-cli"
import type { SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { TaskTool } from "@orchestra/core/tool/task"
import { Tool } from "@orchestra/core/tool/tool"
import type { SessionMessage } from "@orchestra/schema/session-message"
import { validateWorkContract, workContractSections, type WorkContractValidation } from "../../work-contract"
import { GovernanceEvidenceV2 } from "../governance/evidence"
import { GovernanceRecordsV2 } from "../governance/records"
import { MaestroChainTools } from "./chain"
import { MaestroToolGate } from "./gate"
import { MaestroReviewRecords } from "./review-records"
import { WorkflowReviewV2 } from "../workflow/review"

export const names = {
  validation: "maestro_record_validation",
  request: "maestro_request_review",
  review: "maestro_record_review",
} as const

/** The process-global Session execution, when the host exports one; without it a cold review is refused. */
export class Execution extends Context.Service<Execution, Option.Option<SessionExecution.Interface>>()(
  "@orchestra/maestro/tools/Execution",
) {}

export const executionNode = Node.makeGlobalNode({
  // A capture, never a fresh execution graph: the Location reads the process's own execution service when it has one.
  name: "maestro/tools/global/execution",
  layer: Layer.effect(Execution, Effect.serviceOption(SessionExecution.Service)),
  deps: [],
})

const Check = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(["PASS", "FAIL", "HOLD"]),
  detail: Schema.String,
})

const ValidationInput = Schema.Struct({
  planRevisionID: Schema.String,
  contextRecordID: Schema.String,
  contextHash: Schema.String,
  projectID: Schema.String,
  workCardID: Schema.String,
  workCard: Schema.String,
  routedMemberID: Schema.String,
  validatorVersion: Schema.String,
  checks: Schema.Array(Check).annotate({
    description:
      "Nonempty observed evidence, with unique check IDs ordered lexicographically by ID. Do not claim unobserved checks passed.",
  }),
})

const RequestInput = Schema.Struct({
  validationRecordID: Schema.String,
  workCard: Schema.String,
  reviewMethodVersion: Schema.String,
  // `plan` (default) reviews before approval; `code` reviews what the workers committed after it.
  stage: Schema.optional(Schema.Literals(["plan", "code"])),
})

const ReviewInput = Schema.Struct({
  validationRecordID: Schema.String,
  workCard: Schema.String,
  reviewMethodVersion: Schema.String,
  verdict: Schema.Literals(["APPROVE", "FIX_FIRST", "REJECT"]),
  findings: Schema.Array(Schema.Struct({ path: Schema.String, line: Schema.Number, message: Schema.String })),
  artifact: Schema.Struct({
    baseSHA: Schema.NonEmptyString,
    headSHA: Schema.NonEmptyString,
    worktree: Schema.NonEmptyString,
    changedPaths: Schema.Array(Schema.NonEmptyString),
    sha256: Schema.NonEmptyString,
  }),
  checks: Schema.Array(Check),
  stage: Schema.optional(Schema.Literals(["plan", "code"])),
})

/** Validation, cold-review delegation and the review receipt, as the earlier runtime records them. */
export function tools(input: {
  readonly services: MaestroChainTools.Services
  readonly gate: MaestroToolGate.Gate
  readonly sessions: Option.Option<SessionV2.Interface>
  readonly execution: Option.Option<SessionExecution.Interface>
}) {
  const services = input.services
  return {
    [names.validation]: Tool.make({
      description: "Record validation evidence for one routed work card. Maestro only.",
      input: ValidationInput,
      output: Schema.String,
      execute: (params, context) =>
        Effect.gen(function* () {
          yield* input.gate(context, AgentV2.defaultID, "Validation recording requires Maestro")
          if (!params.planRevisionID || !params.contextRecordID || !params.contextHash)
            return yield* new Tool.Failure({
              message: "Validation requires non-empty planRevisionID, contextRecordID, and contextHash",
            })
          // A routed card is one seat-bound unit of work, a work package.
          const contract = validateWorkContract({ kind: "work-package", body: params.workCard })
          if (contract.status === "HOLD") return yield* new Tool.Failure({ message: workCardRejection(contract) })
          const plan = yield* GovernanceRecordsV2.readPlanRevision(services.db, params.planRevisionID)
          const record = yield* GovernanceRecordsV2.readContext(services.db, params.contextRecordID)
          if (!plan) return yield* new Tool.Failure({ message: "Validation planRevisionID not found" })
          if (!record) return yield* new Tool.Failure({ message: "Validation contextRecordID not found" })
          if (record.planRevisionID !== plan.id)
            return yield* new Tool.Failure({ message: "Validation context does not match PlanRevision" })
          if (record.contextHash !== params.contextHash)
            return yield* new Tool.Failure({ message: "Validation contextHash does not match ContextRecord" })
          if (!(yield* GovernanceEvidenceV2.contextIsCurrent(services, record)))
            return yield* new Tool.Failure({
              message: `Validation context is stale: ${MaestroChainTools.STALE_CONTEXT_NEXT_STEP}`,
            })
          const session = yield* services.store.get(context.sessionID)
          if (!session) return yield* new Tool.Failure({ message: "Validation session not found" })
          if (
            plan.sessionID !== session.id ||
            record.sessionID !== session.id ||
            record.projectID !== session.projectID ||
            record.directory !== session.location.directory
          )
            return yield* new Tool.Failure({ message: "Validation context does not match Session" })
          const recorded = yield* MaestroReviewRecords.recordValidation(services, {
            planRevisionID: params.planRevisionID,
            contextRecordID: params.contextRecordID,
            contextHash: params.contextHash,
            projectID: session.projectID,
            sessionID: context.sessionID,
            workCardID: params.workCardID,
            workCard: params.workCard,
            routedMemberID: params.routedMemberID,
            validatorVersion: params.validatorVersion,
            checks: params.checks,
          })
          const bindings = {
            validationRecordID: recorded.id,
            validationHash: MaestroReviewRecords.hash(recorded),
            policyHash: recorded.reviewPolicyHash,
            workCardHash: recorded.workCardHash,
            ...("reviewBaseSHA" in recorded ? { reviewBaseSHA: recorded.reviewBaseSHA } : {}),
          }
          return `${recorded.outcome}: ${recorded.id}\n\nBindings: ${JSON.stringify(bindings)}`
        }),
    }),
    [names.request]: Tool.make({
      description:
        'Delegate one read-only cold review to the native cold reviewer (`lucy`). Maestro only. Stage "plan" (default) reviews the plan and its committed spec before approval; stage "code" reviews what the workers committed after it, before the workflow completes.',
      input: RequestInput,
      output: Schema.String,
      execute: (params, context) =>
        Effect.gen(function* () {
          yield* input.gate(context, AgentV2.defaultID, "Review delegation requires Maestro")
          const validation = yield* GovernanceRecordsV2.readValidation(services.db, params.validationRecordID)
          if (
            !validation ||
            validation.sessionID !== context.sessionID ||
            validation.workCardHash !== MaestroReviewRecords.workCardHash(params.workCard)
          )
            return yield* new Tool.Failure({
              message:
                "Review delegation validation mismatch: pass a validationRecordID recorded in this Session and the byte-identical workCard it validated.",
            })
          if (!validation.contextRecordID || !validation.contextHash)
            return yield* new Tool.Failure({ message: "Review delegation requires bound context" })
          const stage = params.stage ?? "plan"
          if (Option.isNone(input.sessions) || Option.isNone(input.execution))
            return yield* MaestroToolGate.hold(
              "session-execution-unavailable",
              "This host exports no process-global Session service to run the cold reviewer's child Session; the owner decides.",
            )
          const sessions = input.sessions.value
          const execution = input.execution.value
          const parent = yield* services.store.get(context.sessionID)
          if (!parent) return yield* new Tool.Failure({ message: `Session ${context.sessionID} is not available` })
          const record = yield* GovernanceRecordsV2.readContext(services.db, validation.contextRecordID)
          if (
            !record ||
            record.sessionID !== parent.id ||
            record.planRevisionID !== validation.planRevisionID ||
            record.projectID !== parent.projectID ||
            validation.projectID !== parent.projectID ||
            record.directory !== parent.location.directory ||
            record.contextHash !== validation.contextHash ||
            record.changedPaths.length > 0 ||
            // The workers move HEAD after approval; the code stage binds to the plan review's head instead.
            (stage === "plan" && !(yield* GovernanceEvidenceV2.contextIsCurrent(services, record)))
          )
            return yield* new Tool.Failure({
              message: `Review delegation context is stale or dirty: ${MaestroChainTools.STALE_CONTEXT_NEXT_STEP}`,
            })
          const git = services.atlas.git
          const head = yield* git.run(["rev-parse", "HEAD"], { cwd: parent.location.directory })
          if (head.exitCode !== 0) return yield* new Tool.Failure({ message: "Review artifact requires Git HEAD" })
          const headSHA = head.text().trim()
          if (stage === "plan" && headSHA !== record.headSHA)
            return yield* new Tool.Failure({ message: "Review delegation context head mismatch" })
          const root = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: parent.location.directory })
          const worktree = root.text().trim()
          if (root.exitCode !== 0 || !worktree)
            return yield* new Tool.Failure({ message: "Review artifact requires Git root" })
          if (!("reviewBaseSHA" in validation))
            return yield* new Tool.Failure({ message: "Review artifact requires bound baseline" })
          const plan = yield* GovernanceRecordsV2.readPlanRevision(services.db, validation.planRevisionID)
          if (!plan) return yield* new Tool.Failure({ message: "Review delegation requires the bound plan revision" })
          const planned =
            stage === "code"
              ? yield* MaestroReviewRecords.findReview(services, context.sessionID, params.validationRecordID)
              : undefined
          if (stage === "code" && planned?.verdict !== "APPROVE")
            return yield* new Tool.Failure({ message: "Code review requires an APPROVE plan review for this validation" })
          const scope = planned ? yield* WorkflowReviewV2.writePaths(services.db, validation.planRevisionID) : undefined
          if (planned && !scope)
            return yield* new Tool.Failure({ message: "Code review requires the plan's bound workflow writePaths" })
          // The bound base comes from validation (plan) or the APPROVE plan review (code), never from the card, so a
          // smaller card cannot shrink the diff.
          const code = planned && scope ? yield* codeArtifact(git, worktree, planned.artifact.headSHA, scope) : undefined
          const artifact = code ?? (yield* planArtifact(git, worktree, validation.reviewBaseSHA, headSHA))
          // The child id derives from the call, so a retried call adopts the same child.
          const child = yield* sessions
            .create({
              id: TaskTool.taskChildID(context),
              parentID: parent.id,
              agent: AgentV2.ID.make("lucy"),
              ...(parent.model ? { model: parent.model } : {}),
              location: parent.location,
            })
            .pipe(Effect.mapError(() => new Tool.Failure({ message: `Session ${parent.id} is not available` })))
          if (!(yield* GovernanceEvidenceV2.contextIsCurrent(services, record)))
            return yield* new Tool.Failure({ message: "Review delegation context changed during child creation" })
          const promptID = TaskTool.taskPromptID(context, child.id)
          yield* sessions
            .prompt({
              id: promptID,
              sessionID: child.id,
              prompt: {
                text: [
                  "Perform one read-only cold review.",
                  stage === "plan" ? PLAN_STAGE : CODE_STAGE,
                  `validationRecordID: ${params.validationRecordID}`,
                  `work card:\n${params.workCard}`,
                  `plan revision JSON: ${JSON.stringify(plan)}`,
                  `reviewMethodVersion: ${params.reviewMethodVersion}`,
                  `artifact JSON: ${JSON.stringify({ baseSHA: artifact.baseSHA, headSHA: artifact.headSHA, changedPaths: artifact.changedPaths, sha256: artifact.sha256, worktree })}`,
                  `diff under review (git diff --binary --full-index ${artifact.baseSHA} ${artifact.headSHA}; read it, do not copy it into the receipt):\n${artifact.diff}`,
                  `checks JSON: ${JSON.stringify(validation.checks)}`,
                  ...("skills" in record
                    ? record.skills.map(
                        (skill) => `<skill_content name="${skill.name}">\n${skill.content}\n</skill_content>`,
                      )
                    : []),
                  `You MUST call maestro_record_review exactly once with stage "${stage}", your evidence-based verdict, cited findings, exact artifact JSON, and exact checks JSON above. Do not answer with a review narrative.`,
                  "Never edit files or include transcript/model history.",
                ].join("\n\n"),
              },
              delivery: "queue",
              resume: false,
            })
            .pipe(Effect.mapError((error) => new Tool.Failure({ message: `Review delegation prompt refused: ${error._tag}` })))
          // The earlier runtime rechecks just before the provider runs; V2 rechecks just before the child's drain starts. The code stage
          // needs the workers' result to still be the exact tree under review.
          const current =
            planned && scope
              ? yield* codeArtifact(git, worktree, artifact.baseSHA, scope).pipe(
                  Effect.map((next) => next.headSHA === artifact.headSHA),
                  Effect.orElseSucceed(() => false),
                )
              : yield* GovernanceEvidenceV2.contextIsCurrent(services, record)
          if (!current) return "LUCY_ERROR: Error: Review context changed before provider execution"
          const failed = yield* execution.resume(child.id, { interruptOnCancel: true }).pipe(
            Effect.as(undefined),
            Effect.catch((error) => Effect.succeed(error)),
          )
          if (failed !== undefined) return `LUCY_ERROR: ${String(failed)}`
          const review = planned
            ? yield* WorkflowReviewV2.receipt(services.db, parent.id, params.validationRecordID, artifact.headSHA).pipe(
                Effect.map((row) => (row ? { id: row.id, ...row.data } : undefined)),
              )
            : yield* MaestroReviewRecords.findReview(services, parent.id, params.validationRecordID)
          if (review)
            return [`${review.verdict}: ${review.id}`, ...MaestroReviewRecords.renderFindings(review.findings)].join(
              "\n",
            )
          const messages = yield* sessions
            .messages({ sessionID: child.id, order: "asc" })
            .pipe(Effect.mapError(() => new Tool.Failure({ message: `Session ${child.id} is not available` })))
          const text =
            TaskTool.completedReply(messages, promptID)?.content.findLast(
              (part): part is SessionMessage.AssistantText => part.type === "text",
            )?.text ?? ""
          return text ? `LUCY_NO_RECEIPT: ${text}` : `LUCY_NO_RECEIPT: ${child.id}`
        }),
    }),
    [names.review]: Tool.make({
      description: "Record cold review evidence for one validation record. Cold reviewer (`lucy`) only.",
      input: ReviewInput,
      output: Schema.String,
      execute: (params, context) =>
        Effect.gen(function* () {
          yield* input.gate(context, "lucy", "Review recording requires the cold reviewer (`lucy`)")
          const child = yield* services.store.get(context.sessionID)
          if (!child?.parentID)
            return yield* new Tool.Failure({ message: "Review recording requires a lucy child session" })
          const recorded = yield* MaestroReviewRecords.recordReview(services, {
            sessionID: child.parentID,
            validationRecordID: params.validationRecordID,
            workCard: params.workCard,
            reviewMethodVersion: params.reviewMethodVersion,
            verdict: params.verdict,
            findings: params.findings,
            artifact: params.artifact,
            checks: params.checks,
            stage: params.stage,
          })
          return `${recorded.verdict}: ${recorded.id}`
        }),
    }),
  }
}

function workCardRejection(contract: Extract<WorkContractValidation, { status: "HOLD" }>) {
  const offending = contract.reasons.map(
    (reason) =>
      `${reason} (${contract.issues
        .filter((issue) => issue.reason === reason)
        .map((issue) => `## ${issue.section}`)
        .join(", ")})`,
  )
  return `Validation rejected workCard: ${offending.join("; ")}. Write exactly one non-empty section under each of these exact headings, each alone on its line at column zero and outside code fences: ${workContractSections.map((name) => `## ${name}`).join(", ")}.`
}

// A plan review that judged the committed branch asked for the planned work itself; the plan stage rules that out.
const PLAN_STAGE = [
  "Stage: plan. This review runs before the owner approves and before any worker runs.",
  "Judge the plan revision (goal, acceptance, scope, units and their Atlas grounding, constraints, risks) and the committed diff (spec, tests and any code already there). The Relay workflow appears only as its binding in the plan revision: publication checksums, parameters, resolved skills and writePaths. Judge those; you cannot read its work packages, so never assume their content.",
  "The planned implementation does not exist yet. A work package that has not run, or a file the plan will change that is still unchanged, is expected and is never a finding.",
  "Return FIX_FIRST or REJECT only for a defect in the plan, its workflow binding or the committed diff: a wrong or untestable acceptance criterion, scope or writePaths that miss or exceed the goal, a wrong spec, test or code, an unguarded risk. Cite each finding on an added line of the diff.",
].join("\n")

const CODE_STAGE = [
  "Stage: code. The owner approved the plan and the workers ran.",
  "The diff is exactly what the workers changed in the working tree since the plan-reviewed head (the artifact baseSHA); the artifact headSHA is that result written as a Git tree. Judge it against the work card and the approved plan revision: correct, complete, tests that exercise the change, no regression or unsafe behavior. The host already holds it inside the approved writePaths.",
  "Cite each finding on an added line of the diff.",
].join("\n")

// The committed branch delta the plan stage reviews.
const planArtifact = Effect.fn("MaestroReviewTools.planArtifact")(function* (
  git: GitCli.Interface,
  worktree: string,
  baseSHA: string,
  headSHA: string,
) {
  const artifact = yield* MaestroReviewRecords.diffArtifact(git, worktree, baseSHA, headSHA)
  if (artifact.diff.truncated)
    return yield* new Tool.Failure({
      message: `Review artifact exceeds ${MaestroReviewRecords.REVIEW_ARTIFACT_MAX_BYTES} bytes: the cold reviewer (\`lucy\`) reviews the whole committed branch delta merge-base(HEAD, <primary remote>/HEAD)..HEAD, here ${baseSHA}..${headSHA}, so splitting the work card does not help. The owner or a maintainer decides: a smaller branch delta, or a primary remote whose HEAD is the real base, then a new validation with a new workCardID.`,
    })
  if (
    artifact.names.exitCode !== 0 ||
    artifact.names.truncated ||
    artifact.diff.exitCode !== 0 ||
    artifact.diff.stdout.length === 0
  )
    return yield* new Tool.Failure({ message: "Review artifact diff unavailable" })
  return { baseSHA, headSHA, changedPaths: artifact.changedPaths, sha256: artifact.sha256, diff: artifact.diff.text() }
})

// The workers' uncommitted result the code stage reviews, written as a tree from the plan-reviewed head.
const codeArtifact = Effect.fn("MaestroReviewTools.codeArtifact")(function* (
  git: GitCli.Interface,
  worktree: string,
  baseSHA: string,
  writePaths: readonly string[],
) {
  const result = yield* WorkflowReviewV2.result(git, {
    worktree,
    base: baseSHA,
    writePaths,
    maxOutputBytes: MaestroReviewRecords.REVIEW_ARTIFACT_MAX_BYTES,
  })
  if (result.status === "ready")
    return { baseSHA, headSHA: result.tree, changedPaths: result.changedPaths, sha256: result.sha256, diff: result.diff }
  return yield* new Tool.Failure({
    message:
      result.status === "head-moved"
        ? `Code review requires HEAD to stay at the plan-reviewed head ${baseSHA}: workers leave their result uncommitted.`
        : result.status === "unchanged"
          ? "Code review has nothing to review: the working tree still matches the plan-reviewed head."
          : result.status === "outside"
            ? `The workers' result changes paths outside the approved writePaths ${JSON.stringify(writePaths)}: ${JSON.stringify(result.outside.slice(0, 10))}.`
            : result.status === "too-large"
              ? `Review artifact exceeds ${MaestroReviewRecords.REVIEW_ARTIFACT_MAX_BYTES} bytes: the code review covers the workers' whole result since the plan review. The owner or a maintainer decides how to split the work.`
              : "Review artifact diff unavailable",
  })
})
