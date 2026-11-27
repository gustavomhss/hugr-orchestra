export * as MaestroReviewTools from "./review"

export { analysisStore, rawArtifactPath, reviewBinding } from "./review-binding"

import { createHash } from "node:crypto"
import { and, desc, eq } from "drizzle-orm"
import { Cause, Context, Effect, Layer, Option, Schema } from "effect"
import { AgentV2 } from "@orchestra/core/agent"
import { Node } from "@orchestra/core/effect/app-node"
import { BoardProjectTable } from "@orchestra/core/board/sql"
import { BoardThread } from "@orchestra/core/board/thread"
import { Database } from "@orchestra/core/database/database"
import { EventV2 } from "@orchestra/core/event"
import { ReviewCatalog } from "@orchestra/core/review/catalog"
import { ReviewPrecisionCatalog } from "@orchestra/core/review/precision-catalog"
import { ReviewPrecisionStore } from "@orchestra/core/review/precision-store"
import { ReviewRouting } from "@orchestra/core/review/routing"
import { ReviewSeatTools } from "@orchestra/core/review/seat-tools"
import { ReviewSettings } from "@orchestra/core/review/settings"
import { ReviewReleaseEvidence } from "@orchestra/core/review-toolkit/release-evidence"
import { ReviewReleaseRequestV2 } from "./review-release"
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
import { MaestroChainTools } from "./chain"
import { MaestroToolGate } from "./gate"
import { ReviewArtifactsV2 } from "./review-artifacts"
import { ReviewBindingV2 } from "./review-binding"
import { MaestroReviewRecords } from "./review-records"
import { ReviewPRRequestV2 } from "./review-pr"
import { ReviewRoundV2 } from "./review-round"
import { ReviewChecksV2 } from "../workflow/review-checks"
import { ReviewCardV2 } from "../workflow/review-card"
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

const GovernedInput = Schema.Struct({
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
  release: Schema.optional(ReviewReleaseEvidence.Input),
  tier: Schema.optional(Schema.NonEmptyString),
}).annotate({ parseOptions: { onExcessProperty: "error" } })
const RequestInput = Schema.Union([GovernedInput, ReviewPRRequestV2.Input])

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
    readonly release?: ReviewReleaseEvidence.Captured
    readonly base: string
    readonly head: string
    readonly sessionID: SessionSchema.ID
    readonly catalog: ReviewCatalog.Catalog
    readonly changes?: ReadonlyArray<{ readonly path: string; readonly added: ReadonlyArray<{ readonly line: number }> }>
  },
) => Effect.Effect<ReviewFanoutV2.Analysis, Tool.Failure>

/** D6 ceiling. The opened project may enter the build lane. An external target must pass false and stay at repo. */
export function analyzeLane(trusted: boolean) {
  return trusted ? "build" as const : "repo" as const
}

