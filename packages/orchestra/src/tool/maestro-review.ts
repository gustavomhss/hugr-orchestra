import { createHash } from "node:crypto"
import { Cause, Effect, Exit, FileSystem, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Database } from "@orchestra/core/database/database"
import { Session } from "@/session/session"
import { Config } from "@/config/config"
import { SessionID } from "@/session/schema"
import { Git } from "@/git"
import { REVIEW_ARTIFACT_MAX_BYTES, findReview, readValidation, workCardHash } from "@/maestro/validation-record"
import { contextIsCurrent, readContext, STALE_CONTEXT_NEXT_STEP } from "@/maestro/context-record"
import { readPlanRevision } from "@/maestro/plan-revision"
import { CodeReview } from "@/maestro/code-review"
import { omit } from "remeda"
import type { TaskPromptOps } from "@/tool/task"
import { ProviderV2 } from "@orchestra/core/provider"
import { ModelV2 } from "@orchestra/core/model"
import * as Tool from "./tool"

const Parameters = Schema.Struct({
  validationRecordID: Schema.String,
  workCard: Schema.String,
  reviewMethodVersion: Schema.String,
  // `plan` (default) reviews before approval; `code` reviews what the workers committed after it.
  stage: Schema.optional(Schema.Literals(["plan", "code"])),
})

