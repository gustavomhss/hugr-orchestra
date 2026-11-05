export * as MaestroReviewTools from "./review"

import { createHash } from "node:crypto"
import os from "node:os"
import path from "node:path"
import { and, desc, eq } from "drizzle-orm"
import { Context, Effect, Layer, Option, Schema, type Scope } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Node } from "@orchestra/core/effect/app-node"
import { BoardProjectTable } from "@orchestra/core/board/sql"
import { BoardThread } from "@orchestra/core/board/thread"
import type { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import type { GitCli } from "@orchestra/core/git-cli"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { ReviewSeatTools } from "@orchestra/core/review/seat-tools"
import { ReviewSettings } from "@orchestra/core/review/settings"
import { ReviewTools } from "@orchestra/core/review/tools"
import { ReviewAnalyze } from "@orchestra/core/review-toolkit/analyze"
import { ReviewProbe } from "@orchestra/core/review-toolkit/probe"
import { ReviewScratch } from "@orchestra/core/review-toolkit/scratch-copy"
import { AppProcess } from "@orchestra/core/process"
import { SessionSchema, type SessionV2 } from "@orchestra/core/session"
import { SessionExecution } from "@orchestra/core/session/execution"
import { TaskTool } from "@orchestra/core/tool/task"
import { Tool } from "@orchestra/core/tool/tool"
import { MaestroEvent } from "@orchestra/schema/maestro-event"
import { SessionMessage } from "@orchestra/schema/session-message"
import { validateWorkContract, workContractSections, type WorkContractValidation } from "../../work-contract"
import { GovernanceEvidenceV2 } from "../governance/evidence"
import { GovernanceRecordsV2 } from "../governance/records"
import { ReviewResultV2 } from "../governance/review-result"
import { MaestroChainTools } from "./chain"
import { MaestroToolGate } from "./gate"
import { MaestroReviewRecords } from "./review-records"
import { ReviewFanoutV2 } from "../workflow/review-fanout"
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
  // The board card under review, as KEY-n; its thread records the request and the verdict.
  card: Schema.optional(Schema.String),
  // Catalog ids of the running build. The profile defaults from `stage`; the tier from the project pin, else the
  // route's risk rule.
  profile: Schema.optional(Schema.NonEmptyString),
  tier: Schema.optional(Schema.NonEmptyString),
})