const analyzeStep = (processes: AppProcess.Interface): Analyze => (input) => {
  const changed: Record<string, { start: number; end: number }[]> = {}
  for (const change of input.changes ?? []) {
    const lines = change.added.map((line) => line.line)
    if (lines.length === 0) continue
    changed[change.path] = [{ start: Math.min(...lines), end: Math.max(...lines) }]
  }
  // This call reviews the project the owner opened. An external target must not reuse it with trusted true.
  const trusted = true
  return ReviewAnalyze.run({
    worktree: input.worktree,
    base: input.base,
    head: input.head,
    tier: input.executionTier ?? ReviewRouting.tier(input.routing),
    profile: input.routing.profile.id,
    ...(input.release === undefined ? {} : { release: input.release }),
    store: ReviewBindingV2.analysisStore(input.cache),
    changed,
    trusted,
    catalog: input.catalog,
    lane: analyzeLane(trusted),
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
  const finishAuthority = new Map<string, ReviewFanoutV2.FinishAuthorization>()
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
          if ("kind" in params) return yield* ReviewPRRequestV2.run(params, {
            sessionID: context.sessionID, services, sessions: input.sessions, execution: input.execution,
            analyze, stages, processes: input.processes, binding: ReviewBindingV2.reviewBinding, analysisStore: ReviewBindingV2.analysisStore,
            settings: (projectID) => reviewSettings(services.db, projectID),
          }).pipe(Effect.scoped)
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
          const code = planned && scope ? yield* ReviewArtifactsV2.codeArtifact(git, worktree, planned.artifact.headSHA, scope) : undefined
          const artifact = code ?? (yield* ReviewArtifactsV2.planArtifact(git, worktree, validation.reviewBaseSHA, headSHA))
          // K8: the profile follows the stage unless named; route rejects an unsupported profile or tier by name.
          const profile = params.profile ?? stage
          if (profile === "rereview" && stage !== "code")
            return yield* new Tool.Failure({
              message:
                'ReviewRequestRejected: rereview-stage. A rereview continues a code-stage round after FIX_FIRST; pass stage "code" (a plan-stage receipt is recorded once per validation).',
            })
          const first =
            profile === "rereview" ? yield* firstRound(services.db, parent.id, params.validationRecordID) : undefined
          if (profile === "rereview" && !first)
            return yield* new Tool.Failure({
              message:
                "ReviewRequestRejected: rereview-first-round-missing. No earlier code-stage review receipt exists for this validation; request profile \"code\" first.",
            })
          const release = yield* ReviewReleaseRequestV2.capture({
            profile, stage, release: params.release, previousProfile: first?.routing.profile.id,
          }, worktree)
          // Proof identity salts Sessions and analysis together; the reviewed source tree remains the same.
          const lead = leadID(parent.id, params.validationRecordID, stage, ReviewReleaseRequestV2.key(artifact.headSHA, release))
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
          const batches = yield* ReviewPrecisionStore.history().pipe(
            Effect.provideService(Database.Service, { db: services.db }),
            Effect.catchCause((cause) => Effect.fail(new Tool.Failure({
              message: `precision-history: ${Cause.pretty(cause)}`,
              metadata: { reason: "precision-history" },
            }))),
          )
          const catalog = yield* Effect.try({
            try: () => ReviewPrecisionCatalog.effective({ project: parent.projectID, catalog: ReviewCatalog.current, batches }),
            catch: (error) => new Tool.Failure({
              message: `precision-history: ${error instanceof Error ? error.message : String(error)}`,
              metadata: { reason: "precision-history" },
            }),
          })
          // The earlier runtime rechecks just before the provider runs; V2 rechecks just before the first drain starts. The code
          // stage needs the workers' result to still be the exact tree under review.
          const current =
            planned && scope
              ? yield* ReviewArtifactsV2.codeArtifact(git, worktree, artifact.baseSHA, scope).pipe(
                  Effect.map((next) => next.headSHA === artifact.headSHA),
                  Effect.orElseSucceed(() => false),
                )
              : yield* GovernanceEvidenceV2.contextIsCurrent(services, record)
          if (!current) return "LUCY_ERROR: Error: Review context changed before provider execution"
          const sessionID = (key: string) =>
            key === "lead" ? lead : SessionSchema.ID.make(`ses_lucy_review_${sha256(`${lead}\0${key}`)}`)
          const cache = ReviewReleaseRequestV2.key(`review_${params.validationRecordID}_${stage}`, release)
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
          const binding = ReviewBindingV2.reviewBinding({ worktree, diff, cache, lenses: leadLenses, ledger, copies })
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
                if (turn.finish && !turn.authorization)
                  return yield* new Tool.Failure({ message: "method-binding-mismatch: finish has no host authorization", metadata: { reason: "method-binding-mismatch" } })
                if (turn.finish && turn.authorization) {
                  finishing.add(child)
                  finishAuthority.set(child, turn.authorization)
                }
                const failed = yield* execution.resume(child, { interruptOnCancel: true }).pipe(
                  Effect.as(undefined),
                  Effect.catch((error) => Effect.succeed(error)),
                  Effect.ensuring(Effect.sync(() => {
                    finishing.delete(child)
                    finishAuthority.delete(child)
                  })),
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
              analyze({ ...step, catalog, worktree, base: artifact.baseSHA, head: artifact.headSHA, sessionID: lead, changes, ...(release === undefined ? {} : { release }) }),
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
                ...(first ? { firstRound: first.executionTier } : {}),
              },
              base: { files: yield* listed(artifact.baseSHA) },
              head: { files: yield* listed(artifact.headSHA), changes },
              catalog,
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
          const scoped = yield* services.store.scope(context.sessionID)
          if (scoped && !finishing.has(context.sessionID))
            return yield* new Tool.Failure({ message: "Review recording opens only in the lead's final turn" })
          let hostOutcomes: ReviewFanoutV2.FinishAuthorization["outcomes"] | undefined
          let hostRouting: ReviewFanoutV2.FinishAuthorization["routing"] | undefined
          let hostExecutionTier: string | undefined
          if (scoped) {
            const authority = finishAuthority.get(context.sessionID)
            if (!authority || params.reviewMethodVersion !== authority.method || params.routingDigest !== authority.routingDigest || catalogDigest(params.catalogDigest) !== catalogDigest(authority.catalogDigest))
              return yield* new Tool.Failure({ message: "method-binding-mismatch: submitted method or digest does not match host finish", metadata: { reason: "method-binding-mismatch" } })
            if (!sameOutcomes(params.items, authority.outcomes))
              return yield* new Tool.Failure({ message: "outcome-binding-mismatch: submitted items do not match host outcomes", metadata: { reason: "outcome-binding-mismatch" } })
            if (!authority.scope)
              return yield* new Tool.Failure({ message: "method-binding-mismatch: finish has no host scope", metadata: { reason: "method-binding-mismatch" } })
            if (params.artifact.baseSHA !== authority.scope.base || params.artifact.headSHA !== authority.scope.head)
              return yield* new Tool.Failure({ message: "method-binding-mismatch: artifact does not match host scope", metadata: { reason: "method-binding-mismatch" } })
            const quick = authority.executionTier === "quick"
            yield* Effect.try({
              try: () => ReviewCardV2.validateFindings(params.findings, {
                quick,
                ...(authority.confirmed === undefined ? {} : { confirmed: authority.confirmed }),
              }),
              catch: (error) => new Tool.Failure({
                message: error instanceof Error && error.message.length > 0 ? error.message : "unverified-finding",
                metadata: { reason: "unverified-finding" },
              }),
            })
            if (quick) {
              for (const finding of params.findings) yield* quoteOnHead(services.atlas.git, finding, authority.scope.head, child.location.directory)
            }
            const snapshot = authority.seal()
            if (!sameOutcomes(params.items, snapshot))
              return yield* new Tool.Failure({ message: "outcome-binding-mismatch: submitted items do not match host outcomes", metadata: { reason: "outcome-binding-mismatch" } })
            hostOutcomes = snapshot
            yield* Effect.try({
              try: () => ReviewChecksV2.authorize(params.verdict, authority.checkFacts),
              catch: (error) => new Tool.Failure({
                message: error instanceof Error && error.message.length > 0 ? error.message : "checks-blocked",
                metadata: { reason: "checks-blocked" },
              }),
            })
            hostRouting = authority.routing
            hostExecutionTier = authority.executionTier
          }
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
            ...(hostRouting ? { hostRouting, ...(hostExecutionTier ? { hostExecutionTier } : {}) } : {}),
          })
          if (hostOutcomes) yield* admitPrecision(services, { review: recorded.id, project: recorded.projectID, reads: hostOutcomes })
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

function codeReceipt(data: unknown, validationRecordID: string) {
  if (!data || typeof data !== "object") return false
  if (!("validationRecordID" in data) || data.validationRecordID !== validationRecordID) return false
  return "stage" in data && data.stage === "code"
}

const authorityFailure: {
  readonly unavailable: { readonly reason: "round-authority-unavailable"; readonly detail: string }
  readonly corrupt: { readonly reason: "round-authority-corrupt"; readonly detail: string }
  readonly mismatch: { readonly reason: "round-authority-mismatch"; readonly detail: string }
} = {
  unavailable: { reason: "round-authority-unavailable", detail: "newest code receipt has no host round" },
  corrupt: { reason: "round-authority-corrupt", detail: "host round or findings do not decode" },
  mismatch: { reason: "round-authority-mismatch", detail: "host round does not match the receipt binding" },
}

function roundFailure(reason: "round-authority-unavailable" | "round-authority-corrupt" | "round-authority-mismatch" | "round-not-fix-first", detail: string) {
  return new Tool.Failure({ message: `${reason}: ${detail}`, metadata: { reason } })
}

function unverified(detail: string) {
  return new Tool.Failure({ message: `unverified-finding: ${detail}`, metadata: { reason: "unverified-finding" } })
}

function quoteOnHead(git: MaestroChainTools.Services["atlas"]["git"], finding: MaestroEvent.Review.Finding, head: string, cwd: string) {
  return Effect.gen(function* () {
    if (finding.evidence?.kind !== "quote") return yield* unverified("quote evidence is required")
    const start = finding.evidence.startLine
    const end = finding.evidence.endLine
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) return yield* unverified("quote range is reversed")
    const blob = yield* git.run(["show", `${head}:${finding.path}`], { cwd, maxOutputBytes: 4 * 1024 * 1024 }).pipe(
      Effect.mapError((error) => unverified(`head blob unavailable: ${String(error)}`)),
    )
    if (blob.exitCode !== 0 || blob.truncated) return yield* unverified("head blob unavailable")
    const text = yield* Effect.try({
      try: () => new TextDecoder("utf-8", { fatal: true }).decode(blob.stdout),
      catch: () => unverified("head blob is not UTF-8"),
    })
    const lines = text.split("\n")
    const actualLineCount = text.length === 0 ? 0 : lines.length - Number(text.endsWith("\n"))
    const quoted = lines.slice(start - 1, end).join("\n")
    if (end > actualLineCount || quoted.trim().length === 0) return yield* unverified("quote range is empty or outside the head blob")
  })
}