export const MaestroRequestReviewTool = Tool.define(
  "maestro_request_review",
  Effect.gen(function* () {
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const git = yield* Git.Service
    const database = yield* Database.Service
    const config = yield* Config.Service
    const fs = yield* FileSystem.FileSystem
    return {
      description:
        'Delegate one read-only cold review to the native cold reviewer (`lucy`). Maestro only. Stage "plan" (default) reviews the plan and its committed spec before approval; stage "code" reviews what the workers committed after it, before the workflow completes.',
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx) =>
        Effect.gen(function* () {
          const caller = yield* agents.get(ctx.agentID ?? ctx.agent)
          if (caller?.id !== "maestro" || caller.native !== true)
            return yield* Effect.fail(new Error("Review delegation requires Maestro"))
          const validation = yield* readValidation(params.validationRecordID)
          if (
            !validation ||
            validation.sessionID !== ctx.sessionID ||
            validation.workCardHash !== workCardHash(params.workCard)
          ) {
            return yield* Effect.fail(
              new Error(
                "Review delegation validation mismatch: pass a validationRecordID recorded in this Session and the byte-identical workCard it validated.",
              ),
            )
          }
          if (!validation.contextRecordID || !validation.contextHash) {
            return yield* Effect.fail(new Error("Review delegation requires bound context"))
          }
          const stage = params.stage ?? "plan"
          const parent = yield* sessions.get(SessionID.make(ctx.sessionID))
          const context = yield* readContext(validation.contextRecordID)
          if (
            !context ||
            context.sessionID !== parent.id ||
            context.planRevisionID !== validation.planRevisionID ||
            context.projectID !== parent.projectID ||
            validation.projectID !== parent.projectID ||
            context.directory !== parent.directory ||
            context.contextHash !== validation.contextHash ||
            context.changedPaths.length > 0 ||
            // The workers move HEAD after approval; the code stage binds to the plan review's head instead.
            (stage === "plan" && !(yield* contextIsCurrent(context)))
          ) {
            return yield* Effect.fail(
              new Error(`Review delegation context is stale or dirty: ${STALE_CONTEXT_NEXT_STEP}`),
            )
          }
          const head = yield* git.run(["rev-parse", "HEAD"], { cwd: parent.directory })
          if (head.exitCode !== 0) return yield* Effect.fail(new Error("Review artifact requires Git HEAD"))
          const headSHA = head.text().trim()
          if (stage === "plan" && headSHA !== context.headSHA)
            return yield* Effect.fail(new Error("Review delegation context head mismatch"))
          const root = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: parent.directory })
          const worktree = root.text().trim()
          if (root.exitCode !== 0 || !worktree)
            return yield* Effect.fail(new Error("Review artifact requires Git root"))
          if (!("reviewBaseSHA" in validation))
            return yield* Effect.fail(new Error("Review artifact requires bound baseline"))
          const plan = yield* readPlanRevision(validation.planRevisionID)
          if (!plan) return yield* Effect.fail(new Error("Review delegation requires the bound plan revision"))
          const planned = stage === "code" ? yield* findReview(ctx.sessionID, params.validationRecordID) : undefined
          if (stage === "code" && planned?.data.verdict !== "APPROVE")
            return yield* Effect.fail(new Error("Code review requires an APPROVE plan review for this validation"))
          // The bound base comes from validation (plan) or the APPROVE plan review (code), never from the card, so a
          // smaller card cannot shrink the diff.
          const artifact = planned
            ? yield* codeArtifact(worktree, planned.data.artifact.headSHA, validation.planRevisionID)
            : yield* planArtifact(worktree, validation.reviewBaseSHA, headSHA)
          const ops = ctx.extra?.promptOps as TaskPromptOps | undefined
          if (!ops) return yield* Effect.fail(new Error("Review delegation requires promptOps"))
          const child = yield* sessions.create({ parentID: ctx.sessionID, agent: "lucy" })
          if (stage === "plan" && !(yield* contextIsCurrent(context)))
            return yield* Effect.fail(new Error("Review delegation context changed during child creation"))
          const model = ctx.extra?.model as { providerID?: string; api?: { id?: string } } | undefined
          const result = yield* Effect.exit(
            ops.prompt(
              {
                sessionID: child.id,
                agent: "lucy",
                ...(model?.providerID && model.api?.id
                  ? {
                      model: {
                        providerID: ProviderV2.ID.make(model.providerID),
                        modelID: ModelV2.ID.make(model.api.id),
                      },
                    }
                  : {}),
                // Text that names an agent stays plain; as an agent part it would ask Lucy to delegate.
                parts: (yield* ops.resolvePromptParts(
                  [
                    "Perform one read-only cold review.",
                    stage === "plan" ? PLAN_STAGE : CODE_STAGE,
                    `validationRecordID: ${params.validationRecordID}`,
                    `work card:\n${params.workCard}`,
                    `plan revision JSON: ${JSON.stringify(plan)}`,
                    `reviewMethodVersion: ${params.reviewMethodVersion}`,
                    `artifact JSON: ${JSON.stringify({ ...omit(artifact, ["diff"]), worktree })}`,
                    `diff under review (git diff --binary --full-index ${artifact.baseSHA} ${artifact.headSHA}; read it, do not copy it into the receipt):\n${artifact.diff}`,
                    `checks JSON: ${JSON.stringify(validation.checks)}`,
                    ...("skills" in context
                      ? context.skills.map(
                          (skill) => `<skill_content name="${skill.name}">\n${skill.content}\n</skill_content>`,
                        )
                      : []),
                    `You MUST call maestro_record_review exactly once with stage "${stage}", your evidence-based verdict, cited findings, exact artifact JSON, and exact checks JSON above. Do not answer with a review narrative.`,
                    "Never edit files or include transcript/model history.",
                  ].join("\n\n"),
                )).filter((part) => part.type !== "agent"),
              },
              {
                beforeModel: Effect.gen(function* () {
                  if (!planned) return yield* contextIsCurrent(context)
                  // The workers' result must still be the exact tree under review.
                  return yield* codeArtifact(worktree, artifact.baseSHA, validation.planRevisionID).pipe(
                    Effect.map((current) => current.headSHA === artifact.headSHA),
                    Effect.orElseSucceed(() => false),
                  )
                }).pipe(
                  Effect.provideService(Database.Service, database),
                  Effect.provideService(Config.Service, config),
                  Effect.provideService(FileSystem.FileSystem, fs),
                  Effect.provideService(Git.Service, git),
                  Effect.provideService(Session.Service, sessions),
                  Effect.flatMap((current) =>
                    current ? Effect.void : Effect.fail(new Error("Review context changed before provider execution")),
                  ),
                ),
              },
            ),
          )
          // Titles render the reviewer seat's configured label; output codes stay stable for parsers.
          const reviewer = (yield* agents.get("lucy"))?.name ?? "lucy"
          if (Exit.isFailure(result)) {
            return {
              title: `${reviewer} review failed`,
              metadata: { childSessionID: child.id, reviewReceiptID: "" },
              output: `LUCY_ERROR: ${String(Cause.squash(result.cause))}`,
            }
          }
          const review = yield* findReview(
            ctx.sessionID,
            params.validationRecordID,
            planned ? artifact.headSHA : undefined,
          ).pipe(Effect.provideService(Database.Service, database))
          if (review)
            return {
              title: `${reviewer} review ${review.data.verdict}`,
              metadata: { childSessionID: child.id, reviewReceiptID: review.id },
              output: `${review.data.verdict}: ${review.id}`,
            }
          const text = result.value.parts.findLast((part) => part.type === "text")?.text ?? ""
          return {
            title: `${reviewer} review missing receipt`,
            metadata: { childSessionID: child.id, reviewReceiptID: "" },
            output: text ? `LUCY_NO_RECEIPT: ${text}` : `LUCY_NO_RECEIPT: ${child.id}`,
          }
        }).pipe(
          Effect.provideService(Database.Service, database),
          Effect.provideService(Git.Service, git),
          Effect.provideService(Config.Service, config),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Session.Service, sessions),
          Effect.orDie,
        ),
    }
  }),
)

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
const planArtifact = Effect.fn("MaestroRequestReview.planArtifact")(function* (
  worktree: string,
  baseSHA: string,
  headSHA: string,
) {
  const git = yield* Git.Service
  const names = yield* git.run(
    ["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", baseSHA, headSHA, "--", "."],
    {
      cwd: worktree,
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
      baseSHA,
      headSHA,
      "--",
      ".",
    ],
    { cwd: worktree, maxOutputBytes: REVIEW_ARTIFACT_MAX_BYTES },
  )
  if (diff.truncated)
    return yield* Effect.fail(
      new Error(
        `Review artifact exceeds ${REVIEW_ARTIFACT_MAX_BYTES} bytes: the cold reviewer (\`lucy\`) reviews the whole committed branch delta merge-base(HEAD, <primary remote>/HEAD)..HEAD, here ${baseSHA}..${headSHA}, so splitting the work card does not help. The owner or a maintainer decides: a smaller branch delta, or a primary remote whose HEAD is the real base, then a new validation with a new workCardID.`,
      ),
    )
  if (names.exitCode !== 0 || names.truncated || diff.exitCode !== 0 || diff.stdout.length === 0)
    return yield* Effect.fail(new Error("Review artifact diff unavailable"))
  return {
    baseSHA,
    headSHA,
    changedPaths: names.text().split("\0").filter(Boolean),
    sha256: createHash("sha256").update(diff.stdout).digest("hex"),
    diff: diff.text(),
  }
})

