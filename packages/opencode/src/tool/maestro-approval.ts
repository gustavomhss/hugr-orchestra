import { Effect, FileSystem, Schema } from "effect"
import { presentApprovalFromSession, recordApproval } from "@/maestro/approval-record"
import { Database } from "@opencode-ai/core/database/database"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Agent } from "@/agent/agent"
import { readPlanRevision } from "@/maestro/plan-revision"
import { contextIsCurrent, readContext } from "@/maestro/context-record"
import { Git } from "@/git"
import { Config } from "@/config/config"
import { findReview, readValidation, validationRecordHash } from "@/maestro/validation-record"
import { renderPresentation } from "@/maestro/approval"
import { taskHash } from "@/maestro/task-hash"
import { Session } from "@/session/session"
import { Tool } from "./tool"

const PresentationParameters = Schema.Struct({
  planRevisionID: Schema.String,
  validationRecordID: Schema.String,
  revisionHash: Schema.String,
  validationHash: Schema.String,
  contextHash: Schema.String,
  contextRecordID: Schema.optional(Schema.String),
  policyHash: Schema.String,
  taskHash: Schema.optional(
    Schema.NonEmptyString.annotate({
      description:
        "Optional matching task binding hash. Runtime computes the canonical hash from intent and durable evidence.",
    }),
  ),
  intent: Schema.Struct({
    subagentType: Schema.String,
    prompt: Schema.String,
    model: Schema.optional(Schema.String),
    taskID: Schema.optional(Schema.String),
  }),
  methodVersion: Schema.String,
  plan: Schema.String,
  provenance: Schema.String,
  assumptions: Schema.Array(Schema.String),
  validationLedger: Schema.String,
  contextState: Schema.Literal("CURRENT"),
})

