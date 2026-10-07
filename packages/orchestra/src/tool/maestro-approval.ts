import { Effect, FileSystem, Schema } from "effect"
import { presentApprovalFromSession, recordApproval } from "@/maestro/approval-record"
import { Database } from "@orchestra/core/database/database"
import { EventV2Bridge } from "@/event-v2-bridge"
import { Agent } from "@/agent/agent"
import { readPlanRevision } from "@/maestro/plan-revision"
import {
  contextIsCurrent,
  DIRTY_CONTEXT_NEXT_STEP,
  readContext,
  STALE_CONTEXT_NEXT_STEP,
} from "@/maestro/context-record"
import { Git } from "@/git"
import { Config } from "@/config/config"
import { findReview, readValidation, validationRecordHash } from "@/maestro/validation-record"
import { renderPresentation, type ApprovalResult } from "@/maestro/approval"
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
        "Present exact task intent for direct user approval. Requires native Maestro, same-Session/project durable plan and VALID validation, current clean context, and cold-review (`lucy`) APPROVE. Runtime computes the task hash; an optional supplied hash must match.",
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
            return yield* Effect.fail(new Error(`Approval presentation context is stale: ${STALE_CONTEXT_NEXT_STEP}`))
          if (context.changedPaths.length > 0)
            return yield* Effect.fail(new Error(`Approval presentation context is dirty: ${DIRTY_CONTEXT_NEXT_STEP}`))
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
            return yield* Effect.fail(
              new Error(`Approval presentation requires ${(yield* agents.get("lucy"))?.name ?? "lucy"} APPROVE`),
            )
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
          // Short bounded outputs; the Bindings line must reach the model even under tiny truncation limits.
          switch (result.status) {
            case "APPROVED":
            case "DECLINED": {
              const bindings = {
                approvalMessageID: result.decision.approvalMessageID,
                planRevisionID: result.decision.planRevisionID,
              }
              return {
                title: `Approval ${result.status.toLowerCase()}`,
                metadata: {
                  status: String(result.status),
                  approvalMessageID: bindings.approvalMessageID,
                  truncated: false,
                },
                output: `${result.status}: exact plan revision ${bindings.planRevisionID}\n\nBindings: ${JSON.stringify(bindings)}`,
              }
            }
            case "HOLD":
              return {
                title: "Approval not recorded",
                metadata: { status: String(result.status), approvalMessageID: "", truncated: false },
                output: `HOLD: ${result.reason}. ${holdNextSteps[result.reason]}`,
              }
            case "PENDING":
              return {
                title: "Approval not recorded",
                metadata: { status: String(result.status), approvalMessageID: "", truncated: false },
                output: `PENDING: ${result.kind}. ${pendingNextSteps[result.kind]}`,
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

// One next step per result that records no decision, checked against evaluateReply and recordApproval.
const holdNextSteps: Record<Extract<ApprovalResult, { status: "HOLD" }>["reason"], string> = {
  "presentation-message-mismatch":
    "The newest presentation is not shown exactly as rendered in its message; present again with a new methodVersion, then end the turn and wait for the owner's exact reply.",
  "presentation-not-current":
    "Present again with a new methodVersion and end the turn; if it holds again, an earlier presentation shares its assistant message with another or was aborted or removed, which is permanent for this Session, so tell the owner.",
  "reply-not-found": "No owner message exists yet; end the turn and wait for the owner's reply.",
  "reply-session-mismatch": "Record approval only in the Session that presented.",
  "reply-not-direct-user": "Only a direct owner message can answer; end the turn and wait for the owner's reply.",
  "reply-synthetic":
    "The latest user message is synthetic (a task result or compaction), not the owner's reply; if it arrived after the presentation, present again with a new methodVersion, then end the turn and wait for the owner's exact reply.",
  "reply-not-after-presentation":
    "The owner has not replied since the presentation; end the turn and wait for the owner.",
  "reply-not-immediate":
    "Another user message arrived between the presentation and this reply; present again with a new methodVersion, then end the turn and wait for the owner's exact reply.",
  "reply-already-bound":
    "This owner reply already decided another presentation; present again with a new methodVersion, then end the turn and wait for a new reply.",
  "presentation-identity-invalid":
    "The newest presentation record is malformed; present again with a new methodVersion, then end the turn and wait for the owner's exact reply.",
}

const pendingNextSteps: Record<Extract<ApprovalResult, { status: "PENDING" }>["kind"], string> = {
  question:
    "The owner asked a question instead of replying approve, aprovo, decline, declino, cancel or cancelar; answer it, then present again with a new methodVersion and ask for the exact word.",
  ambiguous:
    "The reply is not exactly approve, aprovo, decline, declino, cancel or cancelar; present again with a new methodVersion and ask for the exact word.",
}
