import { createHash } from "node:crypto"
import { Cause, Effect, Exit, FileSystem, Schema } from "effect"
import { Agent } from "@/agent/agent"
import { Database } from "@opencode-ai/core/database/database"
import { Session } from "@/session/session"
import { Config } from "@/config/config"
import { SessionID } from "@/session/schema"
import { Git } from "@/git"
import { REVIEW_ARTIFACT_MAX_BYTES, findReview, readValidation, workCardHash } from "@/maestro/validation-record"
import { contextIsCurrent, readContext } from "@/maestro/context-record"
import type { TaskPromptOps } from "@/tool/task"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import * as Tool from "./tool"

const Parameters = Schema.Struct({
  validationRecordID: Schema.String,
  workCard: Schema.String,
  reviewMethodVersion: Schema.String,
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
      description: "Delegate one read-only cold review to the native cold reviewer (`lucy`). Maestro only.",
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
            return yield* Effect.fail(new Error("Review delegation validation mismatch"))
          }
          if (!validation.contextRecordID || !validation.contextHash) {
            return yield* Effect.fail(new Error("Review delegation requires bound context"))
          }
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
            !(yield* contextIsCurrent(context))
          ) {
            return yield* Effect.fail(new Error("Review delegation context is stale or dirty"))
          }
          const head = yield* git.run(["rev-parse", "HEAD"], { cwd: parent.directory })
          if (head.exitCode !== 0) return yield* Effect.fail(new Error("Review artifact requires Git HEAD"))
          const headSHA = head.text().trim()
          if (headSHA !== context.headSHA)
            return yield* Effect.fail(new Error("Review delegation context head mismatch"))
          const root = yield* git.run(["rev-parse", "--show-toplevel"], { cwd: parent.directory })
          const worktree = root.text().trim()
          if (root.exitCode !== 0 || !worktree)
            return yield* Effect.fail(new Error("Review artifact requires Git root"))
          if (!("reviewBaseSHA" in validation))
            return yield* Effect.fail(new Error("Review artifact requires bound baseline"))
          const baseSHA = validation.reviewBaseSHA
          const names = yield* git.run(
            ["diff", "--no-ext-diff", "--no-renames", "--name-only", "-z", baseSHA, headSHA, "--", "."],
            { cwd: worktree },
          )
          const changedPaths = names.text().split("\0").filter(Boolean)
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
                `Review artifact exceeds ${REVIEW_ARTIFACT_MAX_BYTES} bytes; narrow the review base or split the work card`,
              ),
            )
          if (names.exitCode !== 0 || names.truncated || diff.exitCode !== 0 || diff.stdout.length === 0)
            return yield* Effect.fail(new Error("Review artifact diff unavailable"))
          const sha256 = createHash("sha256").update(diff.stdout).digest("hex")
          const ops = ctx.extra?.promptOps as TaskPromptOps | undefined
          if (!ops) return yield* Effect.fail(new Error("Review delegation requires promptOps"))
          const child = yield* sessions.create({ parentID: ctx.sessionID, agent: "lucy" })
          if (!(yield* contextIsCurrent(context)))
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
                parts: yield* ops.resolvePromptParts(
                  [
                    "Perform one read-only cold review.",
                    `validationRecordID: ${params.validationRecordID}`,
                    `work card:\n${params.workCard}`,
                    `reviewMethodVersion: ${params.reviewMethodVersion}`,
                    `artifact JSON: ${JSON.stringify({ baseSHA, headSHA, worktree, changedPaths, sha256 })}`,
                    `diff under review (git diff --binary --full-index ${baseSHA} ${headSHA}; read it, do not copy it into the receipt):\n${diff.text()}`,
                    `checks JSON: ${JSON.stringify(validation.checks)}`,
                    ...("skills" in context
                      ? context.skills.map(
                          (skill) => `<skill_content name="${skill.name}">\n${skill.content}\n</skill_content>`,
                        )
                      : []),
                    "You MUST call maestro_record_review exactly once with your evidence-based verdict, cited findings, exact artifact JSON, and exact checks JSON above. Do not answer with a review narrative.",
                    "Never edit files or include transcript/model history.",
                  ].join("\n\n"),
                ),
              },
              {
                beforeModel: contextIsCurrent(context).pipe(
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
          const review = yield* findReview(ctx.sessionID, params.validationRecordID).pipe(
            Effect.provideService(Database.Service, database),
          )
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