export const MaestroPresentApprovalTool = Tool.define(
  "maestro_present_approval",
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const agents = yield* Agent.Service
    const sessions = yield* Session.Service
    const git = yield* Git.Service
    const config = yield* Config.Service
    const fs = yield* FileSystem.FileSystem
    return {
      description:
        "Present exact task intent for direct user approval. Requires native Maestro, same-Session/project durable plan and VALID validation, current clean context, and Lucy APPROVE. Runtime computes the task hash; an optional supplied hash must match.",
      parameters: PresentationParameters,
      execute: (_params: Schema.Schema.Type<typeof PresentationParameters>, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agentID ?? ctx.agent)
          if (agent?.id !== "maestro" || agent.native !== true) {
            return yield* Effect.fail(new Error("Approval presentation requires Maestro"))
          }
          if (!_params.planRevisionID.startsWith("evt_") || !_params.validationRecordID.startsWith("evt_")) {
            return yield* Effect.fail(
              new Error("Approval presentation requires durable plan revision and validation event IDs"),
            )
          }
          const plan = yield* readPlanRevision(_params.planRevisionID)
          const validation = yield* readValidation(_params.validationRecordID)
          const context = yield* readContext(_params.contextRecordID ?? _params.contextHash)
          if (!plan || !validation || !context)
            return yield* Effect.fail(new Error("Approval presentation evidence not found"))
          if (
            plan.sessionID !== ctx.sessionID ||
            validation.sessionID !== ctx.sessionID ||
            context.sessionID !== ctx.sessionID
          )
            return yield* Effect.fail(new Error("Approval presentation session mismatch"))
          if (validation.outcome !== "VALID")
            return yield* Effect.fail(new Error("Approval presentation requires VALID validation"))
          if (!(yield* contextIsCurrent(context)))
            return yield* Effect.fail(new Error("Approval presentation context is stale"))
          if (context.changedPaths.length > 0)
            return yield* Effect.fail(new Error("Approval presentation context is dirty"))
          if (
            validation.planRevisionID !== plan.id ||
            validation.contextRecordID !== context.id ||
            validation.contextHash !== context.contextHash ||
            context.planRevisionID !== plan.id
          ) {
            return yield* Effect.fail(new Error("Approval evidence chain mismatch"))
          }
          const session = yield* sessions.get(ctx.sessionID)
          if (
            plan.sessionID !== session.id ||
            validation.projectID !== session.projectID ||
            context.projectID !== session.projectID
          ) {
            return yield* Effect.fail(new Error("Approval project binding mismatch"))
          }
          const review = yield* findReview(ctx.sessionID, validation.id)
          if (!review || review.data.verdict !== "APPROVE")
            return yield* Effect.fail(new Error("Approval presentation requires Lucy APPROVE"))
          const validationHash = validationRecordHash(validation)
          const canonicalTaskHash = taskHash({
            ..._params.intent,
            planRevisionID: plan.id,
            revisionHash: plan.revisionHash,
            validationRecordID: validation.id,
            validationHash,
            contextHash: context.contextHash,
            policyHash: validation.reviewPolicyHash,
          })
          if (_params.taskHash !== undefined && _params.taskHash !== canonicalTaskHash)
            return yield* Effect.fail(
              new Error("Approval presentation task hash does not match intent and durable evidence"),
            )
          const presentation = yield* presentApprovalFromSession({
            sessionID: ctx.sessionID,
            assistantMessageID: ctx.messageID,
            callID: ctx.callID ?? "",
            memberID: "maestro",
            planRevisionID: plan.id,
            validationRecordID: validation.id,
            revisionHash: plan.revisionHash,
            validationHash,
            contextHash: context.contextHash,
            policyHash: validation.reviewPolicyHash,
            taskHash: canonicalTaskHash,
            intent: _params.intent,
            methodVersion: _params.methodVersion,
            plan: plan.goal.value,
            provenance: `admission ${plan.admissionMessageID}`,
            assumptions: plan.assumptions.map((item) => item.value),
            validationLedger: validation.checks
              .map((check) => `${check.id}: ${check.status} (${check.detail})`)
              .join("\n"),
            contextState: "CURRENT",
          }).pipe(
            Effect.provideService(Database.Service, database),
            Effect.provideService(EventV2Bridge.Service, events),
            Effect.provideService(Session.Service, sessions),
          )
          return {
            title: "Approval presented",
            metadata: { presentationID: presentation.id, truncated: false },
            output: renderPresentation(presentation),
          }
        }).pipe(
          Effect.provideService(Database.Service, database),
          Effect.provideService(Agent.Service, agents),
          Effect.provideService(Git.Service, git),
          Effect.provideService(Config.Service, config),
          Effect.provideService(FileSystem.FileSystem, fs),
          Effect.provideService(Session.Service, sessions),
          Effect.orDie,
        ),
    }
  }),
)

export const MaestroRecordApprovalTool = Tool.define(
  "maestro_record_approval",
  Effect.gen(function* () {
    const database = yield* Database.Service
    const events = yield* EventV2Bridge.Service
    const agents = yield* Agent.Service
    return {
      description: "Record direct user approval or decline for current exact Maestro plan presentation. Maestro only.",
      parameters: Schema.Struct({}),
      execute: (_: Record<string, never>, ctx) =>
        Effect.gen(function* () {
          const agent = yield* agents.get(ctx.agentID ?? ctx.agent)
          if (agent?.id !== "maestro" || agent.native !== true) {
            return yield* Effect.fail(new Error("Approval decision requires Maestro"))
          }
          const result = yield* recordApproval(ctx.sessionID)
          switch (result.status) {
            case "APPROVED":
            case "DECLINED":
              return {
                title: `Approval ${result.status.toLowerCase()}`,
                metadata: { status: String(result.status), approvalMessageID: result.decision.approvalMessageID },
                output: `${result.status}: exact plan revision ${result.decision.planRevisionID}`,
              }
            case "HOLD":
              return {
                title: "Approval not recorded",
                metadata: { status: String(result.status), approvalMessageID: "" },
                output: `HOLD: ${result.reason}`,
              }
            case "PENDING":
              return {
                title: "Approval not recorded",
                metadata: { status: String(result.status), approvalMessageID: "" },
                output: `PENDING: ${result.kind}`,
              }
          }
        }).pipe(
          Effect.provideService(Database.Service, database),
          Effect.provideService(EventV2Bridge.Service, events),
          Effect.provideService(Agent.Service, agents),
          Effect.orDie,
        ),
    }
  }),
)