function catalogDigest(value: string | undefined) {
  return value?.replace(/^sha256:/, "")
}

function sameOutcomes(
  submitted: ReadonlyArray<{ readonly pack: string; readonly rule: string; readonly fingerprint: string; readonly outcome: string }> | undefined,
  host: ReadonlyArray<{ readonly pack: string; readonly rule: string; readonly fingerprint: string; readonly outcome: string }>,
) {
  if (submitted === undefined) return false
  const got = submitted
  const key = (item: { readonly pack: string; readonly rule: string; readonly fingerprint: string }) => JSON.stringify([item.pack, item.rule, item.fingerprint])
  if (new Set(got.map(key)).size !== got.length) return false
  if (got.length !== host.length) return false
  const wanted = new Map(host.map((item) => [key(item), item.outcome]))
  return got.every((item) => wanted.get(key(item)) === item.outcome)
}

function admitPrecision(services: MaestroChainTools.Services, input: { readonly review: string; readonly project: string; readonly reads: ReviewFanoutV2.FinishAuthorization["outcomes"] }) {
  return ReviewPrecisionStore.append(input).pipe(
    Effect.provideService(Database.Service, { db: services.db }),
    Effect.provideService(EventV2.Service, services.events),
    Effect.catchCause((cause) => Effect.fail(new Tool.Failure({
      message: `precision-admission: ${Cause.pretty(cause)}`,
      metadata: { reason: "precision-admission" },
    }))),
  )
}

const decodeReceipt = Schema.decodeUnknownOption(MaestroEvent.Review.ReceivedV2.data)

// The round a rereview continues: the newest code receipt and the host routing published on it.
const firstRound = Effect.fn("MaestroReviewTools.firstRound")(function* (
  db: Database.Interface["db"],
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
  const row = rows.find((item) => codeReceipt(item.data, validationRecordID))
  if (!row) return undefined
  const receipt = Option.getOrUndefined(decodeReceipt(row.data, { onExcessProperty: "error" }))
  if (!receipt) return yield* roundFailure("round-authority-corrupt", "newest code receipt does not decode")
  const loaded = ReviewRoundV2.read(receipt)
  if (loaded.status !== "ok") return yield* roundFailure(authorityFailure[loaded.status].reason, authorityFailure[loaded.status].detail)
  if (receipt.verdict !== "FIX_FIRST")
    return yield* roundFailure("round-not-fix-first", "rereview continues only a FIX_FIRST code receipt")
  return { routing: loaded.routing, findings: loaded.findings, reviewed: receipt.artifact.headSHA, executionTier: loaded.executionTier }
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