// The workers' uncommitted result the code stage reviews, written by the host as a tree from the plan-reviewed head.
const codeArtifact = Effect.fn("MaestroRequestReview.codeArtifact")(function* (
  worktree: string,
  baseSHA: string,
  planRevisionID: string,
) {
  const writePaths = yield* CodeReview.writePaths(planRevisionID)
  if (!writePaths) return yield* Effect.fail(new Error("Code review requires the plan's bound workflow writePaths"))
  const result = yield* CodeReview.result({
    worktree,
    base: baseSHA,
    writePaths,
    maxOutputBytes: REVIEW_ARTIFACT_MAX_BYTES,
  })
  if (result.status === "ready")
    return {
      baseSHA,
      headSHA: result.tree,
      changedPaths: result.changedPaths,
      sha256: result.sha256,
      diff: result.diff,
    }
  return yield* Effect.fail(
    new Error(
      result.status === "head-moved"
        ? `Code review requires HEAD to stay at the plan-reviewed head ${baseSHA}: workers leave their result uncommitted.`
        : result.status === "unchanged"
          ? "Code review has nothing to review: the working tree still matches the plan-reviewed head."
          : result.status === "outside"
            ? `The workers' result changes paths outside the approved writePaths ${JSON.stringify(writePaths)}: ${JSON.stringify(result.outside.slice(0, 10))}.`
            : result.status === "too-large"
              ? `Review artifact exceeds ${REVIEW_ARTIFACT_MAX_BYTES} bytes: the code review covers the workers' whole result since the plan review. The owner or a maintainer decides how to split the work.`
              : "Review artifact diff unavailable",
    ),
  )
})