const ReviewInput = Schema.Struct({
  validationRecordID: Schema.String,
  workCard: Schema.String,
  reviewMethodVersion: Schema.String,
  verdict: Schema.Literals(["APPROVE", "FIX_FIRST", "REJECT"]),
  // K1: the full finding record; `recordReview` requires the routed fields on `review-v2` receipts.
  findings: Schema.Array(MaestroEvent.Review.Finding),
  // K10: the routing record's and the catalog's digests, and the outcome of every analyzer item a model read.
  routingDigest: Schema.optional(Schema.String),
  catalogDigest: Schema.optional(Schema.String),
  items: Schema.optional(Schema.Array(MaestroEvent.Review.Item)),
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

/** The host's analyze step (fan-out step 2), at the reviewed revisions. */
export type Analyze = (
  input: ReviewFanoutV2.AnalyzeInput & {
    readonly worktree: string
    readonly base: string
    readonly head: string
    readonly sessionID: SessionSchema.ID
    readonly changes?: ReadonlyArray<{ readonly path: string; readonly added: ReadonlyArray<{ readonly line: number }> }>
  },
) => Effect.Effect<ReviewFanoutV2.Analysis, Tool.Failure>

const analyzeStep = (processes: AppProcess.Interface): Analyze => (input) => {
  const changed: Record<string, { start: number; end: number }[]> = {}
  for (const change of input.changes ?? []) {
    const lines = change.added.map((line) => line.line)
    if (lines.length === 0) continue
    changed[change.path] = [{ start: Math.min(...lines), end: Math.max(...lines) }]
  }
  return ReviewAnalyze.run({
    worktree: input.worktree,
    base: input.base,
    head: input.head,
    tier: ReviewRouting.tier(input.routing),
    store: analysisStore(input.cache),
    changed,
    trusted: true,
    lane: "repo",
    packs: input.packs.map((pack) => pack.id),
    scope: "diff",
    files: [...input.files],
  }).pipe(
    Effect.provideService(AppProcess.Service, processes),
    Effect.mapError((error) => new Tool.Failure({ message: `ReviewAnalyzeFailed: ${String(error)}` })),
  )
}

const seatStages: ReviewFanoutV2.Stages = {
  lead: ReviewSeatTools.lead,
  lens: ReviewSeatTools.lens,
  verifier: ReviewSeatTools.verifier,
  final: ReviewSeatTools.final,
}

/** Validation, cold-review delegation and the review receipt, as the earlier runtime records them. */
export function tools(input: {
  readonly services: MaestroChainTools.Services
  readonly gate: MaestroToolGate.Gate
  readonly sessions: Option.Option<SessionV2.Interface>
  readonly execution: Option.Option<SessionExecution.Interface>
  // Seams over the review toolkit and the seat's stage tool sets; the defaults are the running build's.
  readonly analyze?: Analyze
  readonly stages?: ReviewFanoutV2.Stages
  readonly processes: AppProcess.Interface
}) {
  const services = input.services
  const analyze = input.analyze ?? analyzeStep(input.processes)
  const stages = input.stages ?? seatStages
  // Lead Sessions in their final turn: the only place the record tool opens for a scoped review Session.
  const finishing = new Set<string>()
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
          const card = params.card ? yield* BoardThread.card(services.db, params.card).pipe(Effect.orDie) : undefined
          if (params.card && !card) return yield* new Tool.Failure({ message: `Card ${params.card} is not on the board` })
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
          if (card)
            yield* BoardThread.write(services.db, {
              id: `bno_review_${params.validationRecordID}_${stage}`, issue: card.id, kind: "review", author: "maestro", body: `Review requested (${stage}).`,
            }).pipe(Effect.orDie)
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
          // K8: the profile follows the stage unless named; route rejects an unsupported profile or tier by name.
          const profile = params.profile ?? stage
          if (profile === "rereview" && stage !== "code")
            return yield* new Tool.Failure({
              message:
                'ReviewRequestRejected: rereview-stage. A rereview continues a code-stage round after FIX_FIRST; pass stage "code" (a plan-stage receipt is recorded once per validation).',
            })
          const first =
            profile === "rereview" ? yield* firstRound(services.db, sessions, parent.id, params.validationRecordID) : undefined
          if (profile === "rereview" && !first)
            return yield* new Tool.Failure({
              message:
                "ReviewRequestRejected: rereview-first-round-missing. No earlier code-stage review card exists for this validation; request profile \"code\" first.",
            })
          // The lead derives from the reviewed tree, so a retried call adopts the same Sessions and a rereview finds them.
          const lead = leadID(parent.id, params.validationRecordID, stage, artifact.headSHA)
          const delta =
            first && first.reviewed !== artifact.headSHA
              ? yield* MaestroReviewRecords.diffArtifact(git, worktree, first.reviewed, artifact.headSHA)
              : undefined
          if (delta && (delta.diff.exitCode !== 0 || delta.diff.truncated))
            return yield* new Tool.Failure({ message: "Review delta since the first round is unavailable" })
          const diff = delta ? delta.diff.text() : artifact.diff
          const changes = ReviewFanoutV2.changes(diff)
          const listed = (revision: string) =>
            git
              .run(["ls-tree", "-r", "-z", "--name-only", revision], { cwd: worktree })
              .pipe(Effect.map((result) => (result.exitCode === 0 ? result.text().split("\0").filter(Boolean) : [])))
          const rules = yield* ReviewFanoutV2.baseRules(git, worktree, artifact.baseSHA, artifact.changedPaths)
          const settings = yield* reviewSettings(services.db, parent.projectID)
          // The earlier runtime rechecks just before the provider runs; V2 rechecks just before the first drain starts. The code
          // stage needs the workers' result to still be the exact tree under review.
          const current =
            planned && scope
              ? yield* codeArtifact(git, worktree, artifact.baseSHA, scope).pipe(
                  Effect.map((next) => next.headSHA === artifact.headSHA),
                  Effect.orElseSucceed(() => false),
                )
              : yield* GovernanceEvidenceV2.contextIsCurrent(services, record)
          if (!current) return "LUCY_ERROR: Error: Review context changed before provider execution"
          const sessionID = (key: string) =>
            key === "lead" ? lead : SessionSchema.ID.make(`ses_lucy_review_${sha256(`${lead}\0${key}`)}`)
          const cache = `review_${params.validationRecordID}_${stage}`
          const leadLenses: string[] = []
          const ledger = ReviewProbe.ledger()
          const copies = yield* Effect.cached(
            Effect.all(
              {
                head: ReviewScratch.create({ worktree, revision: artifact.headSHA }),
                base: ReviewScratch.create({ worktree, revision: artifact.baseSHA }),
              },
              { concurrency: 1 },
            ).pipe(Effect.provideService(AppProcess.Service, input.processes)),
          )
          const binding = reviewBinding({ worktree, diff, cache, lenses: leadLenses, ledger, copies })
          const port: ReviewFanoutV2.Port = {
            create: (child) =>
              sessions
                .create({
                  id: sessionID(child.key),
                  // Children hang under the lead; only the lead answers to Maestro's Session and may record.
                  parentID: child.role === "lead" ? parent.id : lead,
                  agent: AgentV2.ID.make("lucy"),
                  // D3: no verifier model is configured in this build, so verifiers run the lead's model with a refutation brief.
                  ...(parent.model ? { model: parent.model } : {}),
                  location: parent.location,
                })
                .pipe(
                  Effect.map((created) => created.id),
                  Effect.mapError(() => new Tool.Failure({ message: `Session ${parent.id} is not available` })),
                ),
            run: (child, brief, turn) =>
              Effect.gen(function* () {
                const promptID = SessionMessage.ID.make(`msg_lucy_review_${sha256(`${child}\0${turn.key}`)}`)
                yield* sessions
                  .prompt({ id: promptID, sessionID: child, prompt: { text: brief }, delivery: "queue", resume: false })
                  .pipe(Effect.mapError((error) => new Tool.Failure({ message: `Review delegation prompt refused: ${error._tag}` })))
                if (turn.finish) finishing.add(child)
                const failed = yield* execution.resume(child, { interruptOnCancel: true }).pipe(
                  Effect.as(undefined),
                  Effect.catch((error) => Effect.succeed(error)),
                  Effect.ensuring(Effect.sync(() => finishing.delete(child))),
                )
                if (failed !== undefined) return yield* new Tool.Failure({ message: `LUCY_ERROR: ${String(failed)}` })
                const messages = yield* sessions
                  .messages({ sessionID: child, order: "asc" })
                  .pipe(Effect.mapError(() => new Tool.Failure({ message: `Session ${child} is not available` })))
                return (
                  TaskTool.completedReply(messages, promptID)?.content.findLast(
                    (part): part is SessionMessage.AssistantText => part.type === "text",
                  )?.text ?? ""
                )
              }),
            analyze: (step) =>
              analyze({ ...step, worktree, base: artifact.baseSHA, head: artifact.headSHA, sessionID: lead, changes }),
            region: (file, start, end) =>
              git
                .run(["show", `${artifact.headSHA}:${file}`], { cwd: worktree })
                .pipe(
                  Effect.map((result) => (result.exitCode === 0 ? result.text().split("\n").slice(start - 1, end).join("\n") : "")),
                ),
            binding,
            allow: (ids) =>
              Effect.sync(() => {
                for (const id of ids) if (!leadLenses.includes(id)) leadLenses.push(id)
              }),
          }
          const ran = yield* Effect.scoped(ReviewFanoutV2.run(
            {
              request: {
                stage,
                settings,
                ...(params.profile ? { profile: params.profile } : {}),
                ...(params.tier ? { tier: params.tier } : {}),
                ...(first ? { firstRound: first.card.tier } : {}),
              },
              base: { files: yield* listed(artifact.baseSHA) },
              head: { files: yield* listed(artifact.headSHA), changes },
              catalog: ReviewCatalog.current,
              stages,
              skills: yield* services.atlas.skills.list(),
              fs: services.atlas.fs,
              store: services.store,
              verifierModel: "same",
              cache,
              reviewed: artifact.headSHA,
              facts: {
                workCard: params.workCard,
                diff,
                rules,
                scope: {
                  base: artifact.baseSHA,
                  head: artifact.headSHA,
                  files: artifact.changedPaths.length,
                  changedLines: changes.reduce((sum, change) => sum + change.added.length + change.removed, 0),
                },
                record: [
                  stage === "plan" ? PLAN_STAGE : CODE_STAGE,
                  `validationRecordID: ${params.validationRecordID}`,
                  `plan revision JSON: ${JSON.stringify(plan)}`,
                  `artifact JSON: ${JSON.stringify({ baseSHA: artifact.baseSHA, headSHA: artifact.headSHA, changedPaths: artifact.changedPaths, sha256: artifact.sha256, worktree })}`,
                  `checks JSON: ${JSON.stringify(validation.checks)}`,
                  `work card (pass it byte for byte as workCard):\n${params.workCard}`,
                  `Call maestro_record_review exactly once with stage "${stage}", the reviewMethodVersion above, your verdict, the confirmed findings as full finding records each cited on its line, the routingDigest and catalogDigest above, the outcome of every analyzer item read, the exact artifact JSON and the exact checks JSON above.`,
                  "Never edit files or include transcript/model history.",
                ],
              },
              ...(first ? { firstRound: first } : {}),
            },
            port,
          ))
          if (ran.status === "unaddressed")
            return `${WorkflowReviewV2.UNADDRESSED}: the workers left the reviewed tree ${artifact.headSHA} unchanged since the last review round.`
          const review = planned
            ? yield* WorkflowReviewV2.receipt(services.db, parent.id, params.validationRecordID, artifact.headSHA).pipe(
                Effect.map((row) => (row ? { id: row.id, ...row.data } : undefined)),
              )
            : yield* MaestroReviewRecords.findReview(services, parent.id, params.validationRecordID)
          if (review) {
            const verdict = [`${review.verdict}: ${review.id}`, ...MaestroReviewRecords.renderFindings(review.findings)].join(
              "\n",
            )
            if (card)
              yield* BoardThread.write(services.db, { id: `bno_verdict_${review.id}`, issue: card.id, kind: "review", author: "lucy", body: verdict }).pipe(Effect.orDie)
            return verdict
          }
          return ran.reply ? `LUCY_NO_RECEIPT: ${ran.reply}` : `LUCY_NO_RECEIPT: ${ran.lead}`
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
          // A scoped review Session holds the record tool for its final turn only (§8.7).
          if ((yield* services.store.scope(context.sessionID)) && !finishing.has(context.sessionID))
            return yield* new Tool.Failure({ message: "Review recording opens only in the lead's final turn" })
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
            ...(params.routingDigest ? { routingDigest: params.routingDigest } : {}),
            ...(params.catalogDigest ? { catalogDigest: params.catalogDigest } : {}),
            ...(params.items ? { items: params.items } : {}),
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

function leadID(parentID: string, validationRecordID: string, stage: string, reviewed: string) {
  return SessionSchema.ID.make(`ses_lucy_review_${sha256([parentID, validationRecordID, stage, reviewed].join("\0"))}`)
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

const decodeReceipt = Schema.decodeUnknownOption(MaestroEvent.Review.ReceivedV2.data)

// The round a rereview continues: the newest code-stage receipt for the validation and the card its lead wrote.
const firstRound = Effect.fn("MaestroReviewTools.firstRound")(function* (
  db: Database.Interface["db"],
  sessions: SessionV2.Interface,
  parentID: SessionSchema.ID,
  validationRecordID: string,
) {
  const rows = yield* db
    .select({ data: EventV2.EventTable.data })
    .from(EventV2.EventTable)
    .where(
      and(
        eq(EventV2.EventTable.aggregate_id, parentID),
        eq(EventV2.EventTable.type, EventV2.versionedType(MaestroEvent.Review.ReceivedV2.type, 2)),
      ),
    )
    .orderBy(desc(EventV2.EventTable.seq))
    .all()
    .pipe(Effect.orDie)
  const receipt = rows
    .flatMap((row) => Option.toArray(decodeReceipt(row.data)))
    .find((data) => data.validationRecordID === validationRecordID && data.stage === "code")
  if (!receipt) return undefined
  const messages = yield* sessions
    .messages({ sessionID: leadID(parentID, validationRecordID, "code", receipt.artifact.headSHA), order: "asc" })
    .pipe(Effect.orElseSucceed(() => []))
  const card = messages
    .flatMap((message) =>
      message.type === "assistant" ? message.content.flatMap((part) => (part.type === "text" ? [part.text] : [])) : [],
    )
    .map((text) => ReviewResultV2.parse(text))
    .findLast((parsed) => parsed !== undefined)
  return card ? { card, reviewed: receipt.artifact.headSHA } : undefined
})

// The tier pin and accepted-unavailable lanes of the board project over this repository; several name no single pin.
const reviewSettings = Effect.fn("MaestroReviewTools.reviewSettings")(function* (
  db: Database.Interface["db"],
  projectID: NonNullable<(typeof BoardProjectTable.$inferSelect)["repo_project_id"]>,
) {
  const rows = yield* db
    .select({ tier: BoardProjectTable.review_tier, acceptedUnavailable: BoardProjectTable.review_accepted_unavailable })
    .from(BoardProjectTable)
    .where(eq(BoardProjectTable.repo_project_id, projectID))
    .all()
    .pipe(Effect.orDie)
  return ReviewSettings.read(rows.length === 1 ? { review: rows[0] } : {})
})

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

const PROBE_TIMEOUT_SECONDS = 60

export const analysisStore = (cache: string) => path.join(os.tmpdir(), "orchestra-review", cache)

/** Logical citation URIs are keys, never filesystem paths supplied by a model. */
export const rawArtifactPath = (cache: string, uri: string) => path.join(analysisStore(cache), "raw", `${sha256(uri)}.json`)

/** The binding a review Session holds until the review's scope closes. Scratch copies are made once, for verifiers. */
export const reviewBinding = (held: {
  readonly worktree: string
  readonly diff: string
  readonly cache: string
  readonly lenses: string[]
  readonly ledger: ReviewProbe.Ledger
  readonly copies: Effect.Effect<
    { readonly head: ReviewScratch.Snapshot; readonly base: ReviewScratch.Snapshot },
    unknown,
    Scope.Scope
  >
}) => (bound: ReviewFanoutV2.BindInput) =>
  Effect.gen(function* () {
    if (bound.lenses) {
      for (const id of bound.lenses) if (!held.lenses.includes(id)) held.lenses.push(id)
    }
    const pageable = bound.lens !== undefined || (bound.lenses?.length ?? 0) > 0
    const needsProbe = bound.role === "verifier" && Object.values(bound.offered ?? {}).flat().some((id) => ReviewProbe.BUILT.some((built) => built === id))
    const made = needsProbe ? yield* held.copies.pipe(Effect.catch(() => Effect.succeed(undefined))) : undefined
    return {
      repository: held.worktree,
      retain: (artifact: { readonly uri: string; readonly text: string }) => Effect.promise(async () => {
        await Bun.write(rawArtifactPath(held.cache, artifact.uri), JSON.stringify(artifact))
      }),
      ...(pageable
        ? {
            analyze: {
              lens: bound.lens ?? held.lenses[0] ?? "none",
              ...(bound.role === "lead" ? { lenses: held.lenses } : {}),
              page: (input: ReviewTools.Page) =>
                ReviewAnalyze.page({
                  store: analysisStore(held.cache),
                  uri: typeof bound.retained === "function" ? bound.retained() : bound.retained,
                  lens: input.lens,
                  ...(input.filter ? { filter: input.filter } : {}),
                  ...(input.cursor ? { cursor: input.cursor } : {}),
                }).pipe(Effect.mapError((error) => new Tool.Failure({ message: `review_analyze ${error.reason}` }))),
            },
          }
        : {}),
      ...(made
        ? {
            probe: {
              reviewID: held.cache,
              head: made.head,
              base: made.base,
              offered: bound.offered ?? {},
              cap: bound.cap,
              hunks: ReviewFanoutV2.hunks(held.diff),
              ledger: held.ledger,
              timeoutSeconds: PROBE_TIMEOUT_SECONDS,
            },
          }
        : {}),
      ...(needsProbe && !made ? { probeUnavailable: "review_probe could not make a scratch copy of the reviewed tree" } : {}),
    }
  })
